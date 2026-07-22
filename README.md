# Hours Ledger

Hours Ledger is a private, offline-first PWA for keeping the everyday hours for one job. It supports one-tap full and half shifts, duration-only entries, exact time ranges, multi-day bulk text, and a persistent clock-in timer. Reports can cover a day, week, month, or custom range and export as CSV, PDF, or a complete JSON backup.

Opt-in workplace logging can start and finish a shift from on-device location checks at the two configured workplaces. It uses separate arrival and departure boundaries plus repeated accurate readings to reduce GPS drift. Web geolocation only runs while the app has permission and is active; mobile browsers may pause checks in the background and stop them when the PWA is fully closed. Reopening the app resumes the check.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Verify a production build

```bash
npm test
npm run build
npm run preview
```

## Data and privacy

Records are stored in the browser's IndexedDB and remain available offline. There is no account or cloud sync in v1. Clearing site data can remove the ledger, so use **Settings → Download backup** periodically.

Pay values are simple estimates based on snapshotted regular hourly rates; the app does not implement overtime, deductions, or payroll rules.
