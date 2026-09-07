import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import path from "path";

import { PrismaClient } from "@prisma/client";
import typeDefs from "./graphql/typeDefs.js";
import { resolvers } from "./graphql/resolvers.js";
import rateLimiter from "./middleware/rateLimiter.js";
import { verifyAccessToken } from "./config/jwt.js";
import uploadRoutes from "./routes/upload.js";
import graphqlUploadExpress from "graphql-upload/graphqlUploadExpress.mjs";
import GraphQLUpload from "graphql-upload/GraphQLUpload.mjs";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function startServer() {
  const app = express();



  app.use(
  cors({
    origin: [
      "http://localhost:7002",
      "https://admin-panel-v2-hazel.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "apollo-require-preflight",
    ],
  })
);
  app.options("*", cors());
  app.use(express.json());
  app.use(cookieParser());
  app.use(rateLimiter);

  // ✅ static folder
  // app.use("/uploads", express.static("uploads"));

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

  // ✅ REST upload
  app.use("/api", uploadRoutes);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginLandingPageLocalDefault()],
  });

  await server.start();

  // 🔥 MUST be before /graphql
app.use(graphqlUploadExpress({ maxFileSize: 10000000, maxFiles: 5 }));
  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req, res }) => {
        let user = null;

        const authHeader = req.headers["authorization"];

        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.replace("Bearer ", "");

          try {
            const decoded = verifyAccessToken(token);

            if (decoded?.type === "staff") {
              user = await prisma.staff.findUnique({
                where: { id: decoded.id },
                include: { role: true },
              });
            }
          } catch (err) {
            user = null;
          }
        }

        return { req, res, user, prisma };
      },
    })
  );

  const PORT = process.env.PORT ||8005;
  app.listen(PORT, () => {
  });
}

startServer();