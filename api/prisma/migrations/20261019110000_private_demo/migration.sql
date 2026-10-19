-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "demoOwner" TEXT;

-- CreateIndex
CREATE INDEX "Consultant_demoOwner_idx" ON "Consultant"("demoOwner");
