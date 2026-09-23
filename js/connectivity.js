/* ==========================================================================
   CONNECTIVITY.JS
   --------------------------------------------------------------------------
   Tracks browser online/offline state and drives the small connectivity
   badge shown in every header. Also exposes a helper the POS page uses to
   enforce the 20-minute offline cutoff (see pos.js) — past that point we
   stop taking sales until reconnected, so two devices can't both sell the
   last of a low-stock item while offline and desync stock counts.
   ========================================================================== */

const OFFLINE_GRACE_MS = 20 * 60 * 1000; // 20 minutes
let lastOnlineAt = Date.now();

function updateConnBadge() {
  const badge = document.getElementById("connBadge");
  const text = document.getElementById("connText");
  if (!badge || !text) return;

  if (navigator.onLine) {
    badge.className = "conn-badge conn-online";
    text.textContent = "Online";
  } else {
    badge.className = "conn-badge conn-offline";
    text.textContent = "Offline — changes will sync";
  }
}

/* Returns true once we've been offline longer than the grace period. */
function isOfflineLockedOut() {
  if (navigator.onLine) return false;
  return Date.now() - lastOnlineAt > OFFLINE_GRACE_MS;
}

function getOfflineDurationMs() {
  if (navigator.onLine) return 0;
  return Date.now() - lastOnlineAt;
}

window.addEventListener("online", () => {
  lastOnlineAt = Date.now();
  updateConnBadge();
  window.dispatchEvent(new CustomEvent("mc:online"));
});

window.addEventListener("offline", () => {
  updateConnBadge();
  window.dispatchEvent(new CustomEvent("mc:offline"));
});

document.addEventListener("DOMContentLoaded", updateConnBadge);
