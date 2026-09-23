ALTER TABLE "Astrologer"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT,
ADD COLUMN "deletedByName" TEXT,
ADD COLUMN "deleteRemark" TEXT;