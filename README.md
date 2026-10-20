# Private Rope Jam · Web + Telegram

A React + TypeScript event companion for Private Rope Jam with a Telegram-style interface. The app works in a normal browser and as a Telegram Mini App. Web sign-in uses WorkOS AuthKit; Telegram retains its profile/launch-data flow.

## Run

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5178. `npm run build` creates `dist/`, and `npm test` runs the authentication, event archive, and calendar tests.

## Announced events

- **Private Rope Jam** — Sunday 15 November 2026, 19:00–21:00, Barcelona time (CET).
- Previous event: Friday 16 October 2026, 19:00–21:00 (CEST).
- Arrivals from **18:30**, up to 30 minutes early.
- **8.50€** per person; **10 people**, all vetted, invite-only.
- **LabCultural**, Carrer del Rector Triadó, 11, Sants, Barcelona.
- One suspension point; check with the host before using it.
- Explicit rules covering consent, pronouns, privacy, discrimination, stop signals, sobriety, and respectful shared use of the room.

The original October photo is unchanged at `public/private-rope-jam-poster.jpg`. November uses a separate SVG poster with the correct Sunday date and the same venue, local hours, price, capacity, suspension point, and invitation policy. Map and Instagram icon buttons sit beside the venue name, with accessible labels and hover titles. House rules include an adults-only agreement.

The interface combines the compact event rows with the legacy cream palette, DM Sans body text, Instrument Serif headings, rope branding, and direct action labels. Event details, People, rules, account, organization tools, and the public sign-in screen share the same visual style. Original Lottie loading and success animations are bundled locally and loaded on demand. Reduced-motion preferences show static frames and disable transitions. The poster is available under Event poster.

**All events** has Upcoming and Past views for the October and November events. Events move to Past after their end time, using timestamp offsets. Add actual events in `src/data/eventCatalog.ts`; `src/lib/events.ts` handles ordering, local-time display, and calendar export.

**Add to calendar** downloads an `.ics` file with the correct time zone conversion. The calendar entry is not a reservation. There is no payment, booking, attendee approval, or check-in backend. Signing in does not confirm attendance; the host does.

Demo accounts are off by default, including locally. An explicit developer-only `VITE_ENABLE_DEMO=true` opt-in in `.env.local` enables the browser demo only during `npm run dev` with mock data. Production, private-service, and API builds cannot enable it. Demo/preview identities never authorize private API requests.

## Legacy backup and rollback

The complete pre-redesign working tree, including the existing uncommitted attendance and rules work, is preserved in `codex/legacy-pre-telegram-2026-10-15` at `f7ed9fe`. The branch is backed up on the existing GitHub repository. Development, testing, and deployment continue on `main`.

To restore that exact version while keeping deployment on `main`, start with a clean working tree and run:

```sh
git switch main
git restore --source=codex/legacy-pre-telegram-2026-10-15 --staged --worktree -- .
git commit -m "Restore legacy app"
git push origin main
```

This restores the saved source and dependency lockfile and removes files introduced by the redesign. The main push triggers the existing production deployment. Local credentials and production database records are not part of this source rollback.

The Telegram redesign keeps the current agreement version and IDs and does not require a database migration. Build and all 115 database-backed tests passed, including packaged-function checks for every JavaScript/CSS asset. Local browser checks covered desktop/mobile layouts, 320px dark mode, reduced-motion confirmation, five-rule gating, saved attendance, People, and returning attendees.

## Files

- `src/App.tsx`: event homepage, event browser, and account dialog.
- `src/data/eventCatalog.ts`: announced event content; `src/data/houseRules.ts`: house rules; `src/data/event.ts`: public development preview.
- `src/components/EventDetails.tsx`: compact event heading, facts, poster, and calendar/rules actions.
- `src/components/LottieAnimation.tsx` and `src/lib/animations.ts`: local loading and confirmation animation artwork and player lifecycle.
- `src/lib/events.ts`: chronological event lists, Barcelona-time formatting, Maps links, and calendar download.
- `src/components/AppAuthProvider.tsx`: web account integration.
- `src/lib/api.ts`: authenticated event invitations and public development preview; `server/eventAttendance.ts`: event groups, membership checks, and saved responses.
- `src/styles.css`: compact layout with the legacy cream palette, typography, and Telegram safe-area support.
- `src/lib/telegram.ts`: Telegram theme updates and system chrome colors.

## Set up new web credentials (WorkOS AuthKit)

The browser integration uses the official `@workos-inc/authkit-react` SDK with the hosted AuthKit login screen. It requires a **public Client ID**, not a secret API key. It works with the locally configured event; an event backend is not required for browser sign-in.

1. Create or sign in to your account at the [WorkOS dashboard](https://dashboard.workos.com/). Create a new project for Private Rope Jam and select its **Staging** environment, so these credentials are separate from other applications.
2. In **Applications**, create/select the event application. Copy its **Client ID** (`client_…`). WorkOS may also show an API key; that key is not used by this frontend.
3. Open the application's **Redirects** tab and set the local URLs below. The trailing slash on the callback and sign-out URLs matters.

   | Setting                         | Local value                   |
   | ------------------------------- | ----------------------------- |
   | Redirect URI / default redirect | `http://127.0.0.1:5178/`      |
   | Sign-out URI / default sign-out | `http://127.0.0.1:5178/`      |
   | Initiate login URI              | `http://127.0.0.1:5178/login` |

4. Allow `http://127.0.0.1:5178` as a **CORS web origin**. WorkOS exposes this in the Authentication **Configure CORS** dialog or the application's Sessions/CORS settings. Use the origin only, with no path or trailing slash.
5. Enable the authentication methods you want in WorkOS (for example email/password and Google). AuthKit displays the enabled methods in its hosted login screen.
6. Put the public Client ID in the `.env.local` file already created in this directory:

   ```dotenv
   VITE_WORKOS_CLIENT_ID=client_YOUR_NEW_CLIENT_ID
   VITE_WORKOS_API_HOSTNAME=
   VITE_WORKOS_DEV_MODE=false
   VITE_DATA_SOURCE=mock
   ```

7. Run `npm install` if dependencies have not been installed, then restart `npm run dev`. Open the exact configured origin and choose **Your account → Sign in** or **Create an account**. After login, check the email in the account screen, reload to confirm session restoration, then test sign-out. The user should also appear in the WorkOS dashboard's Users section.

`.env.local` is ignored by Git. Keep `.env.example` as the shareable template. `VITE_` variables are public: **never place a WorkOS secret API key (`sk_…`), Telegram bot token, or cookie encryption secret in this frontend.** Future server credentials belong in the backend's private environment.

The app uses Vite's base path as the OAuth callback and the `login` route under that path to begin login from invitation/reset links. On static hosting, serve that login route with `index.html`; the current Pages workflow instead redirects all visitors to the protected Vercel service. Do not mix `localhost` and `127.0.0.1`: if you use `localhost`, add that origin and its corresponding redirect/sign-out/login URLs too.

### Hosted web environments

For a **staging preview**, use your staging Client ID and set `VITE_WORKOS_DEV_MODE=true` if you have no custom auth domain. This SDK mode stores its refresh token in localStorage; use it for development/staging only. Local Vite development enables SDK development mode automatically.

For **production**, configure a custom authentication API domain in WorkOS (for example `auth.events.example.com`) and its DNS records. Use the production application's Client ID, set `VITE_WORKOS_API_HOSTNAME=auth.events.example.com` (hostname only), and keep `VITE_WORKOS_DEV_MODE=false`. Add the production origin, callback `/`, sign-out `/`, and initiate-login `/login` URLs in that environment. Rebuild after changing Vite environment variables. The frontend declines production AuthKit setup without a custom domain unless staging development mode was explicitly selected.

AuthKit's client-only SDK requires a top-level browser tab. In Telegram or an iframe, the app keeps the Telegram flow; web sign-in is available when opening the site in a regular browser tab.

### Web and Telegram identity

Both providers use the same event UI and account/pass screen. They are currently separate identities: a WorkOS `user_…` ID and a Telegram numeric ID. Automatically linking them, syncing events between devices, and issuing a single valid ticket require the future backend. Link accounts only after verifying both sign-ins; do not merge by display name or an unverified email. Demo profiles never authorize backend access.

For future authenticated requests, `useWebAccount()` exposes `getAccessToken()`. Retrieve a fresh SDK token at request time and send it as `Authorization: Bearer …` to your event API. The backend must verify the token's signature and claims before granting access; displaying a profile in React is not server authorization.

Reference: [WorkOS React integration guide](https://workos.com/docs/authkit/react) and [official React SDK](https://github.com/workos/authkit-react).

## Connect Telegram

1. Create a bot with [BotFather](https://t.me/BotFather).
2. Host `dist/` over HTTPS and configure that URL as the bot's Main Mini App.
3. Set `VITE_TELEGRAM_BOT_USERNAME` in `.env.local`, without `@`, then restart/rebuild.
4. Open `https://t.me/YOUR_BOT_USERNAME?startapp` or the bot's Launch App button.

Inside Telegram, **Continue with Telegram** sends raw launch data to the local verification server during development, or to the configured auth API. A static preview without either server only displays the host's profile in clearly labeled preview mode and never grants organization access. The backend validates raw Telegram `initData` before trusting an identity. See [Telegram's validation documentation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

## Add an event API later

```dotenv
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=https://api.example.com
```

The default `mock` setting means locally configured event data, not invented event details. AuthKit works independently of this setting.

| Endpoint              | Contract                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /event`          | Return `{ "events": [...] }`, matching `EventData` / `RopeEvent` in `src/types/event.ts`. Include ISO timestamps with explicit offsets and an IANA `timeZone`.                     |
| `POST /auth/telegram` | Accept `{ "initData": "raw launch data" }`. Validate the signature and freshness, create an HttpOnly session cookie, and return `{ "user": { "id": 123, "first_name": "Name" } }`. |
| `POST /auth/logout`   | Invalidate the Telegram session cookie and return a successful status.                                                                                                             |

API requests include credentials. Configure exact CORS origins, suitable secure cookies, and CSRF protection for server state changes. WorkOS access tokens must be validated on the server for protected requests. Demo profiles and Telegram previews never authorize an API.

## Event invitations and attendance

Private builds fetch event content through the authenticated API. After sign-in, members see one **Event** page containing the details and response box, alongside **People**. Group membership grants an invitation; the response starts **Pending**. **Going** confirms attendance and adds the person to People. **Not going** and **Decide later** remove them from confirmed attendance. Responses can be changed until the event ends and persist across sessions/devices.

Each event uses its saved group link, or the server's `TELEGRAM_GROUP_ID` when no link is saved. The administrator can change the association through the admin-only `event-group` API, choosing an approved group where the bot is present. Group configuration is excluded from the attendee response box. Only members of that event's group can read its invitation, view its poster, or reply. App-level individual access overrides do not bypass event membership. Event links support multiple groups in storage; the current API selects one. Overlapping groups produce one response/person per event.

People shows confirmed attendees to members. Organizers can also inspect **Pending** and **Not going**, including identified group members who have never signed in. Bots, blocked users, and departed members are excluded. Incomplete Telegram rosters are labelled **Known pending**, rather than claiming a full invitation count. Telegram or storage failures never confirm attendance.

`event_groups` and `event_responses` are additive tables in `server/schema.sql`. Before deploying this code, apply `npm run db:setup` with the existing database's direct `DATABASE_URL_UNPOOLED`. Do not run migrations through a pooled connection. The default configured group is used until a saved link exists. Hosted Node and Vercel use the same database stores; local Vite uses memory. Demo profiles are explicitly marked as browser-only previews and never authorize the API.

First-time Going responses open the compact general house rules page. Each full rule has a reusable `RuleAcceptanceButton`: **I agree** collapses the rule to its checked title and scrolls to the next unread rule. Titles can be reopened to read or withdraw an agreement. The fixed footer always shows progress; **Confirm attendance** appears only after all five rules are acknowledged. Its reusable `ConfirmationButton` shows orbiting dots while saving and an animated check with **You’re going** only after a successful save, then returns to the event after one second. Failed saves preserve the five agreements for retry, duplicate submissions are blocked, and reduced-motion preferences disable animation and smooth scrolling. The authenticated RSVP endpoint independently requires five distinct current rule IDs together with `houseRulesVersion` from `src/data/houseRules.ts`; agreement and attendance save atomically. The additive `house_rules_acceptances.accepted_rule_ids` column records the acknowledged rules alongside the verified Telegram user, version, and first complete acceptance date. Version `2026-10-15.2` requires individual acknowledgements, including from people who used the previous single-button flow. Existing RSVPs and historical agreements remain saved. Not going and Pending stay immediate; future Going responses reuse the completed agreement across events and devices. The bottom House rules tab remains available for reading without changing attendance.

Tapping **Going** always opens the house rules confirmation page, including for a returning or already-confirmed attendee. A saved current agreement initializes the five rules as checked and collapsed, with **Confirm attendance** available immediately. The response changes only after that explicit confirmation; cancelling preserves the previous response. New or outdated agreements still require all five individual acknowledgements.

| Endpoint under `/api/telegram/` | Purpose |
| --- | --- |
| `GET events` | Return only event invitations for the verified user; administrators can manage all events. |
| `GET attendance?eventId=...` | Return own response, group titles, and eligible People. Pending/declined identities are admin-only. |
| `POST rsvp` | Save `{ eventId, response: "going" | "not-going" | "pending" }` for the session's user. |
| `POST event-group` | Admin-only `{ eventId, chatId }` replaces the event's linked group. |

All mutations require the exact app Origin. Membership, blocks, links and session validity are checked on the server. `npm run test:db` tests persistence against a disposable local PostgreSQL instance and exercises the packaged Vercel function. No production database is modified by that command.

Production release on 14 October 2026: the event schema was applied to the existing database and the current workspace was deployed through the Vercel CLI to https://ropelab.vercel.app (`dpl_7y3Ja7u6T6Ym5xbNqyUjYbyZtM9X`). All 95 database-backed tests and packaged-function checks passed. Live terminal checks verified health, the updated sign-in page, anonymous denial for invitations/attendance/bundles/posters, and cross-origin RSVP rejection. Authenticated visual browser validation remains unverified.

The subsequent layout update (`dpl_2cQkoTd1zVuWqxCVgsPPbZFRRAap`) combines the invitation and event details into one Event page, places the response box under the event facts, and reduces spacing below the header. Event and People are the only local page tabs. The build and standard tests passed; it was deployed directly through the terminal without browser testing.

The compact response-box update (`dpl_CMWBwDWmwn2bvEtjTKKHEVCLcHxZ`) reduces padding, removes the reserved feedback height and separator gap, and tightens the surrounding actions. Touch targets remain 44px. It was built and deployed through the terminal, with standard tests passing and no browser testing.

The follow-up release (`dpl_BMDcuJmcVxCEFwPRFgBWEgwwuRdC`) removes the group-management control from the response box. Existing event-group associations and the admin-only API remain available. Build and standard tests passed; deployment and health verification used the terminal only.

The 15 October 2026 release (`dpl_BbprKJFbtG2g9gYW42UPtpvjRdxZ`) moves general house rules to their own page, retains the bottom navigation tab, and links to the rules from each event’s practical information. The production build, all 103 database-backed tests, and packaged-function verification passed before deployment to https://ropelab.vercel.app. Live checks confirmed health, sign-in, and anonymous denial for events, attendance, the frontend bundle, and the poster. Rules-page navigation was verified locally on desktop and mobile; authenticated production browser validation remains unverified.

The house-rules confirmation release on 15 October 2026 (`dpl_J4a9j8bfMW3W9RGFJqaAFfJ1ygGE`) adds the one-time agreement before Going, with an atomic agreement/RSVP save and cross-event persistence by Telegram account. The additive agreement table was applied to the existing production database. All 108 database-backed tests and packaged-function verification passed, including missing/stale agreement rejection, concurrent confirmation, rollback, and preservation of the first acceptance date. Local desktop/mobile demo checks covered cancellation, confirmation, repeat Going, and the reading-only bottom tab. Live health, sign-in, private-asset denial, and cross-origin RSVP rejection passed; authenticated production browser validation remains unverified.

The fixed-confirmation update on 15 October 2026 (`dpl_BNT58bWsGAjEFoezShvKdFeSfcXM`) keeps acceptance visible above the bottom navigation, with a down arrow and scrolling cue until the final rule clears the fixed controls. Opening rules resets scrolling immediately to prevent premature unlocking during page transitions. Local mobile checks verified the disabled, partially scrolled, and unlocked states; desktop checks verified immediate availability when all rules fit and a successful demo confirmation. The production build and 102 standard tests passed (8 database-dependent tests skipped); live health, sign-in, and private-route checks passed.

The compact individual-acknowledgement release on 15 October 2026 (`dpl_HQRxmN1yqb7H8Kkw3QBkpfNsvsJv`) implements the approved inline design with reusable `RuleAcceptanceButton` controls, animated checkmarks, and fixed five-rule progress. Confirmation requires all five distinct rule IDs on the server, stored atomically with the RSVP under version `2026-10-15.2`. The additive acknowledgement column was applied to the existing database; historical agreements and RSVPs remain saved. All 109 database-backed tests and packaged-function checks passed, covering incomplete/duplicate/unknown acknowledgements, legacy records, concurrent saves, and rollback. Local desktop/mobile checks verified compact layout, the new-version reminder, four-rule rejection, and successful five-rule confirmation. Live health, sign-in, private-route denial, and cross-origin RSVP protection passed; authenticated production browser validation remains unverified.

The 15 October safe-area release (`dpl_oVSw4VqUfDJ9WGsQxAx7qqsSe7sr`) applies the Telegram system and content insets around all four page edges, with browser safe-area fallbacks. Fixed navigation, notifications, dialogs, and the sign-in page respect those insets too. The header no longer tries to fit safe-area padding inside its fixed height. Standard tests, build, and live terminal checks passed; no browser testing was performed.

The guided-agreement release on 15 October 2026 (`dpl_Cz8igpAxcb9nyNgF7PU9RjfhcnZB`) implements the approved prototype: accepting a rule collapses it to its checked title, scrolls to the next unread rule, and updates fixed progress. All five agreements reveal the reusable animated confirmation button; loading follows the save request, and successful attendance displays a check and **You’re going** before returning to the event. Reopening and withdrawing agreements, failed-save retry, duplicate prevention, reduced-motion scrolling, and delayed-navigation cleanup are covered by tests. The production build, all 112 database-backed tests, and packaged-function checks passed. Local mobile browser checks verified collapse/reopen, automatic scrolling, four-rule gating, final-button reveal, and saved-success feedback. Live health, sign-in, protected API/bundle/CSS/poster denial, and cross-origin RSVP rejection passed; authenticated production browser validation remains unverified. No new database migration or agreement-version change was required.

The returning-attendee correction (`dpl_6AHNmz5hBR6Muw9Jg8rf7DrTwgvY`) makes Going always open house rules instead of silently reusing a saved agreement and submitting immediately. Existing agreements remain checked and can be reviewed, while attendance waits for the final confirmation button. The production build and 105 standard tests passed (8 database-dependent tests skipped), including the returning-attendee regression, cancellation, already-Going navigation, and deferred Telegram notification flow. Local browser validation used a demo account with an existing saved agreement. Production health, sign-in, private-route denial, and cross-origin RSVP rejection passed; authenticated Telegram UI validation remains unverified.

## Restrict event visibility to approved Telegram users

### Manage individual users in admin

In **Organization → View members**, choose **Remove access** beside a person to block their event access, including access through other approved groups. Removed members stay visible in the roster with **Restore access** so you can add them back. Bots and the system administrator have no removal control. These decisions change event access, not Telegram group membership.

The **Add user by Telegram ID** form grants app access after verified Telegram sign-in. It does not bypass an event’s linked-group requirement or confirm attendance. The system administrator can manage all events but still needs group membership to RSVP.

Decisions are saved in the existing PostgreSQL database's `user_access` table. Before deploying this version, run `npm run db:setup` with the existing private database connection to apply the additive schema update. Local Vite development uses memory, so its decisions reset on restart. Individual decisions are checked for sessions, sign-in, and every private asset request; removal takes effect on subsequent requests from existing sessions. Already downloaded content cannot be recalled.

The admin-only endpoints are `GET /api/telegram/users` and `POST /api/telegram/user-access` with `{ "userId": "123456789", "name": "Optional label", "state": "allowed" | "blocked" | "group" }`. Mutations require the verified system administrator and the exact app origin. Labels do not establish identity or create Telegram accounts.

**Status: the private app is live at https://ropelab.vercel.app with one PostgreSQL database for sessions and group approvals. Verified members of approved groups can access event files; only Telegram ID 17666600 can administer groups and see rosters. The main-branch GitHub Pages workflow now publishes only a redirect to the private app; the old public deployment is replaced when that workflow succeeds.** Work is on `codex/telegram-event-access`; hosting checks were completed on 8 October 2026.

The sole system administrator is **Telegram user ID `17666600`**, defined in server-only `server/telegramAuth.ts`. After verified Telegram sign-in, the homepage navigation, event actions, footer, and account dialog provide an **Organization** link (`#organization`). Signed-out visitors, other Telegram IDs, WorkOS accounts without a verified Telegram connection, and demo/preview profiles never see this link or the organization screen. Direct navigation shows a generic admin sign-in/denied screen without group data.

The local server verifies Mini App `initData` with the bot token and a five-minute freshness limit. Ordinary browsers use Telegram's popup ID-token flow with a short-lived, one-use server nonce and an HttpOnly challenge cookie; the server validates the ID token against Telegram's JWKS, issuer, audience, timestamp, and nonce. Authorization uses the token's numeric profile `id`, never its distinct OIDC `sub`. Register the preview origin (for example `http://127.0.0.1:5178`, if Telegram permits your local setup) in **BotFather → Login Widget → Allowed URLs** before browser sign-in can succeed. `TELEGRAM_LOGIN_CLIENT_ID` may be supplied in `.env.server.local`; otherwise the bot's numeric ID is used. The popup flow validates the ID token directly and does not need a client secret. See [Telegram Login](https://core.telegram.org/bots/telegram-login).

Local Vite sign-in issues a random, eight-hour, HttpOnly, SameSite=Strict session cookie in server memory; restarting Vite requires signing in again. Hosted sessions use PostgreSQL and Secure cookies, as described below. Session restoration derives the admin role on the server. The roster endpoint returns `401` for missing/expired sessions and `403` for every other Telegram ID, before contacting Telegram. Logout revokes the session, including access to a roster request already in progress. Client changes to IDs, roles, localStorage, or preview profiles cannot authorize server requests.

Group approvals are stored in PostgreSQL through admin-only endpoints. LocalStorage does not grant access. Group discovery combines private server configuration, stored groups, and pending bot updates without acknowledging them or changing webhook settings. Telegram does not offer a general Bot API list of every historical group; refresh shortly after adding the bot so its pending membership update can be observed. Static GitHub Pages has no authentication server and provides no organization access. The private Node service described below packages these functions and the website together and is deployed on Vercel. Main Mini App configuration and a real hosted admin session are verified. Browser login reaches Telegram authorization, but the owner reports that its confirmation message has not arrived; hosted roster loading still needs an end-to-end check.

Choose **View members** on a group to see names, numeric Telegram IDs, usernames (when available), and roles, including an explicit Bot label. Search and refresh are available. Roster data is retrieved live by a server-only authenticated endpoint and is neither saved in the public source nor included in the static build. The local roster endpoint now requires the verified system-admin session. The prepared private-service build also supports member viewing through `/api/telegram/group-members`; hosted viewing is available after verified admin sign-in.

The HTTP Bot API provides administrator identities, a member count, and membership checks for known IDs, but has no general full-roster endpoint. The local service can show the members observed in pending bot updates and administrators, marking the list incomplete when its size differs from the total. It never confirms updates or changes an existing webhook. For a complete roster, the server uses Telegram's MTProto API with **bot authentication**, via Teleproto: [`messages.getFullChat`](https://core.telegram.org/method/messages.getFullChat) for a basic group and paginated [`channels.getParticipants`](https://core.telegram.org/method/channels.getParticipants) for a supergroup. Both methods support bots, subject to Telegram's permissions and participant visibility.

Copy `.env.server.example` to `.env.server.local` only if the latter does not already exist. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_GROUP_ID` privately. Add `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [Telegram's API development tools](https://my.telegram.org/apps) to enable full roster retrieval; these are separate from the BotFather token. The local service reads this file on each request. It authenticates the bot without a personal-account session, and reports incomplete retrieval instead of pretending all members are known. Keep every credential out of `VITE_` variables and Git.

The development endpoints accept only loopback connections with an exact local Host and matching/same-origin request headers. State-changing requests require an exact Origin. Member viewing additionally requires the verified administrator session and the privately configured group ID. It returns `Cache-Control: private, no-store` and is absent from static builds and `vite preview`. Do not expose this development service through a tunnel; deploy roster functionality only with server-verified admin access and production HTTPS session/cookie configuration.


### Private service hosting (step 2)

`npm run build:service` builds the frontend for the private server and bundles its Node entry into `dist-server/index.mjs`. `npm start` serves both the website and `/api/telegram` from one origin. A private-build marker prevents accidentally running an ordinary GitHub Pages build as this service. For a local production-style preview, keep `.env.server.local`, run these commands, and open `http://127.0.0.1:5180`. The existing Vite development server remains isolated on `127.0.0.1:5178`.

Anonymous visitors receive a generic Telegram sign-in shell without event details. Every compiled event bundle, poster and other built file requires a verified session plus either sole-admin status or a fresh positive membership check in a server-approved group. No approved groups means no attendee access. Logout, expired sessions, group revocation, departure, bans and removal of the bot withhold access; the frontend clears event UI when its access check fails. The public repository and its history still contain previously published event source. The main-branch Pages workflow replaces the public website with a generic redirect; it cannot retract historical copies. Group approvals and attendee authorization are implemented; real approved/denied/revoked attendee validation remains step 7.

The chosen host is **Vercel**. `vercel.json` selects a custom Node build with `npm run build:vercel`. The Build Output API creates one Node 22 function in Frankfurt with a 120-second request limit. Every route goes through that function. The frontend build, poster and dependencies stay **inside the function bundle**, with no public static output. Do not change the deployment to a normal Vite/static `dist` deployment: it would expose event assets before authentication. [Vercel private function files](https://vercel.com/docs/build-output-api/primitives), [function limits](https://vercel.com/docs/functions/limitations).

Production configuration is listed in `.env.service.example`. Add values to Vercel's **private environment settings**, not the frontend, repository, chat, or a deployed env file. Production ignores `.env.server.local`. `APP_ORIGIN` must be the actual stable HTTPS origin without a path/query, for example `https://YOUR-PROJECT.vercel.app`. Only that configured Host/Origin is accepted; alternate deployment URLs are denied. Configure the bot token, group ID and MTProto application credentials there. The optional `TELEGRAM_LOGIN_CLIENT_ID` defaults to the bot's numeric ID.

Use **one PostgreSQL database** for login sessions and approved groups. Configure its pooled `DATABASE_URL` privately; the hosted connection verifies TLS. PostgreSQL stores hashed eight-hour sessions, five-minute one-use challenges, and the small shared sign-in counter. The same `approved_groups` table stores discovered titles, approval state, the verified administrator who last changed it, and the change time. Run `npm run db:setup` with the direct `DATABASE_URL_UNPOOLED` before deployment. No Redis, cache service, queue, or worker is required. Both the standalone Node server and Vercel use the same database-backed implementation. Local previews without `DATABASE_URL` retain their development-only memory sessions. [PostgreSQL on Vercel](https://vercel.com/docs/storage), [node-postgres](https://node-postgres.com/features/pooling).

The hosted cookies have `__Host-` names, `Secure`, `HttpOnly`, `Path=/`, and `SameSite=None` to permit Telegram iframe sessions where the browser supports third-party cookies. State-changing API requests require the exact app Origin. API and asset requests reject cross-site initiators; document navigation from an external link can reach the sign-in page. Framing is limited to the app itself and `https://web.telegram.org`. Browser privacy settings can still block third-party cookies; real Telegram client validation remains step 7. The MTProto roster client connects per request and disconnects afterward; its optional per-instance connection cache is not used for attendee authentication.

Hosting status and remaining verification:

1. The Vercel project `damianoshibari-8924/ropelab` is created and linked to this checkout. The CLI account is verified. The GitHub integration is connected to `daaaamiano/tg-app`, with `main` as the production branch. Direct CLI deployment remains available. Framework preset **Other**, Node **22.x**, build command from `vercel.json`; do not override the output directory to `dist`.
2. The owner accepted marketplace terms and the free `ropelab-db` PostgreSQL database was created in Frankfurt with built-in Neon Auth disabled (Telegram handles login). It is connected to the project's production environment. All four application tables are initialized. Telegram credentials are stored as sensitive production variables; no local credential file is deployed. No paid plan was selected. Vercel Hobby is for personal non-commercial projects; the database has its own free-plan quota.
3. `APP_ORIGIN` is `https://ropelab.vercel.app`, and the verified Build Output API artifact is deployed at that stable address. Node 22 is pinned in the package and function settings. The owner reports setting **BotFather → Login Widget → Allowed URLs** and the bot's Main Mini App URL to this address.
4. Live checks confirm `/healthz`, the generic sign-in page, a PostgreSQL-backed login challenge with Secure HttpOnly cookies, logout, cross-origin rejection, and anonymous `401` responses for the event bundle, poster and roster. All 67 local tests and packaged-function checks pass. The working Mini App login has created a real admin session. Hosted roster loading and a real attendee access/revocation check remain to be verified. Groups start unapproved, so attendee access remains denied until the administrator explicitly approves a group.

For repeat deployment, run `vercel pull --environment production`, `vercel build --prod`, check the private artifact, then `vercel deploy --prebuilt --prod`. Vercel does not download sensitive production variables: pulled placeholders are for the build only, and runtime uses the server-side secret settings. Do not replace real production secrets with these placeholders. The CLI may append its standard error fallback after the guarded catch-all route; verification accepts only that exact fallback and still rejects public static output.

Local build commands: `npm run build:service && npm start` for the standalone preview, `npm run build:vercel` for the Vercel artifact, and `npm run test:db` to exercise the SQL and packaged function against a disposable local PostgreSQL instance using fake Telegram credentials. This requires local `initdb`/`pg_ctl` binaries and never touches an existing database. No hosting secrets are needed at build time; missing runtime secrets return a generic 503 and never expose the event.

The browser popup includes the explicit `origin` required by Telegram’s authorization endpoint. Telegram’s current published SDK omits that parameter and returns `origin required`, so both the public sign-in shell and React organization sign-in use the same small popup client. It accepts results only from `https://oauth.telegram.org` and the opened popup; JWT signature, identity and one-use nonce verification remain on the server. Blocked, closed and timed-out popups allow retry.

### Group approval policy

The organizer approves **groups** for app access and links an approved group to each event. Current members receive an invitation to events linked to their group after verified Telegram sign-in. New members start Pending; only a Going response confirms attendance. Membership in an unrelated approved group does not grant access to the event. Revoking a group removes its invitations and confirmed People on subsequent checks.

The backend stores discovered groups by numeric chat ID and their approval state. Bot membership updates supply discovery; group titles and bot administrator status are refreshed through the Bot API. Admin-only list/update endpoints verify the administrator role on the server and recheck it after Telegram lookups. Private event and poster endpoints check the visitor's verified Telegram ID against the **server-stored approved groups**; no approved groups means access denied. An authoritative positive membership check in the event’s linked approved group grants invitation access; an unavailable check must never be treated as a positive result. Existing sessions are checked again on private requests so revocations take effect.

The bot may remain a regular group member. Access is granted only when `getChatMember` returns a current-member result for the verified person; any unavailable lookup fails closed. Administrator rights are recommended for reliable checks, since Telegram only guarantees lookups of other users for administrators, but the current Test lookup succeeds without them. Approval requires the bot to belong to the group, and revocation remains available during Telegram outages. Discovery never approves a group automatically.

When a refresh, approval attempt, or attendee access check confirms that the bot has left or been kicked out, the backend removes the group and its saved approval. Explicit Telegram errors stating that the bot was kicked or is no longer a group member also trigger removal. Temporary lookup failures preserve saved groups for review and revocation. Adding the bot back allows discovery again, with approval required anew.

### Implementation checklist

Work on `codex/telegram-event-access`. Start with step 1; mark configuration complete only after verifying it.

- [ ] **1. Configure and verify the Telegram bot and approved group.**
  - [x] Confirm the event bot's display name, `@username`, and numeric bot ID. Verified via `getMe`: **RopeLab**, **@ropelab_bot**, ID **8961164008**. The local public bot username is configured.
  - [x] Organizer: add the bot to the intended group. Verified via `getChatMember`.
  - [ ] Optional: promote the bot for guaranteed membership-lookup reliability. Its verified current status is `member`; a regular member lookup succeeded on 8 October 2026.
  - [x] Confirm the group's title and numeric chat ID. Verified via `/check@ropelab_bot` update and `getChat`: **Test**, ID **-5492630327**, type `group`. The numeric ID is saved as `TELEGRAM_GROUP_ID` in private local configuration.
  - [ ] Store the bot token in private server configuration; verify bot identity with `getMe`, group identity with `getChat`, and bot administrator status with `getChatMember` using the bot ID. Do not paste the token into the checklist or frontend environment.
  - [x] Set the public bot username and Main Mini App URL; getMe confirms a Main Mini App and a real admin sign-in is recorded.
- [ ] **2. Choose backend hosting and set up the private service.** Prefer the frontend and API on one HTTPS origin.
  - [x] Prepare one Node service serving the private build and `/api/telegram` together, plus a generic public sign-in shell and `/healthz`.
  - [x] Protect every built asset and poster with the verified sole-admin session for the first private preview.
  - [x] Add exact origin checks, HTTPS production configuration, Secure host cookies, and sign-in throttling.
  - [x] Choose Vercel and prepare a private Node function build with no public event assets.
  - [x] Use one PostgreSQL database for sessions and group approvals, with atomic login challenges, shared logout and sign-in throttling.
  - [x] Verify local authentication boundaries and the packaged Vercel function.
  - [x] Confirm Vercel CLI account access and create/link the single `ropelab` backend project.
  - [x] Accept Neon marketplace terms, create/connect the one free PostgreSQL database and initialize its schema.
  - [x] Configure the stable app origin and sensitive production Telegram settings.
  - [x] Deploy the verified private artifact and check live health, SQL login challenges, logout, anonymous asset/roster denial and cross-origin rejection.
  - [x] Verify Main Mini App setup and a real hosted admin session.
  - [ ] Verify hosted roster loading and browser confirmation delivery.
- [x] **3a. Implement local server-verified Telegram authentication and the sole system administrator.** Validate raw launch data and freshness, or browser ID tokens and a one-use nonce; restore/revoke expiring sessions.
- [ ] **3b. Configure Telegram browser Allowed URLs and deploy the authenticated backend for the hosted site.**
- [x] **4. Implement sessions and group authorization.** Verify current membership before private responses, including for existing sessions.
- [x] Connect group approval/revocation UI to server-owned PostgreSQL state; discard browser-only preview approvals.
- [x] Add the group member UI with names and numeric IDs, search, refresh, and explicit incomplete-roster status.
- [x] Verify a complete real roster via MTProto credentials and the bot's group permissions: all 4 Test members retrieved on 7 October 2026 (3 people plus RopeLab).
- [x] Restrict the organization page and live roster to the server-verified sole admin (`17666600`); provide admin-only homepage links.
- [x] Connect the group UI to live bot discovery and server-stored approvals; deploy admin endpoints.
- [ ] **5. Protect event data and the poster.** Move them out of public frontend assets and serve them through authorized endpoints.
- [x] **6. Add frontend access states.** Sign-in, checking, denied, retry, session restoration, and clearing private data when session/access checks fail.
- [ ] **7. Validate and deploy.** Test approved/denied/revoked users and direct API/asset access; retire the public event deployment.

Step 1 is in progress. The private token and verified group ID are configured in Git-ignored `.env.server.local`. Bot identity and group identity are verified through the Bot API. The bot is currently a regular member of **Test**; administrator promotion is optional for reliability. Main Mini App setup and real admin sign-in are verified; its exact configured URL was reported by the owner. No updates were confirmed or webhook settings changed by the checks.

### Recommended access rule

Authenticate the visitor with Telegram and have the backend check current membership in any organizer-approved group, following the group approval policy above. A forwarded event link would show outsiders only a generic sign-in/access screen. Event-specific approval for a subset of members is an optional future policy, beyond the current group-wide approval requirement.

Use the verified **numeric Telegram user ID** as the authorization key. Usernames are optional and can change; keep them as display labels or organizer search helpers. Typing a username or ID into a form proves no identity. Telegram's [`User` contract](https://core.telegram.org/bots/api#user) provides the unique numeric ID. If the organizer only has usernames, collect IDs when people authenticate or interact with the bot and confirm the mapping before approving them. The Bot API has no general lookup that converts arbitrary personal usernames into user IDs.

| Policy | How approval works | Ongoing maintenance |
| --- | --- | --- |
| Current group membership (recommended here) | Backend checks the verified user ID in the configured group | Group membership is the source of truth |
| Fixed list of approved IDs | Backend checks a private allowlist | Organizer adds/removes IDs; leaving the group alone does not revoke access |
| Group membership plus event approval | Both checks must pass | Organizer maintains event approvals as well as the group |

Telegram's [`getChatMember`](https://core.telegram.org/bots/api#getchatmember) checks one known user; downloading a complete group roster is unnecessary. Make the bot a group administrator for reliable checks of other users. Accept `creator`, `administrator`, and `member`; accept `restricted` only when `is_member` is true. Deny `left` and `kicked`. A failed or timed-out membership check must withhold private data and offer retry.

### Changes this app needs

1. **Configure the bot and group.** Create/select the event bot, configure its HTTPS Main Mini App URL, add it as an administrator in the approved group, and capture that group's numeric chat ID. Keep the bot token and group configuration on the server. An organizer without group administrator cooperation can instead use the fixed-ID policy.
2. **Add a small backend.** Serve the app and `/api` on the same HTTPS origin to simplify cookies and avoid depending on cross-site cookies in Telegram webviews. A Node service or serverless functions can provide this. GitHub Pages alone cannot run these checks; it can still serve a generic public shell if a separately hosted API and its cookie/CORS arrangement are validated. Choose hosting before implementation; no particular provider is required.
3. **Verify Telegram authentication.** Inside the Mini App, send raw `Telegram.WebApp.initData` to `POST /auth/telegram`. On the server, verify it using [Telegram's signature validation rules](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app), reject missing/malformed user data and stale/future `auth_date` values, then use the verified user ID. A five-minute launch-data age limit with a small clock-skew allowance is a suggested app policy, not a Telegram requirement. Never authorize from `initDataUnsafe` or the current preview/demo profiles.
4. **Issue and enforce a session.** Set an expiring Secure, HttpOnly session cookie after authentication. Keep authentication separate from approval: a valid session can still receive `403`. Check the configured access rule before every private response. For this small group, start with a fresh membership lookup per private request; any later cache needs an explicit maximum revocation delay. Protect state-changing endpoints against CSRF, rate-limit authentication, bound Telegram request timeouts, and avoid logging tokens or raw launch data.
5. **Protect event content.** Private builds fetch details through `GET /api/telegram/events` after verified Telegram sign-in and group checks; the bundled frontend contains no event date or venue. The poster is served from the private function with the same event-group authorization rule. Remove real event details from public previews, build artifacts, metadata, and any sensitive hard-coded copy. Switching `VITE_DATA_SOURCE=api` alone does not establish this boundary. If the repository is public, event details in its files/history remain another source of disclosure; a new access gate cannot retract previously published copies.
6. **Add the access screen.** Before approval, show sign-in, checking, denied, and retry states without fetching/rendering event details. After approval, fetch the event. Distinguish `401` (sign-in required), `403` (not approved), and `503` (verification temporarily unavailable). Reload after Telegram sign-in, restore the server session on refresh, and clear event data on logout or loss of access. Calendar exports should use only authorized event data.
7. **Test and deploy.** Test a real approved member, an outsider with a forwarded link, a removed/banned member with an existing session, tampered/expired launch data, Telegram outages, logout/refresh, direct event/poster requests, and absence of private details in the public bundle. Verify the flow in Telegram mobile and desktop clients. Publish the private service and updated frontend together and retire the old public event/poster deployment.

Suggested API additions alongside the existing auth/logout/event contracts: `GET /auth/session` to restore the verified identity, and a protected poster endpoint. Return generic error bodies without event details; use `Cache-Control: private, no-store` for private responses and prevent shared CDN caching. The server derives the user ID from verified credentials, never from a request parameter claiming who the visitor is.

### Ordinary browser access and existing WorkOS sign-in

The smallest first release sends ordinary browser visitors to **Open in Telegram**, reusing the existing bot launch link. Telegram users need no extra email/password account.

To allow Telegram sign-in directly in a normal browser, add [Telegram Login / OpenID Connect](https://core.telegram.org/bots/telegram-login). Register allowed origins and redirect URLs in BotFather, keep the client secret server-side, and use an established OIDC library with state, PKCE, and token signature/issuer/audience/expiry validation. Request `openid profile` and use the validated profile `id` for the Bot API membership check; the OIDC `sub` is a separate identifier. Both browser and Mini App flows must reach the same authorization policy.

Existing WorkOS login verifies a separate web identity. It does not prove Telegram group membership. If retaining it for private access, require an explicit account-linking flow that verifies both accounts; email, display name, or a typed Telegram username cannot establish that link. Linking can be deferred if Telegram is the only required identity.

### Complexity and inputs

This is a **small to medium backend feature**, rather than a frontend toggle. Planning estimates for one developer familiar with this app, with bot/group/hosting access ready:

| Scope | Rough effort |
| --- | --- |
| Telegram-only access, one group or private ID list, sessions, protected event/poster, deployment and validation | 2–3 working days |
| Also sign in with Telegram in an ordinary browser | About 1–2 additional days |
| Organizer approval UI or verified WorkOS–Telegram account linking | Additional scope; estimate after defining the workflow |

The first version needs no attendee database or approval dashboard when group membership is the rule: private server configuration, event storage, and a session mechanism suffice. A small fixed allowlist can also live in private configuration. A database becomes useful for per-event approvals, audit history, account links, or organizer editing without redeploying.

Before implementation, choose current membership versus a fixed snapshot/subset, provide bot/group configuration through the hosting platform's secret settings, choose backend hosting, and decide whether ordinary-browser Telegram login is required in the first release. Viewing approval remains separate from booking, payment, and confirmation of attendance.

## Deployment

### GitHub Pages from `main`

`.github/workflows/deploy-pages.yml` tests and builds the private service on every push to `main`, then publishes only a generic redirect to https://ropelab.vercel.app. It also supports manual runs. GitHub Pages must use **GitHub Actions** as its deployment source.

The old URL https://daaaamiano.github.io/tg-app/ forwards visitors to Vercel. The Pages artifact contains only `index.html` and `404.html`; it never includes event bundles, posters, credentials, or the private server. URL fragments such as `#organization` are preserved by the JavaScript redirect. Generate this artifact locally with `node scripts/build-pages-redirect.mjs`.

`vercel.json` enables automatic Git deployments only for `main`. Each deployment runs the tests before building the private Vercel function; a failed test or build stops deployment. The existing GitHub Pages workflow continues publishing the public redirect.

Automatic deployment is active: **daaaamiano/tg-app** is connected to **damianoshibari-8924/ropelab**, and the verified production branch is `main`. Every new push to `main` builds and deploys production at https://ropelab.vercel.app. The function-only build keeps event assets behind Telegram authorization. Review the connection in **Vercel → Project Settings → Git** and branch tracking in **Project Settings → Environments → Production**. The CLI deployment procedure above remains available as a fallback.

### Other static hosts

Build with `npm run build` (or pass `-- --base /YOUR_PATH/` for a subdirectory), then serve `dist/` over HTTPS. Serve the base path's `login` route with `index.html` for AuthKit's login initiation flow. Set the production environment's WorkOS origin/redirects and configure a custom authentication domain as described above. `VITE_` settings are public and are included at build time; never include secret keys or bot tokens.
