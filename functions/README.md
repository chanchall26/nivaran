# functions

Firebase Cloud Functions (Node/TS) for Nivaran's Gemini pipeline. Two callable functions,
both region `asia-south1`, both requiring App Check + anonymous sign-in (same as the rest
of the app — see `web/src/lib/firebase.ts`):

- **`analyzePhoto`** — citizen submits a photo (`photoBase64`, `mimeType`); Gemini vision
  returns `{ sourceType, severity, confidence }`. The client attaches this result to a new
  `evidence` doc itself (the function does not write to Firestore).
- **`draftAlert`** — given a hotspot summary (`sourceType`, `severity`, `confidence`,
  `place`, `evidenceCount`), Gemini drafts one short, plain-language alert in three
  languages at once: `{ en, hi, pa }`.

## Setup

```bash
npm install
firebase functions:secrets:set GEMINI_API_KEY   # one-time, stores the key in Secret Manager
npm run build
firebase deploy --only functions
```

For local development, copy `.env.example` to `.env.local` (git-ignored) and run
`npm run serve` to use the emulator.

## Firestore doc shapes

See `nivaran_parallel_tracks.md` (Track 2 section) for the `evidence`/`hotspots`/`signals`
collection shapes that Track 4's frontend reads.
