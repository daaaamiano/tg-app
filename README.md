# Private Rope Jam · Web + Telegram

A minimal React + TypeScript event companion for a private, friendly shibari gathering. The app works in a normal browser and as a Telegram Mini App. Web sign-in uses WorkOS AuthKit; Telegram retains its profile/launch-data flow.

## Run

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5178. `npm run build` creates `dist/`, and `npm test` runs the authentication, event archive, and calendar tests.

## The announced gathering

- **Private Rope Jam** — Friday 16 October 2026, 19:00–21:00, Barcelona time.
- Arrivals from **18:30**, up to 30 minutes early.
- **8.50€** per person; **10 people**, all vetted, invite-only.
- **LabCultural**, Carrer del Rector Triadó, 11, Sants, Barcelona.
- One suspension point; check with the host before using it.
- Explicit rules covering consent, pronouns, privacy, discrimination, stop signals, sobriety, and respectful shared use of the room.

The details come from the supplied poster and organizer instructions. The photo is used as provided at `public/private-rope-jam-poster.jpg`. No attendee identities are shown. House rules include an adults-only agreement.

A single red thread winds through the homepage margins with gentle continuous drift, scroll parallax, and mouse movement. A fixed mask leaves breathing room around the text and poster, including after responsive layout changes. Separate desktop and portrait phone paths keep it visible on both. On phones, the mask follows individual text lines, and stronger idle drift and scroll movement work without a mouse or touch permissions. Movement stops when reduced motion is preferred or the tab is hidden. The poster itself is unchanged.

**All events** has Upcoming and Past views. There is only one announced event; no fake history or future dates. Events move to Past after their end time, using timestamp offsets. Add actual events in `src/data/event.ts`; `src/lib/events.ts` handles ordering, local-time display, and calendar export.

**Add to calendar** downloads an `.ics` file with the correct time zone conversion. The calendar entry is not a reservation. There is no payment, booking, attendee approval, or check-in backend. Signing in does not confirm attendance; the host does.

## Files

- `src/App.tsx`: event homepage, event browser, and account dialog.
- `src/data/event.ts`: announced events and house rules.
- `src/components/RopeParallax.tsx`: decorative motion, without an animation dependency.
- `src/lib/events.ts`: chronological event lists, Barcelona-time formatting, Maps links, and calendar download.
- `src/components/AppAuthProvider.tsx`: web account integration.
- `src/lib/api.ts`: future event and Telegram authentication APIs.
- `src/styles.css`: responsive, warm monochrome visual design.

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

The app uses Vite's base path as the OAuth callback and the `login` route under that path to begin login from invitation/reset links. On static hosting, serve that login route with `index.html`; the Pages workflow creates `login/index.html` for this purpose. Do not mix `localhost` and `127.0.0.1`: if you use `localhost`, add that origin and its corresponding redirect/sign-out/login URLs too.

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

Inside Telegram, **Continue with Telegram** reads the host's profile. Until the auth API is connected, this is a clearly labeled profile preview. The backend must validate raw Telegram `initData` before trusting an identity. See [Telegram's validation documentation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

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

## Deployment

### GitHub Pages from `main`

`.github/workflows/deploy-pages.yml` tests, builds, and deploys the app on every push to `main`. It also supports manual runs from the Actions tab. In the repository's **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. Push `main` to trigger the first deployment.

The site URL is https://daaaamiano.github.io/tg-app/. The workflow reads the Pages base path, so scripts, the favicon, the poster, and authentication redirects stay under `/tg-app/`. It creates `login/index.html` so the login initiation URL works without a server rewrite.

For a local preview of the Pages build:

```sh
npm run build -- --base /tg-app/
npm run preview -- --base /tg-app/
```

Open http://127.0.0.1:4173/tg-app/. The additional static login entry is created by the deployment workflow.

Set any public build settings in **Settings → Secrets and variables → Actions → Variables** using the names from `.env.example`. The workflow supports `VITE_DATA_SOURCE`, `VITE_API_BASE_URL`, `VITE_TELEGRAM_BOT_USERNAME`, `VITE_WORKOS_CLIENT_ID`, `VITE_WORKOS_API_HOSTNAME`, and `VITE_WORKOS_DEV_MODE`. With no variables, the event site runs with local event data and web sign-in remains unconfigured. `.env.local` is not uploaded or used by GitHub Actions.

To enable WorkOS on Pages, add these URLs in the matching WorkOS environment:

| Setting | Pages value |
| --- | --- |
| CORS origin | `https://daaaamiano.github.io` |
| Redirect URI / default redirect | `https://daaaamiano.github.io/tg-app/` |
| Sign-out URI / default sign-out | `https://daaaamiano.github.io/tg-app/` |
| Initiate login URI | `https://daaaamiano.github.io/tg-app/login/` |

Use staging development mode or a production custom authentication domain as described above. Configure Telegram's Main Mini App URL separately in BotFather.

### Other static hosts

Build with `npm run build` (or pass `-- --base /YOUR_PATH/` for a subdirectory), then serve `dist/` over HTTPS. Serve the base path's `login` route with `index.html` for AuthKit's login initiation flow. Set the production environment's WorkOS origin/redirects and configure a custom authentication domain as described above. `VITE_` settings are public and are included at build time; never include secret keys or bot tokens.
