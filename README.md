# Hours Ledger

Hours Ledger is a private, offline-first PWA for keeping the everyday hours for one job. It supports one-tap full and half shifts, duration-only entries, exact time ranges, multi-day bulk text, and a persistent clock-in timer. Reports can cover a day, week, month, or custom range and export as CSV, PDF, or a complete JSON backup.

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
