import { hashToken } from './tokens.js';

// "Try the demo": each visitor gets a private pair of accounts, a client and their own copy of the demo
// consultant, so nothing one visitor does shows up for another. Both use a fake domain that can't receive email.

export type DemoRole = 'client' | 'consultant';

export const isDemoLoginEnabled = () => process.env.DEMO_LOGIN === 'true';

/** The cookie that brings a visitor back to the same demo pair after signing out. */
export const DEMO_COOKIE = 'consultly_demo';

/** The visitor's id: derived from the secret in their cookie, so the cookie can't be forged from an email. */
export const demoIdFor = (token: string) => hashToken(token).slice(0, 12);

export const demoAccounts = (id: string): Record<DemoRole, string> => ({
  client: `demo-${id}@consultly.test`,
  consultant: `jason-${id}@consultly.test`,
});

const DEMO_EMAIL = /^(?:demo|jason)-([a-f0-9]{12})@consultly\.test$/;

/** The demo visitor behind this email, or null for a real account. */
export const demoIdOf = (email: string | null | undefined) =>
  email?.toLowerCase().match(DEMO_EMAIL)?.[1] ?? null;

export const demoRoleOf = (email: string): DemoRole =>
  email.toLowerCase().startsWith('demo-') ? 'client' : 'consultant';

/** The demo consultant's defaults: each visitor's copy starts (and resets) to these. Also seeds the public Jason. */
export const DEMO_CONSULTANT = {
  name: 'Jason Jefferson',
  headline: 'Staff software engineer',
  category: 'Tech',
  bio: 'Staff engineer with 12 years building payment and scheduling platforms. Bring your architecture, code review or system-design question; leave with a concrete plan.',
  rateCents: 20000,
  slotMinutes: 60,
  timezone: 'Europe/London',
  availability: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startTime: '10:00',
    endTime: '16:00',
  })),
};
