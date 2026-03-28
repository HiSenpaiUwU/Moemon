# Moemon Arena

Moemon Arena is a browser-based monster roguelike foundation inspired by the run flow of Pok\u00e9Rogue. It ships as a dependency-light Node 22 app with:

- persistent accounts with register, login, session cookies, and password reset
- SQLite-backed save data for users, runs, storage, inventory, and admin logs
- a generated content set of `550` monsters and `800` moves
- `Classic`, `Endless`, and `Challenge` modes
- between-wave rewards and shop flow
- persistent storage and starter selection
- admin web controls plus CLI admin commands

## Run It

1. Copy [.env.example](/c:/Moemon/.env.example) to `.env` if you want to override defaults.
2. Start the app:

```powershell
npm start
```

3. Open `http://localhost:3000`.

The first registered account becomes the admin account automatically.

## Deployment Note

On Vercel, the bundled SQLite file runs from `/tmp`, which is ephemeral. The app now keeps a signed browser backup for the current device and also writes a full world snapshot to `MOEMON_WORLD_BACKUP_PATH`, then reloads that snapshot on boot if the SQLite file is empty. That protects player/admin progress, party slots, EXP, runs, inventory, and sessions on the same host, but for true cross-device persistence you should still use durable storage outside the function filesystem.

## Password Reset Email

Password reset works through SMTPS when these env vars are set:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

For Gmail, use SMTP over port `465` with an app password.

If SMTP is not configured, the app still generates a reset link and prints it to the server console for development.

## Admin

Admin controls are available in the `/admin` page.

CLI commands are also available:

```powershell
node src/tools/admin.js help
node src/tools/admin.js create-admin admin@example.com StrongPass123!
node src/tools/admin.js list-users
node src/tools/admin.js grant-cash 2 5000
node src/tools/admin.js grant-item 2 capture-orb 10
node src/tools/admin.js grant-monster 2 astravault-omega 40
```

## Test

Run the smoke test:

```powershell
npm test
```

That check boots the server, registers a fresh account, opens the hub, starts a run, and verifies the battle screen renders.

