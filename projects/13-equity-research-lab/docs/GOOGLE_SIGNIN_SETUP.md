# Google sign-in setup (about 10 minutes, one time)

The app signs you in with your Google account. Only the emails you list can enter. Until these variables exist the app keeps its old behavior and the sign-in page says so.

## 1. Create the Google OAuth client
1. Go to https://console.cloud.google.com/ and create or choose a project.
2. **APIs & Services → OAuth consent screen**: choose *External*, app name "Equity Research Lab", your email as support/developer contact. Add yourself under *Test users* (leave the app in Testing; no review needed for one user).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type *Web application*.
4. **Authorized redirect URIs** — add exactly: `https://13-equity-research-lab.vercel.app/api/auth/callback` (and `http://localhost:3000/api/auth/callback` if you run it locally).
5. Copy the **Client ID** and **Client secret**.

## 2. Set Vercel environment variables (Production, and Preview if you use previews)
| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from step 1 |
| `GOOGLE_CLIENT_SECRET` | from step 1 |
| `AUTH_SECRET` | 32+ random characters, e.g. `openssl rand -base64 32` |
| `OWNER_EMAILS` | your Google email (comma-separate to allow more) |

Redeploy. Open the site: you should be sent to **Sign in → Continue with Google**.

## 3. Apply the database migration
Run `supabase/migrations/006_account_claim.sql` in the Supabase SQL editor. On first sign-in from the browser you used before, earlier reports are attached to your account automatically.

## Notes
- Sessions last 7 days. Sign out is in the top navigation.
- `OWNER_ACCESS_KEY` is no longer needed once Google sign-in is configured; the brokerage refresh uses your Google session.
- Never put these values in the repo, Notion or chat.
