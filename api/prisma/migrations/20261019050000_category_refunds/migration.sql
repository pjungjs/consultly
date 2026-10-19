-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "refundId" TEXT;

-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Strategy';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "stripePaymentId" TEXT;

