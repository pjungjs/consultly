# Consultly API (NestJS)

All business rules for Consultly: consultants and availability, holds and orders, Stripe Checkout and refunds, email sign-in, profiles, PDF briefs and the Help chat endpoint. Runs on port 4000.

See the [project README](../README.md) for setup. Common commands:

```bash
npm run start:dev                       # watch mode
npm test                                # unit tests (vitest)
npx prisma migrate deploy               # apply migrations
npx prisma db seed                      # 10 demo consultants (idempotent)
npm run seed:briefs                     # attach the sample PDF briefs
```

Code map: `src/orders` (holds, Checkout, refunds), `src/consultants` (slot generation), `src/auth` (sign-in, profiles, availability), `src/briefs`, `src/support`, `src/stripe`, `src/email`; schema and migrations in `prisma/`.
