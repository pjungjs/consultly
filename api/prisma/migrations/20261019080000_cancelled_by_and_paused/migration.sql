-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelledBy" TEXT;

-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "paused" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Booking" SET "cancelledBy" = 'CONSULTANT' WHERE "refundId" IS NOT NULL; -- every refund so far came from a consultant
