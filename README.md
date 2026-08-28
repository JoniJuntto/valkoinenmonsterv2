# valkoinenmonsterv2

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Start, Elysia, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Start** - SSR framework with TanStack Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Elysia** - Type-safe, high-performance framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Biome** - Linting and formatting
- **Electrobun** - Lightweight desktop shell for web frontends
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

### PostgreSQL integration tests

The repository includes a disposable PostgreSQL container for integration
tests. Create the ignored local environment file once:

```bash
printf '%s\n' 'TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55432/valkoinenmonster_test' > .env.test.local
bun run db:test:up
bun run db:test:migrate
bun run test:integration
```

`db:test:migrate` requires `TEST_DATABASE_URL` and explicitly maps it to
`DATABASE_URL`, so migration cannot fall back to the development database.
Run `bun run db:test:down` to remove the container and its data. Run the
database-free suite separately with `bun run test:unit`.

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:6283](http://localhost:6283).

## Season Events

Every two weeks a themed season event rotates in automatically (schedule is
deterministic — anchored at `SEASON_ANCHOR_MS` in
[`packages/api/src/seasons.ts`](packages/api/src/seasons.ts), no cron needed).
Each season is a fresh, equal-start mini-save with its own exclusive producers
and upgrades; golden upgrades, prestige bonuses and achievements are excluded,
so the season leaderboard is a pure fixed-ruleset race on season cans earned.

- Season state lives in `season_state` keyed by `(user_id, season_id)`; past
  seasons freeze automatically and each theme's shop is served from
  `SEASON_THEMES`.
- API: `season.current` (season info + snapshot + top-50 leaderboard + viewer
  rank), `season.sync` (tap flush, same click budget mechanics as the main
  game), `season.buyProducer`, `season.buyUpgrade`.
- UI: the `SeasonPanel` card on the game page (taps, exclusive shop,
  leaderboard).
- Analytics: server event `game.season.joined` on first season save, client
  events `game.season.viewed`, `game.season.tap`, `game.season.purchase.*`.

Adding a theme is one `buildTheme(...)` entry in `SEASON_THEMES`; the rotation
picks it up automatically.

## JSON Agent Game Mode

Development and test servers expose `POST /api/game/json` so an AI agent can
play the same authenticated save without browser automation. The route is not
registered in production.

Create an anonymous account and keep its Better Auth session cookie:

```bash
curl -c .agent-game-cookies \
  -H 'Content-Type: application/json' \
  -d '{}' \
  http://localhost:6283/api/auth/sign-in/anonymous
```

Then observe the game:

```bash
curl -b .agent-game-cookies \
  -H 'Content-Type: application/json' \
  -d '{"action":"observe"}' \
  http://localhost:6283/api/game/json
```

Every response contains the canonical save, derived statistics, the full shop,
the visible top-ten leaderboard, and `legalActions`. Each legal action is a
complete command that can be posted back unchanged. Mutating commands use a
unique UUID `operationId` for immediate-retry idempotency.

Available commands:

```json
{ "action": "observe" }
{ "action": "click", "count": 20, "operationId": "<uuid>" }
{ "action": "buy_producer", "producerId": "pull-tab", "operationId": "<uuid>" }
{ "action": "buy_upgrade", "upgradeId": "cold-can", "operationId": "<uuid>" }
{ "action": "wait", "milliseconds": 5000, "operationId": "<uuid>" }
{ "action": "prestige", "operationId": "<uuid>" }
{ "action": "reset", "confirm": "RESET", "operationId": "<uuid>" }
```

`click.count` accepts `1`–`10000` but still enforces the normal server click
budget. `wait.milliseconds` accepts `1`–`3600000`, advances online production,
and runs Smart Stocker on the same five-second heartbeat as the web game.
Resetting irreversibly clears the authenticated account's game progress.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@valkoinenmonsterv2/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Run checks: `bun run check`

## Project Structure

```
valkoinenmonsterv2/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Start)
│   └── server/      # Backend API (Elysia, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run test:unit`: Run tests that do not require PostgreSQL
- `bun run test:integration`: Run PostgreSQL integration tests using `TEST_DATABASE_URL`
- `bun run db:test:up`: Start the disposable PostgreSQL test database
- `bun run db:test:migrate`: Migrate only the configured test database
- `bun run db:test:down`: Remove the PostgreSQL test database and its data
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Biome formatting and linting
- `bun run dev:desktop`: Start the Electrobun desktop app with HMR
- `bun run build:desktop`: Build the stable Electrobun desktop app
- `bun run build:desktop:canary`: Build the canary Electrobun desktop app
- Note: Desktop builds package static web assets. TanStack Start needs a static/export build configuration before desktop packaging will work.
