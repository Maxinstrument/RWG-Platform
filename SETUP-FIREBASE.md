# RWG CRM — Firebase Setup (Step 1 of going live)

**Time:** ~15 minutes · **Cost:** $0 (free "Spark" plan, no credit card) · **Account:** temperan.carlos@gmail.com

Firebase is the free Google service that will (a) handle secure logins and (b) be the one shared database all agents and you read/write. You only do the clicks below once — then paste me the **config snippet** and I wire up the rest.

---

## Part A — Create the project
1. Go to **https://console.firebase.google.com** and sign in with **temperan.carlos@gmail.com**.
2. Click **Create a project** (or **Add project**).
3. Project name: **`rwg-crm`** → **Continue**.
4. **Google Analytics**: toggle it **OFF** ("Enable Google Analytics for this project") — we don't need it → **Continue / Create project**.
5. Wait ~30 sec for "Your new project is ready" → **Continue**.

## Part B — Register the Web App and copy the config  ⭐ (this is what I need)
1. On the project home page, find the **Web** button — a `</>` icon labeled "Add an app." Click it.
2. App nickname: **`RWG CRM Web`**.
3. **Do NOT** check "Also set up Firebase Hosting" → click **Register app**.
4. Firebase shows a code block that looks like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIza………",
     authDomain: "rwg-crm.firebaseapp.com",
     projectId: "rwg-crm",
     storageBucket: "rwg-crm.appspot.com",
     messagingSenderId: "0000000000",
     appId: "1:0000:web:abcdef……"
   };
   ```
   👉 **Copy that entire `firebaseConfig = { … }` block and paste it to me in chat.**
   (This is safe to share — it only identifies your project. Security is enforced by the rules I'll add, not by hiding these values.)
5. Click **Continue to console**.

## Part C — Turn on Email/Password login
1. Left sidebar → **Build → Authentication** → **Get started**.
2. Open the **Sign-in method** tab.
3. Click **Email/Password** in the providers list.
4. Toggle the **first switch (Email/Password) to Enabled**. Leave "Email link (passwordless)" OFF. → **Save**.

## Part D — Create the database (Firestore)
1. Left sidebar → **Build → Firestore Database** → **Create database**.
2. Location: pick a US region — **`nam5 (United States)`** or **`us-east1`** (closest to Florida). → **Next**.
3. Start in **Production mode** → **Create**.
   *(It'll look "locked" for now — that's correct. I'll give you the exact security rules to paste in Part E once the code is ready.)*

## Part E — Publish the security rules ✅ (do this now — code is wired)
These lock the database down: agents can only read/write **their own** leads; only the owner/admin can approve agents or see everything.
1. Firebase Console → **Build → Firestore Database → Rules** tab.
2. **Delete** whatever's there and **paste the entire contents of `firestore.rules`** (in this CRM folder).
3. Click **Publish**.

---

## ✅ When you're done, send me:
1. The **`firebaseConfig` object** from Part B.
2. A quick confirmation that **Email/Password is enabled** (Part C) and **Firestore is created** (Part D).

## Notes
- **Your master login:** your email (temperan.carlos@gmail.com) will be set as the **owner/admin** in code — when you sign into the app with it, you get full access automatically. Agents sign up and wait for your approval.
- **No billing:** everything we use (Email/Password auth + Firestore) is on the free tier. If Firebase ever asks for a billing/Blaze upgrade, you don't need it for this.
- **Your data, your account:** all lead data lives in *your* Firebase project — you own and control it.
