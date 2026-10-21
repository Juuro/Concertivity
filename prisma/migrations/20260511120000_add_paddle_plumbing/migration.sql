-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
  'CANCELED',
  'LIFETIME'
);

-- AlterTable
ALTER TABLE "user" ADD COLUMN "paddleCustomerId" TEXT;

-- CreateTable
CREATE TABLE "subscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL,
  "paddleSubscriptionId" TEXT,
  "paddlePriceId" TEXT,
  "planKey" TEXT,
  "currentPeriodEnd" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paddle_webhook_event" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "lastRetryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "paddle_webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_userId_key" ON "subscription" ("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_paddleSubscriptionId_key" ON "subscription" ("paddleSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_paddleSubscriptionId_idx" ON "subscription" ("paddleSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "paddle_webhook_event_eventId_key" ON "paddle_webhook_event" ("eventId");

-- CreateIndex
CREATE INDEX "paddle_webhook_event_createdAt_idx" ON "paddle_webhook_event" ("createdAt");

-- CreateIndex
CREATE INDEX "paddle_webhook_event_processedAt_idx" ON "paddle_webhook_event" ("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_paddleCustomerId_key" ON "user" ("paddleCustomerId");

-- AddForeignKey
ALTER TABLE "subscription"
ADD CONSTRAINT "subscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve admin audit rows when the acting user is deleted (Paddle erasure + account delete).
ALTER TABLE "admin_activity" DROP CONSTRAINT IF EXISTS "admin_activity_userId_fkey";
ALTER TABLE "admin_activity" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "admin_activity"
ADD CONSTRAINT "admin_activity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
