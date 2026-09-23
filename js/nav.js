/* ==========================================================================
   NAV.JS
   --------------------------------------------------------------------------
   Small shared helper for the app-shell pages (pos/manager/reports).
   Keeps the header logo live: if the manager updates the company name in
   Settings on another device/tab, this page's header updates without a
   refresh being needed.
   ========================================================================== */

function watchBusinessConfig() {
  db.collection("businessConfig")
    .doc("main")
    .onSnapshot((doc) => {
      const name = doc.exists ? doc.data().companyName : "Misty Code";
      applyLogo(name || "Misty Code");
    });
}

document.addEventListener("DOMContentLoaded", () => {
  // Runs after requireAuth() resolves in each page's own script, but it's
  // harmless to attach the listener immediately — Firestore rules only
  // allow reads once signed in, so this simply waits quietly until then.
  watchBusinessConfig();
});
