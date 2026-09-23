/* ==========================================================================
   LOGO.JS — auto-generated wordmark
   --------------------------------------------------------------------------
   Builds the [Initials badge] + Company Name lockup shown in every header
   and on the login screen, purely from the business's company name. No
   image upload needed — change the name in Settings and the logo updates
   everywhere automatically.
   ========================================================================== */

const STOPWORDS = new Set(["the", "and", "of", "a", "an", "&"]);

function getInitials(companyName) {
  if (!companyName || !companyName.trim()) return "MC";

  const words = companyName
    .trim()
    .split(/\s+/)
    .filter((w) => !STOPWORDS.has(w.toLowerCase()));

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return "MC";
}

/* Applies the logo (badge initials + name) to every element on the page
   carrying the standard IDs. Call this once businessConfig has loaded. */
function applyLogo(companyName) {
  const initials = getInitials(companyName);
  document.querySelectorAll("#logoBadge, .logo-badge").forEach((el) => {
    el.textContent = initials;
  });
  document.querySelectorAll("#logoName, .logo-name").forEach((el) => {
    el.textContent = companyName || "Misty Code";
  });
  document.title = document.title.replace(/^[^—]+/, (companyName || "Misty Code") + " ");
}

/* Loads businessConfig/main from Firestore and applies it. Falls back to
   "Misty Code" if the doc doesn't exist yet (first run, before Settings
   has been saved once). */
function loadAndApplyLogo() {
  db.collection("businessConfig")
    .doc("main")
    .get()
    .then((doc) => {
      const name = doc.exists ? doc.data().companyName : "Misty Code";
      applyLogo(name || "Misty Code");
    })
    .catch(() => {
      applyLogo("Misty Code");
    });
}
