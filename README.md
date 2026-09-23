# Misty Code POS

A point-of-sale system for local businesses — sell, track stock, and see
reports, from a browser, anywhere. Runs entirely on free-tier Firebase +
Vercel + GitHub.

## What's in this project

```
index.html              Sign-in (seller / manager)
pages/
  pos.html               Selling screen
  manager.html            Inventory, categories, stock history, settings
  reports.html             Sales reports
css/
  theme.css               Every color/font/spacing token — edit this to re-skin
  animations.css           Shared motion
  index.css, pos.css, manager.css, reports.css   Per-page layout
js/
  firebase-config.js       ⚠️ Needs your real Firebase project config (see below)
  utils.js, logo.js, connectivity.js, auth.js, nav.js
  index.js, pos.js, manager.js, reports.js
firestore.rules           Security rules — enforce roles server-side
vercel.json                Vercel static deploy config
```

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it (e.g. `misty-code-pos`) → keep it on the free **Spark** plan.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Build → Authentication → Users → Add user.** Create exactly two accounts:
   - `seller@mistycode.local` (or your own domain) with a password
   - `manager@mistycode.local` with a password
   - (You can use real email addresses instead if you'd like the password-reset emails to land somewhere real — recommended.)
4. **Build → Firestore Database → Create database** → start in **production mode** → pick a region close to your users.
5. In **Firestore → Rules**, paste in the contents of `firestore.rules` from this project and **Publish**.
6. Manually create two documents so the accounts know their role — in **Firestore → Data**:
   - Collection `users` → Document ID = the seller's UID (copy it from the Authentication tab) → field `role` (string) = `seller`, field `displayName` (string) = `Seller`.
   - Collection `users` → Document ID = the manager's UID → field `role` = `manager`, field `displayName` = `Main`.
7. Create the business config doc (or just do this later from the Manager → Settings tab once deployed):
   - Collection `businessConfig` → Document ID = `main` → fields: `companyName` = `Misty Code`, `address` = `""`, `phone` = `""`, `currency` = `KSh`.

## 2. Get your web app config

**Project settings (gear icon) → General → Your apps → Add app → Web (</>together>).**
Register the app (no need for Firebase Hosting), then copy the `firebaseConfig` object shown.

Open `js/firebase-config.js` in this project and replace the placeholder object with your real one. That's the only file you need to edit to connect this project to your Firebase backend.

If your fixed account emails aren't `seller@mistycode.local` / `manager@mistycode.local`, also update the `FIXED_EMAILS` object further down in that same file.

## 3. Push to GitHub

```bash
cd misty-pos
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/misty-code-pos.git
git push -u origin main
```

## 4. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Other** (it's a static site, no build step).
3. Deploy. You'll get a URL like `misty-code-pos.vercel.app`.
4. Back in Firebase Console → **Authentication → Settings → Authorized domains** → add your Vercel domain (and your custom domain later, if you add one), or `sendPasswordResetEmail` and sign-in will be blocked from that origin.

## 5. First login

Visit your Vercel URL → choose **Manager** → sign in with the manager account you created → go to the **Inventory** tab and add your first category and product → switch to **Sell** and you're ready to go.

## Re-skinning for a different business

Everything visual lives in `css/theme.css`. Change the `--color-brand-primary` / `--color-brand-secondary` values at the top for a new palette, and the logo badge + wordmark update automatically from whatever company name is set in **Manager → Settings → Business details** — no image editing needed.

## A few operational notes

- **Offline:** the POS keeps working through short connectivity drops (Firestore's offline cache), but locks selling after 20 minutes offline to keep stock counts accurate — it unlocks itself once the connection returns.
- **Password resets:** since account emails are fixed and can't be changed in-app, use **Manager → Settings → Account access** to send either account a password-reset email; they set the new password by following the link.
- **Archiving, not deleting:** removing a product from the **Inventory** tab archives it (hides it from POS) rather than deleting it outright, so past sales/reports referencing it stay accurate.
- **Receipts:** printing uses the browser's print dialog (`window.print()`) styled to an ~80mm receipt width — pick "Save as PDF" there if you want a digital copy, or send to a connected receipt printer if you have one.
