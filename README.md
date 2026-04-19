# unfair_berlin

A Next.js app with an interactive Berlin map for reporting places that remove fair negative reviews.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## What's inside

- `src/app/page.tsx` — map, pins, submission form, moderation queue, and statistics
- `src/app/globals.css` — styles for the map and panel UI
- `src/app/api/notes/route.ts` — API endpoint `/api/notes`
- `src/lib/db.ts` — SQLite initialization and queries
