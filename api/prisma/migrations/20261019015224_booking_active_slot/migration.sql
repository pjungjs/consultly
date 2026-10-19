-- At most one active (PENDING or CONFIRMED) booking per consultant + start time.
-- Partial index: Prisma's schema language can't express WHERE, so it lives here as raw SQL.
CREATE UNIQUE INDEX "Booking_active_slot_key"
  ON "Booking" ("consultantId", "startsAt")
  WHERE status IN ('PENDING', 'CONFIRMED');
