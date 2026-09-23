/* ==========================================================================
   UTILS.JS — shared helpers used across every page
   ========================================================================== */

/* ----- Currency ------------------------------------------------------------
   All sale totals are whole KSh, no decimals. Round-half-up to the nearest
   shilling (300.2 -> 300, 300.5 -> 301, 300.51 -> 301).
   ========================================================================= */
function roundKsh(amount) {
  return Math.floor(amount + 0.5);
}

function formatKsh(amount) {
  const rounded = roundKsh(amount);
  return "KSh " + rounded.toLocaleString("en-KE");
}

/* ----- Unit conversion ------------------------------------------------------
   Canonical stock for a "double unit" product is always stored in MINOR
   units (e.g. total kg). Major-unit quantities are derived for display.
   ========================================================================= */
function minorToMajor(minorQty, minorPerMajor) {
  if (!minorPerMajor) return 0;
  return minorQty / minorPerMajor;
}

function majorToMinor(majorQty, minorPerMajor) {
  return majorQty * minorPerMajor;
}

/* Format a double-unit stock quantity for display, e.g. "10 sacks (200 kg)" */
function formatDoubleUnitStock(minorQty, product) {
  const majorQty = minorToMajor(minorQty, product.minorPerMajor);
  const majorWhole = Math.floor(majorQty);
  const remainderMinor = roundKsh(minorQty - majorWhole * product.minorPerMajor);
  let parts = [];
  if (majorWhole > 0) parts.push(`${majorWhole} ${pluralize(product.majorUnitName, majorWhole)}`);
  if (remainderMinor > 0 || parts.length === 0) parts.push(`${remainderMinor} ${product.minorUnitName}`);
  return parts.join(" ");
}

function pluralize(word, count) {
  if (count === 1) return word;
  // simple heuristic pluralization — good enough for unit names like sack/carton/bottle
  if (/[sxz]$|[^aeiou]h$/i.test(word)) return word + "es";
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
}

/* Fraction presets were used for major-unit selling in an earlier version;
   major units now sell as whole numbers only (see pos.js), so this list
   isn't used anymore — left removed intentionally, not an oversight. */

/* ----- Receipt numbering -----------------------------------------------------
   Sequential, zero-padded to 7 digits, never resets. Stored as a counter
   doc so it's safe(ish) across sessions. Not perfectly collision-proof
   under true concurrent writes, but fine for a single-till setup.
   ========================================================================= */
async function getNextReceiptNumber() {
  const counterRef = db.collection("counters").doc("receiptNumber");
  const next = await db.runTransaction(async (t) => {
    const doc = await t.get(counterRef);
    const current = doc.exists ? doc.data().value : 0;
    const updated = current + 1;
    t.set(counterRef, { value: updated }, { merge: true });
    return updated;
  });
  return String(next).padStart(7, "0");
}

/* ----- Dates ------------------------------------------------------------------ */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}
function formatDateTime(date) {
  return new Date(date).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDateInput(date) {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

/* ----- Toasts ------------------------------------------------------------------ */
function showToast(message, type = "info") {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 200ms ease";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

/* ----- Debounce (search inputs) ------------------------------------------------- */
function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

/* ----- Simple HTML escaping (defense against product names etc rendering as HTML) */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ----- CSV export ---------------------------------------------------------------- */
function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
