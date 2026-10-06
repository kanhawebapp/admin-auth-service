/*
  Warnings:

  - The values [PERCENTAGE,FLAT] on the enum `CouponType` will be removed. If these variants are still used in the database, this will fail.
  - The values [PUBLIC,PRIVATE] on the enum `CouponVisibility` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `profileImage` on the `KycDetail` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Service` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[invoiceNo]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `originalAmount` to the `PaymentOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Review` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BannerType" AS ENUM ('DESKTOP', 'MOBILE');

-- CreateEnum
CREATE TYPE "FraudStatus" AS ENUM ('PENDING', 'FRAUD', 'FINE');

-- CreateEnum
CREATE TYPE "CmsStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('ANDROID', 'IOS');

-- CreateEnum
CREATE TYPE "AppType" AS ENUM ('USER', 'ASTROLOGER');

-- CreateEnum
CREATE TYPE "NoticeTargetType" AS ENUM ('ALL', 'SELECTED');

-- CreateEnum
CREATE TYPE "BlogStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "LiveStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "CouponType_new" AS ENUM ('CASHBACK', 'DISCOUNT');
ALTER TABLE "Coupon" ALTER COLUMN "type" TYPE "CouponType_new" USING ("type"::text::"CouponType_new");
ALTER TYPE "CouponType" RENAME TO "CouponType_old";
ALTER TYPE "CouponType_new" RENAME TO "CouponType";
DROP TYPE "CouponType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CouponVisibility_new" AS ENUM ('VISIBLE', 'HIDDEN');
ALTER TABLE "Coupon" ALTER COLUMN "visibility" TYPE "CouponVisibility_new" USING ("visibility"::text::"CouponVisibility_new");
ALTER TYPE "CouponVisibility" RENAME TO "CouponVisibility_old";
ALTER TYPE "CouponVisibility_new" RENAME TO "CouponVisibility";
DROP TYPE "CouponVisibility_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PricingType" ADD VALUE 'GIFT_COMMISSION';
ALTER TYPE "PricingType" ADD VALUE 'OFFER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'REFUND';
ALTER TYPE "TransactionType" ADD VALUE 'CASHBACK';
ALTER TYPE "TransactionType" ADD VALUE 'DISCOUNT';

-- DropForeignKey
ALTER TABLE "Address" DROP CONSTRAINT "Address_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "AstrologerDocument" DROP CONSTRAINT "AstrologerDocument_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "AstrologerPricing" DROP CONSTRAINT "AstrologerPricing_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "AstrologerRejectionHistory" DROP CONSTRAINT "AstrologerRejectionHistory_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "AstrologerWallet" DROP CONSTRAINT "AstrologerWallet_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "ExperiencePlatform" DROP CONSTRAINT "ExperiencePlatform_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "Intake" DROP CONSTRAINT "Intake_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "Interview" DROP CONSTRAINT "Interview_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "KycDetail" DROP CONSTRAINT "KycDetail_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_astrologerId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_astrologerId_fkey";

-- DropIndex
DROP INDEX "Payment_razorpayOrderId_idx";

-- DropIndex
DROP INDEX "Payment_status_idx";

-- DropIndex
DROP INDEX "Payment_userId_idx";

-- DropIndex
DROP INDEX "PaymentOrder_razorpayOrderId_idx";

-- DropIndex
DROP INDEX "PaymentOrder_status_idx";

-- DropIndex
DROP INDEX "PaymentOrder_userId_idx";

-- AlterTable
ALTER TABLE "Astrologer" ADD COLUMN     "isBusy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isCallActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isChatActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEligibleAudio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEligibleCall" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEligibleChat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isEligibleVideo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLiveActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPromotional" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "profilePic" DROP NOT NULL,
ALTER COLUMN "dateOfBirth" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AstrologerPricing" ALTER COLUMN "price" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AstrologerWallet" ADD COLUMN     "lastPaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pendingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "bannerType" "BannerType" NOT NULL DEFAULT 'DESKTOP';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "image" TEXT;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "applicable" TEXT,
ADD COLUMN     "couponCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Intake" ADD COLUMN     "appliedOffer" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "pricePerMin" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "KycDetail" DROP COLUMN "profileImage",
ADD COLUMN     "documentRemarks" TEXT,
ALTER COLUMN "astrologerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "time" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cgst" DOUBLE PRECISION,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "gstRate" DOUBLE PRECISION,
ADD COLUMN     "igst" DOUBLE PRECISION,
ADD COLUMN     "invoiceNo" TEXT,
ADD COLUMN     "pgCharge" DOUBLE PRECISION,
ADD COLUMN     "pgChargeRate" DOUBLE PRECISION,
ADD COLUMN     "pgIgst" DOUBLE PRECISION,
ADD COLUMN     "pgTotal" DOUBLE PRECISION,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "receivableAmount" DOUBLE PRECISION,
ADD COLUMN     "sgst" DOUBLE PRECISION,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "taxableAmount" DOUBLE PRECISION,
ADD COLUMN     "totalAmount" DOUBLE PRECISION,
ADD COLUMN     "totalTax" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "PaymentOrder" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "originalAmount" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "PricingConfig" ADD COLUMN     "globalCallPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "globalChatPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isGlobalOfferEnabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "isFirstOfferEnabled" SET DEFAULT false;

-- AlterTable
ALTER TABLE "RechargePack" ADD COLUMN     "hideAfterFirstRecharge" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reply" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "type";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "by" TEXT,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "source" TEXT,
ALTER COLUMN "coinsDeducted" SET DEFAULT 0,
ALTER COLUMN "coinsDeducted" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "coinsEarned" SET DEFAULT 0,
ALTER COLUMN "coinsEarned" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "commission" SET DEFAULT 0,
ALTER COLUMN "commission" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "profileImage" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "UserOfferUsage" ADD COLUMN     "firstOfferUsedAt" TIMESTAMP(3),
ADD COLUMN     "secondOfferUsedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "updatedBalance" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ServiceAstrologer" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceAstrologer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudFlag" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "sessionId" TEXT,
    "senderId" TEXT,
    "senderName" TEXT,
    "receiverId" TEXT,
    "receiverName" TEXT,
    "message" TEXT NOT NULL,
    "matchedKeywords" TEXT[],
    "status" "FraudStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AboutPage" (
    "id" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'about-us',
    "heroTitle" TEXT,
    "heroDescription" TEXT,
    "mentors" JSONB,
    "founders" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[],
    "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AboutPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyPage" (
    "id" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'privacy-policy',
    "title" TEXT,
    "content" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[],
    "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundPolicyPage" (
    "id" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'refund-policy',
    "title" TEXT,
    "content" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[],
    "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundPolicyPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclaimerPage" (
    "id" TEXT NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'disclaimer',
    "title" TEXT,
    "content" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "keywords" TEXT[],
    "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisclaimerPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remedy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Remedy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL,
    "appType" "AppType" NOT NULL,
    "platform" "PlatformType" NOT NULL,
    "latestVersion" TEXT NOT NULL,
    "minimumVersion" TEXT NOT NULL,
    "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "playStoreUrl" TEXT,
    "appStoreUrl" TEXT,
    "releaseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreeService" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "offerName" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionRemedy" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "remedyText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionRemedy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AstrologerOffer" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AstrologerOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "giftName" TEXT NOT NULL,
    "giftPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AstrologerFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AstrologerFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "astrologerId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "dob" TEXT NOT NULL,
    "tob" TEXT NOT NULL,
    "pob" TEXT NOT NULL,
    "gender" TEXT,
    "concern" TEXT,
    "amount" DOUBLE PRECISION,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "bookingStatus" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "razorpayOrderId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "walletAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableAmount" DOUBLE PRECISION NOT NULL,
    "couponId" TEXT,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetType" "NoticeTargetType" NOT NULL DEFAULT 'ALL',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeAstrologer" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,

    CONSTRAINT "NoticeAstrologer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blog" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "featuredImage" TEXT,
    "publishDate" TIMESTAMP(3),
    "status" "BlogStatus" NOT NULL DEFAULT 'DRAFT',
    "hashtags" TEXT[],
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "schemaMarkup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Blog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogCategoryMapping" (
    "blogId" TEXT NOT NULL,
    "blogCategoryId" TEXT NOT NULL,

    CONSTRAINT "BlogCategoryMapping_pkey" PRIMARY KEY ("blogId","blogCategoryId")
);

-- CreateTable
CREATE TABLE "LiveStream" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "chatRoomId" TEXT,
    "status" "LiveStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LiveStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallRecording" (
    "id" TEXT NOT NULL,
    "roomId" VARCHAR(255) NOT NULL,
    "sessionId" VARCHAR(255),
    "userId" VARCHAR(255) NOT NULL,
    "astrologerId" VARCHAR(255) NOT NULL,
    "astrologerName" VARCHAR(255),
    "fileName" VARCHAR(500) NOT NULL,
    "fileUrl" VARCHAR(1000) NOT NULL,
    "filePath" TEXT,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "callType" TEXT NOT NULL DEFAULT 'audio',
    "timestamp" VARCHAR(100) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isAdminOnly" BOOLEAN NOT NULL DEFAULT true,
    "uploadedBy" VARCHAR(255),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "CallRecording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentOrderId" TEXT,
    "servicePaymentOrderId" TEXT,
    "discount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AstrologerPayout" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "remark" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "totalRevenue" DOUBLE PRECISION NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "earning" DOUBLE PRECISION NOT NULL,
    "pgChargeRate" DOUBLE PRECISION NOT NULL,
    "pgCharge" DOUBLE PRECISION NOT NULL,
    "gstRate" DOUBLE PRECISION NOT NULL,
    "igst" DOUBLE PRECISION,
    "cgst" DOUBLE PRECISION,
    "sgst" DOUBLE PRECISION,
    "pgTotal" DOUBLE PRECISION NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "tdsPercent" DOUBLE PRECISION NOT NULL,
    "tdsAmount" DOUBLE PRECISION NOT NULL,
    "lastPaidAmount" DOUBLE PRECISION,
    "payableAmount" DOUBLE PRECISION NOT NULL,
    "transactionRef" TEXT,
    "paymentDate" TIMESTAMP(3),
    "status" "WithdrawalStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AstrologerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AstrologerTax" (
    "id" TEXT NOT NULL,
    "astrologerId" TEXT NOT NULL,
    "gstNumber" TEXT,
    "state" TEXT NOT NULL,
    "panNumber" TEXT NOT NULL,
    "tdsPercent" DOUBLE PRECISION NOT NULL,
    "gstPercent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AstrologerTax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AstrologerPayoutSession" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "AstrologerPayoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "userMobile" TEXT,
    "astrologerId" TEXT NOT NULL,
    "astrologerName" TEXT,
    "transactionId" TEXT,
    "orderId" TEXT,
    "sessionDuration" INTEGER NOT NULL,
    "ratePerMin" INTEGER NOT NULL,
    "refundDuration" INTEGER NOT NULL,
    "refundAmount" DOUBLE PRECISION NOT NULL,
    "refundType" TEXT,
    "mode" TEXT,
    "refundReason" TEXT NOT NULL,
    "requestedByStaffId" TEXT NOT NULL,
    "requestedByStaffName" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByStaffId" TEXT,
    "approvedByStaffName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByStaffId" TEXT,
    "rejectedByStaffName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAstrologer_serviceId_astrologerId_key" ON "ServiceAstrologer"("serviceId", "astrologerId");

-- CreateIndex
CREATE UNIQUE INDEX "FraudFlag_keyword_key" ON "FraudFlag"("keyword");

-- CreateIndex
CREATE INDEX "FraudFlag_keyword_idx" ON "FraudFlag"("keyword");

-- CreateIndex
CREATE INDEX "FraudLog_sessionId_idx" ON "FraudLog"("sessionId");

-- CreateIndex
CREATE INDEX "FraudLog_senderId_idx" ON "FraudLog"("senderId");

-- CreateIndex
CREATE INDEX "FraudLog_receiverId_idx" ON "FraudLog"("receiverId");

-- CreateIndex
CREATE INDEX "FraudLog_status_idx" ON "FraudLog"("status");

-- CreateIndex
CREATE INDEX "FraudLog_createdAt_idx" ON "FraudLog"("createdAt");

-- CreateIndex
CREATE INDEX "AboutPage_status_idx" ON "AboutPage"("status");

-- CreateIndex
CREATE INDEX "AboutPage_createdAt_idx" ON "AboutPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AboutPage_pageType_key" ON "AboutPage"("pageType");

-- CreateIndex
CREATE INDEX "PrivacyPage_status_idx" ON "PrivacyPage"("status");

-- CreateIndex
CREATE INDEX "PrivacyPage_createdAt_idx" ON "PrivacyPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacyPage_pageType_key" ON "PrivacyPage"("pageType");

-- CreateIndex
CREATE INDEX "RefundPolicyPage_status_idx" ON "RefundPolicyPage"("status");

-- CreateIndex
CREATE INDEX "RefundPolicyPage_createdAt_idx" ON "RefundPolicyPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefundPolicyPage_pageType_key" ON "RefundPolicyPage"("pageType");

-- CreateIndex
CREATE INDEX "DisclaimerPage_status_idx" ON "DisclaimerPage"("status");

-- CreateIndex
CREATE INDEX "DisclaimerPage_createdAt_idx" ON "DisclaimerPage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisclaimerPage_pageType_key" ON "DisclaimerPage"("pageType");

-- CreateIndex
CREATE INDEX "Remedy_createdAt_idx" ON "Remedy"("createdAt");

-- CreateIndex
CREATE INDEX "Remedy_isActive_idx" ON "Remedy"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FreeService_slug_key" ON "FreeService"("slug");

-- CreateIndex
CREATE INDEX "SessionRemedy_sessionId_idx" ON "SessionRemedy"("sessionId");

-- CreateIndex
CREATE INDEX "SessionRemedy_createdAt_idx" ON "SessionRemedy"("createdAt");

-- CreateIndex
CREATE INDEX "AstrologerOffer_astrologerId_idx" ON "AstrologerOffer"("astrologerId");

-- CreateIndex
CREATE INDEX "AstrologerOffer_offerId_idx" ON "AstrologerOffer"("offerId");

-- CreateIndex
CREATE INDEX "AstrologerOffer_isActive_idx" ON "AstrologerOffer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AstrologerOffer_astrologerId_offerId_key" ON "AstrologerOffer"("astrologerId", "offerId");

-- CreateIndex
CREATE INDEX "GiftHistory_userId_idx" ON "GiftHistory"("userId");

-- CreateIndex
CREATE INDEX "GiftHistory_astrologerId_idx" ON "GiftHistory"("astrologerId");

-- CreateIndex
CREATE INDEX "GiftHistory_giftId_idx" ON "GiftHistory"("giftId");

-- CreateIndex
CREATE INDEX "AstrologerFollow_userId_idx" ON "AstrologerFollow"("userId");

-- CreateIndex
CREATE INDEX "AstrologerFollow_astrologerId_idx" ON "AstrologerFollow"("astrologerId");

-- CreateIndex
CREATE UNIQUE INDEX "AstrologerFollow_userId_astrologerId_key" ON "AstrologerFollow"("userId", "astrologerId");

-- CreateIndex
CREATE INDEX "ServiceBooking_userId_idx" ON "ServiceBooking"("userId");

-- CreateIndex
CREATE INDEX "ServiceBooking_serviceId_idx" ON "ServiceBooking"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceBooking_astrologerId_idx" ON "ServiceBooking"("astrologerId");

-- CreateIndex
CREATE INDEX "ServiceBooking_paymentStatus_idx" ON "ServiceBooking"("paymentStatus");

-- CreateIndex
CREATE INDEX "ServiceBooking_bookingStatus_idx" ON "ServiceBooking"("bookingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePaymentOrder_razorpayOrderId_key" ON "ServicePaymentOrder"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "ServicePaymentOrder_userId_idx" ON "ServicePaymentOrder"("userId");

-- CreateIndex
CREATE INDEX "ServicePaymentOrder_bookingId_idx" ON "ServicePaymentOrder"("bookingId");

-- CreateIndex
CREATE INDEX "ServicePaymentOrder_razorpayOrderId_idx" ON "ServicePaymentOrder"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "ServicePaymentOrder_status_idx" ON "ServicePaymentOrder"("status");

-- CreateIndex
CREATE INDEX "ServicePaymentOrder_couponId_idx" ON "ServicePaymentOrder"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeAstrologer_noticeId_astrologerId_key" ON "NoticeAstrologer"("noticeId", "astrologerId");

-- CreateIndex
CREATE UNIQUE INDEX "Blog_slug_key" ON "Blog"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BlogCategory_slug_key" ON "BlogCategory"("slug");

-- CreateIndex
CREATE INDEX "CallRecording_roomId_idx" ON "CallRecording"("roomId");

-- CreateIndex
CREATE INDEX "CallRecording_userId_idx" ON "CallRecording"("userId");

-- CreateIndex
CREATE INDEX "CallRecording_astrologerId_idx" ON "CallRecording"("astrologerId");

-- CreateIndex
CREATE INDEX "CallRecording_sessionId_idx" ON "CallRecording"("sessionId");

-- CreateIndex
CREATE INDEX "CallRecording_createdAt_idx" ON "CallRecording"("createdAt");

-- CreateIndex
CREATE INDEX "CallRecording_status_idx" ON "CallRecording"("status");

-- CreateIndex
CREATE INDEX "CallRecording_isAdminOnly_idx" ON "CallRecording"("isAdminOnly");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_paymentOrderId_key" ON "CouponRedemption"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_servicePaymentOrderId_key" ON "CouponRedemption"("servicePaymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_slug_key" ON "Problem"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AstrologerTax_astrologerId_key" ON "AstrologerTax"("astrologerId");

-- CreateIndex
CREATE UNIQUE INDEX "AstrologerPayoutSession_payoutId_sessionId_key" ON "AstrologerPayoutSession"("payoutId", "sessionId");

-- CreateIndex
CREATE INDEX "RefundRequest_sessionId_idx" ON "RefundRequest"("sessionId");

-- CreateIndex
CREATE INDEX "RefundRequest_userId_idx" ON "RefundRequest"("userId");

-- CreateIndex
CREATE INDEX "RefundRequest_astrologerId_idx" ON "RefundRequest"("astrologerId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- CreateIndex
CREATE INDEX "RefundRequest_requestedByStaffId_idx" ON "RefundRequest"("requestedByStaffId");

-- CreateIndex
CREATE INDEX "RefundRequest_createdAt_idx" ON "RefundRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceNo_key" ON "Payment"("invoiceNo");

-- CreateIndex
CREATE INDEX "Review_rating_idx" ON "Review"("rating");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAstrologer" ADD CONSTRAINT "ServiceAstrologer_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAstrologer" ADD CONSTRAINT "ServiceAstrologer_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperiencePlatform" ADD CONSTRAINT "ExperiencePlatform_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerDocument" ADD CONSTRAINT "AstrologerDocument_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerRejectionHistory" ADD CONSTRAINT "AstrologerRejectionHistory_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerWallet" ADD CONSTRAINT "AstrologerWallet_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDetail" ADD CONSTRAINT "KycDetail_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerPricing" ADD CONSTRAINT "AstrologerPricing_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudLog" ADD CONSTRAINT "FraudLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionRemedy" ADD CONSTRAINT "SessionRemedy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerOffer" ADD CONSTRAINT "AstrologerOffer_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerOffer" ADD CONSTRAINT "AstrologerOffer_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftHistory" ADD CONSTRAINT "GiftHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftHistory" ADD CONSTRAINT "GiftHistory_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftHistory" ADD CONSTRAINT "GiftHistory_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "Gift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerFollow" ADD CONSTRAINT "AstrologerFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerFollow" ADD CONSTRAINT "AstrologerFollow_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePaymentOrder" ADD CONSTRAINT "ServicePaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePaymentOrder" ADD CONSTRAINT "ServicePaymentOrder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePaymentOrder" ADD CONSTRAINT "ServicePaymentOrder_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeAstrologer" ADD CONSTRAINT "NoticeAstrologer_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeAstrologer" ADD CONSTRAINT "NoticeAstrologer_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogCategoryMapping" ADD CONSTRAINT "BlogCategoryMapping_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogCategoryMapping" ADD CONSTRAINT "BlogCategoryMapping_blogCategoryId_fkey" FOREIGN KEY ("blogCategoryId") REFERENCES "BlogCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveStream" ADD CONSTRAINT "LiveStream_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallRecording" ADD CONSTRAINT "CallRecording_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_servicePaymentOrderId_fkey" FOREIGN KEY ("servicePaymentOrderId") REFERENCES "ServicePaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerPayout" ADD CONSTRAINT "AstrologerPayout_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerTax" ADD CONSTRAINT "AstrologerTax_astrologerId_fkey" FOREIGN KEY ("astrologerId") REFERENCES "Astrologer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerPayoutSession" ADD CONSTRAINT "AstrologerPayoutSession_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "AstrologerPayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AstrologerPayoutSession" ADD CONSTRAINT "AstrologerPayoutSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
