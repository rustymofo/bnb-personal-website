# bnb-personal-website
Standalone personal booking website product for indiidual BnB/host owners, sold separately from the MyBnStays marketplace.

## CI/CD

GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`** — runs on every push/PR to `main`: installs deps, runs `npm test`, runs `npm run build`, uploads the `dist/` artifact. This is the required status check.
- **`preview.yml`** — on every PR, builds and deploys a Vercel preview and comments the URL on the PR.
- **`deploy.yml`** — on every push to `main`: deploys the production build to Vercel, and (only when `firestore.rules` / `storage.rules` changed) deploys Firebase security rules.

### Required repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
| --- | --- |
| `VERCEL_TOKEN` | https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | Run `vercel link` locally once, then read `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | Same source as above |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project settings → Service accounts → Generate new private key, then `base64 -i key.json | tr -d '\n'` |
| `FIREBASE_PROJECT_ID` | e.g. `bnb-personal-website` |

The Firebase rules deploy step is skipped automatically (not failed) until `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_PROJECT_ID` are set, so the pipeline works for the Vercel side immediately even before Firebase secrets are added.
