/* ==========================================================================
   FIREBASE-CONFIG.JS
   --------------------------------------------------------------------------
   PLACEHOLDER — replace the firebaseConfig object below with the config
   object from your Firebase project:
   Firebase Console → Project settings → General → Your apps → SDK setup
   and configuration → "Config".

   It looks like this (values will differ):

   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "misty-code-pos.firebaseapp.com",
     projectId: "misty-code-pos",
     storageBucket: "misty-code-pos.appspot.com",
     messagingSenderId: "123456789000",
     appId: "1:123456789000:web:abcdef123456"
   };

   Nothing else in this file needs to change.
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyAACs_nT6_AqwBdF9nSFVl-CcDiyKzhpZw",
  authDomain: "mistybest.firebaseapp.com",
  projectId: "mistybest",
  storageBucket: "mistybest.firebasestorage.app",
  messagingSenderId: "236020663058",
  appId: "1:236020663058:web:9a1891d3c9fe9d0428e9cb",
};

firebase.initializeApp(firebaseConfig);

// Shared handles used across every page's JS files.
const auth = firebase.auth();
const db = firebase.firestore();

// Enable offline persistence so the POS keeps working through brief
// connectivity drops. Sales/reads queue locally and sync automatically
// once back online. If multiple tabs are open, persistence only attaches
// to one of them — that's expected and fine for a single-till setup.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Offline persistence: multiple tabs open, persistence enabled in another tab only.");
  } else if (err.code === "unimplemented") {
    console.warn("Offline persistence not supported in this browser.");
  }
});

/* ===== Fixed account emails =============================================
   Emails are fixed on purpose (kept simple per design decision) — create
   these two users manually in Firebase Console → Authentication → Users,
   then set their role in the `users` collection in Firestore (see below).
   If you ever need to change an email, do it directly in Firebase Console;
   there's no in-app flow for it.
   ========================================================================== */
const FIXED_EMAILS = {
  seller: "seller@mistycode.local",
  manager: "manager@mistycode.local",
};

/* Firestore structure this app expects (create the first two docs manually
   the first time, or let manager.js's Settings tab create businessConfig
   for you on first save):

   users/{uid}                -> { role: "seller" | "manager", displayName: "..." }
   businessConfig/main        -> { companyName, address, phone, currency: "KSh" }
   categories/{id}            -> { name }
   products/{id}              -> see manager.js for full shape
   sales/{id}                 -> see pos.js for full shape
   stockAdjustments/{id}      -> see manager.js for full shape
*/
