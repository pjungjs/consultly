
-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_email_key" ON "Consultant"("email");

