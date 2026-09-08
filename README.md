## BlumeCore Production Deployment Checklist

BlumeCore is a single-owner, private admin application. Before deploying to production or preview on Vercel, verify the following checklist:

### 1. Environment Variables Configuration (Vercel Production & Preview)
Ensure the following variables are defined in both **Production** and **Preview** environments in the Vercel Project Settings:

- `ADMIN_FIREBASE_UID`: `Vkp7vtLHSuPZyXU8ohOZqvRoeE22`
  > **CRITICAL**: This variable must **NEVER** have a `NEXT_PUBLIC_` prefix. If undefined or empty, server routes and layout will fail-closed and reject all access.
- `CRON_SECRET`: High-entropy random secret (e.g. generated via `openssl rand -hex 32`). Used exclusively by Vercel Cron on `/api/cron/github-sync`.
- `FIREBASE_ADMIN_PROJECT_ID`: Firebase project identifier.
- `FIREBASE_ADMIN_CLIENT_EMAIL`: Firebase service account client email.
- `FIREBASE_ADMIN_PRIVATE_KEY`: Firebase service account private key (with escaped `\n`).
- `GITHUB_TOKEN`: GitHub personal access token with repository read/write permissions.
- `GITHUB_ALLOWED_OWNER`: GitHub user or organization allowed for mod repository management.

### 2. Firestore & Storage Security Rules Deployment
Deploy the single-owner locked security rules to Firebase:

```bash
# Deploy both Firestore and Storage rules
npx firebase-tools deploy --only firestore:rules,storage
```

Both `firestore.rules` and `storage.rules` enforce `request.auth.uid == "Vkp7vtLHSuPZyXU8ohOZqvRoeE22"` and reject all non-owner/unauthenticated operations.

### 3. Vercel Cron Job Verification
- Verify that `vercel.json` includes the automated synchronization job:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/github-sync",
        "schedule": "0 3 * * *"
      }
    ]
  }
  ```
- In Vercel Project Settings > Cron Jobs, confirm that `/api/cron/github-sync` is active.

### 4. Git Security Verification
- Ensure that `.env*` and `*serviceAccount*.json` files are **never committed** to Git (verified in `.gitignore`).

---

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Testing
- `npm test`: Runs all unit and propagation test suites.
- `npm run test:emulator`: Runs security rules and concurrent transaction outbox tests against real Cloud Firestore Emulator.

