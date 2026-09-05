import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  createAdminService,
  addAstrologerService,
  adminLoginService,
} from "../services/adminService.js";
import { DateTimeResolver } from "graphql-scalars";
import { connectMongo } from "../config/mongo.js";

import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs";
import GraphQLJSON from "graphql-type-json";
import { generateSlug } from "../utils/slugify.js";
import { generateAccessToken, generateRefreshToken } from "../config/jwt.js";

const prisma = new PrismaClient();
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import redis from "../config/redis.js";

const PG_RATE = 2.118644;
const GST_RATE = 18;
const COMPANY_STATE = "Delhi";

const getFilterDate = (filter) => {
  const now = new Date();

  switch (filter) {
    case "TODAY": {
      return new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
    }

    case "WEEK": {
      const day = now.getDay(); // 0 = Sunday
      const diff = day === 0 ? 6 : day - 1; // Monday as start of week
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - diff);
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek;
    }

    case "MONTH": {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    default:
      return null;
  }
};

const handleUpload = async (file) => {
  try {
    const { createReadStream, filename, mimetype } = await file;
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(mimetype)) {
      throw new Error("Invalid file type");
    }

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const DOCUMENTS_DIR = path.join(__dirname, "..", "uploads", "documents");

    if (!fs.existsSync(DOCUMENTS_DIR)) {
      fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
    }

    const ext = path.extname(filename) || ".jpg";
    const newFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${ext}`;

    const uploadPath = path.join(DOCUMENTS_DIR, newFileName);

    const stream = createReadStream();
    const out = fs.createWriteStream(uploadPath);

    let size = 0;
    const MAX_SIZE = 5 * 1024 * 1024;

    await new Promise((resolve, reject) => {
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_SIZE) {
          stream.destroy();
          out.destroy();
          fs.unlink(uploadPath, () => {});
          reject(new Error("File too large (max 5MB)"));
        }
      });

      stream.pipe(out);

      out.on("finish", resolve);
      out.on("error", reject);
      stream.on("error", reject);
    });

    const publicUrl = `/adminAuth/uploads/documents/${newFileName}`;

    return {
      url: publicUrl,
      filename: newFileName,
      mimetype,
    };
  } catch (error) {
    throw new Error(error.message || "Upload failed");
  }
};
async function logGraphQLEvent(type, operation, userId = null, details = {}) {
  try {
    const db = await connectMongo();
    const collection = db.collection("adminGraphQLLogs");

    await collection.insertOne({
      type,
      operation,
      userId,
      details,
      timestamp: new Date(),
    });
  } catch (error) {}
}

async function checkPermission(context, requiredPermission) {
  const staff = context.user;

  if (!staff || !staff.id) {
    throw new Error("Unauthorized");
  }

  // SUPER ADMIN CHECK

  if (staff.role?.slug === "super-admin") {
    return true;
  }

  const roleId = staff.roleId || staff.role?.id;

  if (!roleId) {
    throw new Error("Unauthorized: Role missing");
  }

  const rolePerms = await context.prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: true },
  });

  const staffPerms = await context.prisma.staffPermission.findMany({
    where: { staffId: staff.id },
    include: { permission: true },
  });

  const allPermissions = [
    ...rolePerms.map((r) => r.permission.name),
    ...staffPerms.map((s) => s.permission.name),
  ];

  if (!allPermissions.includes(requiredPermission)) {
    throw new Error("Unauthorized: Missing permission");
  }

  return true;
}

// generate auto permission
const generateCRUDPermissions = async (module, prismaInstance) => {
  const actions = ["create", "read", "update", "delete"];

  for (const action of actions) {
    const name = `${module.slug}.${action}`;

    const permission = await prismaInstance.permission.upsert({
      where: { name },
      update: {},
      create: {
        name,
        type: "SYSTEM",
      },
    });

    const existingLink = await prismaInstance.modulePermission.findFirst({
      where: {
        moduleId: module.id,
        permissionId: permission.id,
      },
    });

    if (!existingLink) {
      await prismaInstance.modulePermission.create({
        data: {
          moduleId: module.id,
          permissionId: permission.id,
        },
      });
    }
  }
};

export const resolvers = {
  JSON: GraphQLJSON,
  Upload: GraphQLUpload,
  Query: {
    getAllWaitingQueues: async () => {
      try {
        const astrologers = await prisma.astrologer.findMany({
          select: {
            id: true,
            name: true,
            profilePic: true,
            isOnline: true,
            isBusy: true,
          },
        });

        const queues = await Promise.all(
          astrologers.map(async (astro) => {
            const list = await redis.lrange(`queue:${astro.id}`, 0, -1);

            const queue = list.map((item) => JSON.parse(item));

            // Skip if no waiting users
            if (queue.length === 0) {
              return null;
            }

            const userIds = queue.map((item) => item.user_id);

            const users = await prisma.user.findMany({
              where: {
                id: {
                  in: userIds,
                },
              },
              select: {
                id: true,
                name: true,
                mobile: true,
                countryCode: true,
              },
            });

            const userMap = new Map(users.map((user) => [user.id, user]));

            return {
              astrologerId: astro.id,
              astrologerName: astro.name,
              astrologerProfilePic: astro.profilePic,
              isOnline: astro.isOnline,
              isBusy: astro.isBusy,

              waitingCount: queue.length,

              waitingUsers: queue.map((item) => {
                const user = userMap.get(item.user_id);

                return {
                  userId: item.user_id,
                  name: user?.name || "",
                  mobile: user?.mobile || "",
                  countryCode: user?.countryCode || "",

                  roomId: item.roomId,
                  maximumTime: item.maximum_time,
                  source: item.source,
                  type: item.type,
                };
              }),
            };
          }),
        );

        return queues.filter(Boolean);
      } catch (error) {
        console.log(error);
        throw error;
      }
    },
    getAstrologerWaitingUsers: async (_, { astrologerId }) => {
      try {
        const list = await redis.lrange(`queue:${astrologerId}`, 0, -1);

        const queue = list.map((item) => JSON.parse(item));

        const userIds = queue.map((item) => item.user_id);

        const users = await prisma.user.findMany({
          where: {
            id: {
              in: userIds,
            },
          },
          select: {
            id: true,
            name: true,
            mobile: true,
            countryCode: true,
            profilePic: true,
          },
        });

        const userMap = new Map(users.map((user) => [user.id, user]));

        return {
          waitingCount: queue.length,

          waitingUsers: queue.map((item) => {
            const user = userMap.get(item.user_id);

            return {
              userId: item.user_id,
              name: user?.name || "",
              mobile: user?.mobile || "",
              countryCode: user?.countryCode || "",
              profilePic: user?.profilePic || "",
              roomId: item.roomId,
              maximumTime: item.maximum_time,
              source: item.source,
              type: item.type,
            };
          }),
        };
      } catch (error) {
        console.error("getAstrologerWaitingUsers Error:", error);
        throw new Error("Failed to fetch waiting users");
      }
    },
    getUsersListBySearch: async (_, { searchInput }) => {
      try {
        const {
          query,
          mobile,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 10,
        } = searchInput;

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const skip = (safePage - 1) * safeLimit;

        const where = {};

        // ---------------- TEXT SEARCH ----------------
        if (query) {
          where.OR = [
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              id: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              mobile: {
                contains: query,
              },
            },
          ];
        }

        // ---------------- MOBILE FILTER ----------------
        if (mobile) {
          where.mobile = {
            contains: mobile,
          };
        }

        // ---------------- DATE FILTER ----------------
        if (filterType) {
          const now = new Date();
          let start, end;

          switch (filterType) {
            case "TODAY":
              start = new Date(now.setHours(0, 0, 0, 0));
              end = new Date();
              break;

            case "WEEK":
              start = new Date();
              start.setDate(start.getDate() - 7);
              end = new Date();
              break;

            case "MONTH":
              start = new Date();
              start.setMonth(start.getMonth() - 1);
              end = new Date();
              break;

            case "YEAR":
              start = new Date();
              start.setFullYear(start.getFullYear() - 1);
              end = new Date();
              break;

            case "CUSTOM":
              start = startDate ? new Date(startDate) : undefined;
              end = endDate ? new Date(endDate) : undefined;
              break;
          }

          where.createdAt = {};

          if (start) where.createdAt.gte = start;
          if (end) where.createdAt.lte = end;
        }

        // ---------------- FETCH USERS ----------------
        const [users, totalCount] = await Promise.all([
          prisma.user.findMany({
            where,
            skip,
            take: safeLimit,
            orderBy: {
              createdAt: "desc",
            },

            include: {
              wallet: true,
            },
          }),

          prisma.user.count({ where }),
        ]);

        // ---------------- FINAL RESPONSE ----------------
        const enrichedUsers = users.map((user) => ({
          ...user,

          userCoins: user.wallet?.balanceCoins || 0,
          lockedCoins: user.wallet?.lockedCoins || 0,
        }));

        return {
          data: enrichedUsers,
          totalCount,
          currentPage: safePage,
          totalPages: Math.ceil(totalCount / safeLimit),
        };
      } catch (error) {
        throw new Error("Failed to fetch users");
      }
    },

    getAstrologerListBySearch: async (_, { searchInput }, context) => {
      const { prisma } = context;
      await checkPermission(context, "astrologer.read");
      try {
        if (!context) throw new Error("Not authorized");

        const {
          query,
          sortField,
          sortOrder,
          limit = 50,
          page = 1,
        } = searchInput;

        const safeLimit = Math.min(limit, 50);
        const safePage = Math.max(page, 1);
        const skip = (safePage - 1) * safeLimit;

        let orderBy = {};

        if (sortField) {
          switch (sortField) {
            case "EXPERIENCE":
              orderBy.experience = sortOrder === "ASC" ? "asc" : "desc";
              break;
            case "PRICE":
              orderBy.price = sortOrder === "ASC" ? "asc" : "desc";
              break;
            case "RATING":
              orderBy.rating = sortOrder === "ASC" ? "asc" : "desc";
              break;
          }
        } else {
          orderBy.createdAt = "desc";
        }

        const where = query
          ? {
              OR: [
                {
                  name: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  displayName: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  email: {
                    contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  contactNo: {
                    contains: query,
                  },
                },
                {
                  skills: {
                    has: query,
                  },
                },
                {
                  languages: {
                    has: query,
                  },
                },
              ],
            }
          : {};

        const [astrologers, totalCount] = await Promise.all([
          prisma.astrologer.findMany({
            where,
            orderBy,
            skip,
            take: safeLimit,
          }),
          prisma.astrologer.count({ where }),
        ]);

        const response = {
          data: astrologers,
          totalCount,
          currentPage: safePage,
          totalPages: Math.ceil(totalCount / safeLimit),
        };

        return response;
      } catch (error) {
        throw error;
      }
    },

    getAstrologerEarnings: async (_, { searchInput }) => {
      try {
        const {
          query,
          email,
          contactNo,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 10,
        } = searchInput;

        // ---------------- PAGINATION ----------------

        const safePage = Math.max(page, 1);

        const safeLimit = Math.min(limit, 50);

        const skip = (safePage - 1) * safeLimit;

        // ---------------- WHERE ----------------

        const where = {};

        // ---------------- SEARCH FILTER ----------------

        const andConditions = [];

        if (query) {
          andConditions.push({
            OR: [
              {
                name: {
                  contains: query,
                  mode: "insensitive",
                },
              },

              {
                email: {
                  contains: query,
                  mode: "insensitive",
                },
              },

              {
                contactNo: {
                  contains: query,
                },
              },
            ],
          });
        }

        if (email) {
          andConditions.push({
            email: {
              contains: email,
              mode: "insensitive",
            },
          });
        }

        if (contactNo) {
          andConditions.push({
            contactNo: {
              contains: contactNo,
            },
          });
        }

        if (andConditions.length > 0) {
          where.astrologer = {
            AND: andConditions,
          };
        }

        // ---------------- DATE FILTER ----------------

        if (filterType) {
          const now = new Date();

          let start;
          let end;

          switch (filterType) {
            case "TODAY":
              start = new Date(now.setHours(0, 0, 0, 0));
              end = new Date();
              break;

            case "WEEK":
              start = new Date();
              start.setDate(start.getDate() - 7);
              end = new Date();
              break;

            case "MONTH":
              start = new Date();
              start.setMonth(start.getMonth() - 1);
              end = new Date();
              break;

            case "YEAR":
              start = new Date();
              start.setFullYear(start.getFullYear() - 1);
              end = new Date();
              break;

            case "CUSTOM":
              start = startDate ? new Date(startDate) : undefined;
              end = endDate ? new Date(endDate) : undefined;
              break;
          }

          where.createdAt = {};

          if (start) {
            where.createdAt.gte = start;
          }

          if (end) {
            where.createdAt.lte = end;
          }
        }

        // ---------------- FETCH WALLET DATA ----------------

        const [wallets, totalCount] = await Promise.all([
          prisma.astrologerWallet.findMany({
            where,

            include: {
              astrologer: true,

              transactions: {
                include: {
                  session: true,
                },
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,

            take: safeLimit,
          }),

          prisma.astrologerWallet.count({
            where,
          }),
        ]);

        // ---------------- DATE HELPERS ----------------

        const todayStart = new Date();

        todayStart.setHours(0, 0, 0, 0);

        const monthStart = new Date();

        monthStart.setDate(1);

        monthStart.setHours(0, 0, 0, 0);

        // ---------------- RESPONSE ----------------

        const enrichedData = wallets.map((wallet) => {
          const transactions = wallet.transactions || [];

          // ---------------- TOTAL SESSION EARNINGS ----------------

          const totalSessionEarnings = transactions.reduce((sum, tx) => {
            return sum + Number(tx.amount || 0);
          }, 0);

          // ---------------- TODAY EARNINGS ----------------

          const todayEarnings = transactions
            .filter((tx) => {
              return new Date(tx.createdAt) >= todayStart;
            })
            .reduce((sum, tx) => {
              return sum + Number(tx.amount || 0);
            }, 0);

          // ---------------- MONTHLY EARNINGS ----------------

          const monthlyEarnings = transactions
            .filter((tx) => {
              return new Date(tx.createdAt) >= monthStart;
            })
            .reduce((sum, tx) => {
              return sum + Number(tx.amount || 0);
            }, 0);

          return {
            astrologerId: wallet.astrologer?.id,

            astrologerName: wallet.astrologer?.displayName || "",

            email: wallet.astrologer?.email || "",

            contactNo: wallet.astrologer?.contactNo || "",

            balanceCoins: wallet.balanceCoins || 0,

            totalEarned: wallet.totalEarned || 0,

            totalWithdrawn: wallet.totalWithdrawn || 0,

            totalSessionEarnings,

            monthlyEarnings,

            todayEarnings,

            createdAt: wallet.createdAt,
          };
        });

        return {
          data: enrichedData,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),
        };
      } catch (error) {
        throw new Error("Failed to fetch astrologer earnings");
      }
    },

    getAstrologerDashboardStats: async (_, { astrologerId }, { prisma }) => {
      const astrologer = await prisma.astrologer.findUnique({
        where: {
          id: astrologerId,
        },

        include: {
          wallet: true,
          followers: true,
          reviews: true,
        },
      });

      if (!astrologer) {
        throw new Error("Astrologer not found");
      }

      const sessions = await prisma.session.findMany({
        where: {
          astrologerId,
        },

        select: {
          type: true,
          durationSec: true,
          coinsEarned: true,
          coinsDeducted: true,
          commission: true,
          status: true,
        },
      });

      const totalChats = sessions.filter((s) => s.type === "CHAT").length;

      const totalCalls = sessions.filter((s) => s.type === "CALL").length;

      const totalDurationMinutes = Math.floor(
        sessions.reduce((sum, s) => sum + (s.durationSec || 0), 0) / 60,
      );

      const totalCoinsEarned = sessions.reduce(
        (sum, s) => sum + (s.coinsEarned || 0),
        0,
      );

      const totalCoinsDeducted = sessions.reduce(
        (sum, s) => sum + (s.coinsDeducted || 0),
        0,
      );

      const totalCommission = sessions.reduce(
        (sum, s) => sum + (s.commission || 0),
        0,
      );
      const statusSummary = {
        requested: 0,
        accepted: 0,
        ongoing: 0,
        completed: 0,
        cancelled: 0,
        failed: 0,
      };

      sessions.forEach((session) => {
        switch (session.status) {
          case "REQUESTED":
            statusSummary.requested++;
            break;

          case "ACCEPTED":
            statusSummary.accepted++;
            break;

          case "ONGOING":
            statusSummary.ongoing++;
            break;

          case "COMPLETED":
            statusSummary.completed++;
            break;

          case "FAILED":
            statusSummary.failed++;
            break;

          case "CANCELLED":
            statusSummary.cancelled++;
            break;
        }
      });

      return {
        totalChats,

        totalCalls,

        totalSessions: sessions.length,

        totalCoinsEarned,

        totalCoinsDeducted,

        totalCommission,

        totalDurationMinutes,

        walletBalance: astrologer.wallet?.balanceCoins || 0,

        totalEarned: astrologer.wallet?.totalEarned || 0,

        totalWithdrawn: astrologer.wallet?.totalWithdrawn || 0,

        totalFollowers: astrologer.followers.length,

        totalReviews: astrologer.reviews.length,

        averageRating: astrologer.rating || 0,
        statusSummary,
      };
    },

    getAstrologerChatHistory: async (
      _,
      { astrologerId, page = 1, limit = 10, status, filter },
      { prisma },
    ) => {
      const skip = (page - 1) * limit;

      const where = {
        astrologerId,
        type: "CHAT",
      };

      if (status) {
        where.status = status;
      }
      const filterDate = getFilterDate(filter);

      if (filterDate) {
        where.createdAt = {
          gte: filterDate,
        };
      }

      const [sessions, totalCount] = await Promise.all([
        prisma.session.findMany({
          where,

          include: {
            user: true,
            remedies: {
              select: {
                id: true,
              },
              take: 1,
            },
          },

          orderBy: {
            createdAt: "desc",
          },

          skip,
          take: limit,
        }),

        prisma.session.count({
          where,
        }),
      ]);

      return {
        data: sessions.map((session) => ({
          sessionId: session.id,

          userId: session.userId,

          userName: session.user?.name || "",
          by: session.by,
          ratePerMin: session.ratePerMin,

          durationSec: session.durationSec,

          astrologerCommission: session.commission,

          dhwaniCommission: session.coinsEarned,

          coinsDeducted: session.coinsDeducted,

          status: session.status,

          startedAt: session.startedAt?.toISOString(),

          endedAt: session.endedAt?.toISOString(),
          hasRemedy: session.remedies.length > 0,

          createdAt: session.createdAt?.toISOString(),
        })),

        totalCount,

        currentPage: page,

        totalPages: Math.ceil(totalCount / limit),
      };
    },

    getAstrologerCallHistory: async (
      _,
      { astrologerId, page = 1, limit = 10, status, filter },
      { prisma },
    ) => {
      const skip = (page - 1) * limit;

      const where = {
        astrologerId,
        type: "CALL",
      };

      if (status) {
        where.status = status;
      }
      const filterDate = getFilterDate(filter);

      if (filterDate) {
        where.createdAt = {
          gte: filterDate,
        };
      }

      const [sessions, totalCount] = await Promise.all([
        prisma.session.findMany({
          where,

          include: {
            user: true,
          },

          orderBy: {
            createdAt: "desc",
          },

          skip,
          take: limit,
        }),

        prisma.session.count({
          where,
        }),
      ]);

      return {
        data: sessions.map((session) => ({
          sessionId: session.id,

          userId: session.userId,

          userName: session.user?.name || "",

          ratePerMin: session.ratePerMin,

          durationSec: session.durationSec,
          by: session.by,
          astrologerCommission: session.commission,

          dhwaniCommission: session.coinsEarned,

          coinsDeducted: session.coinsDeducted,

          status: session.status,

          startedAt: session.startedAt?.toISOString(),

          endedAt: session.endedAt?.toISOString(),

          createdAt: session.createdAt?.toISOString(),
        })),

        totalCount,

        currentPage: page,

        totalPages: Math.ceil(totalCount / limit),
      };
    },
    getSessionAnalytics: async (_, { status, filter }, { prisma }) => {
      const where = {};

      if (status) {
        where.status = status;
      }

      const filterDate = getFilterDate(filter);

      if (filterDate) {
        where.createdAt = {
          gte: filterDate,
        };
      }

      const sessions = await prisma.session.findMany({
        where,
        include: {
          user: true,
          astrologer: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const statusSummary = {
        requested: 0,
        accepted: 0,
        ongoing: 0,
        completed: 0,
        cancelled: 0,
        failed: 0,
      };

      sessions.forEach((session) => {
        const status = session.status?.toLowerCase();

        if (statusSummary.hasOwnProperty(status)) {
          statusSummary[status]++;
        }
      });
      const totalChats = sessions.filter(
        (s) => s.type?.toUpperCase() === "CHAT",
      ).length;

      const totalCalls = sessions.filter(
        (s) => s.type?.toUpperCase() === "CALL",
      ).length;
      return {
        totalSessions: sessions.length,
        totalChats,
        totalCalls,
        statusSummary,

        recentSessions: sessions.map((session) => ({
          sessionId: session.id,
          userId: session.userId,
          roomId: session.roomId,
          userName: session.user?.name || null,
          type: session.type,
          by: session.by,
          astrologerId: session.astrologerId,
          ratePerMin: session.ratePerMin,
          durationSec: session.durationSec,

          astrologerCommission: session.coinsEarned,

          dhwaniCommission: session.commission,

          coinsDeducted: session.coinsDeducted,

          status: session.status,

          startedAt: session.startedAt?.toISOString() || null,
          endedAt: session.endedAt?.toISOString() || null,
          createdAt: session.createdAt?.toISOString() || null,
        })),
      };
    },

    getAstrologerFollowers: async (
      _,
      { astrologerId, page = 1, limit = 20, search },
      { prisma },
    ) => {
      try {
        const skip = (page - 1) * limit;

        const where = {
          astrologerId,
        };

        if (search) {
          where.user = {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                mobile: {
                  contains: search,
                },
              },
            ],
          };
        }

        const [followers, totalCount] = await Promise.all([
          prisma.astrologerFollow.findMany({
            where,

            include: {
              user: true,
              astrologer: true,
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: limit,
          }),

          prisma.astrologerFollow.count({
            where,
          }),
        ]);

        return {
          data: followers,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (err) {
        throw new Error(err.message);
      }
    },

    // -------------------- RESOLVER --------------------

    getUsersChatHistory: async (_, { searchInput }, { prisma }) => {
      try {
        const {
          query,
          mobile,
          astrologerName,
          userId,
          status,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 10,
        } = searchInput;

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 100);

        const skip = (safePage - 1) * safeLimit;

        // ---------------- WHERE CONDITION ----------------

        const where = {
          type: "CHAT", // ONLY CHAT DATA
        };
        if (userId) {
          where.userId = userId;
        }

        // ---------------- USER SEARCH FILTER ----------------

        const userFilters = [];

        if (query) {
          userFilters.push(
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              mobile: {
                contains: query,
              },
            },
          );
        }

        if (mobile) {
          userFilters.push({
            mobile: {
              contains: mobile,
            },
          });
        }

        if (userFilters.length > 0) {
          where.user = {
            OR: userFilters,
          };
        }

        // ---------------- ASTROLOGER FILTER ----------------

        if (astrologerName) {
          where.astrologer = {
            name: {
              contains: astrologerName,
              mode: "insensitive",
            },
          };
        }

        // ---------------- STATUS FILTER ----------------

        if (status) {
          where.status = status;
        }

        // ---------------- DATE FILTER ----------------

        let start;
        let end;

        if (filterType) {
          switch (filterType) {
            case "TODAY":
              start = new Date();
              start.setHours(0, 0, 0, 0);

              end = new Date();
              break;

            case "WEEK":
              start = new Date();
              start.setDate(start.getDate() - 7);

              end = new Date();
              break;

            case "MONTH":
              start = new Date();
              start.setMonth(start.getMonth() - 1);

              end = new Date();
              break;

            case "YEAR":
              start = new Date();
              start.setFullYear(start.getFullYear() - 1);

              end = new Date();
              break;

            case "CUSTOM":
              start = startDate
                ? new Date(`${startDate}T00:00:00+05:30`)
                : undefined;

              end = endDate ? new Date(`${endDate}T00:00:00+05:30`) : undefined;

              // Include the complete end date
              if (end) {
                end.setDate(end.getDate() + 1);
              }

              break;
          }
        }

        if (start || end) {
          where.createdAt = {};

          if (start) {
            where.createdAt.gte = start;
          }

          if (end) {
            where.createdAt.lt = end;
          }
        }

        // ---------------- FETCH DATA ----------------

        const [sessions, totalCount, aggregate] = await Promise.all([
          prisma.session.findMany({
            where,

            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  mobile: true,
                  countryCode: true,
                },
              },

              astrologer: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },

              remedies: {
                select: {
                  id: true,
                },
                take: 1,
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: safeLimit,
          }),

          prisma.session.count({
            where,
          }),

          prisma.session.aggregate({
            where,

            _sum: {
              coinsDeducted: true,
              coinsEarned: true,
              commission: true,
            },
          }),
        ]);

        // ---------------- FORMAT RESPONSE ----------------

        const formattedData = sessions.map((session) => ({
          sessionId: session.id,
          userId: session.userId,
          source: session.source,
          userId: session.user?.id || null,
          userName: session.user?.name || "",
          mobile: session.user?.mobile || "",
          by: session.by,
          astrologerId: session.astrologer?.id || null,
          astrologerName:
            session.astrologer?.displayName || session.astrologer?.name || "",

          type: session.type,
          status: session.status,

          ratePerMin: session.ratePerMin || 0,

          durationSec: session.durationSec || 0,

          coinsDeducted: session.coinsDeducted || 0,

          coinsEarned: session.coinsEarned || 0,

          commission: session.commission || 0,

          startedAt: session.startedAt,
          endedAt: session.endedAt,
          hasRemedy: session.remedies.length > 0,
          createdAt: session.createdAt,
        }));

        return {
          data: formattedData,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),

          totalCoinsDeducted: aggregate?._sum?.coinsDeducted || 0,

          totalCoinsEarned: aggregate?._sum?.coinsEarned || 0,

          totalCommission: aggregate?._sum?.commission || 0,
        };
      } catch (error) {
        throw new Error("Failed to fetch users chat history");
      }
    },
    getCallRecording: async (_, { sessionId }, { prisma }) => {
      return prisma.callRecording.findFirst({
        where: {
          sessionId,
          status: "active",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    },

    getUserCallHistory: async (_, { searchInput }, { prisma }) => {
      try {
        const {
          query,
          mobile,
          astrologerName,
          userId,
          status,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 10,
        } = searchInput;

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 100);

        const skip = (safePage - 1) * safeLimit;

        // ---------------- WHERE CONDITION ----------------

        const where = {
          type: "CALL",
        };

        // ---------------- USER SEARCH FILTER ----------------
        const userWhere = {};

        if (userId) {
          userWhere.id = userId;
        }

        const userFilters = [];

        if (query) {
          userFilters.push(
            {
              name: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              mobile: {
                contains: query,
              },
            },
          );
        }

        if (mobile) {
          userFilters.push({
            mobile: {
              contains: mobile,
            },
          });
        }

        if (userFilters.length) {
          userWhere.OR = userFilters;
        }

        if (Object.keys(userWhere).length) {
          where.user = userWhere;
        }
        // ---------------- ASTROLOGER FILTER ----------------

        if (astrologerName) {
          where.astrologer = {
            name: {
              contains: astrologerName,
              mode: "insensitive",
            },
          };
        }

        // ---------------- STATUS FILTER ----------------

        if (status) {
          where.status = status;
        }

        // ---------------- DATE FILTER ----------------
        // ---------------- DATE FILTER ----------------

        let start;
        let end;

        if (filterType) {
          switch (filterType) {
            case "TODAY":
              start = new Date();
              start.setHours(0, 0, 0, 0);

              end = new Date();
              break;

            case "WEEK":
              start = new Date();
              start.setDate(start.getDate() - 7);

              end = new Date();
              break;

            case "MONTH":
              start = new Date();
              start.setMonth(start.getMonth() - 1);

              end = new Date();
              break;

            case "YEAR":
              start = new Date();
              start.setFullYear(start.getFullYear() - 1);

              end = new Date();
              break;

            case "CUSTOM":
              start = startDate
                ? new Date(`${startDate}T00:00:00+05:30`)
                : undefined;

              end = endDate ? new Date(`${endDate}T00:00:00+05:30`) : undefined;

              // Include complete end date
              if (end) {
                end.setDate(end.getDate() + 1);
              }

              break;
          }
        }

        if (start || end) {
          where.createdAt = {};

          if (start) {
            where.createdAt.gte = start;
          }

          if (end) {
            where.createdAt.lt = end;
          }
        }

        // ---------------- FETCH DATA ----------------

        const [sessions, totalCount, aggregate] = await Promise.all([
          prisma.session.findMany({
            where,

            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  mobile: true,
                  countryCode: true,
                },
              },

              astrologer: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },
              remedies: {
                select: {
                  id: true,
                },
                take: 1,
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: safeLimit,
          }),

          prisma.session.count({
            where,
          }),

          prisma.session.aggregate({
            where,

            _sum: {
              coinsDeducted: true,
              coinsEarned: true,
              commission: true,
            },
          }),
        ]);

        // ---------------- FORMAT RESPONSE ----------------

        const formattedData = sessions.map((session) => ({
          sessionId: session.id,
          by: session.by,
          userId: session.user?.id || null,
          userName: session.user?.name || "",
          mobile: session.user?.mobile || "",
          source: session.source,
          astrologerId: session.astrologer?.id || null,
          astrologerName:
            session.astrologer?.displayName || session.astrologer?.name || "",

          type: session.type,
          status: session.status,

          ratePerMin: session.ratePerMin || 0,

          durationSec: session.durationSec || 0,

          coinsDeducted: session.coinsDeducted || 0,

          coinsEarned: session.coinsEarned || 0,

          commission: session.commission || 0,

          startedAt: session.startedAt,
          endedAt: session.endedAt,
          hasRemedy: session.remedies.length > 0,

          createdAt: session.createdAt,
        }));

        return {
          data: formattedData,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),

          totalCoinsDeducted: aggregate?._sum?.coinsDeducted || 0,

          totalCoinsEarned: aggregate?._sum?.coinsEarned || 0,

          totalCommission: aggregate?._sum?.commission || 0,
        };
      } catch (error) {
        throw new Error("Failed to fetch user call history");
      }
    },
    getPendingAstrologers: async (_, { page = 1, limit = 10 }, context) => {
      try {
        if (!context.user || context.user.role !== "ADMIN") {
          throw new Error("Admin only");
        }

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 50);
        const skip = (safePage - 1) * safeLimit;

        const whereCondition = {
          approvalStatus: {
            in: ["PENDING", "INTERVIEW", "DOCUMENT_VERIFICATION"],
          },
        };

        const [astrologers, totalCount] = await Promise.all([
          prisma.astrologer.findMany({
            where: whereCondition,
            skip,
            take: safeLimit,
            include: {
              addresses: true,
              experiences: true,
              interviews: true,
              documents: true,
              rejectionHistory: true,
            },
            orderBy: { createdAt: "desc" },
          }),
          prisma.astrologer.count({ where: whereCondition }),
        ]);

        const response = {
          data: astrologers,
          totalCount,
          currentPage: safePage,
          totalPages: Math.ceil(totalCount / safeLimit),
        };

        return response;
      } catch (error) {
        throw error;
      }
    },

    getAstrologerInterviews: async (
      _,
      { astrologerId, page = 1, limit = 10 },
      context,
    ) => {
      try {
        if (!context.user || context.user.role !== "ADMIN") {
          throw new Error("Admin only");
        }

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 50);
        const skip = (safePage - 1) * safeLimit;

        const whereCondition = { astrologerId };

        const [interviews, totalCount] = await Promise.all([
          prisma.interview.findMany({
            where: whereCondition,
            skip,
            take: safeLimit,
            orderBy: { roundNumber: "asc" },
          }),
          prisma.interview.count({ where: whereCondition }),
        ]);

        const response = {
          data: interviews,
          totalCount,
          currentPage: safePage,
          totalPages: Math.ceil(totalCount / safeLimit),
        };

        return response;
      } catch (error) {
        throw error;
      }
    },

    getRegisteredAstrologers: async (_, { page = 1, limit = 10 }, context) => {
      try {
        if (!context.user || context.user.role !== "ADMIN") {
          throw new Error("Admin only");
        }

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 50);
        const skip = (safePage - 1) * safeLimit;

        const astrologers = await prisma.astrologer.findMany({
          skip,
          take: safeLimit,
          include: {
            addresses: true,
            experiences: true,
          },
          orderBy: { createdAt: "desc" },
        });

        return astrologers;
      } catch (error) {
        throw error;
      }
    },

    getApprovedAstrologers: async (_, { page = 1, limit = 10 }, context) => {
      try {
        if (!context.user || context.user.role !== "ADMIN") {
          throw new Error("Admin only");
        }

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 50);
        const skip = (safePage - 1) * safeLimit;

        const whereCondition = { approvalStatus: "APPROVED" };

        const [astrologers, totalCount] = await Promise.all([
          prisma.astrologer.findMany({
            where: whereCondition,
            skip,
            take: safeLimit,
            include: {
              addresses: true,
              experiences: true,
              interviews: true,
              documents: true,
              rejectionHistory: true,
            },
            orderBy: { createdAt: "desc" },
          }),
          prisma.astrologer.count({ where: whereCondition }),
        ]);

        const response = {
          data: astrologers,
          totalCount,
          currentPage: safePage,
          totalPages: Math.ceil(totalCount / safeLimit),
        };

        return response;
      } catch (error) {
        throw error;
      }
    },

    getAdmins: async (_, { page = 1, limit = 10 }, context) => {
      try {
        if (!context.user || context.user.role !== "SUPER_ADMIN") {
          throw new Error("Only SUPER_ADMIN can view admins");
        }

        const skip = (page - 1) * limit;

        const whereCondition = {
          role: {
            name: "ADMIN",
          },
        };

        const [admins, totalCount] = await Promise.all([
          prisma.admin.findMany({
            where: whereCondition,
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
            include: {
              role: true,
            },
          }),
          prisma.admin.count({
            where: whereCondition,
          }),
        ]);

        return {
          data: admins,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        throw new Error("Failed to fetch admins");
      }
    },

    getRechargePacks: async (_, __, context) => {
      await checkPermission(context, "walletpackages.read");

      return prisma.rechargePack.findMany({
        orderBy: { createdAt: "desc" },
      });
    },
 getUserWalletTransactions: async (
  _,
  {
    page = 1,
    limit = 20,
    type,
    amount,
    mobile,
    userId,
    filterType,
    startDate,
    endDate,
    onlyRecharge = false,
  },
) => {
  try {
    const skip = (page - 1) * limit;

    const whereClause = {
      userWalletId: {
        not: null,
      },
    };

    if (onlyRecharge) {
      whereClause.rechargePackId = {
        not: null,
      };
    }

    if (type) {
      whereClause.type = type.toUpperCase();
    }

    if (amount) {
      whereClause.amount = Number(amount);
    }

    if (userId || mobile) {
      whereClause.userWallet = {};

      if (userId) {
        whereClause.userWallet.userId = userId;
      }

      if (mobile) {
        whereClause.userWallet.user = {
          mobile: {
            contains: mobile,
          },
        };
      }
    }

    const now = new Date();

    if (filterType === "WEEK") {
      const weekStart = new Date();
      weekStart.setDate(now.getDate() - 7);

      whereClause.createdAt = {
        gte: weekStart,
        lte: now,
      };
    }

    if (filterType === "MONTH") {
      const monthStart = new Date();
      monthStart.setMonth(now.getMonth() - 1);

      whereClause.createdAt = {
        gte: monthStart,
        lte: now,
      };
    }

    if (filterType === "YEAR") {
      const yearStart = new Date();
      yearStart.setFullYear(now.getFullYear() - 1);

      whereClause.createdAt = {
        gte: yearStart,
        lte: now,
      };
    }

    if (filterType === "CUSTOM" && startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // ---------------------------------------------------------
    // 1. GET PAGINATED TRANSACTIONS
    // ---------------------------------------------------------

    const [data, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereClause,
        include: {
          userWallet: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  mobile: true,
                },
              },
            },
          },
          rechargePack: true,
          payment: true,
          session: {
            select: {
              id: true,
            },
          },
        },
        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        skip,
        take: limit,
      }),

      prisma.walletTransaction.count({
        where: whereClause,
      }),
    ]);

    // ---------------------------------------------------------
    // 2. GET ALL TRANSACTIONS FOR THESE WALLETS
    // ---------------------------------------------------------

    const walletIds = [
      ...new Set(
        data
          .map((transaction) => transaction.userWalletId)
          .filter(Boolean),
      ),
    ];

    const allWalletTransactions =
      walletIds.length > 0
        ? await prisma.walletTransaction.findMany({
            where: {
              userWalletId: {
                in: walletIds,
              },
            },
            select: {
              id: true,
              userWalletId: true,
              type: true,
              coins: true,
              createdAt: true,
            },
            orderBy: [
              {
                createdAt: "desc",
              },
              {
                id: "desc",
              },
            ],
          })
        : [];

    // ---------------------------------------------------------
    // 3. GET CURRENT WALLET BALANCES
    // ---------------------------------------------------------

    const wallets = walletIds.length
      ? await prisma.userWallet.findMany({
          where: {
            id: {
              in: walletIds,
            },
          },
          select: {
            id: true,
            balanceCoins: true,
          },
        })
      : [];

    const currentBalanceMap = new Map();

    wallets.forEach((wallet) => {
      currentBalanceMap.set(
        wallet.id,
        Number(wallet.balanceCoins || 0),
      );
    });

    // ---------------------------------------------------------
    // 4. CALCULATE HISTORICAL UPDATED BALANCE
    // ---------------------------------------------------------

    const updatedBalanceMap = new Map();

    // Group transactions wallet-wise
    const transactionsByWallet = new Map();

    allWalletTransactions.forEach((transaction) => {
      if (!transactionsByWallet.has(transaction.userWalletId)) {
        transactionsByWallet.set(transaction.userWalletId, []);
      }

      transactionsByWallet
        .get(transaction.userWalletId)
        .push(transaction);
    });

    transactionsByWallet.forEach((transactions, walletId) => {
      let runningBalance =
        currentBalanceMap.get(walletId) || 0;

      // Transactions are DESC:
      // latest -> oldest
      transactions.forEach((transaction) => {
        // Balance AFTER this transaction
        updatedBalanceMap.set(
          transaction.id,
          runningBalance,
        );

        const coins = Number(transaction.coins || 0);

        // ---------------------------------------------------
        // IMPORTANT:
        // Change these transaction types according to your
        // actual TransactionType enum.
        // ---------------------------------------------------

        const type = String(transaction.type || "").toUpperCase();

        const isCredit =
          type === "RECHARGE" ||
          type === "CREDIT" ||
          type === "REFUND";

        const isDebit =
          type === "DEBIT" ||
          type === "CHAT" ||
          type === "CALL" ||
          type === "SESSION";

        if (isCredit) {
          runningBalance -= coins;
        } else if (isDebit) {
          runningBalance += coins;
        }
      });
    });

    // ---------------------------------------------------------
    // 5. ADD updatedBalance TO RESPONSE
    // ---------------------------------------------------------

    const finalData = data.map((transaction) => ({
      ...transaction,

      updatedBalance:
        updatedBalanceMap.get(transaction.id) ??
        Number(transaction.userWallet?.balanceCoins || 0),
    }));

    // ---------------------------------------------------------
    // 6. RETURN
    // ---------------------------------------------------------

    return {
      data: finalData,
      totalCount,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    };
  } catch (err) {
    console.error("getUserWalletTransactions error:", err);

    throw new Error(
      err.message || "Failed to fetch transactions",
    );
  }
},

    // getAstrologerWalletTransactions: async (
    //   _,
    //   {
    //     page = 1,
    //     limit = 20,
    //     type,
    //     amount,
    //     contactNo,
    //     astrologerId,
    //     filterType,
    //     startDate,
    //     endDate,
    //   },
    // ) => {
    //   try {
    //     const skip = (page - 1) * limit;
    //     const whereClause = {
    //       astrologerWalletId: {
    //         not: null,
    //       },
    //     };
    //     if (type) {
    //       whereClause.type = type.toUpperCase();
    //     }
    //     if (amount) {
    //       whereClause.amount = Number(amount);
    //     }
    //     if (contactNo) {
    //       whereClause.astrologerWallet = {
    //         astrologer: {
    //           contactNo: {
    //             contains: contactNo,
    //           },
    //         },
    //       };
    //     }
    //     if (astrologerId) {
    //       whereClause.astrologerWallet = {
    //         ...(whereClause.astrologerWallet || {}),
    //         astrologer: {
    //           ...(whereClause.astrologerWallet?.astrologer || {}),
    //           id: astrologerId,
    //         },
    //       };
    //     }
    //     const now = new Date();
    //     if (filterType === "WEEK") {
    //       const weekStart = new Date();
    //       weekStart.setDate(now.getDate() - 7);

    //       whereClause.createdAt = {
    //         gte: weekStart,
    //         lte: now,
    //       };
    //     }
    //     if (filterType === "MONTH") {
    //       const monthStart = new Date();
    //       monthStart.setMonth(now.getMonth() - 1);

    //       whereClause.createdAt = {
    //         gte: monthStart,
    //         lte: now,
    //       };
    //     }
    //     if (filterType === "YEAR") {
    //       const yearStart = new Date();
    //       yearStart.setFullYear(now.getFullYear() - 1);

    //       whereClause.createdAt = {
    //         gte: yearStart,
    //         lte: now,
    //       };
    //     }
    //     if (filterType === "CUSTOM" && startDate && endDate) {
    //       whereClause.createdAt = {
    //         gte: new Date(startDate),
    //         lte: new Date(endDate),
    //       };
    //     }
    //     const [data, totalCount] = await Promise.all([
    //       prisma.walletTransaction.findMany({
    //         where: whereClause,

    //         include: {
    //           astrologerWallet: {
    //             include: {
    //               astrologer: {
    //                 select: {
    //                   id: true,
    //                   name: true,
    //                   displayName: true,
    //                   contactNo: true,
    //                   email: true,
    //                 },
    //               },
    //             },
    //           },

    //           session: {
    //             select: {
    //               id: true,
    //               type: true,
    //               status: true,
    //               coinsEarned: true,
    //               coinsDeducted: true,
    //               commission: true,
    //               durationSec: true,
    //               ratePerMin: true,
    //               startedAt: true,
    //               endedAt: true,
    //               createdAt: true,
    //               roomId: true,
    //             },
    //           },

    //           payment: {
    //             select: {
    //               id: true,
    //               amount: true,
    //               coins: true,
    //               status: true,
    //               provider: true,
    //               razorpayPaymentId: true,
    //               createdAt: true,
    //             },
    //           },
    //         },

    //         orderBy: {
    //           createdAt: "desc",
    //         },

    //         skip,
    //         take: limit,
    //       }),

    //       prisma.walletTransaction.count({
    //         where: whereClause,
    //       }),
    //     ]);

    //     // Current balance
    //     let runningBalance = data[0]?.astrologerWallet?.balanceCoins ?? 0;

    //     const updatedData = data.map((transaction) => {
    //       const transactionAmount = Number(transaction.amount || 0);

    //       // Balance AFTER this transaction
    //       const balanceAfterTransaction = runningBalance;

    //       // Calculate balance BEFORE this transaction
    //       if (transaction.type === "CREDIT") {
    //         runningBalance -= transactionAmount;
    //       } else if (transaction.type === "DEBIT") {
    //         runningBalance += transactionAmount;
    //       }

    //       return {
    //         ...transaction,
    //         updatedBalance: balanceAfterTransaction,
    //       };
    //     });
    //     const totalPages = Math.ceil(totalCount / limit);
    //     return {
    //       data: updatedData,
    //       totalCount,
    //       totalPages,
    //     };
    //   } catch (err) {
    //     throw new Error("Failed to fetch astrologer wallet transactions");
    //   }
    // },

getAstrologerWalletTransactions: async (
  _,
  {
    page = 1,
    limit = 20,
    type,
    amount,
    contactNo,
    astrologerId,
    filterType,
    startDate,
    endDate,
  },
) => {
  try {
    const skip = (page - 1) * limit;

    // --------------------------------
    // BASE WHERE
    // --------------------------------

    const whereClause = {
      astrologerWalletId: {
        not: null,
      },
    };

    // --------------------------------
    // TYPE FILTER
    // --------------------------------

    if (type) {
      whereClause.type = type.toUpperCase();
    }

    // --------------------------------
    // AMOUNT FILTER
    // --------------------------------

    if (
      amount !== undefined &&
      amount !== null &&
      amount !== ""
    ) {
      whereClause.amount = Number(amount);
    }

    // --------------------------------
    // ASTROLOGER FILTER
    // --------------------------------

    if (contactNo || astrologerId) {
      whereClause.astrologerWallet = {
        astrologer: {},
      };

      if (contactNo) {
        whereClause.astrologerWallet.astrologer.contactNo = {
          contains: contactNo,
        };
      }

      if (astrologerId) {
        whereClause.astrologerWallet.astrologer.id =
          astrologerId;
      }
    }

    // --------------------------------
    // DATE FILTER
    // --------------------------------

    const now = new Date();

    if (filterType === "WEEK") {
      const weekStart = new Date();
      weekStart.setDate(now.getDate() - 7);

      whereClause.createdAt = {
        gte: weekStart,
        lte: now,
      };
    }

    if (filterType === "MONTH") {
      const monthStart = new Date();
      monthStart.setMonth(now.getMonth() - 1);

      whereClause.createdAt = {
        gte: monthStart,
        lte: now,
      };
    }

    if (filterType === "YEAR") {
      const yearStart = new Date();
      yearStart.setFullYear(now.getFullYear() - 1);

      whereClause.createdAt = {
        gte: yearStart,
        lte: now,
      };
    }

    if (
      filterType === "CUSTOM" &&
      startDate &&
      endDate
    ) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    // --------------------------------
    // GET TRANSACTIONS
    // --------------------------------

    const [data, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereClause,

        include: {
          astrologerWallet: {
            include: {
              astrologer: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  contactNo: true,
                  email: true,
                },
              },
            },
          },

          session: {
            select: {
              id: true,
              type: true,
              status: true,
              coinsEarned: true,
              coinsDeducted: true,
              commission: true,
              durationSec: true,
              ratePerMin: true,
              startedAt: true,
              endedAt: true,
              createdAt: true,
              roomId: true,
            },
          },

          payment: {
            select: {
              id: true,
              amount: true,
              coins: true,
              status: true,
              provider: true,
              razorpayPaymentId: true,
              createdAt: true,
            },
          },
        },

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        skip,
        take: limit,
      }),

      prisma.walletTransaction.count({
        where: whereClause,
      }),
    ]);

    // --------------------------------
    // CURRENT ASTROLOGER WALLET BALANCE
    // --------------------------------
    //
    // This is the CURRENT balance of the
    // astrologer's wallet.
    //
    // Example:
    //
    // Current wallet = 18
    //
    // --------------------------------

    let runningBalance = Number(
      data[0]?.astrologerWallet?.balanceCoins ?? 0
    );

    // --------------------------------
    // CALCULATE TRANSACTION BALANCE
    // --------------------------------
    //
    // IMPORTANT:
    //
    // CREDIT = money/coins added to astrologer wallet
    //
    // DEBIT = money/coins deducted from astrologer wallet
    //
    // REFUND = money/coins deducted from astrologer wallet
    //
    // Since we start from CURRENT balance and
    // move backwards:
    //
    // CREDIT:
    // Current = Previous + Credit
    // Previous = Current - Credit
    //
    // DEBIT:
    // Current = Previous - Debit
    // Previous = Current + Debit
    //
    // REFUND:
    // Current = Previous - Refund
    // Previous = Current + Refund
    //
    // --------------------------------

    const updatedData = data.map((transaction) => {
      const transactionCoins = Number(
        transaction.coins || 0
      );

      // --------------------------------
      // BALANCE AFTER TRANSACTION
      // --------------------------------

      const balanceAfterTransaction =
        runningBalance;

      // --------------------------------
      // CALCULATE PREVIOUS BALANCE
      // --------------------------------

      switch (transaction.type) {
        case "CREDIT":
          // CREDIT increased astrologer's wallet
          runningBalance -= transactionCoins;
          break;

        case "DEBIT":
          // DEBIT decreased astrologer's wallet
          runningBalance += transactionCoins;
          break;

        case "REFUND":
          // REFUND also decreased astrologer's wallet
          runningBalance += transactionCoins;
          break;

        default:
          // Unknown transaction type
          // Do not modify balance
          break;
      }

      return {
        ...transaction,

        // Balance AFTER this transaction
        updatedBalance: Number(
          balanceAfterTransaction.toFixed(2)
        ),
      };
    });

    // --------------------------------
    // PAGINATION
    // --------------------------------

    const totalPages = Math.ceil(
      totalCount / limit
    );

    return {
      data: updatedData,
      totalCount,
      currentPage: page,
      totalPages,
    };
  } catch (err) {
    console.error(
      "getAstrologerWalletTransactions error:",
      err
    );

    throw new Error(
      err.message ||
        "Failed to fetch astrologer wallet transactions"
    );
  }
},


    getAllWalletTransactions: async (
      _,
      {
        page = 1,
        limit = 20,
        type,
        amount,
        contactNo,
        filterType,
        startDate,
        endDate,
        source,
      },
    ) => {
      try {
        const skip = (page - 1) * limit;

        const whereClause = {};
        if (source === "USER") {
          whereClause.userWalletId = { not: null };
        }

        if (source === "ASTROLOGER") {
          whereClause.astrologerWalletId = { not: null };
        }
        if (type) {
          whereClause.type = type.toUpperCase();
        }
        if (amount) {
          whereClause.amount = Number(amount);
        }
        if (contactNo) {
          whereClause.OR = [
            {
              userWallet: {
                user: {
                  contactNo: {
                    contains: contactNo,
                  },
                },
              },
            },
            {
              astrologerWallet: {
                astrologer: {
                  contactNo: {
                    contains: contactNo,
                  },
                },
              },
            },
          ];
        }
        const now = new Date();

        if (filterType === "WEEK") {
          const weekStart = new Date();
          weekStart.setDate(now.getDate() - 7);

          whereClause.createdAt = { gte: weekStart, lte: now };
        }

        if (filterType === "MONTH") {
          const monthStart = new Date();
          monthStart.setMonth(now.getMonth() - 1);

          whereClause.createdAt = { gte: monthStart, lte: now };
        }

        if (filterType === "YEAR") {
          const yearStart = new Date();
          yearStart.setFullYear(now.getFullYear() - 1);

          whereClause.createdAt = { gte: yearStart, lte: now };
        }

        if (filterType === "CUSTOM" && startDate && endDate) {
          whereClause.createdAt = {
            gte: new Date(startDate),
            lte: new Date(endDate),
          };
        }
        const [data, totalCount] = await Promise.all([
          prisma.walletTransaction.findMany({
            where: whereClause,

            include: {
              userWallet: {
                include: {
                  user: true,
                },
              },
              astrologerWallet: {
                include: {
                  astrologer: true,
                },
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: limit,
          }),

          prisma.walletTransaction.count({
            where: whereClause,
          }),
        ]);
        const formattedData = data.map((tx) => ({
          ...tx,
          source: tx.userWalletId ? "USER" : "ASTROLOGER",
        }));

        return {
          data: formattedData,
          totalCount,
        };
      } catch (err) {
        throw new Error("Failed to fetch wallet transactions");
      }
    },
    getUserReviews: async (_, { searchInput }, { prisma }) => {
      try {
        const {
          query,
          userName,
          userId,
          astrologerName,
          rating,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 10,
        } = searchInput;

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 50);

        const skip = (safePage - 1) * safeLimit;

        // ---------------- WHERE CONDITION ----------------

        const where = {};
        if (userId) {
          where.userId = userId;
        }

        // ---------------- SEARCH FILTER ----------------

        const orFilters = [];

        if (query) {
          orFilters.push(
            {
              userName: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              astroName: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              comment: {
                contains: query,
                mode: "insensitive",
              },
            },
          );
        }

        if (orFilters.length > 0) {
          where.OR = orFilters;
        }

        // ---------------- USER FILTER ----------------

        if (userName) {
          where.userName = {
            contains: userName,
            mode: "insensitive",
          };
        }

        // ---------------- ASTROLOGER FILTER ----------------

        if (astrologerName) {
          where.astroName = {
            contains: astrologerName,
            mode: "insensitive",
          };
        }

        // ---------------- RATING FILTER ----------------

        if (rating) {
          where.rating = Number(rating);
        }

        // ---------------- DATE FILTER ----------------

        let start;
        let end;

        if (filterType) {
          switch (filterType) {
            case "TODAY":
              start = new Date();
              start.setHours(0, 0, 0, 0);

              end = new Date();
              break;

            case "WEEK":
              start = new Date();
              start.setDate(start.getDate() - 7);

              end = new Date();
              break;

            case "MONTH":
              start = new Date();
              start.setMonth(start.getMonth() - 1);

              end = new Date();
              break;

            case "YEAR":
              start = new Date();
              start.setFullYear(start.getFullYear() - 1);

              end = new Date();
              break;

            case "CUSTOM":
              start = startDate ? new Date(startDate) : undefined;
              end = endDate ? new Date(endDate) : undefined;
              break;
          }
        }

        if (start || end) {
          where.createdAt = {};

          if (start) {
            where.createdAt.gte = start;
          }

          if (end) {
            where.createdAt.lte = end;
          }
        }

        // ---------------- FETCH DATA ----------------

        const [reviews, totalCount, aggregate] = await Promise.all([
          prisma.review.findMany({
            where,

            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  mobile: true,
                },
              },

              astrologer: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                },
              },

              session: {
                select: {
                  id: true,
                  type: true,
                  status: true,
                },
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: safeLimit,
          }),

          prisma.review.count({
            where,
          }),

          prisma.review.aggregate({
            where,

            _avg: {
              rating: true,
            },
          }),
        ]);

        const formattedData = reviews.map((review) => ({
          reviewId: review.id,

          sessionId: review.session?.id || null,
          orderId: review.session?.orderId || null,
          userId: review.user?.id || null,
          userName: review.user?.name || null,
          astrologerId: review.astrologer?.id || null,
          astrologerName: review.astrologer?.name || "",
          displayName: review.astrologer?.displayName || "",
          mobile: review.user?.mobile || "",
          sessionType: review.session?.type || "",
          sessionStatus: review.session?.status || "",
          rating: review.rating,
          comment: review.comment || "",
          createdAt: review.createdAt,
          isFlagged: review.isFlagged,
        }));

        return {
          data: formattedData,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),

          averageRating: aggregate?._avg?.rating || 0,
        };
      } catch (error) {
        throw new Error("Failed to fetch user reviews");
      }
    },

    getFraudFlags: async (_, { searchInput }, { prisma }) => {
      try {
        const { query, page = 1, limit = 10 } = searchInput || {};

        const safePage = Math.max(page, 1);
        const safeLimit = Math.min(limit, 50);

        const skip = (safePage - 1) * safeLimit;

        const where = {};

        if (query) {
          where.keyword = {
            contains: query,
            mode: "insensitive",
          };
        }

        const [flags, totalCount] = await Promise.all([
          prisma.fraudFlag.findMany({
            where,

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: safeLimit,
          }),

          prisma.fraudFlag.count({
            where,
          }),
        ]);

        return {
          data: flags,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),
        };
      } catch (error) {
        throw new Error("Failed to fetch fraud flags");
      }
    },

    getFraudLogs: async (_, { searchInput }, { prisma }) => {
      try {
        const {
          query,
          status,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 10,
        } = searchInput || {};

        const safePage = Math.max(page, 1);

        const safeLimit = Math.min(limit, 50);

        const skip = (safePage - 1) * safeLimit;

        const where = {};

        // ---------------- SEARCH ----------------

        if (query) {
          where.OR = [
            {
              senderName: {
                contains: query,
                mode: "insensitive",
              },
            },

            {
              receiverName: {
                contains: query,
                mode: "insensitive",
              },
            },

            {
              orderId: {
                contains: query,
                mode: "insensitive",
              },
            },

            {
              message: {
                contains: query,
                mode: "insensitive",
              },
            },
          ];
        }

        // ---------------- STATUS ----------------

        if (status) {
          where.status = status;
        }

        // ---------------- DATE FILTER ----------------

        let start;
        let end;

        if (filterType) {
          switch (filterType) {
            case "TODAY":
              start = new Date();
              start.setHours(0, 0, 0, 0);

              end = new Date();
              break;

            case "WEEK":
              start = new Date();
              start.setDate(start.getDate() - 7);

              end = new Date();
              break;

            case "MONTH":
              start = new Date();
              start.setMonth(start.getMonth() - 1);

              end = new Date();
              break;

            case "YEAR":
              start = new Date();
              start.setFullYear(start.getFullYear() - 1);

              end = new Date();
              break;

            case "CUSTOM":
              start = startDate ? new Date(startDate) : undefined;

              end = endDate ? new Date(endDate) : undefined;

              break;
          }
        }

        if (start || end) {
          where.createdAt = {};

          if (start) {
            where.createdAt.gte = start;
          }

          if (end) {
            where.createdAt.lte = end;
          }
        }

        const [logs, totalCount] = await Promise.all([
          prisma.fraudLog.findMany({
            where,

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: safeLimit,
          }),

          prisma.fraudLog.count({
            where,
          }),
        ]);

        return {
          data: logs,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),
        };
      } catch (error) {
        throw new Error("Failed to fetch fraud logs");
      }
    },
    getPaymentReports: async (
      _,
      {
        searchInput: {
          query,
          status,
          provider,
          platform,
          country,
          minAmount,
          maxAmount,
          filterType,
          startDate,
          endDate,
          page = 1,
          limit = 20,
        },
      },
      { prisma },
    ) => {
      try {
        const skip = (page - 1) * limit;

        const whereClause = {};

        // ======================
        // STATUS FILTER
        // ======================
        if (status) {
          whereClause.status = status;
        }

        // ======================
        // SEARCH FILTER
        // ======================
        if (query) {
          whereClause.OR = [
            {
              invoiceNo: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              razorpayOrderId: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              razorpayPaymentId: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              user: {
                is: {
                  mobile: {
                    contains: query,
                  },
                },
              },
            },
            {
              user: {
                mobile: {
                  contains: query,
                },
              },
            },
          ];
        }

        // ======================
        // DATE FILTERS
        // ======================
        const now = new Date();

        if (filterType === "TODAY") {
          const start = new Date();
          start.setHours(0, 0, 0, 0);

          const end = new Date();
          end.setHours(23, 59, 59, 999);

          whereClause.createdAt = {
            gte: start,
            lte: end,
          };
        }

        if (filterType === "WEEK") {
          const weekStart = new Date(now);
          weekStart.setDate(now.getDate() - now.getDay());
          weekStart.setHours(0, 0, 0, 0);

          whereClause.createdAt = {
            gte: weekStart,
            lte: now,
          };
        }

        if (filterType === "MONTH") {
          const monthStart = new Date();
          monthStart.setMonth(now.getMonth() - 1);

          whereClause.createdAt = {
            gte: monthStart,
            lte: now,
          };
        }

        if (filterType === "YEAR") {
          const yearStart = new Date();
          yearStart.setFullYear(now.getFullYear() - 1);

          whereClause.createdAt = {
            gte: yearStart,
            lte: now,
          };
        }

        if (filterType === "CUSTOM" && startDate && endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);

          whereClause.createdAt = {
            gte: new Date(startDate),
            lte: end,
          };
        }
        if (provider) {
          whereClause.provider = provider;
        }

        if (platform) {
          whereClause.platform = platform;
        }

        if (country) {
          whereClause.country = country;
        }

        if (minAmount || maxAmount) {
          whereClause.amount = {};

          if (minAmount) whereClause.amount.gte = Number(minAmount);

          if (maxAmount) whereClause.amount.lte = Number(maxAmount);
        }

        // ======================
        // FETCH DATA
        // ======================
        const [data, totalCount, totalStats, paidStats, failedStats] =
          await Promise.all([
            prisma.payment.findMany({
              where: whereClause,
              include: {
                user: true,
                rechargePack: true,
              },
              orderBy: {
                createdAt: "desc",
              },
              skip,
              take: limit,
            }),

            prisma.payment.count({
              where: whereClause,
            }),

            prisma.payment.aggregate({
              where: whereClause,

              _sum: {
                amount: true,
                coins: true,
                taxableAmount: true,
                cgst: true,
                sgst: true,
                igst: true,
                totalTax: true,
                totalAmount: true,
                pgCharge: true,
              },
            }),

            prisma.payment.aggregate({
              where: {
                ...whereClause,
                status: "SUCCESS",
              },

              _sum: {
                amount: true,
              },

              _count: true,
            }),

            prisma.payment.aggregate({
              where: {
                ...whereClause,
                status: "FAILED",
              },

              _sum: {
                amount: true,
              },

              _count: true,
            }),
          ]);

        const formattedData = data.map((item) => ({
          id: item.id,

          userId: item.userId,
          userName: item.user?.name,
          mobile: item.user?.mobile,

          rechargePackId: item.rechargePackId,
          rechargePackName: item.rechargePack?.name,

          invoiceNo: item.invoiceNo,

          amount: item.amount,
          taxableAmount: item.taxableAmount,

          gstRate: item.gstRate,

          cgst: item.cgst,
          sgst: item.sgst,
          igst: item.igst,
          pgChargeRate: item.pgChargeRate,
          pgCharge: item.pgCharge,
          pgIgst: item.pgIgst,
          pgTotal: item.pgTotal,
          receivableAmount: item.receivableAmount,
          totalTax: item.totalTax,
          totalAmount: item.totalAmount,

          coins: item.coins,

          country: item.country,
          state: item.state,
          city: item.city,

          provider: item.provider,
          platform: item.platform,

          razorpayOrderId: item.razorpayOrderId,
          razorpayPaymentId: item.razorpayPaymentId,

          status: item.status,

          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));
        const totalAmount = totalStats._sum?.totalAmount || 0;
        const totalCoins = totalStats._sum?.coins || 0;
        const totalTax = totalStats._sum?.totalTax || 0;

        const totalCGST = totalStats._sum?.cgst || 0;
        const totalSGST = totalStats._sum?.sgst || 0;
        const totalIGST = totalStats._sum?.igst || 0;
        const totalPGCharge = totalStats._sum?.pgCharge || 0;
        const totalGST = totalCGST + totalSGST + totalIGST;

        const paidAmount = paidStats._sum.amount || 0;

        const failedAmount = failedStats._sum.amount || 0;

        const paidCount = paidStats._count._all || 0;

        const failedCount = failedStats._count._all || 0;
        const totalTaxableAmount = totalStats._sum?.taxableAmount || 0;
        return {
          data: formattedData,

          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),

          totalAmount,
          totalCoins,
          totalPGCharge,
          paidAmount,
          failedAmount,

          paidCount,
          failedCount,

          totalTax,
          totalGST,

          totalCGST,
          totalSGST,
        };
      } catch (err) {
        console.error(err);
        throw new Error("Failed to fetch payment reports");
      }
    },
    getModulesPaginated: async (_, { page = 1, limit = 10 }) => {
      const skip = (page - 1) * limit;

      const [modules, totalCount] = await Promise.all([
        prisma.module.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.module.count(),
      ]);

      return {
        data: modules,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    },

    getRoles: async (_, { page = 1, limit = 10 }, context) => {
      const { prisma } = context;
      await checkPermission(context, "roles.read");
      try {
        const skip = (page - 1) * limit;

        const [roles, totalCount] = await Promise.all([
          prisma.role.findMany({
            skip,
            take: limit,
            orderBy: { createdAt: "desc" },
          }),
          prisma.role.count(),
        ]);

        return {
          data: roles,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },

    getPermissions: async (_, { page = 1, limit = 100, type }, context) => {
      const { prisma } = context;
      await checkPermission(context, "permissions.read");

      const skip = (page - 1) * limit;

      const where = {
        isDeleted: false,
        ...(type && { type }),
      };

      const [permissions, totalCount] = await Promise.all([
        prisma.permission.findMany({
          where,
          skip,
          take: limit,
          include: {
            modules: {
              include: {
                module: true,
              },
            },
          },
        }),
        prisma.permission.count({ where }),
      ]);

      const formatted = permissions.map((p) => ({
        ...p,
        modules: p.modules.map((m) => m.module),
      }));

      return {
        data: formatted,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    },

    getDepartments: async (_, { page = 1, limit = 10 }, context) => {
      const skip = (page - 1) * limit;
      const { prisma } = context;
      await checkPermission(context, "departments.read");

      const [departments, totalCount] = await Promise.all([
        prisma.department.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.department.count(),
      ]);

      return {
        data: departments,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    },

    getStaff: async (_, { page = 1, limit = 10 }) => {
      const skip = (page - 1) * limit;

      const [staff, totalCount] = await Promise.all([
        prisma.staff.findMany({
          skip,
          take: limit,

          include: {
            department: true,
            role: true,
            permissions: {
              include: { permission: true },
            },
          },
        }),

        prisma.staff.count(),
      ]);

      const formatted = staff.map((s) => ({
        ...s,
        permissions: s.permissions.map((p) => p.permission),
      }));

      return {
        data: formatted,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    },

    // Get my access
    getMyAccess: async (_, __, context) => {
      const user = context.user;
      if (!user) throw new Error("Unauthorized");

      const fullUser = await prisma.staff.findUnique({
        where: { id: user.id },
        include: { role: true },
      });

      //  SUPER ADMIN BYPASS (CRITICAL FIX)
      if (fullUser.role?.slug === "super-admin") {
        const modules = await prisma.module.findMany({
          where: { isDeleted: false, isActive: true },
        });
        if (!fullUser) throw new Error("User not found in DB");
        return modules.map((mod) => ({
          id: mod.id,
          name: mod.name,
          slug: mod.slug,
          permissions: [
            `${mod.slug}.create`,
            `${mod.slug}.read`,
            `${mod.slug}.update`,
            `${mod.slug}.delete`,
          ],
        }));
      }

      // ================= NORMAL FLOW =================

      const rolePermissions = await prisma.rolePermission.findMany({
        where: {
          roleId: user.roleId,
          permission: { isDeleted: false },
        },
        include: {
          permission: {
            include: {
              modules: {
                where: {
                  module: { isDeleted: false, isActive: true },
                },
                include: { module: true },
              },
            },
          },
        },
      });

      const staffPermissions = await prisma.staffPermission.findMany({
        where: {
          staffId: user.id,
          permission: { isDeleted: false },
        },
        include: {
          permission: {
            include: {
              modules: {
                where: {
                  module: { isDeleted: false, isActive: true },
                },
                include: { module: true },
              },
            },
          },
        },
      });

      const allPermissions = [
        ...rolePermissions.map((r) => r.permission),
        ...staffPermissions.map((s) => s.permission),
      ];

      const moduleMap = {};

      allPermissions.forEach((perm) => {
        perm.modules.forEach((mp) => {
          const mod = mp.module;

          if (!moduleMap[mod.id]) {
            moduleMap[mod.id] = {
              id: mod.id,
              name: mod.name,
              slug: mod.slug,
              permissions: new Set(),
            };
          }

          moduleMap[mod.id].permissions.add(perm.name);
        });
      });

      return Object.values(moduleMap).map((mod) => ({
        ...mod,
        permissions: Array.from(mod.permissions),
      }));
    },

    getModulesBySection: async (_, { section }) => {
      return prisma.module.findMany({
        where: {
          section: section.trim().toLowerCase(),
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      });
    },

    getSections: async () => {
      const sections = await prisma.module.findMany({
        select: { section: true },
        distinct: ["section"],
      });

      return sections.map((s) => s.section);
    },

    // get coupons
    getCoupons: async (_, __, context) => {
      const { prisma } = context;
      await checkPermission(context, "coupons.read");

      try {
        return await prisma.coupon.findMany({
          orderBy: { createdAt: "desc" },
        });
      } catch (error) {
        throw error;
      }
    },

    getCategories: async (_, __, { prisma }) => {
      return prisma.category.findMany({
        orderBy: {
          createdAt: "desc",
        },
      });
    },

    getCategory: async (_, { id }, { prisma }) => {
      return prisma.category.findUnique({
        where: { id },
        include: {
          services: true,
        },
      });
    },

    getServices: async (_, __, { prisma }) => {
      return prisma.service.findMany({
        include: {
          category: true,

          astrologerMappings: {
            include: {
              astrologer: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });
    },

    getService: async (_, { id }, { prisma }) => {
      return prisma.service.findUnique({
        where: { id },
        include: {
          category: true,
        },
      });
    },
    getServiceAstrologers: async (_, { serviceId }, { prisma }) => {
      return prisma.serviceAstrologer.findMany({
        where: {
          serviceId,
        },
        include: {
          astrologer: true,
        },
      });
    },

    getServiceBySlug: async (_, { slug }, { prisma }) => {
      return prisma.service.findUnique({
        where: { slug },
        include: {
          category: true,
        },
      });
    },

    getCategories: async (_, __, context) => {
      if (!context || !context.prisma) {
        throw new Error("Context not available");
      }

      return context.prisma.category.findMany({
        orderBy: { createdAt: "desc" },
      });
    },

    getGifts: async (_, __, context) => {
      const { prisma } = context;

      await checkPermission(context, "gifts.read");

      return prisma.gift.findMany({
        orderBy: { createdAt: "desc" },
      });
    },

    testimonials: async (_, __, context) => {
      await checkPermission(context, "testimonials.read");

      return await context.prisma.testimonial.findMany({
        orderBy: { createdAt: "desc" },
      });
    },

    testimonial: async (_, { id }, context) => {
      await checkPermission(context, "testimonials.read");

      return await context.prisma.testimonial.findUnique({
        where: { id },
      });
    },

    faqs: async (_, __, context) => {
      await checkPermission(context, "faqs.read");

      return context.prisma.faq.findMany({
        orderBy: { createdAt: "desc" },
      });
    },

    faq: async (_, { id }, context) => {
      await checkPermission(context, "faqs.read");

      return context.prisma.faq.findUnique({
        where: { id },
      });
    },

    getBanners: async (_, __, context) => {
      const { prisma } = context;
      await checkPermission(context, "banners.read");

      return await prisma.banner.findMany({
        orderBy: { sortorder: "asc" },
      });
    },

    getInterviewers: async (_, __, { prisma }) => {
      return prisma.staff.findMany({
        where: {
          role: {
            slug: "interviewer",
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
    },

    getPendingApplications: async (_, __, { prisma }) => {
      return await prisma.astrologerApplication.findMany({
        where: {
          status: "PENDING",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    },

    getApplications: (_, { status }, { prisma }) => {
      return prisma.astrologerApplication.findMany({
        where: status ? { applicationStatus: status } : {},
        include: {
          kycDetail: true,
        },
      });
    },

    getFinalPrice: async (_, { astrologerId }, { prisma, userId }) => {
      const config = await prisma.pricingConfig.findFirst();

      const userUsage = await prisma.userOfferUsage.findUnique({
        where: { userId },
      });

      const visitCount = userUsage?.visitCount || 0;

      if (visitCount === 0 && config?.isFirstOfferEnabled) {
        return {
          chatPrice: config.firstChatPrice,
          callPrice: config.firstCallPrice,
          isOfferApplied: true,
          offerType: "FIRST_TIME",
        };
      }

      if (visitCount === 1 && config?.isSecondOfferEnabled) {
        return {
          chatPrice: config.secondChatPrice,
          callPrice: config.secondCallPrice,
          isOfferApplied: true,
          offerType: "SECOND_TIME",
        };
      }

      if (config?.isGlobalOfferEnabled) {
        return {
          chatPrice: config.globalChatPrice,
          callPrice: config.globalCallPrice,
          isOfferApplied: true,
          offerType: "GLOBAL",
        };
      }

      const chat = await prisma.astrologerPricing.findFirst({
        where: {
          astrologerId,
          type: "CHAT",
          isActive: true,
        },
      });

      const call = await prisma.astrologerPricing.findFirst({
        where: {
          astrologerId,
          type: "CALL",
          isActive: true,
        },
      });

      return {
        chatPrice: chat?.price || 0,
        callPrice: call?.price || 0,
        isOfferApplied: false,
        offerType: null,
      };
    },

    getPricingConfig: async (_, __, { prisma }) => {
      return await prisma.pricingConfig.findFirst();
    },

    getAdminPreviewPrice: async (_, __, { prisma }) => {
      const config = await prisma.pricingConfig.findFirst();

      return {
        globalChatPrice: config?.globalChatPrice || 0,

        globalCallPrice: config?.globalCallPrice || 0,

        firstChatPrice: config?.firstChatPrice || 0,

        firstCallPrice: config?.firstCallPrice || 0,

        secondChatPrice: config?.secondChatPrice || 0,

        secondCallPrice: config?.secondCallPrice || 0,
      };
    },

    getOfferAnalytics: async (_, __, { prisma }) => {
      const totalUsers = await prisma.userOfferUsage.count();

      const firstUsed = await prisma.userOfferUsage.count({
        where: { usedFirst: true },
      });

      const secondUsed = await prisma.userOfferUsage.count({
        where: { usedSecond: true },
      });

      return {
        totalUsers,
        firstUsed,
        secondUsed,
      };
    },

    getMyInterviews: async (_, __, { prisma, userId }) => {
      return prisma.astrologerApplication.findMany({
        where: {
          interviewerId: userId,
          interviewStatus: "SCHEDULED",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    },

    getApplicationById: async (_, { id }) => {
      return await prisma.astrologerApplication.findUnique({
        where: { id },
        include: {
          kycDetail: true,
        },
      });
    },

    getAboutPage: async () => {
      return await prisma.aboutPage.findFirst({
        where: {
          pageType: "about-us",
        },
      });
    },

    getPrivacyPage: async () => {
      return await prisma.privacyPage.findFirst({
        where: {
          pageType: "privacy-policy",
        },
      });
    },
    getRefundPolicyPage: async () => {
      return await prisma.refundPolicyPage.findFirst({
        where: {
          pageType: "refund-policy",
        },
      });
    },
    getDisclaimerPage: async () => {
      return await prisma.disclaimerPage.findFirst({
        where: {
          pageType: "disclaimer",
        },
      });
    },
    // remedy
    getRemedies: async () => {
      try {
        return await prisma.remedy.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });
      } catch (error) {
        throw new Error(error.message);
      }
    },
    getRemedyById: async (_, { id }) => {
      try {
        return await prisma.remedy.findUnique({
          where: { id },
        });
      } catch (error) {
        throw new Error(error.message);
      }
    },

    // apppppppppppppppppppppppppppppppp
    getLatestAppVersion: async (_, { platform, appType }, context) => {
      return await context.prisma.appVersion.findFirst({
        where: {
          platform,
          appType,
        },
      });
    },
    getAppVersions: async (_, __, { prisma }) => {
      return prisma.appVersion.findMany({
        orderBy: {
          updatedAt: "desc",
        },
      });
    },

    freeServices: async () => {
      return await prisma.freeService.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          order: "asc",
        },
      });
    },

    getOffers: async () => {
      try {
        const offers = await prisma.offer.findMany({
          orderBy: {
            createdAt: "desc",
          },
        });

        return offers.map((offer) => ({
          ...offer,
          createdAt: offer.createdAt.toISOString(),
          updatedAt: offer.updatedAt.toISOString(),
        }));
      } catch (error) {
        throw new Error(error.message || "Failed to fetch offers");
      }
    },
    getAstrologerById: async (_, { id }, context) => {
      const { prisma } = context;

      await checkPermission(context, "astrologer.read");

      const astrologer = await prisma.astrologer.findUnique({
        where: { id },
        include: {
          pricing: true,
          addresses: true,
          kycDetail: true,
          documents: true,
        },
      });

      if (!astrologer) {
        throw new Error("Astrologer not found");
      }

      const aadhaarDoc = astrologer.documents?.find(
        (doc) => doc.documentType === "AADHAAR",
      );

      const panDoc = astrologer.documents?.find(
        (doc) => doc.documentType === "PAN",
      );

      const passbookDoc = astrologer.documents?.find(
        (doc) => doc.documentType === "PASSBOOK",
      );

      return {
        ...astrologer,
        kycDetail: {
          ...(astrologer.kycDetail || {}),
          aadhaarImage: aadhaarDoc?.documentUrl || null,
          panImage: panDoc?.documentUrl || null,
          passbookImage: passbookDoc?.documentUrl || null,
        },
      };
    },
    getSendGiftHistory: async (
      _,
      { page = 1, limit = 10, search, astrologerId, fromDate, toDate },
      context,
    ) => {
      try {
        const { prisma } = context;

        await checkPermission(context, "gift-history.read");

        const skip = (page - 1) * limit;

        const where = {};

        if (astrologerId) {
          where.astrologerId = astrologerId;
        }

        if (fromDate || toDate) {
          where.createdAt = {};

          if (fromDate) {
            where.createdAt.gte = new Date(fromDate);
          }

          if (toDate) {
            where.createdAt.lte = new Date(toDate);
          }
        }

        if (search) {
          where.user = {
            name: {
              contains: search,
              mode: "insensitive",
            },
          };
        }

        const [giftHistory, totalCount] = await Promise.all([
          prisma.giftHistory.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  mobile: true,
                },
              },

              astrologer: {
                select: {
                  id: true,
                  name: true,
                  profilePic: true,
                },
              },

              gift: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  amount: true,
                },
              },
            },

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: limit,
          }),

          prisma.giftHistory.count({ where }),
        ]);

        return {
          data: giftHistory,
          totalCount,
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },
    getAstrologerGiftHistory: async (
      _,
      { astrologerId, page = 1, limit = 20 },
    ) => {
      const skip = (page - 1) * limit;

      const where = {
        astrologerWallet: {
          astrologerId,
        },

        description: {
          startsWith: "Gift Received",
        },
      };

      const [data, totalCount] = await Promise.all([
        prisma.walletTransaction.findMany({
          where,
          include: {
            session: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          skip,
          take: limit,
        }),

        prisma.walletTransaction.count({
          where,
        }),
      ]);

      return {
        totalCount,

        data: data.map((item) => ({
          id: item.id,
          coins: item.coins,
          amount: item.amount,
          description: item.description,
          createdAt: item.createdAt.toISOString(),
          sessionId: item.sessionId,
          userId: item.session?.user?.id,
          userName: item.session?.user?.name,
        })),
      };
    },

    getAstrologerNotices: async (_, __, { astrologer }) => {
      return await prisma.notice.findMany({
        where: {
          isActive: true,

          OR: [
            {
              targetType: "ALL",
            },

            {
              targetType: "SELECTED",

              astrologers: {
                some: {
                  astrologerId: astrologer.id,
                },
              },
            },
          ],
        },

        orderBy: [
          {
            isPinned: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      });
    },
    getNotices: async (_, __, { prisma }) => {
      const notices = await prisma.notice.findMany({
        include: {
          astrologers: {
            include: {
              astrologer: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return notices.map((notice) => ({
        ...notice,
        astrologers: notice.astrologers.map((item) => item.astrologer),
      }));
    },

    blogs: async () => {
      return await prisma.blog.findMany({
        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });
    },
    blogBySlug: async (_, { slug }) => {
      return await prisma.blog.findUnique({
        where: {
          slug,
        },

        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      });
    },
    blogCategories: async () => {
      const data = await prisma.blogCategory.findMany();

      return data;
    },

    adminGetSessionMessages: async (_, { sessionId }, context) => {
      const { prisma } = context;

      await checkPermission(context, "chatHistory.read");

      try {
        const session = await prisma.session.findUnique({
          where: {
            id: sessionId,
          },
        });

        if (!session) {
          throw new Error("Session not found");
        }

        const messages = await prisma.message.findMany({
          where: {
            sessionId,
          },
          orderBy: {
            createdAt: "asc",
          },
        });

        return {
          success: true,
          totalCount: messages.length,

          data: messages.map((msg) => ({
            id: msg.id,
            msgId: msg.msgId,
            roomId: msg.roomId,
            senderId: msg.senderId,
            time: msg.time || null,

            receiverId: msg.receiverId || null,
            message: msg.message || null,
            image: msg.image || null,
            sender: msg.sender,
            replyTo: msg.replyTo ? JSON.stringify(msg.replyTo) : null,
            createdAt: msg.createdAt.toISOString(),
          })),
        };
      } catch (error) {
        throw new Error(error.message || "Failed to fetch messages");
      }
    },

getDashboardCounts: async (_, __, { prisma }) => {
  try {
    const [
      totalAstrologers,
      totalUsers,
      totalStaff,
      totalCalls,
      totalChats,
      totalApplications,
      revenueResult,
      rechargeResult,
    ] = await Promise.all([
      prisma.astrologer.count(),

      prisma.user.count(),

      prisma.staff.count(),

      prisma.session.count({
        where: {
          type: "CALL",
        },
      }),

      prisma.session.count({
        where: {
          type: "CHAT",
        },
      }),

      prisma.astrologerApplication.count(),

      prisma.session.aggregate({
        _sum: {
          coinsDeducted: true,
        },
      }),

      prisma.payment.aggregate({
        where: {
          status: "SUCCESS",
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    return {
      totalAstrologers,
      totalUsers,
      totalStaff,
      totalCalls,
      totalChats,
      totalApplications,
      totalRechargeAmount: rechargeResult?._sum?.amount ?? 0,
      totalRevenue: revenueResult?._sum?.coinsDeducted ?? 0,
    };
  } catch (error) {
    console.error("getDashboardCounts ERROR:", error);

    throw new Error(error?.message || "Failed to fetch dashboard counts");
  }
},

    getUserProfile: async (_, { userId }, { prisma }) => {
      try {
        const user = await prisma.user.findUnique({
          where: {
            id: userId,
          },

          include: {
            wallet: true,

            reviews: true,

            follows: true,

            serviceBookings: true,

            payments: {
              orderBy: {
                createdAt: "desc",
              },
            },

            sessions: true,
          },
        });

        if (!user) {
          throw new Error("User not found");
        }

        const calls = user.sessions.filter((s) => s.type === "CALL");

        const chats = user.sessions.filter((s) => s.type === "CHAT");

        const totalRecharge = user.payments.reduce(
          (sum, p) => sum + (p.amount || 0),
          0,
        );

        const lastRecharge = user.payments?.[0];

        return {
          ...user,

          stats: {
            walletBalance: user.wallet?.balanceCoins || 0,

            totalRecharge,

            totalRechargeCount: user.payments.length,

            totalCalls: calls.length,

            totalChats: chats.length,

            totalReviews: user.reviews.length,

            totalFollowing: user.follows.length,

            totalBookings: user.serviceBookings.length,

            lastRechargeAmount: lastRecharge?.amount || 0,

            lastRechargeDate: lastRecharge?.createdAt?.toISOString() || null,
          },
        };
      } catch (err) {
        throw new Error(err.message);
      }
    },
    getAstrologerReviews: async (_, { astrologerId }) => {
      return prisma.review
        .findMany({
          where: {
            astrologerId,
          },

          include: {
            user: true,
            session: true,
          },

          orderBy: {
            createdAt: "desc",
          },
        })
        .then((reviews) =>
          reviews.map((r) => ({
            reviewId: r.id,

            sessionId: r.sessionId,

            userId: r.userId,

            userName: r.user?.name,

            rating: r.rating,

            comment: r.comment,

            sessionType: r.session?.type,

            createdAt: r.createdAt,
          })),
        );
    },
    getSessionRemedies: async (_, { sessionId }, { prisma }) => {
      return await prisma.sessionRemedy.findMany({
        where: {
          sessionId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    },
    getSkills: async () => {
      return prisma.skill.findMany({
        orderBy: {
          sortOrder: "asc",
        },
      });
    },
    getProblems: async () => {
      return prisma.problem.findMany({
        orderBy: {
          sortOrder: "asc",
        },
      });
    },
    payoutReport: async (_, { fromDate, toDate }, { prisma, user }) => {
      // Permission check
      // await checkPermission({ user, prisma }, "payout.read");

      // Get all astrologers with their relationships
      const astrologers = await prisma.astrologer.findMany({
        where: {
          isDeleted: false,
        },
        include: {
          wallet: true,

          pricing: {
            where: {
              isActive: true,
            },
          },

          tax: true,

          kycDetail: true,

          addresses: {
            take: 1,
            orderBy: {
              id: "desc",
            },
          },

          sessions: {
            where: {
              status: "COMPLETED",
              endedAt: {
                gte: new Date(fromDate),
                lte: new Date(toDate),
              },
            },
          },
        },
      });

      return astrologers.map((astro) => {
        // =====================================================
        // ASTROLOGER WALLET
        // =====================================================

        const wallet = astro.wallet;

        // Current wallet balance
        const balanceCoins = Number(wallet?.balanceCoins || 0);

        // Total amount earned by astrologer
        const earning = Number(wallet?.balanceCoins || 0);

        // Total revenue generated for astrologer
        // Use wallet totalEarned instead of Session.coinsDeducted
        const totalRevenue = Number(wallet?.totalEarned || 0);

        // Total commission from wallet
        const commission = Number(wallet?.totalCommission || 0);

        // Amount already paid
        const totalPaid = Number(wallet?.totalPaid || 0);

        // Last payment made
        const lastPaidAmount = Number(wallet?.lastPaidAmount || 0);

        // Pending payout amount
        const pendingAmount = Number(wallet?.pendingAmount || 0);

        // Total withdrawn
        const totalWithdrawn = Number(wallet?.totalWithdrawn || 0);

        // =====================================================
        // COMMISSION
        // =====================================================

        const commissionPercent = Number(
          astro.pricing[0]?.commissionPercent || 0,
        );

        // =====================================================
        // PG CHARGES
        // =====================================================

        const pgCharge = Number(((earning * PG_RATE) / 100).toFixed(2));

        const gstAmount = Number(((pgCharge * GST_RATE) / 100).toFixed(2));

        let cgst = 0;
        let sgst = 0;
        let igst = 0;

        if (
          astro.tax?.state &&
          astro.tax.state.toLowerCase() === COMPANY_STATE.toLowerCase()
        ) {
          cgst = Number((gstAmount / 2).toFixed(2));
          sgst = Number((gstAmount / 2).toFixed(2));
        } else {
          igst = gstAmount;
        }

        const pgTotal = Number((pgCharge + gstAmount).toFixed(2));

        // =====================================================
        // GROSS
        // =====================================================

        const grossAmount = Number((earning - pgTotal).toFixed(2));

        // =====================================================
        // TDS
        // =====================================================

        const tdsPercent = Number(astro.tax?.tdsPercent || 10);

        const tdsAmount = Number(((grossAmount * tdsPercent) / 100).toFixed(2));

        // =====================================================
        // PAYABLE
        // =====================================================

        const payableAmount = Math.max(
          0,
          Number((grossAmount - tdsAmount).toFixed(2)),
        );

        // =====================================================
        // RESPONSE
        // =====================================================

        return {
          astrologerId: astro.id,
          astrologerName: astro.displayName,
          profilePic: astro.profilePic,

          accountHolderName: astro.kycDetail?.accountHolderName || null,

          accountNumber: astro.kycDetail?.accountNumber || null,

          bankName: astro.kycDetail?.bankName || null,

          ifsc: astro.kycDetail?.ifsc || null,

          panNumber: astro.kycDetail?.panNumber || null,

          state: astro.addresses[0]?.state || null,

          // Session information is still useful
          totalSessions: astro.sessions.length,

          // ===================================================
          // WALLET VALUES
          // ===================================================

          balanceCoins,

          totalRevenue,

          earning,

          commission,

          totalCommission: commission,

          pendingAmount,

          totalWithdrawn,

          totalPaid,

          lastPaidAmount,

          // ===================================================
          // COMMISSION %
          // ===================================================

          commissionPercent,

          // ===================================================
          // PG
          // ===================================================

          pgChargeRate: PG_RATE,

          pgCharge,

          gstRate: GST_RATE,

          cgst,

          sgst,

          igst,

          pgTotal,

          // ===================================================
          // GROSS
          // ===================================================

          grossAmount,

          // ===================================================
          // TDS
          // ===================================================

          tdsPercent,

          tdsAmount,

          // ===================================================
          // FINAL PAYABLE
          // ===================================================

          payableAmount,
        };
      });
    },
    // payoutReport: async (_, { fromDate, toDate }, { prisma, user }) => {
    //   // Permission check - only admins with appropriate permission
    //   // await checkPermission({ user, prisma }, "payout.read");

    //   // Get all astrologers with their relationships
    //   const astrologers = await prisma.astrologer.findMany({
    //     where: {
    //       isDeleted: false,
    //     },
    //     include: {
    //       wallet: true,
    //       pricing: {
    //         where: {
    //           isActive: true,
    //         },
    //       },
    //       tax: true,
    //       kycDetail: true,
    //       addresses: {
    //         take: 1,
    //         orderBy: {
    //           id: "desc",
    //         },
    //       },
    //       sessions: {
    //         where: {
    //           status: "COMPLETED",
    //           endedAt: {
    //             gte: new Date(fromDate),
    //             lte: new Date(toDate),
    //           },
    //         },
    //       },
    //     },
    //   });

    //   return astrologers.map((astro) => {
    //     const totalRevenue = astro.sessions.reduce(
    //       (sum, session) => sum + (session.coinsDeducted || 0),
    //       0,
    //     );

    //     const earning = astro.sessions.reduce(
    //       (sum, session) => sum + (session.coinsEarned || 0),
    //       0,
    //     );

    //     const commission = astro.sessions.reduce(
    //       (sum, session) => sum + (session.commission || 0),
    //       0,
    //     );

    //     const commissionPercent = astro.pricing[0]?.commissionPercent || 0;

    //     // ---------------- PG ----------------

    //     const pgCharge = Number(((earning * PG_RATE) / 100).toFixed(2));

    //     const gstAmount = Number(((pgCharge * GST_RATE) / 100).toFixed(2));

    //     let cgst = 0;
    //     let sgst = 0;
    //     let igst = 0;

    //     if (
    //       astro.tax?.state &&
    //       astro.tax.state.toLowerCase() === COMPANY_STATE.toLowerCase()
    //     ) {
    //       cgst = Number((gstAmount / 2).toFixed(2));
    //       sgst = Number((gstAmount / 2).toFixed(2));
    //     } else {
    //       igst = gstAmount;
    //     }

    //     const pgTotal = Number((pgCharge + gstAmount).toFixed(2));

    //     // ---------------- Gross ----------------

    //     const grossAmount = Number((earning - pgTotal).toFixed(2));

    //     // ---------------- TDS ----------------

    //     const tdsPercent = astro.tax?.tdsPercent || 10;
    //     const totalPaid = astro.wallet?.totalPaid || 0;
    //     const tdsAmount = Number(((grossAmount * tdsPercent) / 100).toFixed(2));

    //     // ---------------- Already Paid ----------------

    //     const lastPaidAmount = astro.wallet?.lastPaidAmount || 0;

    //     // ---------------- Final Amount ----------------

    //     const payableAmount = Math.max(
    //       0,
    //       Number((grossAmount - tdsAmount - totalPaid).toFixed(2)),
    //     );

    //     return {
    //       astrologerId: astro.id,
    //       astrologerName: astro.displayName,
    //       profilePic: astro.profilePic,

    //       accountHolderName: astro.kycDetail?.accountHolderName || null,

    //       accountNumber: astro.kycDetail?.accountNumber || null,

    //       bankName: astro.kycDetail?.bankName || null,

    //       ifsc: astro.kycDetail?.ifsc || null,

    //       panNumber: astro.kycDetail?.panNumber || null,

    //       state: astro.addresses[0]?.state || null,

    //       totalSessions: astro.sessions.length,

    //       totalRevenue,

    //       commissionPercent,

    //       commission,

    //       earning,

    //       pgChargeRate: PG_RATE,

    //       pgCharge,

    //       gstRate: GST_RATE,

    //       cgst,

    //       sgst,

    //       igst,

    //       pgTotal,

    //       grossAmount,

    //       tdsPercent,

    //       tdsAmount,

    //       lastPaidAmount,
    //       totalPaid,
    //       payableAmount,
    //     };
    //   });
    // },
    getAstrologerPayoutHistory: async (_, { astrologerId }, { prisma }) => {
      try {
        const payouts = await prisma.astrologerPayout.findMany({
          where: {
            astrologerId: astrologerId,
          },

          include: {
            astrologer: {
              select: {
                id: true,
                name: true,
              },
            },
          },

          orderBy: {
            paymentDate: "desc",
          },
        });

        return payouts.map((payout) => ({
          id: payout.id,

          astrologerId: payout.astrologerId,

          astrologerName: payout.astrologer?.name || "",

          remark: payout.remark || "",

          earning: Number(payout.earning || 0),

          pgCharge: Number(payout.pgCharge || 0),

          // Tumhare Prisma model me subTotal nahi hai,
          // isliye grossAmount use kar rahe hain
          subTotal: Number(payout.grossAmount || 0),

          tdsAmount: Number(payout.tdsAmount || 0),

          paidAmount: Number(payout.payableAmount || 0),

          startDate: payout.fromDate ? payout.fromDate.toISOString() : null,

          endDate: payout.toDate ? payout.toDate.toISOString() : null,

          paidOn: payout.paymentDate ? payout.paymentDate.toISOString() : null,
        }));
      } catch (error) {
        console.error("getAstrologerPayoutHistory ERROR:", error);

        throw new Error("Failed to fetch astrologer payout history");
      }
    },
    getRefundRequests: async (_, { searchInput = {} }, context) => {
      try {
        const { prisma, user } = context;

        // -----------------------------
        // AUTH
        // -----------------------------

        if (!user?.id) {
          throw new Error("Unauthorized");
        }

        const { page = 1, limit = 10, status, search } = searchInput;

        const safePage = Math.max(Number(page), 1);
        const safeLimit = Math.min(Math.max(Number(limit), 1), 50);

        const skip = (safePage - 1) * safeLimit;

        // -----------------------------
        // WHERE
        // -----------------------------

        const where = {};

        if (status) {
          where.status = status;
        }

        if (search) {
          where.OR = [
            {
              userName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              astrologerName: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              transactionId: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              orderId: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              requestedByStaffName: {
                contains: search,
                mode: "insensitive",
              },
            },
          ];
        }

        // -----------------------------
        // FETCH
        // -----------------------------

        const [requests, totalCount] = await Promise.all([
          prisma.refundRequest.findMany({
            where,

            orderBy: {
              createdAt: "desc",
            },

            skip,
            take: safeLimit,
          }),

          prisma.refundRequest.count({
            where,
          }),
        ]);

        return {
          data: requests,

          totalCount,

          currentPage: safePage,

          totalPages: Math.ceil(totalCount / safeLimit),
        };
      } catch (error) {
        console.error("getRefundRequests error:", error);

        throw new Error(error.message || "Failed to fetch refund requests");
      }
    },
  },

  // **********************************************START MUTATION**********************************

  Mutation: {
    createRefundRequest: async (_, { input }, context) => {
      try {
        const { prisma, user } = context;

        // -----------------------------
        // AUTH
        // -----------------------------

        if (!user?.id) {
          throw new Error("Unauthorized");
        }

        const {
          sessionId,
          refundDuration,
          refundReason,
          refundType = "Partial",
          mode = "Chat",
        } = input;

        // -----------------------------
        // VALIDATION
        // -----------------------------

        if (!sessionId) {
          throw new Error("Session ID is required");
        }

        if (!refundReason?.trim()) {
          throw new Error("Refund reason is required");
        }

        const duration = Number(refundDuration);

        if (!Number.isInteger(duration) || duration < 1) {
          throw new Error("Refund duration must be at least 1 minute");
        }

        // -----------------------------
        // GET SESSION
        // -----------------------------

        const session = await prisma.session.findUnique({
          where: {
            id: sessionId,
          },

          include: {
            user: {
              select: {
                id: true,
                name: true,
                mobile: true,
              },
            },

            astrologer: {
              select: {
                id: true,
                name: true,
                displayName: true,
              },
            },
          },
        });

        if (!session) {
          throw new Error("Session not found");
        }


    const sessionDurationSec = Number(session.durationSec || 0);

if (sessionDurationSec < 30) {
  throw new Error("Session does not have enough duration for refund");
}

const maxRefundMinutes = Math.max(
  1,
  Math.ceil((sessionDurationSec - 30) / 60),
);

if (duration > maxRefundMinutes) {
  throw new Error(
    `Refund duration cannot exceed ${maxRefundMinutes} minutes`,
  );
}


        const existingRequest = await prisma.refundRequest.findFirst({
          where: {
            sessionId,

            status: {
              in: ["PENDING", "APPROVED"],
            },
          },
        });

        if (existingRequest) {
          throw new Error("Refund request already exists for this session");
        }

        // -----------------------------
        // RATE
        // -----------------------------

        const ratePerMin = Number(session.ratePerMin || 0);

        if (ratePerMin <= 0) {
          throw new Error("Invalid session rate");
        }

        // -----------------------------
        // REFUND AMOUNT
        // -----------------------------

        const refundAmount = ratePerMin * duration;

        // -----------------------------
        // ADMIN / STAFF
        // -----------------------------

        const staff = await prisma.staff.findUnique({
          where: {
            id: user.id,
          },

          select: {
            id: true,
            name: true,
            isActive: true,
            isDeleted: true,
          },
        });

        if (!staff || !staff.isActive || staff.isDeleted) {
          throw new Error("Staff account is not active");
        }

        // -----------------------------
        // CREATE REQUEST
        // -----------------------------

        const refundRequest = await prisma.refundRequest.create({
          data: {
            sessionId,

            userId: session.userId,
            userName: session.user?.name || null,
            userMobile: session.user?.mobile || null,

            astrologerId: session.astrologerId,

            astrologerName:
              session.astrologer?.displayName ||
              session.astrologer?.name ||
              null,

            // Your session model does not
            // currently have transactionId/orderId
            // directly, so leave these null
            transactionId: null,
            orderId: null,
          
sessionDate: session.createdAt,
            sessionDuration: sessionDurationSec,

            ratePerMin,

            refundDuration: duration,

            refundAmount,

            refundType,

            mode,

            refundReason: refundReason.trim(),

            requestedByStaffId: staff.id,

            requestedByStaffName: staff.name,

            status: "PENDING",
          },
        });

        return refundRequest;
      } catch (error) {
        console.error("createRefundRequest error:", error);

        throw new Error(error.message || "Failed to create refund request");
      }
    },

  approveRefundRequest: async (_, { id }, context) => {
  try {
    const { prisma, user } = context;

    // -----------------------------
    // AUTH
    // -----------------------------

    if (!user?.id) {
      throw new Error("Unauthorized");
    }

    // -----------------------------
    // STAFF
    // -----------------------------

    const staff = await prisma.staff.findUnique({
      where: {
        id: user.id,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!staff || !staff.isActive || staff.isDeleted) {
      throw new Error("Staff account is not active");
    }

    // -----------------------------
    // REFUND REQUEST
    // -----------------------------

    const request = await prisma.refundRequest.findUnique({
      where: {
        id,
      },
    });

    if (!request) {
      throw new Error("Refund request not found");
    }

    // -----------------------------
    // STATUS CHECK
    // -----------------------------

    if (request.status !== "PENDING") {
      throw new Error(
        `Refund request is already ${request.status.toLowerCase()}`
      );
    }

    // -----------------------------
    // VALIDATE REFUND
    // -----------------------------

    const refundCoins = Number(request.refundAmount);

    if (!Number.isFinite(refundCoins) || refundCoins <= 0) {
      throw new Error("Invalid refund amount");
    }

    // -----------------------------
    // ATOMIC TRANSACTION
    // -----------------------------

    const result = await prisma.$transaction(async (tx) => {
      // --------------------------------
      // Re-check request
      // --------------------------------

      const currentRequest = await tx.refundRequest.findUnique({
        where: {
          id,
        },
      });

      if (!currentRequest) {
        throw new Error("Refund request not found");
      }

      if (currentRequest.status !== "PENDING") {
        throw new Error("Refund request has already been processed");
      }

      // --------------------------------
      // GET SESSION
      // --------------------------------

      const session = await tx.session.findUnique({
        where: {
          id: currentRequest.sessionId,
        },
        select: {
          id: true,
          astrologerId: true,
          type: true,
        },
      });

      if (!session) {
        throw new Error("Session not found");
      }

      if (!session.astrologerId) {
        throw new Error("Astrologer not found for this session");
      }

      // --------------------------------
      // USER WALLET
      // --------------------------------

      const userWallet = await tx.userWallet.findUnique({
        where: {
          userId: currentRequest.userId,
        },
      });

      if (!userWallet) {
        throw new Error("User wallet not found");
      }

      // --------------------------------
      // ASTROLOGER WALLET
      // --------------------------------

      const astrologerWallet = await tx.astrologerWallet.findUnique({
        where: {
          astrologerId: session.astrologerId,
        },
      });

      if (!astrologerWallet) {
        throw new Error("Astrologer wallet not found");
      }

      // --------------------------------
      // GET ASTROLOGER PRICING
      // --------------------------------

      const pricing = await tx.astrologerPricing.findUnique({
        where: {
          astrologerId_type: {
            astrologerId: session.astrologerId,
            type: session.type,
          },
        },
        select: {
          id: true,
          type: true,
          price: true,
          offerPrice: true,
          commissionPercent: true,
          isActive: true,
        },
      });

      if (!pricing) {
        throw new Error(
          `Astrologer pricing not found for ${session.type}`
        );
      }

      if (!pricing.isActive) {
        throw new Error(
          `Astrologer pricing for ${session.type} is inactive`
        );
      }

      // --------------------------------
      // COMMISSION %
      // --------------------------------

      const commissionPercent = Number(pricing.commissionPercent ?? 45);

      if (
        !Number.isFinite(commissionPercent) ||
        commissionPercent < 0 ||
        commissionPercent > 100
      ) {
        throw new Error(
          `Invalid commission percentage: ${commissionPercent}`
        );
      }

      // --------------------------------
      // CALCULATE ASTROLOGER REFUND
      // --------------------------------
      //
      // Example:
      //
      // refundCoins       = 100
      // commissionPercent = 70%
      //
      // astrologerRefund = 100 * 70 / 100
      //                   = 70 coins
      //
      // --------------------------------

      const astrologerRefundCoins = Number(
        ((refundCoins * commissionPercent) / 100).toFixed(2)
      );

      if (astrologerRefundCoins <= 0) {
        throw new Error(
          "Calculated astrologer refund amount is zero"
        );
      }

      // --------------------------------
      // CHECK ASTROLOGER BALANCE
      // --------------------------------

      if (
        Number(astrologerWallet.balanceCoins) <
        astrologerRefundCoins
      ) {
        throw new Error(
          `Insufficient astrologer wallet balance. Available: ${astrologerWallet.balanceCoins}, Required: ${astrologerRefundCoins}`
        );
      }

      // --------------------------------
      // CREDIT USER WALLET
      // --------------------------------

      const updatedUserWallet = await tx.userWallet.update({
        where: {
          id: userWallet.id,
        },
        data: {
          balanceCoins: {
            increment: refundCoins,
          },
        },
      });

      // --------------------------------
      // DEBIT ASTROLOGER WALLET
      // --------------------------------
      const updatedAstrologerWallet =
        await tx.astrologerWallet.update({
          where: {
            id: astrologerWallet.id,
          },
          data: {
            balanceCoins: {
              decrement: astrologerRefundCoins,
            },
          },
        });

      // --------------------------------
      // USER WALLET TRANSACTION
      // --------------------------------

      await tx.walletTransaction.create({
        data: {
          userWalletId: userWallet.id,

          sessionId: currentRequest.sessionId,

          type: "REFUND",

          coins: refundCoins,

          amount: Number(currentRequest.refundAmount),

          description:
            `Refund approved - ${currentRequest.refundDuration} min`,
        },
      });

      // --------------------------------
      // ASTROLOGER WALLET TRANSACTION
      // --------------------------------

      await tx.walletTransaction.create({
        data: {
          astrologerWalletId: astrologerWallet.id,

          sessionId: currentRequest.sessionId,

          type: "REFUND",

          coins: astrologerRefundCoins,

          amount: astrologerRefundCoins,

          description:
            `Refund deducted - ${currentRequest.refundDuration} min ` +
            `(${session.type}`,
        },
      });

      // --------------------------------
      // UPDATE REFUND REQUEST
      // --------------------------------

      const updatedRequest = await tx.refundRequest.update({
        where: {
          id,
        },
        data: {
          status: "APPROVED",

          approvedByStaffId: staff.id,

          approvedByStaffName: staff.name,

          approvedAt: new Date(),
        },
      });

      return {
        updatedUserWallet,
        updatedAstrologerWallet,
        updatedRequest,
        refundCoins,
        astrologerRefundCoins,
        commissionPercent,
      };
    });

    console.log("Refund approved:", {
      refundRequestId: id,
      sessionId: result.updatedRequest.sessionId,
      refundCoins: result.refundCoins,
      astrologerRefundCoins: result.astrologerRefundCoins,
      commissionPercent: result.commissionPercent,
    });

    return result.updatedRequest;
  } catch (error) {
    console.error("approveRefundRequest error:", error);

    throw new Error(error.message || "Failed to approve refund");
  }
},

    rejectRefundRequest: async (_, { id, reason }, context) => {
      try {
        const { prisma, user } = context;

        // -----------------------------
        // AUTH
        // -----------------------------

        if (!user?.id) {
          throw new Error("Unauthorized");
        }

        if (!reason?.trim()) {
          throw new Error("Rejection reason is required");
        }

        // -----------------------------
        // STAFF
        // -----------------------------

        const staff = await prisma.staff.findUnique({
          where: {
            id: user.id,
          },

          select: {
            id: true,
            name: true,
            isActive: true,
            isDeleted: true,
          },
        });

        if (!staff || !staff.isActive || staff.isDeleted) {
          throw new Error("Staff account is not active");
        }

        // -----------------------------
        // REQUEST
        // -----------------------------

        const request = await prisma.refundRequest.findUnique({
          where: {
            id,
          },
        });

        if (!request) {
          throw new Error("Refund request not found");
        }

        // -----------------------------
        // STATUS
        // -----------------------------

        if (request.status !== "PENDING") {
          throw new Error(
            `Refund request is already ${request.status.toLowerCase()}`,
          );
        }

        // -----------------------------
        // REJECT
        // -----------------------------

        const rejectedRequest = await prisma.refundRequest.update({
          where: {
            id,
          },

          data: {
            status: "REJECTED",

            rejectedByStaffId: staff.id,

            rejectedByStaffName: staff.name,

            rejectedAt: new Date(),

            rejectionReason: reason.trim(),
          },
        });

        return rejectedRequest;
      } catch (error) {
        console.error("rejectRefundRequest error:", error);

        throw new Error(error.message || "Failed to reject refund");
      }
    },
    exportPayoutReport: async (
      _,
      { fromDate, toDate, remark },
      { prisma, user },
    ) => {
      // await checkPermission({ user, prisma }, "payout.update");

      const from = new Date(fromDate);
      const to = new Date(toDate);

      const astrologers = await prisma.astrologer.findMany({
        where: {
          isDeleted: false,
        },

        include: {
          // ==============================
          // ASTROLOGER WALLET
          // ==============================
          wallet: true,

          pricing: {
            where: {
              isActive: true,
            },
          },

          tax: true,

          kycDetail: true,

          addresses: {
            take: 1,
            orderBy: {
              id: "desc",
            },
          },

          // Sessions are still used ONLY
          // for totalSessions in the export
          sessions: {
            where: {
              status: "COMPLETED",
              endedAt: {
                gte: from,
                lte: to,
              },
            },
          },
        },
      });

      const result = [];

      for (const astro of astrologers) {
        // =====================================================
        // WALLET
        // =====================================================

        const wallet = astro.wallet;

        // Current wallet balance
        const balanceCoins = Number(wallet?.balanceCoins || 0);

        // Total earning from astrologer wallet
        const earning = Number(wallet?.balanceCoins || 0);

        // Revenue should now come from wallet
        // instead of Session.coinsDeducted
        const totalRevenue = Number(wallet?.totalEarned || 0);

        // Total commission from wallet
        const commission = Number(wallet?.totalCommission || 0);

        // =====================================================
        // COMMISSION %
        // =====================================================

        const commissionPercent = Number(
          astro.pricing?.[0]?.commissionPercent || 0,
        );

        // =====================================================
        // PG CHARGE
        // =====================================================

        const pgCharge = Number(((earning * PG_RATE) / 100).toFixed(2));

        // =====================================================
        // GST ON PG CHARGE
        // =====================================================

        const gstAmount = Number(((pgCharge * GST_RATE) / 100).toFixed(2));

        let cgst = 0;
        let sgst = 0;
        let igst = 0;

        if (
          astro.tax?.state &&
          astro.tax.state.toLowerCase() === COMPANY_STATE.toLowerCase()
        ) {
          cgst = Number((gstAmount / 2).toFixed(2));

          sgst = Number((gstAmount / 2).toFixed(2));
        } else {
          igst = gstAmount;
        }

        const pgTotal = Number((pgCharge + gstAmount).toFixed(2));

        // =====================================================
        // GROSS AMOUNT
        // =====================================================

        const grossAmount = Number((earning - pgTotal).toFixed(2));

        // =====================================================
        // TDS
        // =====================================================

        const tdsPercent = Number(astro.tax?.tdsPercent || 10);

        const tdsAmount = Number(((grossAmount * tdsPercent) / 100).toFixed(2));

        // =====================================================
        // WALLET PAYMENT INFORMATION
        // =====================================================

        const totalPaid = Number(wallet?.totalPaid || 0);

        const lastPaidAmount = Number(wallet?.lastPaidAmount || 0);

        // =====================================================
        // PAYABLE AMOUNT
        // =====================================================

        const payableAmount = Math.max(
          0,
          Number((grossAmount - tdsAmount).toFixed(2)),
        );

        const exportLastPaid = lastPaidAmount;
        const exportPayable = payableAmount;

        // =====================================================
        // PAYOUT TRANSACTION
        // =====================================================

        await prisma.$transaction(async (tx) => {
          // -----------------------------------------------
          // Prevent duplicate payout generation
          // -----------------------------------------------

          const existingPayout = await tx.astrologerPayout.findFirst({
            where: {
              astrologerId: astro.id,
              fromDate: from,
              toDate: to,
            },
          });

          // Already processed
          // Do not deduct wallet again
          if (existingPayout) {
            return;
          }

          // =================================================
          // PAYOUT AMOUNT
          // =================================================

          const payoutAmount = Number(earning.toFixed(2));

          // =================================================
          // CREATE PAYOUT RECORD
          // =================================================

          await tx.astrologerPayout.create({
            data: {
              astrologerId: astro.id,

              fromDate: from,
              toDate: to,

              remark: remark?.trim() || null,

              // Wallet based values
              totalRevenue,
              commissionPercent,
              commission,
              earning,

              pgChargeRate: PG_RATE,
              pgCharge,

              gstRate: GST_RATE,

              igst,
              cgst,
              sgst,

              pgTotal,
              grossAmount,

              tdsPercent,
              tdsAmount,

              lastPaidAmount: exportLastPaid,
              payableAmount: exportPayable,

              transactionRef: null,

              paymentDate: new Date(),

              status: "PENDING",
            },
          });

          // =================================================
          // DEDUCT FROM ASTROLOGER WALLET
          // =================================================

          if (payoutAmount > 0 && astro.wallet) {
            await tx.astrologerWallet.update({
              where: {
                astrologerId: astro.id,
              },

              data: {
                balanceCoins: {
                  decrement: payoutAmount,
                },

                totalPaid: {
                  increment: payoutAmount,
                },

                lastPaidAmount: payoutAmount,
              },
            });

            // =================================================
            // WALLET TRANSACTION
            // =================================================

            await tx.walletTransaction.create({
              data: {
                astrologerWalletId: astro.wallet.id,

                amount: payoutAmount,

                coins: Math.round(payoutAmount),

                type: "DEBIT",
              },
            });
          }
        });

        // =====================================================
        // EXPORT RESULT
        // =====================================================

        result.push({
          astrologerId: astro.id,

          astrologerName: astro.name,

          profilePic: astro.profilePic,

          accountHolderName: astro.kycDetail?.accountHolderName || null,

          accountNumber: astro.kycDetail?.accountNumber || null,

          bankName: astro.kycDetail?.bankName || null,

          ifsc: astro.kycDetail?.ifsc || null,

          panNumber: astro.kycDetail?.panNumber || null,

          state: astro.addresses?.[0]?.state || "",

          // Session count is still date-wise
          totalSessions: astro.sessions.length,

          // =================================================
          // WALLET VALUES
          // =================================================

          balanceCoins,

          totalRevenue,

          earning,

          commission,

          // =================================================
          // COMMISSION
          // =================================================

          commissionPercent,

          // =================================================
          // PG
          // =================================================

          pgChargeRate: PG_RATE,

          pgCharge,

          // =================================================
          // GST
          // =================================================

          gstRate: GST_RATE,

          cgst,

          sgst,

          igst,

          pgTotal,

          // =================================================
          // GROSS
          // =================================================

          grossAmount,

          // =================================================
          // TDS
          // =================================================

          tdsPercent,

          tdsAmount,

          // =================================================
          // PAYMENT
          // =================================================

          lastPaidAmount: exportLastPaid,

          payableAmount: exportPayable,
        });
      }

      return result;
    },
    //     exportPayoutReport: async (_, { fromDate, toDate,remark  }, { prisma, user }) => {
    //       // await checkPermission({ user, prisma }, "payout.update");

    //       const from = new Date(fromDate);
    //       const to = new Date(toDate);

    //       const astrologers = await prisma.astrologer.findMany({
    //         where: {
    //           isDeleted: false,
    //         },
    //         include: {
    //           wallet: true,
    //           pricing: {
    //             where: {
    //               isActive: true,
    //             },
    //           },
    //           tax: true,
    //           kycDetail: true,
    //           addresses: {
    //             take: 1,
    //             orderBy: {
    //               id: "desc",
    //             },
    //           },
    //           sessions: {
    //             where: {
    //               status: "COMPLETED",
    //               endedAt: {
    //                 gte: from,
    //                 lte: to,
    //               },
    //             },
    //           },
    //         },
    //       });

    //       const result = [];

    //       for (const astro of astrologers) {
    //         const totalRevenue = astro.sessions.reduce(
    //           (sum, s) => sum + (s.coinsDeducted || 0),
    //           0,
    //         );

    //         const earning = astro.sessions.reduce(
    //           (sum, s) => sum + (s.coinsEarned || 0),
    //           0,
    //         );

    //         const commission = astro.sessions.reduce(
    //           (sum, s) => sum + (s.commission || 0),
    //           0,
    //         );

    //         const commissionPercent = astro.pricing?.[0]?.commissionPercent || 0;

    //         const pgCharge = Number(((earning * PG_RATE) / 100).toFixed(2));

    //         const gstAmount = Number(((pgCharge * GST_RATE) / 100).toFixed(2));

    //         let cgst = 0;
    //         let sgst = 0;
    //         let igst = 0;

    //         if (
    //           astro.tax?.state &&
    //           astro.tax.state.toLowerCase() === COMPANY_STATE.toLowerCase()
    //         ) {
    //           cgst = Number((gstAmount / 2).toFixed(2));
    //           sgst = Number((gstAmount / 2).toFixed(2));
    //         } else {
    //           igst = gstAmount;
    //         }

    //         const pgTotal = Number((pgCharge + gstAmount).toFixed(2));

    //         const grossAmount = Number((earning - pgTotal).toFixed(2));

    //         const tdsPercent = astro.tax?.tdsPercent || 0;

    //         const tdsAmount = Number(((grossAmount * tdsPercent) / 100).toFixed(2));

    //         const totalPaid = astro.wallet?.totalPaid || 0;
    //         const lastPaidAmount = astro.wallet?.lastPaidAmount || 0;

    //         const payableAmount = Math.max(
    //           0,
    //           Number((grossAmount - tdsAmount - totalPaid).toFixed(2)),
    //         );

    //         const exportLastPaid = lastPaidAmount;
    //         const exportPayable = payableAmount;

    //     await prisma.$transaction(async (tx) => {
    //   // Prevent duplicate payout generation
    //   const existingPayout = await tx.astrologerPayout.findFirst({
    //     where: {
    //       astrologerId: astro.id,
    //       fromDate: from,
    //       toDate: to,
    //     },
    //   });

    //   // Already processed -> don't deduct wallet again
    //   if (existingPayout) {
    //     return;
    //   }

    //   const payoutAmount = Number(earning.toFixed(2));

    //   // 1️⃣ Create payout record
    //   await tx.astrologerPayout.create({
    //     data: {
    //       astrologerId: astro.id,

    //       fromDate: from,
    //       toDate: to,

    //       remark: remark?.trim() || null,

    //       totalRevenue,
    //       commissionPercent,
    //       commission,
    //       earning,

    //       pgChargeRate: PG_RATE,
    //       pgCharge,

    //       gstRate: GST_RATE,

    //       igst,
    //       cgst,
    //       sgst,

    //       pgTotal,
    //       grossAmount,

    //       tdsPercent,
    //       tdsAmount,

    //       lastPaidAmount: exportLastPaid,
    //       payableAmount: exportPayable,

    //       transactionRef: null,

    //       // Export submit time
    //       paymentDate: new Date(),

    //       status: "PENDING",
    //     },
    //   });

    //   // 2️⃣ Deduct amount from astrologer wallet
    //   if (payoutAmount > 0 && astro.wallet) {
    //     await tx.astrologerWallet.update({
    //       where: {
    //         astrologerId: astro.id,
    //       },
    //       data: {
    //         balanceCoins: {
    //           decrement: payoutAmount,
    //         },

    //         totalPaid: {
    //           increment: payoutAmount,
    //         },

    //         lastPaidAmount: payoutAmount,
    //       },
    //     });

    //     // 3️⃣ Create wallet transaction
    // await tx.walletTransaction.create({
    //   data: {
    //     astrologerWalletId: astro.wallet.id,
    //     amount: payoutAmount,
    //     coins: Math.round(payoutAmount),
    //     type: "DEBIT",
    //   },
    // });
    //   }
    // });

    //         result.push({
    //           astrologerId: astro.id,
    //           astrologerName: astro.name,
    //           profilePic: astro.profilePic,

    //           accountHolderName: astro.kycDetail?.accountHolderName,

    //           accountNumber: astro.kycDetail?.accountNumber,

    //           bankName: astro.kycDetail?.bankName,

    //           ifsc: astro.kycDetail?.ifsc,

    //           panNumber: astro.kycDetail?.panNumber,

    //           state: astro.addresses?.[0]?.state || "",

    //           totalSessions: astro.sessions.length,

    //           totalRevenue,

    //           commissionPercent,

    //           commission,

    //           earning,

    //           pgChargeRate: PG_RATE,

    //           pgCharge,

    //           gstRate: GST_RATE,

    //           cgst,

    //           sgst,

    //           igst,

    //           pgTotal,

    //           grossAmount,

    //           tdsPercent,

    //           tdsAmount,

    //           lastPaidAmount: exportLastPaid,

    //           payableAmount: exportPayable,
    //         });
    //       }

    //       return result;
    //     },
    // upload image
    uploadImage: async (_, { file }, context) => {
      try {
        if (!context.user) {
          throw new Error("Unauthorized");
        }

        return await handleUpload(file);
      } catch (error) {
        throw new Error(error.message || "Upload failed");
      }
    },

    // ================= ADMIN LOGIN =================
    loginStaff: async (_, { email, password }, { res }) => {
      const staff = await prisma.staff.findUnique({
        where: { email },
        include: { role: true },
      });

      if (!staff) throw new Error("Invalid credentials");
      const isMatch = await bcrypt.compare(password, staff.password);

      if (!isMatch) throw new Error("Invalid credentials");

      const accessToken = generateAccessToken(staff);
      const refreshToken = generateRefreshToken(staff);
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 24 * 60 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return {
        accessToken,
        refreshToken,
        user: staff,
      };
    },

    logoutAdmin: async (_, __, context) => {
      try {
        if (!context.user?.id) {
          throw new Error("Unauthorized");
        }

        return "Admin logged out successfully";
      } catch (error) {
        throw new Error(error.message || "Logout failed");
      }
    },

    assignPermissionsToRole: async (_, { roleId, permissionIds }, context) => {
      try {
        if (!context.user || context.user.role !== "SUPER_ADMIN") {
          throw new Error("Only SUPER_ADMIN can assign permissions");
        }

        const role = await prisma.role.findUnique({ where: { id: roleId } });
        if (!role) throw new Error("Role not found");

        const permissions = await prisma.permission.findMany({
          where: { id: { in: permissionIds } },
        });

        if (permissions.length !== permissionIds.length) {
          throw new Error("One or more permission IDs are invalid");
        }

        await prisma.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId,
            permissionId,
          })),
          skipDuplicates: true,
        });

        const updatedRole = await prisma.role.findUnique({
          where: { id: roleId },
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        });

        return {
          id: updatedRole.id,
          name: updatedRole.name,
          description: updatedRole.description,
          permissions: updatedRole.permissions.map((rp) => rp.permission),
        };
      } catch (error) {
        throw new Error(
          error.message || "Failed to assign permissions to role",
        );
      }
    },

    // ================= CREATE ADMIN =================
    createAdmin: async (_, args, context) => {
      try {
        if (!context.user || context.user.role !== "SUPER_ADMIN")
          throw new Error("Only SUPER_ADMIN can create admins");

        return await createAdminService(args);
      } catch (error) {
        throw new Error(error.message || "Failed to create admin");
      }
    },

    // ================= UPDATE ADMIN =================
    updateAdmin: async (_, { adminId, name, email, roleId }, context) => {
      try {
        if (!context.user || context.user.role !== "SUPER_ADMIN") {
          throw new Error("Only SUPER_ADMIN can update admins");
        }

        const existingAdmin = await prisma.admin.findUnique({
          where: { id: adminId },
          include: { role: true },
        });

        if (!existingAdmin) {
          throw new Error("Admin not found");
        }

        if (existingAdmin.role.name === "SUPER_ADMIN") {
          throw new Error("Cannot update SUPER_ADMIN");
        }

        if (email) {
          const duplicate = await prisma.admin.findUnique({
            where: { email },
          });

          if (duplicate && duplicate.id !== adminId) {
            throw new Error("Email already in use");
          }
        }

        if (roleId) {
          const role = await prisma.role.findUnique({
            where: { id: roleId },
          });

          if (!role) {
            throw new Error("Invalid role");
          }
        }

        const updatedAdmin = await prisma.admin.update({
          where: { id: adminId },
          data: {
            ...(name && { name }),
            ...(email && { email }),
            ...(roleId && { roleId }),
          },
          include: { role: true },
        });

        return updatedAdmin;
      } catch (error) {
        throw new Error(error.message || "Failed to update admin");
      }
    },

    // ================= DELETE ADMIN =================
    deleteAdmin: async (_, { adminId }, context) => {
      try {
        if (!context.user || context.user.role !== "SUPER_ADMIN") {
          throw new Error("Only SUPER_ADMIN can delete admins");
        }

        const existingAdmin = await prisma.admin.findUnique({
          where: { id: adminId },
          include: { role: true },
        });

        if (!existingAdmin) {
          throw new Error("Admin not found");
        }

        if (existingAdmin.role.name === "SUPER_ADMIN") {
          throw new Error("Cannot delete SUPER_ADMIN");
        }

        await prisma.admin.delete({
          where: { id: adminId },
        });

        return "Admin deleted successfully";
      } catch (error) {
        throw new Error(error.message || "Failed to delete admin");
      }
    },

    // ================= ADD ASTROLOGER =================
    addAstrologer: async (_, { data }, context) => {
      const { prisma } = context;

      if (data.applicationId) {
        const application = await prisma.astrologerApplication.findUnique({
          where: { id: data.applicationId },
        });

        if (application?.astrologerId) {
          throw new Error("Astrologer already created for this application");
        }
      }

      try {
        await checkPermission(context, "astrologer.create");
        const chatPricing = data.pricing.find((p) => p.type === "CHAT");
        const callPricing = data.pricing.find((p) => p.type === "CALL");
        const videoPricing = data.pricing.find((p) => p.type === "VIDEO");
        const audioPricing = data.pricing.find((p) => p.type === "AUDIO");
        const astrologer = await prisma.astrologer.create({
          data: {
            name: data.astroname,
            displayName: data.displayName,
            profilePic: data.profilePic,
            gender: data.gender,
            email: data.email,
            contactNo: String(data.phoneNumber),
            password: data.password,
            experience: Number(data.experience),
            about: data.about,
            status: data.status,
            languages: data.languages,
            skills: data.expertise,
            problems: data.problems,
            dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
            isEligibleChat: !!chatPricing?.isActive,
            isEligibleCall: !!callPricing?.isActive,
            isEligibleVideo: !!videoPricing?.isActive,
            isEligibleAudio: !!audioPricing?.isActive,
            tags: data.tags,
            vtags: data.vtags,

            pricing: {
              create: data.pricing
                .filter((p) => p.isActive)
                .map((p) => {
                  const isCommissionOnly =
                    p.type === "GIFT_COMMISSION" || p.type === "OFFER";

                  return {
                    type: p.type,
                    price: isCommissionOnly ? 0 : Number(p.price),
                    offerPrice: isCommissionOnly
                      ? null
                      : p.offerPrice
                        ? Number(p.offerPrice)
                        : null,
                    commissionPercent: Number(p.commissionPercent) || 0,
                    isActive: p.isActive,
                  };
                }),
            },

            addresses: {
              create: {
                street: data.address?.street || "",
                city: data.address?.city || "",
                state: data.address?.state || "",
                country: data.address?.country || "",
                pincode: data.address?.pincode || "",
              },
            },

            // FIX: Only create documents if present
            documents: data.documents
              ? {
                  create: [
                    ...(data.documents?.aadhaar
                      ? [
                          {
                            documentType: "AADHAAR",
                            documentUrl: data.documents.aadhaar,
                          },
                        ]
                      : []),

                    ...(data.documents?.panCard
                      ? [
                          {
                            documentType: "PAN",
                            documentUrl: data.documents.panCard,
                          },
                        ]
                      : []),

                    ...(data.documents?.passbook
                      ? [
                          {
                            documentType: "PASSBOOK",
                            documentUrl: data.documents.passbook,
                          },
                        ]
                      : []),
                  ],
                }
              : undefined,

            // FIX: Move bankDetails → KYC
            kycDetail: data.bankDetails
              ? {
                  create: {
                    accountHolderName: data.bankDetails.accountHolderName,
                    accountNumber: data.bankDetails.accountNumber,
                    bankName: data.bankDetails.bankName,
                    ifsc: data.bankDetails.ifscCode,
                    panNumber: data.bankDetails.panCardNumber,
                    branchName: data.bankDetails.branchName,
                    status: data.bankDetails.status,

                    ...(data.applicationId && {
                      application: {
                        connect: { id: data.applicationId },
                      },
                    }),
                  },
                }
              : undefined,

            // optional audit
            // createdBy: context.user.id,
          },
        });
        if (data.applicationId) {
          await prisma.astrologerApplication.update({
            where: {
              id: data.applicationId,
            },
            data: {
              astrologerId: astrologer.id,
              approvalStatus: "APPROVED",
            },
          });
        }

        return {
          success: true,
          message: "Astrologer added successfully",
          data: astrologer,
        };
      } catch (error) {
        throw new Error(error.message || "Failed to add astrologer");
      }
    },

    // ================= UPDATE ASTROLOGER =================
    updateAstrologer: async (_, { astrologerId, data }, context) => {
      const { prisma } = context;

      try {
        await checkPermission(context, "astrologer.update");

        const existing = await prisma.astrologer.findUnique({
          where: { id: astrologerId },
          include: {
            addresses: true,
            kycDetail: true,
            pricing: true,
          },
        });

        if (!existing) {
          throw new Error("Astrologer not found");
        }
        const chatPricing = data.pricing.find((p) => p.type === "CHAT");
        const callPricing = data.pricing.find((p) => p.type === "CALL");
        const videoPricing = data.pricing.find((p) => p.type === "VIDEO");
        const audioPricing = data.pricing.find((p) => p.type === "AUDIO");
        const updatedAstrologer = await prisma.astrologer.update({
          where: {
            id: astrologerId,
          },
          data: {
            name: data.astroname,
            displayName: data.displayName,

            profilePic: data.profilePic,

            gender: data.gender,

            dateOfBirth: data.dateOfBirth
              ? new Date(data.dateOfBirth)
              : undefined,
            isEligibleChat: !!chatPricing?.isActive,
            isEligibleCall: !!callPricing?.isActive,
            isEligibleVideo: !!videoPricing?.isActive,
            isEligibleAudio: !!audioPricing?.isActive,
            email: data.email,
            contactNo: data.phoneNumber,

            experience: data.experience,

            skills: data.expertise,
            languages: data.languages,
            problems: data.problems,

            about: data.about,

            status: data.status,

            tags: data.tags,
            vtags: data.vtags,

            // ADDRESS
            addresses: data.address
              ? {
                  deleteMany: {},

                  create: {
                    street: data.address.street,
                    city: data.address.city,
                    state: data.address.state,
                    country: data.address.country,
                    pincode: data.address.pincode,
                  },
                }
              : undefined,

            // KYC
            kycDetail:
              data.bankDetails || data.documents
                ? {
                    upsert: {
                      create: {
                        accountHolderName: data.bankDetails?.accountHolderName,

                        accountNumber: data.bankDetails?.accountNumber,

                        bankName: data.bankDetails?.bankName,

                        ifsc: data.bankDetails?.ifscCode,

                        branchName: data.bankDetails?.branchName,

                        panNumber: data.bankDetails?.panCardNumber,

                        aadhaarImage: data.documents?.aadhaar,

                        panImage: data.documents?.panCard,

                        passbookImage: data.documents?.passbook,
                      },

                      update: {
                        accountHolderName: data.bankDetails?.accountHolderName,

                        accountNumber: data.bankDetails?.accountNumber,

                        bankName: data.bankDetails?.bankName,

                        ifsc: data.bankDetails?.ifscCode,

                        branchName: data.bankDetails?.branchName,

                        panNumber: data.bankDetails?.panCardNumber,

                        aadhaarImage: data.documents?.aadhaar,

                        panImage: data.documents?.panCard,

                        passbookImage: data.documents?.passbook,
                      },
                    },
                  }
                : undefined,

            // PRICING
            pricing: data.pricing?.length
              ? {
                  deleteMany: {},

                  create: data.pricing
                    .filter((p) => p.isActive)
                    .map((item) => ({
                      type: item.type,
                      price: Number(item.price),
                      offerPrice: item.offerPrice
                        ? Number(item.offerPrice)
                        : null,
                      commissionPercent: Number(item.commissionPercent) || 0,
                      isActive: true,
                    })),
                }
              : undefined,
          },
          include: {
            addresses: true,
            pricing: true,
            kycDetail: true,
          },
        });

        return updatedAstrologer;
      } catch (error) {
        throw new Error(error.message || "Failed to update astrologer");
      }
    },

    updateAstrologerAvailability: async (_, data, context) => {
      const { prisma } = context;
      const { astrologerId, ...updateData } = data;

      return prisma.astrologer.update({
        where: {
          id: astrologerId,
        },
        data: updateData,
      });
    },

    // ================= DELETE ASTROLOGER =================
    deleteAstrologer: async (_, { astrologerId }, context) => {
      try {
        if (
          !context.user ||
          !["SUPER_ADMIN", "MANAGER"].includes(context.user.role?.name)
        )
          throw new Error("Not authorized");

        const existing = await prisma.astrologer.findUnique({
          where: { id: astrologerId },
        });

        if (!existing) throw new Error("Astrologer not found");

        await prisma.astrologer.update({
          where: { id: astrologerId },
          data: {
            isDeleted: true,
            status: false,
            isOnline: false,
            isBusy: false,
            isChatActive: false,
            isCallActive: false,
            isLiveActive: false,
          },
        });
        return true;
      } catch (error) {
        throw new Error(error.message || "Failed to delete astrologer");
      }
    },

    // ================= UPDATE USER =================
    updateUser: async (_, { userId, data }, context) => {
      try {
        if (!context.user || context.user.role?.name !== "ADMIN") {
          throw new Error("Admin only");
        }

        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!existingUser || existingUser.isDeleted) {
          throw new Error("User not found");
        }

        if (data.mobile) {
          const mobileExists = await prisma.user.findFirst({
            where: {
              mobile: data.mobile,
              NOT: { id: userId },
            },
          });

          if (mobileExists) {
            throw new Error("Mobile already in use");
          }
        }

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data,
        });

        return updatedUser;
      } catch (error) {
        throw new Error(error.message || "Failed to update user");
      }
    },

    updateUser: async (_, { userId, data }, context) => {
      try {
        if (!context.user || context.user.role !== "ADMIN") {
          throw new Error("Admin only");
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user || user.isDeleted) {
          throw new Error("User not found");
        }

        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: {
            ...data,
          },
        });

        return updatedUser;
      } catch (error) {
        throw new Error(error.message || "Failed to update user");
      }
    },

    deleteUser: async (_, { userId }, context) => {
      try {
        if (!context.user || context.user.role !== "ADMIN") {
          throw new Error("Admin only");
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user || user.isDeleted) {
          throw new Error("User not found");
        }

        await prisma.user.update({
          where: { id: userId },
          data: {
            isDeleted: true,
            isActive: false,
          },
        });

        return "User deleted successfully";
      } catch (error) {
        throw new Error(error.message || "Failed to delete user");
      }
    },

    // ================= VERIFY DOCUMENT =================

    // ================= SCHEDULE INTERVIEW =================

    // ================= REJECT ASTROLOGER =================
    rejectAstrologer: async (_, { astrologerId, stage, reason }, context) => {
      try {
        if (!context.user || context.user.role !== "ADMIN")
          throw new Error("Admin only");

        await prisma.astrologerRejectionHistory.create({
          data: {
            astrologerId,
            stage,
            reason,
            rejectedBy: context.user.id,
          },
        });

        await prisma.astrologer.update({
          where: { id: astrologerId },
          data: { approvalStatus: "REJECTED" },
        });

        return true;
      } catch (error) {
        throw new Error(error.message || "Failed to reject astrologer");
      }
    },

    // ================= APPROVE ASTROLOGER =================
    approveAstrologer: async (_, { id }) => {
      const app = await prisma.astrologerApplication.findUnique({
        where: { id },
        include: { kyc: true },
      });

      if (!app) throw new Error("Application not found");

      //  create final astrologer
      const astrologer = await prisma.astrologer.create({
        data: {
          name: app.name,
          email: app.email,
          contactNo: app.phoneNumber,
          experience: app.experience,
          languages: app.languages,
          skills: app.skills,
          // profilePic: app.kyc?.profileImage,
          approvalStatus: "APPROVED",
        },
      });

      // update application
      await prisma.astrologerApplication.update({
        where: { id },
        data: { approvalStatus: "APPROVED" },
      });

      return astrologer;
    },

    // Recharge packages ===============================

    createRechargePack: async (_, { input }, context) => {
      const { prisma } = context;
      await checkPermission(context, "walletpackages.create");

      try {
        const pack = await prisma.rechargePack.create({
          data: {
            name: input.name,
            description: input.description,
            price: input.price,
            coins: input.coins,
            talktime: input.talktime,
            validityDays: input.validityDays,
            isActive: input.isActive ?? true,
            hideAfterFirstRecharge: input.hideAfterFirstRecharge ?? false,
          },
        });

        return pack;
      } catch (error) {
        throw error;
      }
    },
    deleteRechargePack: async (_, { id }, context) => {
      const { prisma } = context;
      await checkPermission(context, "walletpackages.delete");

      try {
        await prisma.rechargePack.update({
          where: { id },
          data: {
            isActive: false,
          },
        });

        return true;
      } catch (error) {
        throw error;
      }
    },

    updateRechargePack: async (_, { id, input }, context) => {
      const { prisma } = context;
      await checkPermission(context, "walletpackages.update");

      try {
        const pack = await prisma.rechargePack.update({
          where: { id },
          data: input,
        });

        return pack;
      } catch (error) {
        throw error;
      }
    },

    // ===============Coupons ++++++++++++++++++++++
    createCoupon: async (_, { input }, context) => {
      const { prisma } = context;

      await checkPermission(context, "coupons.create");

      return prisma.coupon.create({
        data: {
          code: input.code,
          description: input.description,

          applicable: input.applicable,

          type: input.type,
          visibility: input.visibility,

          couponCount: input.couponCount || 0,

          status: input.status?.toUpperCase() === "ACTIVE",

          percentage: input.percentage,
          minOrderAmount: input.minOrderAmount,

          maxDiscount: input.maxDiscount,
          redeemLimit: input.redeemLimit,

          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
        },
      });
    },

    deleteCoupon: async (_, { id }, context) => {
      const { prisma } = context;
      await checkPermission(context, "coupons.delete");

      try {
        await prisma.coupon.delete({
          where: { id },
        });

        return true;
      } catch (error) {
        throw error;
      }
    },

    updateCouponStatus: async (_, { id, status }, context) => {
      const { prisma } = context;

      await checkPermission(context, "coupons.update");

      return prisma.coupon.update({
        where: { id },
        data: {
          status: String(status).toUpperCase() === "ACTIVE",
        },
      });
    },

    updateCoupon: async (_, { id, input }, context) => {
      const { prisma } = context;

      await checkPermission(context, "coupons.update");

      const existingCoupon = await prisma.coupon.findUnique({
        where: { id },
      });

      if (!existingCoupon) {
        throw new Error("Coupon not found");
      }

      return prisma.coupon.update({
        where: { id },
        data: {
          ...(input.code !== undefined && {
            code: input.code.trim(),
          }),

          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.minOrderAmount !== undefined && {
            minOrderAmount: input.minOrderAmount,
          }),

          ...(input.applicable !== undefined && {
            applicable: input.applicable,
          }),

          ...(input.type !== undefined && {
            type: input.type,
          }),

          ...(input.visibility !== undefined && {
            visibility: input.visibility,
          }),

          ...(input.status !== undefined && {
            status: input.status.toUpperCase() === "ACTIVE",
          }),

          ...(input.couponCount !== undefined && {
            couponCount: input.couponCount,
          }),

          ...(input.percentage !== undefined && {
            percentage: input.percentage,
          }),

          ...(input.maxDiscount !== undefined && {
            maxDiscount: input.maxDiscount,
          }),

          ...(input.redeemLimit !== undefined && {
            redeemLimit: input.redeemLimit,
          }),

          ...(input.startDate && {
            startDate: new Date(input.startDate),
          }),

          ...(input.endDate && {
            endDate: new Date(input.endDate),
          }),
        },
      });
    },

    // ****************************** Modules ********************

    createModule: async (_, { name, slug, description, section }, context) => {
      const { prisma } = context;

      try {
        await checkPermission(context, "modules.create");

        const normalizedName = name.trim();
        const normalizedSlug = slug.trim().toLowerCase();
        const normalizedSection = section.trim().toLowerCase();

        const module = await prisma.$transaction(async (tx) => {
          const newModule = await tx.module.create({
            data: {
              name: normalizedName,
              slug: normalizedSlug,
              description,
              section: normalizedSection,
            },
          });

          await generateCRUDPermissions(newModule, tx);

          return newModule;
        });

        return module;
      } catch (error) {
        if (error.code === "P2002") {
          throw new Error("Module with same slug already exists");
        }

        throw new Error(error.message || "Failed to create module");
      }
    },

    updateModule: async (
      _,
      { id, name, slug, description, section, isActive },
      context,
    ) => {
      const { prisma } = context;
      try {
        await checkPermission(context, "modules.edit");

        const moduleExists = await prisma.module.findUnique({
          where: { id },
        });

        if (!moduleExists) {
          throw new Error("Module not found");
        }

        //  normalize values if provided
        const normalizedSlug = slug?.trim().toLowerCase();
        const normalizedSection = section?.trim().toLowerCase();

        //  check slug uniqueness (if changed)
        if (normalizedSlug && normalizedSlug !== moduleExists.slug) {
          const existingSlug = await prisma.module.findUnique({
            where: { slug: normalizedSlug },
          });

          if (existingSlug) {
            throw new Error("Slug already exists");
          }
        }

        const updatedModule = await prisma.module.update({
          where: { id },
          data: {
            ...(name && { name: name.trim() }),
            ...(normalizedSlug && { slug: normalizedSlug }),
            ...(description !== undefined && { description }),
            ...(normalizedSection && { section: normalizedSection }), // 🔥 ADD THIS
            ...(isActive !== undefined && { isActive }),
          },
        });

        return updatedModule;
      } catch (error) {
        throw new Error(error.message || "Failed to update module");
      }
    },

    deleteModule: async (_, { id }, context) => {
      const { prisma } = context;
      await checkPermission(context, "modules.delete");

      await prisma.modulePermission.deleteMany({
        where: { moduleId: id },
      });

      await prisma.module.delete({
        where: { id },
      });

      return true;
    },

    // Roles +++++++++++++++++++++++++++++++

    createRole: async (_, { name, slug, description }, context) => {
      const { prisma } = context;
      try {
        await checkPermission(context, "roles.create");
        const normalizedName = name.trim();
        const normalizedSlug = slug.trim().toLowerCase();

        const existingRole = await prisma.role.findFirst({
          where: {
            OR: [{ name: normalizedName }, { slug: normalizedSlug }],
          },
        });

        if (existingRole) {
          throw new Error("Role with same name or slug already exists");
        }

        const role = await prisma.role.create({
          data: {
            name: normalizedName,
            slug: normalizedSlug,
            description,
          },
        });

        return role;
      } catch (error) {
        throw new Error(error.message || "Failed to create role");
      }
    },

    updateRole: async (
      _,
      { roleId, name, slug, description, isActive },
      context,
    ) => {
      const { prisma } = context;
      await checkPermission(context, "roles.edit");

      return prisma.role.update({
        where: { id: roleId },
        data: {
          ...(name && { name }),
          ...(slug && { slug: slug.trim().toLowerCase() }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive }), // 👈 ADD THIS
        },
      });
    },

    deleteRole: async (_, { roleId }, context) => {
      const { prisma } = context;
      try {
        await checkPermission(context, "roles.delete");
        const role = await prisma.role.findUnique({
          where: { id: roleId },
        });

        if (!role) {
          throw new Error("Role not found");
        }

        await prisma.role.delete({
          where: { id: roleId },
        });

        return {
          success: true,
          message: "Role deleted successfully",
          error: "",
        };
      } catch (error) {
        return {
          success: false,
          message: "Failed to delete role",
          error: "This role is assigned to staff. Delete or reassign first.",
        };
      }
    },

    // Permission
    createPermission: async (_, { name, moduleIds }, context) => {
      const { prisma } = context;
      await checkPermission(context, "permissions.create");

      if (name.includes(".")) {
        throw new Error("System permissions cannot be created manually");
      }

      const permission = await prisma.permission.create({
        data: {
          name,
          type,
          modules: {
            create: moduleIds.map((id) => ({
              module: { connect: { id } },
            })),
          },
        },
        include: {
          modules: { include: { module: true } },
        },
      });

      return {
        ...permission,
        modules: permission.modules.map((m) => m.module),
      };
    },

    updatePermission: async (_, { permissionId, name, moduleIds }, context) => {
      const { prisma } = context;
      await checkPermission(context, "permissions.update");

      const existing = await prisma.permission.findUnique({
        where: { id: permissionId },
      });

      // SYSTEM ko edit nahi karne dena
      if (existing.type === "SYSTEM") {
        throw new Error("System permissions cannot be updated");
      }

      if (moduleIds) {
        await prisma.modulePermission.deleteMany({
          where: { permissionId },
        });
      }

      const permission = await prisma.permission.update({
        where: { id: permissionId },
        data: {
          ...(name && { name }),
          ...(moduleIds && {
            modules: {
              create: moduleIds.map((id) => ({
                module: { connect: { id } },
              })),
            },
          }),
        },
        include: {
          modules: { include: { module: true } },
        },
      });

      return {
        ...permission,
        modules: permission.modules.map((m) => m.module),
      };
    },

    deletePermission: async (_, { permissionId }, context) => {
      const { prisma } = context;
      await checkPermission(context, "permissions.delete");

      const existing = await prisma.permission.findUnique({
        where: { id: permissionId },
      });

      //  SYSTEM delete block
      if (existing.type === "SYSTEM") {
        throw new Error("System permissions cannot be deleted");
      }

      await prisma.modulePermission.deleteMany({
        where: { permissionId },
      });

      await prisma.permission.delete({
        where: { id: permissionId },
      });

      return true;
    },

    // Department
    createDepartment: async (_, { name, description }, context) => {
      const { prisma } = context;
      await checkPermission(context, "departments.create");
      const slug = generateSlug(name);

      const department = await prisma.department.create({
        data: {
          name,
          slug,
          description,
        },
      });

      return department;
    },

    updateDepartment: async (
      _,
      { departmentId, name, description, isActive },
      context,
    ) => {
      const { prisma } = context;
      await checkPermission(context, "departments.edit");
      let slug;

      if (name) {
        slug = generateSlug(name);
      }

      const department = await prisma.department.update({
        where: { id: departmentId },
        data: {
          ...(name && { name }),
          ...(slug && { slug }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      return department;
    },

    deleteDepartment: async (_, { departmentId }, context) => {
      const { prisma } = context;
      await checkPermission(context, "departments.delete");
      const staffCount = await prisma.staff.count({
        where: { departmentId },
      });

      if (staffCount > 0) {
        throw new Error("Cannot delete department. Staff are assigned to it.");
      }

      await prisma.department.delete({
        where: { id: departmentId },
      });

      return true;
    },

    // Stafff

    createStaff: async (
      _,
      { name, email, password, departmentId, roleId, permissionIds },
      context,
    ) => {
      const { prisma } = context;
      try {
        await checkPermission(context, "staff.create");

        const normalizedEmail = email.toLowerCase().trim();

        const existingStaff = await prisma.staff.findUnique({
          where: { email: normalizedEmail },
        });

        if (existingStaff) {
          throw new Error("Staff with this email already exists");
        }

        const hashedPassword = await bcrypt.hash(password.trim(), 10);

        const staff = await prisma.staff.create({
          data: {
            name,
            email: normalizedEmail,
            password: hashedPassword,

            department: { connect: { id: departmentId } },
            role: { connect: { id: roleId } },

            permissions: {
              create:
                permissionIds?.map((id) => ({
                  permission: { connect: { id } },
                })) || [],
            },
          },

          include: {
            department: true,
            role: true,
            permissions: { include: { permission: true } },
          },
        });

        return {
          ...staff,
          permissions: staff.permissions.map((p) => p.permission),
        };
      } catch (error) {
        throw new Error(error.message || "Failed to create staff");
      }
    },

    updateStaff: async (
      _,
      { staffId, name, email, password, departmentId, roleId, permissionIds },
      context,
    ) => {
      const { prisma } = context;
      try {
        await checkPermission(context, "staff.edit");
        const staffExists = await prisma.staff.findUnique({
          where: { id: staffId },
        });

        if (!staffExists) {
          throw new Error("Staff not found");
        }

        if (email && email !== staffExists.email) {
          const emailExists = await prisma.staff.findUnique({
            where: { email },
          });

          if (emailExists) {
            throw new Error("Email already in use");
          }
        }

        let hashedPassword;

        if (password) {
          hashedPassword = await bcrypt.hash(password, 10);
        }

        if (permissionIds) {
          await prisma.staffPermission.deleteMany({
            where: { staffId },
          });
        }

        const staff = await prisma.staff.update({
          where: { id: staffId },

          data: {
            ...(name && { name }),
            ...(email && { email }),
            ...(hashedPassword && { password: hashedPassword }),

            ...(departmentId && {
              department: { connect: { id: departmentId } },
            }),

            ...(roleId && {
              role: { connect: { id: roleId } },
            }),

            ...(permissionIds && {
              permissions: {
                create: permissionIds.map((id) => ({
                  permission: { connect: { id } },
                })),
              },
            }),
          },

          include: {
            department: true,
            role: true,
            permissions: { include: { permission: true } },
          },
        });

        return {
          ...staff,
          permissions: staff.permissions.map((p) => p.permission),
        };
      } catch (error) {
        throw new Error(error.message || "Failed to update staff");
      }
    },

    deleteStaff: async (_, { staffId }, context) => {
      const { prisma } = context;
      try {
        await checkPermission(context, "staff.delete");
        const staff = await prisma.staff.findUnique({
          where: { id: staffId },
        });

        if (!staff) {
          throw new Error("Staff not found");
        }

        await prisma.staffPermission.deleteMany({
          where: { staffId },
        });

        await prisma.staff.delete({
          where: { id: staffId },
        });

        return true;
      } catch (error) {
        throw new Error(error.message || "Failed to delete staff");
      }
    },

    // dhwani services
    createService: async (_, { input }, { prisma }) => {
      return prisma.service.create({
        data: {
          name: input.name,
          slug: input.slug,
          image: input.image,
          description: input.description,
          longText: input.longText,
          price: input.price,
          categoryId: input.categoryId || null,
        },
      });
    },
    updateService: async (_, { id, input }, { prisma }) => {
      return prisma.service.update({
        where: { id },

        data: {
          name: input.name,
          slug: input.slug,

          image: input.image,
          description: input.description,
          longText: input.longText,

          price: input.price,

          categoryId: input.categoryId || null,
        },
      });
    },
    deleteService: async (_, { id }, { prisma }) => {
      await prisma.service.delete({
        where: { id },
      });

      return true;
    },

    createCategory: async (_, { input }, { prisma }) => {
      return prisma.category.create({
        data: {
          name: input.name,
          slug: input.slug,
          image: input.image,
        },
      });
    },
    updateCategory: async (_, { id, input }, { prisma }) => {
      return prisma.category.update({
        where: { id },

        data: {
          name: input.name,
          slug: input.slug,
          image: input.image,
        },
      });
    },
    deleteCategory: async (_, { id }, { prisma }) => {
      await prisma.category.delete({
        where: { id },
      });

      return true;
    },

    // gifts
    createGift: async (_, { input }, context) => {
      await checkPermission(context, "gifts.create");

      return await context.prisma.gift.create({
        data: {
          name: input.name,
          amount: input.amount,
          image: input.image,
          status: input.status,
        },
      });
    },

    updateGift: async (_, { id, input }, context) => {
      await checkPermission(context, "gifts.update"); //  FIXED

      return await context.prisma.gift.update({
        where: { id },
        data: {
          name: input.name,
          amount: input.amount,
          status: input.status,
          ...(input.image && { image: input.image }),
        },
      });
    },
    deleteGift: async (_, { id }, context) => {
      await checkPermission(context, "gifts.delete"); //  FIXED

      await context.prisma.gift.delete({
        where: { id },
      });

      return true;
    },

    // Testimonials
    createTestimonial: async (_, { input }, context) => {
      await checkPermission(context, "testimonials.create");

      // optional validation (good for interviews)
      if (input.rating < 1 || input.rating > 5) {
        throw new Error("Rating must be between 1 and 5");
      }

      return await context.prisma.testimonial.create({
        data: {
          name: input.name,
          address: input.address,
          content: input.content,
          image: input.image,
          rating: input.rating,
        },
      });
    },

    updateTestimonial: async (_, { id, input }, context) => {
      await checkPermission(context, "testimonials.update");

      return await context.prisma.testimonial.update({
        where: { id },
        data: {
          ...(input.name && { name: input.name }),
          ...(input.address && { address: input.address }),
          ...(input.content && { content: input.content }),
          ...(input.image && { image: input.image }),
          ...(input.rating && { rating: input.rating }),
        },
      });
    },

    deleteTestimonial: async (_, { id }, context) => {
      await checkPermission(context, "testimonials.delete");

      await context.prisma.testimonial.delete({
        where: { id },
      });

      return "Testimonial deleted successfully";
    },

    // FAQs
    createFaq: async (_, { input }, context) => {
      await checkPermission(context, "faqs.create");

      return context.prisma.faq.create({
        data: {
          question: input.question,
          answer: input.answer,
        },
      });
    },

    updateFaq: async (_, { id, input }, context) => {
      await checkPermission(context, "faqs.update");

      return context.prisma.faq.update({
        where: { id },
        data: {
          ...(input.question && { question: input.question }),
          ...(input.answer && { answer: input.answer }),
        },
      });
    },

    deleteFaq: async (_, { id }, context) => {
      await checkPermission(context, "faqs.delete");

      await context.prisma.faq.delete({
        where: { id },
      });

      return "FAQ deleted";
    },

    // banners
    createBanner: async (_, { input }, context) => {
      const { prisma } = context;

      await checkPermission(context, "banners.create");

      return prisma.banner.create({
        data: {
          heading: input.heading,
          subheading: input.subheading,
          slug: input.slug,
          sortorder: input.sortorder,
          bannerlink: input.bannerlink,
          language: input.language,
          imageUrl: input.imageUrl,
        },
      });
    },

    updateBanner: async (_, { id, input }, context) => {
      const { prisma } = context;

      await checkPermission(context, "banners.update");

      return prisma.banner.update({
        where: { id },
        data: input,
      });
    },

    deleteBanner: async (_, { id }, context) => {
      const { prisma } = context;
      await checkPermission(context, "banners.delete");

      await prisma.banner.delete({
        where: { id },
      });

      return true;
    },

    // hiring astrologer
    scheduleInterview: async (
      _,
      {
        astrologerId,
        astrologerNumber,
        astrologerMail,
        interviewerId,
        interviewDate,
        interviewTime,
        round,
      },
      { prisma },
    ) => {
      return prisma.astrologerApplication.update({
        where: { id: astrologerId },
        data: {
          interviewerId,
          interviewDate: new Date(interviewDate).toISOString(), // ISO fix
          interviewTime,
          round,
          interviewStatus: "SCHEDULED",

          interviewScheduledAt: new Date(),
        },
      });
    },
    updateInterviewResult: async (
      _,
      { astrologerId, status, remarks },
      { prisma },
    ) => {
      return prisma.astrologerApplication.update({
        where: { id: astrologerId },
        data: {
          interviewStatus: status,
          interviewRemarks: remarks,
          interviewTakenAt: new Date(),

          ...(status === "REJECTED" && {
            approvalStatus: "REJECTED",
          }),
        },
      });
    },

    updateDocumentStatus: async (_, { astrologerId, status }, { prisma }) => {
      return prisma.astrologerApplication.update({
        where: { id: astrologerId },
        data: { documentStatus: status },
      });
    },

    updateApprovalStatus: async (_, { astrologerId, status }, { prisma }) => {
      return prisma.astrologerApplication.update({
        where: { id: astrologerId },
        data: {
          approvalStatus: status,
          ...(status === "APPROVED" && {
            applicationStatus: "APPROVED",
          }),
        },
      });
    },

    approveAstrologer: async (_, { id }, { prisma, user }) => {
      const application = await prisma.astrologerApplication.findUnique({
        where: { id },
      });

      if (!application) throw new Error("Application not found");

      // role check (important)
      if (user.role !== "ADMIN") {
        throw new Error("Not authorized");
      }

      const result = await prisma.$transaction([
        prisma.astrologer.create({
          data: {
            name: application.name,
            email: application.email,
            phoneNumber: application.phoneNumber,
            gender: application.gender,
            languages: application.languages,
            skills: application.skills,
            experience: application.experience,
            about: application.about,
            applicationId: application.id,
            approvedById: user.id,
          },
        }),

        prisma.astrologerApplication.update({
          where: { id },
          data: {
            approvalStatus: "APPROVED",
            applicationStatus: "APPROVED",
          },
        }),
      ]);

      return result[1]; // updated application
    },

    // pricng config
    updatePricingConfig: async (_, args, { prisma }) => {
      const existing = await prisma.pricingConfig.findFirst();

      if (existing) {
        return await prisma.pricingConfig.update({
          where: { id: existing.id },
          data: args,
        });
      }

      return await prisma.pricingConfig.create({
        data: args,
      });
    },

    markOfferUsed: async (_, __, { prisma, userId }) => {
      await prisma.userOfferUsage.upsert({
        where: { userId },
        update: {
          hasUsedFirstOffer: true,
          usedAt: new Date(),
        },
        create: {
          userId,
          hasUsedFirstOffer: true,
          usedAt: new Date(),
        },
      });

      return true;
    },

    // docs and image verify
    saveAndVerifyKyc: async (_, args, context) => {
      if (!context.user) throw new Error("Unauthorized");

      const { astrologerId, input, remarks } = args;

      const kyc = await prisma.kycDetail.upsert({
        where: {
          astrologerApplicationId: astrologerId,
        },
        update: {
          ...input,
          documentRemarks: remarks,
        },
        create: {
          astrologerApplicationId: astrologerId,
          ...input,
          documentRemarks: remarks,
        },
      });

      await prisma.astrologerApplication.update({
        where: { id: astrologerId },
        data: {
          documentStatus: input.status,
        },
      });
      return kyc;
    },

    rejectKyc: async (_, { astrologerId, remarks }, context) => {
      if (!context.user) throw new Error("Unauthorized");

      await prisma.astrologerApplication.update({
        where: { id: astrologerId },
        data: {
          documentStatus: "REJECTED",
          approvalStatus: "REJECTED",
          documentRemarks: remarks,
        },
      });

      return true;
    },

    createFraudFlag: async (_, { keyword }, { prisma }) => {
      try {
        const cleanKeyword = keyword.trim().toLowerCase();

        if (!cleanKeyword) {
          throw new Error("Keyword is required");
        }

        const existing = await prisma.fraudFlag.findUnique({
          where: {
            keyword: cleanKeyword,
          },
        });

        if (existing) {
          throw new Error("Keyword already exists");
        }

        const fraudFlag = await prisma.fraudFlag.create({
          data: {
            keyword: cleanKeyword,
          },
        });

        return fraudFlag;
      } catch (error) {
        throw new Error(error.message || "Failed to create fraud flag");
      }
    },
    deleteFraudFlag: async (_, { id }, { prisma }) => {
      try {
        await prisma.fraudFlag.delete({
          where: {
            id,
          },
        });

        return true;
      } catch (error) {
        throw new Error("Failed to delete fraud flag");
      }
    },

    updateFraudLogStatus: async (_, { id, status }, { prisma }) => {
      try {
        const fraudLog = await prisma.fraudLog.update({
          where: {
            id,
          },

          data: {
            status,
          },
        });

        return fraudLog;
      } catch (error) {
        throw new Error("Failed to update fraud log status");
      }
    },

    // about page
    upsertAboutPage: async (_, { input }, context) => {
      try {
        const existing = await prisma.aboutPage.findFirst({
          where: {
            pageType: "about-us",
          },
        });

        // ================= UPDATE =================

        if (existing) {
          return await prisma.aboutPage.update({
            where: {
              id: existing.id,
            },

            data: {
              heroTitle: input.heroTitle,

              heroDescription: input.heroDescription,

              mentors: input.mentors,

              founders: input.founders,

              metaTitle: input.metaTitle,

              metaDescription: input.metaDescription,

              keywords: input.keywords,

              status: input.status,
            },
          });
        }

        // ================= CREATE =================

        return await prisma.aboutPage.create({
          data: {
            pageType: "about-us",

            heroTitle: input.heroTitle,

            heroDescription: input.heroDescription,

            mentors: input.mentors,

            founders: input.founders,

            metaTitle: input.metaTitle,

            metaDescription: input.metaDescription,

            keywords: input.keywords,

            status: input.status,
          },
        });
      } catch (error) {
        throw new Error("Failed to save about page");
      }
    },

    upsertPrivacyPage: async (_, { input }) => {
      try {
        const existing = await prisma.privacyPage.findFirst({
          where: {
            pageType: "privacy-policy",
          },
        });

        // ================= UPDATE =================

        if (existing) {
          return await prisma.privacyPage.update({
            where: {
              id: existing.id,
            },

            data: {
              title: input.title,

              content: input.content,

              metaTitle: input.metaTitle,

              metaDescription: input.metaDescription,

              keywords: input.keywords,

              status: input.status,
            },
          });
        }

        // ================= CREATE =================

        return await prisma.privacyPage.create({
          data: {
            pageType: "privacy-policy",

            title: input.title,

            content: input.content,

            metaTitle: input.metaTitle,

            metaDescription: input.metaDescription,

            keywords: input.keywords,

            status: input.status,
          },
        });
      } catch (error) {
        throw new Error("Failed to save privacy page");
      }
    },

    upsertRefundPolicyPage: async (_, { input }) => {
      try {
        const existing = await prisma.refundPolicyPage.findFirst({
          where: {
            pageType: "refund-policy",
          },
        });

        // ================= UPDATE =================

        if (existing) {
          return await prisma.refundPolicyPage.update({
            where: {
              id: existing.id,
            },

            data: {
              title: input.title,

              content: input.content,

              metaTitle: input.metaTitle,

              metaDescription: input.metaDescription,

              keywords: input.keywords,

              status: input.status,
            },
          });
        }

        // ================= CREATE =================

        return await prisma.refundPolicyPage.create({
          data: {
            pageType: "refund-policy",

            title: input.title,

            content: input.content,

            metaTitle: input.metaTitle,

            metaDescription: input.metaDescription,

            keywords: input.keywords,

            status: input.status,
          },
        });
      } catch (error) {
        throw new Error("Failed to save refund policy page");
      }
    },

    upsertDisclaimerPage: async (_, { input }) => {
      try {
        const existing = await prisma.disclaimerPage.findFirst({
          where: {
            pageType: "disclaimer",
          },
        });

        // ================= UPDATE =================

        if (existing) {
          return await prisma.disclaimerPage.update({
            where: {
              id: existing.id,
            },

            data: {
              title: input.title,

              content: input.content,

              metaTitle: input.metaTitle,

              metaDescription: input.metaDescription,

              keywords: input.keywords,

              status: input.status,
            },
          });
        }

        // ================= CREATE =================

        return await prisma.disclaimerPage.create({
          data: {
            pageType: "disclaimer",

            title: input.title,

            content: input.content,

            metaTitle: input.metaTitle,

            metaDescription: input.metaDescription,

            keywords: input.keywords,

            status: input.status,
          },
        });
      } catch (error) {
        throw new Error("Failed to save disclaimer page");
      }
    },

    createRemedy: async (_, { input }) => {
      try {
        return await prisma.remedy.create({
          data: {
            title: input.title,
            description: input.description,
          },
        });
      } catch (error) {
        throw new Error(error.message);
      }
    },

    updateRemedy: async (_, { id, input }) => {
      try {
        return await prisma.remedy.update({
          where: { id },
          data: {
            ...(input.title && { title: input.title }),
            ...(input.description && {
              description: input.description,
            }),
            ...(input.isActive !== undefined && {
              isActive: input.isActive,
            }),
          },
        });
      } catch (error) {
        throw new Error(error.message);
      }
    },

    deleteRemedy: async (_, { id }) => {
      try {
        await prisma.remedy.delete({
          where: { id },
        });

        return true;
      } catch (error) {
        throw new Error(error.message);
      }
    },

    // appppppppppppppppppp
    addOrUpdateAppVersion: async (_, { data }, context) => {
      const { prisma } = context;

      try {
        const existing = await prisma.appVersion.findFirst({
          where: {
            platform: data.platform,
            appType: data.appType,
          },
        });

        let version;

        if (existing) {
          version = await prisma.appVersion.update({
            where: {
              id: existing.id,
            },
            data: {
              appType: data.appType,
              platform: data.platform,

              latestVersion: data.latestVersion,
              minimumVersion: data.minimumVersion,

              forceUpdate: data.forceUpdate,

              maintenanceMode: data.maintenanceMode,
              maintenanceMessage: data.maintenanceMessage,

              playStoreUrl: data.playStoreUrl,
              appStoreUrl: data.appStoreUrl,

              releaseNotes: data.releaseNotes,
            },
          });
        } else {
          version = await prisma.appVersion.create({
            data,
          });
        }

        return {
          success: true,
          message: "Version updated successfully",
          data: version,
        };
      } catch (error) {
        throw new Error(error.message);
      }
    },

    createFreeService: async (_, args) => {
      return await prisma.freeService.create({
        data: args,
      });
    },

    deleteFreeService: async (_, { id }) => {
      await prisma.freeService.delete({
        where: { id },
      });

      return true;
    },

    createOffer: async (_, { data }) => {
      try {
        const { offerName, price, description } = data;

        const offer = await prisma.offer.create({
          data: {
            offerName,
            price,
            description,
          },
        });

        return {
          success: true,
          message: "Offer created successfully",
          data: {
            ...offer,
            createdAt: offer.createdAt.toISOString(),
            updatedAt: offer.updatedAt.toISOString(),
          },
        };
      } catch (error) {
        throw new Error(error.message || "Failed to create offer");
      }
    },
    deleteOffer: async (_, { id }) => {
      try {
        const existingOffer = await prisma.offer.findUnique({
          where: {
            id,
          },
        });

        if (!existingOffer) {
          throw new Error("Offer not found");
        }

        await prisma.offer.delete({
          where: {
            id,
          },
        });

        return {
          success: true,
          message: "Offer deleted successfully",
        };
      } catch (error) {
        throw new Error(error.message || "Failed to delete offer");
      }
    },
    updateOffer: async (_, { id, data }) => {
      try {
        const existingOffer = await prisma.offer.findUnique({
          where: {
            id,
          },
        });

        if (!existingOffer) {
          throw new Error("Offer not found");
        }

        const updatedOffer = await prisma.offer.update({
          where: {
            id,
          },

          data: {
            ...(data.offerName !== undefined && {
              offerName: data.offerName,
            }),

            ...(data.price !== undefined && {
              price: data.price,
            }),

            ...(data.description !== undefined && {
              description: data.description,
            }),

            ...(data.isActive !== undefined && {
              isActive: data.isActive,
            }),
          },
        });

        return {
          success: true,

          message: "Offer updated successfully",

          data: {
            ...updatedOffer,

            createdAt: updatedOffer.createdAt.toISOString(),

            updatedAt: updatedOffer.updatedAt.toISOString(),
          },
        };
      } catch (error) {
        throw new Error(error.message || "Failed to update offer");
      }
    },
    deleteOffer: async (_, { id }) => {
      try {
        const existingOffer = await prisma.offer.findUnique({
          where: {
            id,
          },
        });

        if (!existingOffer) {
          throw new Error("Offer not found");
        }

        await prisma.offer.delete({
          where: {
            id,
          },
        });

        return {
          success: true,
          message: "Offer deleted successfully",
        };
      } catch (error) {
        throw new Error(error.message || "Failed to delete offer");
      }
    },

    createNotice: async (_, { input }) => {
      const { astrologers, ...noticeData } = input;

      return await prisma.notice.create({
        data: {
          ...noticeData,

          astrologers: {
            create:
              astrologers?.map((id) => ({
                astrologerId: id,
              })) || [],
          },
        },

        include: {
          astrologers: true,
        },
      });
    },
    updateNotice: async (_, { id, input }, { prisma }) => {
      const { astrologers, ...data } = input;

      await prisma.notice.update({
        where: { id },
        data,
      });

      if (astrologers) {
        await prisma.noticeAstrologer.deleteMany({
          where: {
            noticeId: id,
          },
        });

        await prisma.noticeAstrologer.createMany({
          data: astrologers.map((astrologerId) => ({
            noticeId: id,
            astrologerId,
          })),
        });
      }

      return prisma.notice.findUnique({
        where: { id },
      });
    },
    deleteNotice: async (_, { id }, { prisma }) => {
      await prisma.notice.delete({
        where: { id },
      });

      return true;
    },

    createBlog: async (_, { input }) => {
      const blog = await prisma.blog.create({
        data: {
          title: input.title,
          slug: input.slug,

          language: input.language,

          shortDescription: input.shortDescription,

          content: input.content,

          featuredImage: input.featuredImage,

          publishDate: input.publishDate ? new Date(input.publishDate) : null,

          status: input.status,

          hashtags: input.hashtags,

          metaTitle: input.metaTitle,

          metaDescription: input.metaDescription,

          metaKeywords: input.metaKeywords,

          schemaMarkup: input.schemaMarkup,

          categories: {
            create: input.categoryIds.map((categoryId) => ({
              category: {
                connect: {
                  id: categoryId,
                },
              },
            })),
          },
        },

        include: {
          categories: {
            include: {
              category: true,
            },
          },
        },
      });

      return blog;
    },

    updateBlog: async (_, { id, input }) => {
      await prisma.blogCategoryMapping.deleteMany({
        where: {
          blogId: id,
        },
      });

      return prisma.blog.update({
        where: {
          id,
        },

        data: {
          title: input.title,
          slug: input.slug,

          language: input.language,

          shortDescription: input.shortDescription,

          content: input.content,

          featuredImage: input.featuredImage,

          publishDate: input.publishDate ? new Date(input.publishDate) : null,

          status: input.status,

          hashtags: input.hashtags,

          metaTitle: input.metaTitle,

          metaDescription: input.metaDescription,

          metaKeywords: input.metaKeywords,

          schemaMarkup: input.schemaMarkup,

          categories: {
            create: input.categoryIds.map((categoryId) => ({
              blogCategoryId: categoryId,
            })),
          },
        },
      });
    },

    createBlogCategory: async (_, { input }) => {
      return prisma.blogCategory.create({
        data: {
          name: input.name,
          slug: input.slug,
        },
      });
    },
    updateBlogCategory: async (_, { id, input }) => {
      return prisma.blogCategory.update({
        where: {
          id,
        },

        data: {
          name: input.name,
          slug: input.slug,
        },
      });
    },
    deleteBlogCategory: async (_, { id }) => {
      const usageCount = await prisma.blogCategoryMapping.count({
        where: {
          blogCategoryId: id,
        },
      });

      if (usageCount > 0) {
        throw new Error(
          `Category is used in ${usageCount} blog(s). Remove it from blogs first.`,
        );
      }

      await prisma.blogCategory.delete({
        where: {
          id,
        },
      });

      return true;
    },
    deleteBlog: async (_, { id }) => {
      await prisma.blogCategoryMapping.deleteMany({
        where: {
          blogId: id,
        },
      });

      await prisma.blog.delete({
        where: {
          id,
        },
      });

      return true;
    },

    toggleReviewFlag: async (_, { reviewId, isFlagged }, { prisma }) => {
      await prisma.review.update({
        where: {
          id: reviewId,
        },
        data: {
          isFlagged,
        },
      });

      return {
        success: true,
        message: "Review flag updated successfully",
      };
    },
    deleteAppVersion: async (_, { id }, { prisma }) => {
      await prisma.appVersion.delete({
        where: { id },
      });

      return true;
    },

    updateReviewComment: async (
      _,
      { reviewId, comment, rating },
      { prisma },
    ) => {
      const review = await prisma.review.update({
        where: {
          id: reviewId,
        },
        data: {
          ...(comment !== undefined && { comment }),
          ...(rating !== undefined && { rating }),
        },
        include: {
          user: true,
          astrologer: true,
          session: true,
        },
      });

      return {
        reviewId: review.id,

        sessionId: review.session?.id || null,

        userId: review.user?.id || null,
        userName: review.userName || review.user?.name || "",
        mobile: review.user?.mobile || "",

        astrologerId: review.astrologer?.id || null,
        astrologerName: review.astrologer?.name || "",
        displayName: review.astrologer?.displayName || "",

        sessionType: review.session?.type || "",
        sessionStatus: review.session?.status || "",

        isFlagged: review.isFlagged,
        rating: review.rating,

        comment: review.comment,

        createdAt: review.createdAt,
      };
    },
    updateGiftStatus: async (_, { id, status }, { prisma }) => {
      if (!["active", "inactive"].includes(status)) {
        throw new Error("Invalid status");
      }

      return await prisma.gift.update({
        where: { id },
        data: { status },
      });
    },
    saveServiceAstrologers: async (
      _,
      { serviceId, astrologers },
      { prisma },
    ) => {
      await prisma.serviceAstrologer.deleteMany({
        where: { serviceId },
      });

      await prisma.serviceAstrologer.createMany({
        data: astrologers.map((a) => ({
          serviceId,
          astrologerId: a.astrologerId,
          price: Number(a.price),
        })),
      });

      return true;
    },
    updateUserStatus: async (_, { userId, isActive }, { prisma }) => {
      return prisma.user.update({
        where: {
          id: userId,
        },
        data: {
          isActive,
        },
      });
    },

    manageAstrologerWallet: async (
      _,
      { astrologerId, amount, remarks, type },
    ) => {
      const amt = Number(amount);

      if (isNaN(amt) || amt <= 0) {
        throw new Error("Invalid amount");
      }
      let wallet = await prisma.astrologerWallet.findUnique({
        where: {
          astrologerId,
        },
      });

      if (!wallet) {
        wallet = await prisma.astrologerWallet.create({
          data: {
            astrologerId,
            balanceCoins: 0,
          },
        });
      }

      const updatedBalance =
        type === "CREDIT"
          ? wallet.balanceCoins + amt
          : wallet.balanceCoins - amt;

      await prisma.$transaction(async (tx) => {
        await tx.astrologerWallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            balanceCoins: updatedBalance,
          },
        });

        await tx.walletTransaction.create({
          data: {
            astrologerWalletId: wallet.id,
            type,
            coins: Math.round(amt),
            amount: amt,
            description: remarks,
            updatedBalance: updatedBalance,
          },
        });
      });

      return {
        success: true,
        message:
          type === "CREDIT"
            ? "Wallet credited successfully"
            : "Wallet debited successfully",
        walletBalance: updatedBalance,
      };
    },
    manageUserWallet: async (_, { userId, amount, remarks, type }) => {
      const amt = Number(amount);

      if (isNaN(amt) || amt <= 0) {
        throw new Error("Invalid amount");
      }

      let wallet = await prisma.userWallet.findUnique({
        where: {
          userId,
        },
      });

      if (!wallet) {
        wallet = await prisma.userWallet.create({
          data: {
            userId,
            balanceCoins: 0,
            lockedCoins: 0,
          },
        });
      }

      const updatedBalance =
        type === "CREDIT"
          ? wallet.balanceCoins + amt
          : wallet.balanceCoins - amt;

      await prisma.$transaction(async (tx) => {
        await tx.userWallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            balanceCoins: updatedBalance,
          },
        });

        await tx.walletTransaction.create({
          data: {
            userWalletId: wallet.id,
            type,
            coins: Math.round(amt),
            amount: amt,
            description: remarks,
            updatedBalance: updatedBalance,
          },
        });
      });

      return {
        success: true,
        message:
          type === "CREDIT"
            ? "Wallet credited successfully"
            : "Wallet debited successfully",
        walletBalance: updatedBalance,
      };
    },
    endSessionByAdmin: async (_, { sessionId }) => {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        throw new Error("Session not found");
      }

      const durationSec = session.startedAt
        ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
        : session.durationSec;

      await prisma.$transaction([
        prisma.session.update({
          where: { id: sessionId },
          data: {
            status: "CANCELLED",
            by: "Rejected by Admin",
            endedAt: new Date(),
            durationSec,
          },
        }),

        prisma.astrologer.update({
          where: {
            id: session.astrologerId,
          },
          data: {
            isBusy: false,
          },
        }),
      ]);

      return "Session ended successfully";
    },
    createSkill: async (_, { input }) => {
      return prisma.skill.create({
        data: {
          ...input,
          slug: input.slug || input.name.toLowerCase().replace(/\s+/g, "-"),
        },
      });
    },
    updateSkill: async (_, { id, input }) => {
      return prisma.skill.update({
        where: { id },

        data: input,
      });
    },
    deleteSkill: async (_, { id }) => {
      await prisma.skill.delete({
        where: { id },
      });

      return true;
    },
    updateSkillStatus: async (_, { id, status }) => {
      return prisma.skill.update({
        where: { id },

        data: {
          isActive: status,
        },
      });
    },
    createProblem: async (_, { input }) => {
      return prisma.problem.create({
        data: {
          ...input,
          slug: input.slug || input.name.toLowerCase().replace(/\s+/g, "-"),
        },
      });
    },
    updateProblem: async (_, { id, input }) => {
      return prisma.problem.update({
        where: { id },

        data: input,
      });
    },
    deleteProblem: async (_, { id }) => {
      await prisma.problem.delete({
        where: { id },
      });

      return true;
    },
    updateProblemStatus: async (_, { id, status }) => {
      return prisma.problem.update({
        where: { id },

        data: {
          isActive: status,
        },
      });
    },
  },

  Blog: {
    categories: (parent) => {
      return parent.categories.map((mapping) => mapping.category);
    },
  },
};
