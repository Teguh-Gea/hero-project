# HERO: admin portal and astronaut portal

HERO monitors each astronaut's eye health (SANS), mental health (BHP), and ISS cabin environment. The project is built with **Next.js (App Router)** and serves two separate portals from one server:

| Portal | Address | For |
|---|---|---|
| Admin | `http://localhost:3000/admin` | Manages all data (also acts as flight surgeon) |
| Astronaut | `http://localhost:3000/astronot` | Astronauts, including cabin leaders |

Access rights are enforced on the **server**, not just in the UI. Astronauts never receive data outside their rights, and every change sent to the server is checked again.

## Running

Requires Node.js 20.9 or newer.

```bash
cd hero-project
npm install
npm run dev          # development mode (hot reload) at http://localhost:3000
```

For production:

```bash
npm run build
npm start            # next start, port 3000
```

The Geist font is self-hosted through `next/font`, and React and the icons are bundled at build time, so the browser no longer loads anything from a CDN.

Without `DATABASE_URL`, data is stored in the file `data/hero-db.json` and sessions are kept in memory. On the first API call, the server creates that file from the simulation data in `lib/server/seed.js`. To go back to the initial data, stop the server and run `npm run reset-data`, or use the **Reset to sample data** button in the admin portal (Input simulator menu).

## Deploying to Vercel (Neon Postgres database)

On Vercel the file system is read-only and the server runs on many instances. HERO therefore switches to Postgres automatically when `DATABASE_URL` is present. Data, login sessions, and login attempt limits are all stored there.

1. In the Vercel dashboard, open the project → **Storage** → choose **Neon** (Serverless Postgres) → **Install / Create**. The free plan is enough.
2. Connect the database to this project (**Connect Project**) for Production, Preview, and Development. Vercel adds `DATABASE_URL` under **Settings → Environment Variables** automatically. A different prefix, such as `STORAGE_DATABASE_URL`, is also recognized.
3. **Redeploy** (**Deployments** → latest deployment → **Redeploy**). New environment variables are only picked up by deployments created after they were added.
4. Open the site and sign in, for example with `teguh@hero.com` / `password123`. The first request creates the tables (`hero_state`, `hero_sessions`, `hero_login_attempts`) and fills them with the simulation data.

To return to the simulation data on Vercel, sign in as an Admin and use **Input simulator → Reset to sample data**. (`npm run reset-data` only applies to the local file.)

Session cookies are marked `Secure` automatically on Vercel. If you see "Database belum tersambung" (database not connected) or "Gagal terhubung ke database" (could not connect to the database), check steps 2–3. To use the same Neon database from your own computer, run `vercel env pull .env.local` and then `npm run dev`.

**How the data is stored:**
- All HERO data is stored as a single JSONB document in the `hero_state` row, with a `version` column.
- Each request reads its own copy. When saving, the version is checked (*optimistic locking*). If another request saved first, the request is retried automatically with the latest data, including all of its access checks.
- Session IDs are stored as SHA-256 hashes.

### Environment variables

By default `next start` listens on all network interfaces. To restrict it to this computer only: `npm start -- -H 127.0.0.1`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port (or `npm start -- -p 4000`) |
| `HERO_DATA_DIR` | `./data` | Folder for the database file |
| `HERO_DEMO` | `1` | `0` hides the demo account list on the login page |
| `GEMINI_API_KEY` | (empty) | Enables the neural voice of HERO AI Assistant (Gemini TTS) through `/api/tts`. The key stays on the server. Without a key, the most natural voice on the device is used |
| `GEMINI_TTS_VOICE` | `Sulafat` | Gemini voice name, e.g. `Achernar`, `Aoede`, `Kore` |
| `DATABASE_URL` | (empty) | Postgres (Neon) URL. If set, data and sessions are stored in Postgres; otherwise in a file and in memory |
| `HERO_SECURE_COOKIE` | `0` (`1` on Vercel) | `1` when the server is behind HTTPS (session cookie gets the `Secure` flag) |

## Demo accounts (simulation data)

All accounts use the email `[name]@hero.com` and the password `password123`.

**Admins:** `teguh@hero.com`, `jeremy@hero.com`, `naila@hero.com`, `abel@hero.com`, `vinson@hero.com`, `nabillah@hero.com`

**Astronauts** (3 missions, 3 people per mission; same mission = same cabin):

| Mission | Cabin | Cabin leader | Cabin members |
|---|---|---|---|
| INC-071 · Ekspedisi 71 (starts 1 Jun 2026) | Node 2 Harmony | `raka@hero.com` (Cmdr. Raka Pratama) | `sari@hero.com`, `dimas@hero.com` |
| INC-072 · Ekspedisi 72 (starts 20 Jul 2026) | Node 3 Tranquility | `putri@hero.com` (Cmdr. Putri Anggraini) | `bima@hero.com`, `laras@hero.com` |
| INC-073 · Ekspedisi 73 (starts 10 Sep 2026) | Kibo JEM | `arif@hero.com` (Cmdr. Arif Hidayat) | `maya@hero.com`, `yoga@hero.com` |

Every astronaut has pre-flight data and 3 in-orbit examinations (eye OD/OS, mental, vitals, countermeasures), and every cabin has 3 environment readings. Conditions vary on purpose so that every status is visible. Each mission has one astronaut with severe SANS and stress signs, one moderate, and one normal. The INC-071 cabin also has the most problematic environment.

Admin accounts can only sign in through the admin portal, and astronaut accounts only through the astronaut portal.

**Replacing old data:** if `data/hero-db.json` already exists from an earlier version (`@nasa.gov` accounts), the old accounts are still stored there. Stop the server, run `npm run reset-data`, and start it again; or sign in as an Admin and use **Input simulator → Reset to sample data**.

## HERO AI Assistant (voice)

- The default language is **English**. The ID/EN choice is remembered in the browser.
- The "Hi HERO" microphone turns on automatically after sign-in, and can be turned off or on with the microphone button in the assistant widget (bottom right).
- The most human-sounding voice comes from setting `GEMINI_API_KEY` on Vercel (Settings → Environment Variables) and redeploying. Speech is synthesized on the server (`/api/tts`, for signed-in users only), so the key never reaches the browser.
- Without a key, the assistant uses the most natural voice on the device, such as "Microsoft … Online (Natural)" in Edge or "Google US English" in Chrome, at normal pitch and speed.
- The **Command list** follows the user's role: Admin-only commands (Missions, Users, Research & SQL, adding astronauts, protocols) are hidden from astronauts. If an astronaut says one anyway, the assistant politely declines.
- The command logic lives in `lib/voice-commands.js`. `tests/voice-commands.test.js` makes sure every phrase in the list is understood exactly as described, in both languages and for both roles.

## Authentication & authorization

### Authentication

HERO uses its own authentication system, which has been in place from the start (it does not use Better Auth):

- Sign in at `/admin/login` or `/astronot/login`. Passwords are stored as scrypt hashes, and sign-in is limited to 8 failed attempts per 10 minutes.
- A session is a random 256-bit ID in the `hero_sid` cookie (`HttpOnly`, `SameSite=Strict`, and `Secure` on Vercel or when `HERO_SECURE_COOKIE=1`), stored as a hash in Postgres (or in memory when running locally). Sessions last 8 hours since last use, including after the browser is closed.
- Pages are protected on the server (`lib/server/guard-page.js`) before any HTML is sent. Signed-out users are redirected to that portal's login page, and users who open the wrong portal are redirected to their own.
- Every API request reads the account from the database again. Role changes and deleted accounts take effect immediately, and the sessions of promoted or deleted users are ended.

### Three roles

The effective role is computed on the server from the database, never from data sent by the browser.

| Role | Source |
|---|---|
| **Admin** | `accounts.role = 'admin'`. There can be more than one, all with equal rights. |
| **Cabin leader** | An astronaut account recorded in `modules.leaderAstronautId` for a cabin they are actually assigned to |
| **Cabin member** | Any other astronaut account |

**Cabin** = the crew quarters module (`modules`). Astronauts join a cabin through `assignments.quartersModuleId`. No new tables were added: the user, cabin, and leader structure already existed.

| Data / feature | Admin | Cabin leader | Cabin member |
|---|---|---|---|
| Own profile & health data | Manage | Manage | Manage |
| Cabin mates' profiles & health data | Manage | View only | View only |
| Astronauts & data in other cabins | Manage | Not visible | Not visible |
| Cabin environment data | All cabins | Manage the cabin they lead | View their cabin only |
| Missions & cabins, assignments, astronaut registration, accounts | Manage | View own* | View own* |
| Appointing cabin leaders (per cabin) | Yes | No | No |
| Protocol approval (LBNP, environment, BHP) | Yes | View only | View only |
| Users menu, promoting to Admin, Research & SQL, data reset | Yes | No | No |

\* Their own examination schedule and assignment length can be changed.

### Role changes

The only way to change a role is `POST /api/admin/users/:id/role` with the body `{ "role": "admin" }`, and only an Admin can use it. The `role` column cannot be changed through `/api/sync`.

| From | To | Result |
|---|---|---|
| Cabin leader / Cabin member | Admin | Allowed. Their cabin leadership is released; profile and health data are kept; they sign in again through the admin portal. |
| Admin | Admin | `409`, already an Admin |
| Admin | Cabin leader / member (or any role) | `403`, the Admin role is protected |
| Leader ↔ Member | | `403` through this endpoint. Leaders are appointed per cabin in **Missions → Change leader** (see below). |
| Own account | | `403` |

Admin protection also applies to `/api/sync`: an Admin cannot delete another Admin's account or change their email, name, or password. Each Admin manages only their own account. Admin accounts also cannot be appointed as cabin leaders.

Role checks and changes run in a single synchronous step in the Node process, with no `await` in between, so no other request can slip in.

### Where the rules live

| File | Contents |
|---|---|
| `lib/server/authz.js` | Central helpers: `getCurrentUser`, `requireAuth`, `requireRole`, `checkPermission`, `checkCabinAccess`, `canChangeRole`, `promoteToAdmin`, `portalRedirect` |
| `lib/server/access.js` | Per-user data filtering (`filterDb`) and checks for every change from `/api/sync` |
| `lib/server/http.js` | Route Handler wrapper: CSRF, 401 when signed out, 403 when the role does not match (`handler(fn, { roles: ['admin'] })`) |
| `lib/server/guard-page.js` | Server-side protection of the portal pages |

The app's menus adapt to the role (Admins see every menu, including **Users** and **Research & SQL**), but that is only for display. All rules are still enforced on the server.

### Appointing cabin leaders

Only an Admin can decide who leads a cabin, through **Missions → Change leader** on the mission in question (`PUT /api/admin/missions/:id/leader`).

- Only that mission's crew can be chosen. Admin accounts cannot be chosen, and a cabin can also be left without a leader.
- The previous leader automatically becomes a cabin member, and the new leader can enter cabin environment data right away without signing in again.
- Cabin leaders and members get `403` if they try to change it, whether through this endpoint or through `/api/sync`.

### Mission = cabin

Every mission has exactly one cabin, and **astronauts on the same mission always share a cabin**. That way they can automatically see each other's data (see the table above).

- Admins manage missions in the **Missions** menu: add, edit (name, dates, cabin name), and delete. Creating a mission creates its cabin automatically. The mission code cannot be changed.
- A mission that still has astronauts cannot be deleted, so their health data is not lost. An empty mission is deleted together with its cabin and the cabin's environment data.
- New astronauts, whether added from **Crew → Register astronaut** or from **Input simulator → Add new astronaut**, must be assigned to an existing mission. Missions are no longer created automatically from a typed code.
- The server always derives the cabin from the assignment's mission, so any `quartersModuleId` sent by the browser is ignored. Missions and cabins also cannot be created or deleted through `/api/sync`.
- A cabin leader whose assignment is removed is automatically released from that cabin.

### Accounts & passwords

Admins manage accounts in the **Users** menu:

- **Add:** a new Admin account, or an account for an astronaut who does not have one yet.
- **Edit:** an astronaut account's email and password, or their own account details.
- **Delete:** cabin leader / member accounts. The profile and health data are kept. Admin accounts cannot be deleted.

The password rules are in `lib/password-policy.js` and are used identically by the browser forms and the server:

- 8–128 characters, containing letters and numbers;
- no leading or trailing spaces;
- not the same as the email or the part before `@`;
- the "Repeat password" field must match.

New astronauts no longer get the default password `password123`. Passwords are never stored in browser drafts (localStorage) either. Changing another account's password ends all of its sessions.

`/api/sync` is now **atomic**: if even one change is rejected, nothing is saved. For example, a registration with a weak password no longer leaves behind an astronaut without an account.

### Testing

```bash
npm test
```

There are 98 tests that call the real Route Handlers against a temporary database:
- 43 scenarios run twice: in file mode and in Postgres mode (`tests/pg-*.test.js`, using the simulated database `tests/fake-pg.js`).
- `tests/postgres.test.js` adds 5 Postgres-specific tests: initial seeding, sessions in the database, login limits, concurrent writes, and optimistic locking.
- `tests/rbac.test.js` covers signed-out access, wrong portal, cabin isolation, IDOR, forged `cabinId`, attempts to demote/delete/take over an Admin, promotion to Admin, and several Admins at once.
- `tests/admin-crud.test.js` covers password rules, account CRUD, mission CRUD, same mission = same cabin, and atomic sync.
- `tests/cabin-leader.test.js` covers changing the cabin leader.
- `tests/seed.test.js` checks the simulation data (all 15 accounts can sign in, 3 people per mission, cabin isolation).
- `tests/voice-commands.test.js` checks every phrase in the command list.

The other tests use fixed test data in `tests/fixtures/seed.json`, so they are not affected by changes to the demo data.

## Project structure

```
hero-project/
├── package.json
├── next.config.mjs        # security headers, Next.js configuration
├── postcss.config.mjs     # Tailwind CSS v4 through PostCSS
├── app/
│   ├── layout.jsx         # <html>, Geist font (next/font), globals.css
│   ├── globals.css        # HERO color palette, fonts, and base rules (dark theme) + Tailwind
│   ├── page.jsx           # portal picker page
│   ├── admin/             # admin portal: page.jsx + login/page.jsx
│   ├── astronot/          # astronaut portal: page.jsx + login/page.jsx
│   └── api/               # Route Handlers, one folder per endpoint (see the API table)
├── components/
│   ├── hero-portal.jsx    # loads the app in the browser only (next/dynamic, ssr: false)
│   ├── hero-app.jsx       # the HERO React app (shared by both portals through the `portal` prop)
│   ├── users-page.jsx     # Users page: account CRUD & promoting to Admin (Admin only)
│   ├── missions-page.jsx  # Missions page: mission & cabin CRUD (Admin only)
│   └── admin-api.js       # API caller & button styles for the Admin pages
├── lib/
│   ├── password-policy.js # password rules (used by browser & server)
│   ├── voice-commands.js  # voice/typed command recognition & role-based command list
│   ├── rf-models.js       # Random Forest models (glaucoma, mental, cabin) in JavaScript
│   └── server/            # server-only code
│       ├── authz.js       # central authorization helpers (role, permission, cabin, role changes)
│       ├── guard-page.js  # server-side protection of the portal pages
│       ├── missions.js    # mission = cabin rules (create, edit, delete)
│       ├── http.js        # Route Handler helpers: CSRF, session, role, JSON, errors
│       ├── access.js      # ALL access rules (filter data & check changes)
│       ├── auth.js        # scrypt password hashing, sessions, cookies, login attempt limit
│       ├── store.js       # read/write data: Postgres (optimistic locking) or JSON file
│       ├── pg.js          # connection & all Postgres (Neon) SQL, active when DATABASE_URL is set
│       ├── tts.js         # Gemini TTS for the assistant's voice (server-side key)
│       └── seed.js        # initial simulation data (plain passwords only here, hashed on load)
├── tests/                 # authorization, Admin feature & voice command tests (npm test)
└── data/                  # created automatically, contains hero-db.json
```

## API

Every request that changes data must carry the header `X-HERO-Request: 1` (CSRF protection, on top of the `SameSite=Strict` cookie).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/demo-accounts?portal=admin\|astronot` | Demo account list (off when `HERO_DEMO=0`) |
| `POST` | `/api/login` | `{ email, password, portal }` |
| `POST` | `/api/logout` | Ends the session |
| `GET` | `/api/session?portal=...` | Current user + the data they may see |
| `GET` | `/api/db` | The data the user may see |
| `POST` | `/api/sync` | `{ changes: [{ table, op: 'insert'\|'update'\|'delete', row }] }`; atomic: if anything is rejected, nothing is saved and all reasons are returned |
| `POST` | `/api/tts` | `{ text, lang }` → assistant voice audio (signed-in users; `501` without `GEMINI_API_KEY`) |
| `POST` | `/api/admin/reset` | Reset to sample data (Admin) |
| `GET` | `/api/admin/users` | All users with effective role & cabin (Admin) |
| `POST` | `/api/admin/users` | Create an account: `{ kind: 'admin', name, title?, email, password }` or `{ kind: 'astronaut', astronautId, email, password }` (Admin) |
| `PATCH` | `/api/admin/users/:id` | Change `email`, `password` (and `name`, `title` for the Admin's own account) (Admin) |
| `DELETE` | `/api/admin/users/:id` | Delete a cabin leader / member account (Admin) |
| `GET` | `/api/admin/missions` | Missions with their cabin, leader, and crew (Admin) |
| `POST` | `/api/admin/missions` | `{ id, name, startDate, endDate?, cabinName? }`, creates a mission and its cabin (Admin) |
| `PATCH` | `/api/admin/missions/:id` | Change `name`, `startDate`, `endDate`, `cabinName` (Admin) |
| `PUT` | `/api/admin/missions/:id/leader` | `{ astronautId }` or `{ astronautId: null }`, appoints/changes the cabin leader (Admin) |
| `DELETE` | `/api/admin/missions/:id` | Deletes an empty mission with its cabin; `409` if it still has astronauts (Admin) |
| `POST` | `/api/admin/users/:id/role` | `{ role: 'admin' }`, promotes a cabin leader / member to Admin (Admin) |

Any other endpoint under `/api/` returns a JSON `404`.

## Security notes

This is a prototype. Before real use:

- run behind HTTPS (automatic on Vercel), or set `HERO_SECURE_COOKIE=1`;
- change all demo passwords and set `HERO_DEMO=0`;
- without `DATABASE_URL`, sessions live in memory and data in a single file, so run it as **a single Node process**. For Vercel or multiple instances, use Postgres (see Deploying to Vercel);
- the login attempt limit uses the address from the `X-Forwarded-For` header (rightmost entry), because Next.js Route Handlers cannot read the socket. Put the server behind a reverse proxy that sets this header;
- in Postgres all data is still stored as a single JSONB document, so every save rewrites all of the data. This is fine for dozens of users. For larger scale, split it into tables (a relational schema is available in the Research & SQL menu).

## Changing the look

Tailwind CSS v4 is compiled automatically by Next.js through PostCSS, so new classes in `app/` or `components/` take effect without a manual build step.

`app/globals.css` contains the HERO color palette, fonts, and base rules (dark theme).
