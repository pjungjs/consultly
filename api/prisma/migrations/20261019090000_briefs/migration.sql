-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" JSONB,
    "model" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brief_orderId_key" ON "Brief"("orderId");

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

