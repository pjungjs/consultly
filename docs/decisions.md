# Key decisions

The choices that shaped Consultly. How the pieces work is in [architecture.md](architecture.md).

Each decision has the same fields, so they can be compared at a glance:

- **Problem:** what had to be solved.
- **Decision:** what was picked.
- **Alternatives:** what else was considered, and why not.
- **Trade-off:** what the decision costs.
- **Revisit when:** the situation that would change the answer.
- **Code:** where to read it.

| Section | Decisions |
|---|---|
| [System shape](#system-shape) | 1. NestJS owns the data; FastAPI only does AI |
| [Scheduling and booking](#scheduling-and-booking) | 2. Build scheduling in-house · 3. Bookings in UTC, weekly hours in local time · 4. The database prevents double booking |
| [Payments](#payments) | 5. Stripe Checkout, confirmed only by the webhook · 6. An order holds many sessions; refunds are per session |
| [Accounts](#accounts) | 7. Passwordless sign-in with hashed links and sessions · 8. Forward `/api` through the website · 9. One email can be both client and consultant · 10. A private demo per visitor |
| [AI](#ai) | 11. Briefs: text from pypdf, a structured prep sheet from Claude · 12. The Help assistant reads bookings as the user · 13. Cap AI spending in three layers |
| [Quality](#quality) | 14. Test the risky logic, fake the outside services |

## System shape

### 1. NestJS owns the data; FastAPI only does AI

- **Problem:** the project had to use both TypeScript/NestJS and Python/FastAPI, and two services need one clear boundary.
- **Decision:** NestJS owns users, bookings, payments, webhooks and the database. FastAPI reads PDFs and calls Claude, stores nothing, and only answers the API, which proves itself with a shared service token.
- **Alternatives:** FastAPI as the core with NestJS in front (Nest becomes a thin proxy); splitting features across both with a shared database (two services writing the same tables, so neither owns the rules).
- **Trade-off:** an extra network hop, and a second service to deploy and wake up.
- **Revisit when:** the team is Python-first, or the AI work needs the database directly.
- **Code:** `api/src/ai-budget/ai-service.ts` (the API's calls out), `ai/src/ai/main.py` (the token check).

## Scheduling and booking

### 2. Build scheduling in-house

- **Problem:** clients need to see a consultant's open times and hold them while they pay.
- **Decision:** consultants set weekly hours and time off; the API turns them into open times, 60 days ahead.
- **Alternatives:** embedding Calendly or Cal.com. Their UI is polished, but they add paid webhooks and make holding a time during payment awkward.
- **Trade-off:** slot generation, time off and the calendar views were ours to write and test.
- **Revisit when:** consultants need two-way sync with Google or Outlook calendars.
- **Code:** `api/src/consultants/slots.ts`, `api/src/auth/availability.controller.ts`.

### 3. Bookings in UTC, weekly hours in local time

- **Problem:** "Mondays 9 to 5 in New York" is a wall-clock rule; a booking is an exact moment. Daylight saving moves the UTC offset twice a year.
- **Decision:**
  - Availability is stored as local `HH:mm` plus the consultant's IANA time zone.
  - Bookings are stored as UTC instants.
  - Luxon converts between the two, and browsers show every time in the visitor's own zone.
- **Alternatives:** date-fns-tz (its conversion functions are easy to mix up); hours stored in UTC only (open times drift by an hour at every daylight-saving change).
- **Trade-off:** a second date type in the API (Luxon's `DateTime` next to `Date`).
- **Revisit when:** the `Temporal` API is available in the runtime.
- **Code:** `api/src/consultants/slots.ts`, `web/app/consultants/[id]/slot-picker.tsx`.

### 4. The database prevents double booking

- **Problem:** two clients can ask for the same time at the same moment, and "check, then insert" leaves a gap between the two steps.
- **Decision:**
  - A partial unique index allows one `PENDING` or `CONFIRMED` booking per consultant and start time.
  - Expired holds are cleared in the same transaction as the insert.
  - A violation returns 409 "just taken".
- **Alternatives:** locking the consultant's rows (`SELECT … FOR UPDATE`). The rule is easier to read in one function, but every code path must remember to lock.
- **Trade-off:** the rule lives in a hand-written SQL migration, because Prisma can't put a `WHERE` on an index. It only compares equal start times.
- **Revisit when:** sessions have different lengths and can overlap. Then use a Postgres exclusion constraint on a time range.
- **Code:** `api/prisma/migrations/20261019015224_booking_active_slot/migration.sql`, `api/src/orders/orders.service.ts`.

## Payments

### 5. Stripe Checkout, confirmed only by the webhook

- **Problem:** take card payments without handling card details, and confirm a booking only once the money is really there.
- **Decision:**
  - Stripe's hosted Checkout page, with the order id in its metadata.
  - Only the signed `checkout.session.completed` webhook confirms the order, and only from `PENDING`. A repeated delivery changes nothing and sends no second email.
  - The hold lasts as long as the Checkout session: 31 minutes, because Stripe's minimum is 30.
- **Alternatives:** Stripe Elements, a card form inside the page (about twice the code, and more card-handling responsibility); a fake payment (nothing real to show).
- **Trade-off:** the client leaves the site to pay, and local testing needs `stripe listen` to forward webhooks.
- **Revisit when:** the brand needs the card form inside the page.
- **Code:** `api/src/stripe/stripe-webhook.controller.ts`, `markPaid` in `api/src/orders/orders.service.ts`.

### 6. An order holds many sessions; refunds are per session

- **Problem:** clients want to book a series with one consultant and pay once, but may need to cancel just one session.
- **Decision:**
  - An Order has one client, one consultant, one payment and up to 6 sessions; each session is a Booking.
  - All the bookings are created in one transaction, or none are.
  - Cancelling refunds one session's price, with a per-booking idempotency key so a retry can't refund twice.
  - Clients can cancel until 24 hours before a session; consultants any time.
- **Alternatives:** a cart across consultants (needs Stripe Connect to pay several people); one session per payment.
- **Trade-off:** two tables whose statuses must stay in step.
- **Revisit when:** consultants sell packages or subscriptions. Then use credits or Stripe Billing.
- **Code:** `api/src/orders/orders.service.ts`, `api/src/orders/create-order.dto.ts`.

## Accounts

### 7. Passwordless sign-in with hashed links and sessions

- **Problem:** clients and consultants need to sign in from any device, without the site storing passwords.
- **Decision:**
  - An emailed one-time link: a random token that lasts 15 minutes and works once.
  - Signing in creates a database session behind an httpOnly, SameSite=Lax cookie that lasts 7 days.
  - Only SHA-256 hashes of the token and the session id are stored.
- **Alternatives:**
  - Passwords: hashing, resets and lockouts to build.
  - A JWT in the link: it can't be made single-use.
  - A token in `localStorage`: any injected script can read it.
- **Trade-off:** signing in depends on email delivery, and the free sender only reaches the account owner. That's why the private demos exist (decision 10).
- **Revisit when:** you need 2FA, teams or social sign-in. Then use an identity provider (Auth.js, Clerk).
- **Code:** `api/src/auth/auth.service.ts`, `api/src/auth/tokens.ts`, `api/src/auth/session.ts`.

### 8. Forward `/api` through the website

- **Problem:** free hosting gives the website and the API unrelated addresses, so a cookie set by the API's address would be a third-party cookie on the website, which browsers block.
- **Decision:** the browser calls `/api/*` on the website, and Next.js forwards it to the API, so the sign-in cookie belongs to the website's address. Stripe's webhook goes straight to the API.
- **Alternatives:** a custom domain with the API on a subdomain (costs a domain); `SameSite=None` cookies (blocked by Safari, and by more browsers over time).
- **Trade-off:** one more hop on every API call.
- **Revisit when:** both run under one domain you own.
- **Code:** `web/next.config.ts`.

### 9. One email can be both client and consultant

- **Problem:** a consultant may also book other consultants, and anyone should be able to start offering sessions.
- **Decision:**
  - The signed-in email is always a client. It's also a consultant when a consultant profile has that email.
  - "Become a consultant" on the Profile page creates that profile. It stays hidden until it has weekly hours, and it can be paused.
  - Consultants can't book themselves.
- **Alternatives:** one role per email (consultants would need a second address).
- **Trade-off:** every page has to work out which role applies.
- **Revisit when:** going live for real. Then add admin review before a profile is listed, and a membership table if teams appear.
- **Code:** `api/src/auth/profile.controller.ts`, `GET /me` in `api/src/auth/auth.controller.ts`.

### 10. A private demo per visitor

- **Problem:** visitors can't receive sign-in emails (decision 7), and one shared demo account would let them see and undo each other's bookings.
- **Decision:**
  - **Explore as a client or consultant** creates a private pair for that browser: a client and a personal copy of the demo consultant, with sample sessions. Only that visitor can see or book their consultant.
  - Switching sides keeps the pair; Reset rebuilds it.
  - Pairs unused for an hour are removed when the next demo starts, and new demos are rate-limited per network.
- **Alternatives:** one shared demo account reset on a schedule (visitors collide); screenshots only (nothing to try).
- **Trade-off:** demo rows live in the real tables, so public queries must filter them out (`demoOwner`).
- **Revisit when:** real users arrive. Then a separate demo environment is cleaner.
- **Code:** `api/src/auth/demo.ts`, `api/src/auth/demo.service.ts`.

## AI

### 11. Briefs: text from pypdf, a structured prep sheet from Claude

- **Problem:** turn a client's PDF brief into a short prep sheet the consultant can read before the session.
- **Decision:**
  - Clients attach one PDF per order after paying, until the session.
  - pypdf extracts the text. Claude Haiku returns a prep sheet that must match a Pydantic schema (structured outputs), so the JSON is always valid.
  - The brief is passed as data, never as instructions. A scan with no text gets a clear message.
  - The client and the consultant see the same sheet. Files live in a private Supabase bucket.
- **Alternatives:** sending scans to Claude to read as images (handles more files, costs more per upload); regular expressions (free, but brittle).
- **Trade-off:** scanned PDFs aren't summarised.
- **Revisit when:** clients often upload scans. Then send no-text PDFs to Claude directly.
- **Code:** `ai/src/ai/prep_sheet.py`, `ai/src/ai/pdf.py`, `api/src/briefs/`.

### 12. The Help assistant reads bookings as the user

- **Problem:** answer questions about the site and about the user's own bookings, without giving the AI more access than the user has.
- **Decision:**
  - A Help bubble on every page answers from the site's help topics.
  - For a signed-in user it has one read-only tool, `get_my_bookings`, which the AI service runs by calling the API with the user's own session.
  - The conversation stays in the browser tab.
  - Demo mode answers from pre-written topics without calling Claude.
- **Alternatives:** giving the AI service database access (it could see anyone's bookings); letting it cancel or rebook (it could change data).
- **Trade-off:** it can only explain and link to the right page, not act.
- **Revisit when:** actions are worth the risk. Then add confirm steps the user clicks themselves.
- **Code:** `ai/src/ai/support.py`, `api/src/support/support.controller.ts`.

### 13. Cap AI spending in three layers

- **Problem:** a public portfolio site with a paid model needs a ceiling on what strangers can spend.
- **Decision:**
  1. Live AI needs sign-in; signed-out visitors get Demo answers.
  2. The API enforces daily caps (200 chats, 30 briefs), stored in the database so they survive restarts and sleeping servers.
  3. A monthly spend limit in the Anthropic Console is the backstop.
- **Alternatives:** per-network rate limits alone (they reset whenever the free server restarts).
- **Trade-off:** a busy day can use up the cap for everyone until midnight UTC.
- **Revisit when:** there's revenue to cover it. Then cap per user instead of per site.
- **Code:** `api/src/ai-budget/ai-budget.service.ts`.

## Quality

### 14. Test the risky logic, fake the outside services

- **Problem:** catch mistakes that cost money or time, without tests that are slow, flaky or spend real money.
- **Decision:**
  - Unit and service tests cover open times and time zones; orders, holds and the webhook; refunds and cancellation rules; sign-in and demo accounts; briefs; and the Help assistant.
  - Stripe, Resend and Claude are replaced with fakes, so tests are free and run offline.
  - Tests were written once each feature's design had settled.
- **Alternatives:** browser end-to-end tests with Playwright (cover whole flows, but slow and brittle while the UI kept changing).
- **Trade-off:** clicking through the pages was checked by hand.
- **Revisit when:** there's CI and more contributors. Then add a few end-to-end tests for booking and paying.
- **Code:** `api/src/**/*.spec.ts`, `web/lib/*.test.ts`, `ai/tests/`.
