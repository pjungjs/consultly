import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateSlots } from './slots.js';

export const SLOT_WINDOW_DAYS = 60; // How far ahead clients can book

// What anyone may see about a consultant: never the sign-in email.
const PUBLIC_FIELDS = {
  id: true,
  name: true,
  headline: true,
  category: true,
  bio: true,
  rateCents: true,
  slotMinutes: true,
  timezone: true,
  paused: true,
} as const;

@Injectable()
export class ConsultantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The public catalogue: only profiles that are taking bookings (not paused, and with weekly hours set). Demo copies are private. */
  list() {
    return this.prisma.consultant.findMany({
      where: { paused: false, demoOwner: null, availability: { some: {} } },
      orderBy: { name: 'asc' },
      select: PUBLIC_FIELDS,
    });
  }

  /** One public profile. A demo copy opens by its link (only its visitor has it) and says it's a demo copy. */
  async profile(id: string) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { id },
      select: { ...PUBLIC_FIELDS, demoOwner: true },
    });
    if (!consultant) throw new NotFoundException('Consultant not found');
    const { demoOwner, ...rest } = consultant;
    return { ...rest, demo: demoOwner !== null };
  }

  /** The full record, for the API's own checks (includes the email). */
  async get(id: string) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { id },
    });
    if (!consultant) throw new NotFoundException('Consultant not found');
    return consultant;
  }

  async slots(id: string) {
    const consultant = await this.prisma.consultant.findUnique({
      where: { id },
      include: { availability: true },
    });
    if (!consultant) throw new NotFoundException('Consultant not found');

    const now = new Date();
    const bookings = await this.prisma.booking.findMany({
      where: {
        consultantId: id,
        endsAt: { gt: now },
        OR: [
          { status: 'CONFIRMED' },
          { status: 'PENDING', holdExpiresAt: { gt: now } },
        ],
      },
      select: { startsAt: true, endsAt: true },
    });
    // Time off blocks slots exactly like a booking does.
    const timeOff = await this.prisma.timeOff.findMany({
      where: { consultantId: id, endsAt: { gt: now } },
      select: { startsAt: true, endsAt: true },
    });

    return {
      timezone: consultant.timezone,
      slotMinutes: consultant.slotMinutes,
      // A paused profile can still be viewed but offers no times, so nothing new can be booked.
      slots: consultant.paused
        ? []
        : generateSlots({
            timezone: consultant.timezone,
            slotMinutes: consultant.slotMinutes,
            availability: consultant.availability,
            bookings: [...bookings, ...timeOff],
            now,
            days: SLOT_WINDOW_DAYS,
          }),
    };
  }
}
