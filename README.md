# 🫙 Pots — budgeting for people who've never budgeted

```
npm install
npm run dev        # works immediately in local demo mode (no Firebase needed)
```

## Concepts (user-facing language)
| Word in UI | Meaning | Firestore |
|---|---|---|
| **Plan** | anything that regularly comes in / goes out / is put aside | `users/{uid}/plans` |
| **Pot** | a category (Food, Home & Bills…) | `users/{uid}/categories` |
| **Stash** | a savings goal | `users/{uid}/stashes` |
| **Account** | card, bank, Payoneer, cash, savings account | `users/{uid}/accounts` |
| *(hidden)* | what happened to a single due item: confirmed / postponed / cancelled | `users/{uid}/payments/{planId}_{dueDate}` |

Occurrences are **never stored** — they're computed from plans ([src/schedule.ts](src/schedule.ts)), and a `payments` doc only exists once the user acts on one. User settings (main currency) live on `users/{uid}`.

## Firebase setup (≈10 min)
1. https://console.firebase.google.com → **Add project**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
3. **Build → Firestore Database → Create database** (production mode, nearest region).
4. **Project settings → General → Your apps → Web (</>)** → register → copy config into `.env.local` (see `.env.example`).
5. `npm i -g firebase-tools && firebase login && firebase use --add` (pick the project).
6. `firebase deploy --only firestore:rules`
7. Restart `npm run dev` → "Continue with Google" works. First login seeds default pots + a Cash account.

## Discord login
Firebase has no built-in Discord provider, so we use a tiny Cloud Function that turns a Discord OAuth code into a Firebase custom token ([functions/index.js](functions/index.js)). Requires the **Blaze** (pay-as-you-go) plan — free tier covers this easily.

1. https://discord.com/developers/applications → **New Application** → **OAuth2**:
   - copy **Client ID** and **Client Secret**
   - add Redirects: `http://localhost:5173/auth/discord` and `https://<your-domain>/auth/discord`
2. ```
   cd functions && npm install && cd ..
   firebase functions:secrets:set DISCORD_CLIENT_ID
   firebase functions:secrets:set DISCORD_CLIENT_SECRET
   firebase deploy --only functions
   ```
3. Google Cloud Console → **IAM** → give the function's service account (`<project-number>-compute@developer.gserviceaccount.com`) the role **Service Account Token Creator** (needed for `createCustomToken`).
4. Put `VITE_DISCORD_CLIENT_ID` and `VITE_DISCORD_FN_URL` (URL printed by deploy) into `.env.local`.

## Deploy
`npm run build && firebase deploy --only hosting` — then add the hosting domain under **Authentication → Settings → Authorized domains** (and to Discord redirects).

## Skeleton TODOs
- Currency conversion (pots currently sum amounts across currencies as-is)
- Onboarding wizard (income → rent → bills → first stash)
- Push/email reminders on due dates
- Editing pots (categories) in the UI
