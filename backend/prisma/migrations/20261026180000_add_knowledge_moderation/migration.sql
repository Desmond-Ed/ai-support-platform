-- CreateEnum
CREATE TYPE "KnowledgeModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "knowledge_documents"
  ADD COLUMN "moderationStatus" "KnowledgeModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "moderationReason" TEXT,
  ADD COLUMN "moderatedById" TEXT,
  ADD COLUMN "moderatedAt" TIMESTAMPTZ,
  ADD COLUMN "moderationVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ingestionAttempt" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "knowledge_documents_moderationStatus_idx" ON "knowledge_documents"("moderationStatus");

-- CreateIndex
CREATE INDEX "knowledge_documents_moderatedById_idx" ON "knowledge_documents"("moderatedById");

-- AddForeignKey
ALTER TABLE "knowledge_documents"
  ADD CONSTRAINT "knowledge_documents_moderatedById_fkey"
  FOREIGN KEY ("moderatedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_resolvedAt_idx" ON "tickets"("resolvedAt");
