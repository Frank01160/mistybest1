/* ==========================================================================
   REPORTS.JS — sales reports logic
   ========================================================================== */

let repUser = null;
let allSales = [];
let filteredSales = [];
let businessInfoR = { companyName: "Misty Code" };

(async function init() {
  repUser = await requireAuth(["seller", "manager"]);
  db.collection("businessConfig")
    .doc("main")
    .onSnapshot((doc) => {
      if (doc.exists) businessInfoR = { ...businessInfoR, ...doc.data() };
    });

  setDefaultDateRange("today");
  wireFilters();
  wireExports();
  wireSaleDetail();
  listenToSales();
})();

function setDefaultDateRange(range) {
  const now = new Date();
  let from, to;
  if (range === "today") {
    from = to = now;
  } else if (range === "week") {
    from = new Date(now);
    from.setDate(now.getDate() - now.getDay());
    to = now;
  } else if (range === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = now;
  }
  document.getElementById("fromDateInput").value = formatDateInput(from);
  document.getElementById("toDateInput").value = formatDateInput(to);
}

function wireFilters() {
  document.getElementById("fromDateInput").addEventListener("change", applyFilters);
  document.getElementById("toDateInput").addEventListener("change", applyFilters);
  document.getElementById("paymentFilterSelect").addEventListener("change", applyFilters);
  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDefaultDateRange(btn.dataset.range);
      applyFilters();
    });
  });
}

function listenToSales() {
  // Listen to a generous recent window client-side filtered further by the date pickers,
  // to keep this simple and avoid composite-index requirements.
  db.collection("sales")
    .orderBy("createdAt", "desc")
    .limit(2000)
    .onSnapshot(
      (snap) => {
        allSales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        applyFilters();
      },
      (err) => {
        console.error(err);
        showToast("Couldn't load sales.", "danger");
      }
    );
}

function applyFilters() {
  const fromVal = document.getElementById("fromDateInput").value;
  const toVal = document.getElementById("toDateInput").value;
  const payment = document.getElementById("paymentFilterSelect").value;

  filteredSales = allSales.filter((s) => {
    if (!s.createdAt) return false;
    const d = s.createdAt.toDate();
    if (fromVal && d < startOfDay(fromVal)) return false;
    if (toVal && d > endOfDay(toVal)) return false;
    if (payment !== "all" && s.paymentMethod !== payment) return false;
    return true;
  });

  renderSummary();
  renderTable();
}

function renderSummary() {
  const total = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  const cash = filteredSales.filter((s) => s.paymentMethod === "cash").reduce((sum, s) => sum + (s.total || 0), 0);
  const mobile = filteredSales.filter((s) => s.paymentMethod === "mobile").reduce((sum, s) => sum + (s.total || 0), 0);

  document.getElementById("summaryTotal").textContent = formatKsh(total);
  document.getElementById("summaryCount").textContent = filteredSales.length;
  document.getElementById("summaryCash").textContent = formatKsh(cash);
  document.getElementById("summaryMobile").textContent = formatKsh(mobile);
}

function renderTable() {
  const tbody = document.getElementById("salesTableBody");
  const emptyEl = document.getElementById("salesEmpty");

  if (filteredSales.length === 0) {
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  tbody.innerHTML = filteredSales
    .map((s) => {
      const itemCount = (s.items || []).reduce((sum, i) => sum + 1, 0);
      return `
      <tr class="sale-row" data-sale-id="${s.id}">
        <td>${escapeHtml(s.receiptNumber || "—")}</td>
        <td>${s.createdAt ? formatDateTime(s.createdAt.toDate()) : "—"}</td>
        <td>${escapeHtml(s.customerName || "Walk-in")}</td>
        <td>${itemCount} item${itemCount === 1 ? "" : "s"}</td>
        <td>${formatKsh(s.discount || 0)}</td>
        <td>${formatKsh(s.total || 0)}</td>
        <td><span class="badge ${s.paymentMethod === "cash" ? "badge-cash" : "badge-mobile"}">${s.paymentMethod === "cash" ? "Cash" : "Mobile"}</span></td>
        <td><span class="badge ${s.servedByRole === "manager" ? "badge-manager" : "badge-seller"}">${escapeHtml(s.servedByName || "—")}</span></td>
      </tr>`;
    })
    .join("");
}

/* ----- Sale detail modal ---------------------------------------------------------- */
function wireSaleDetail() {
  document.getElementById("salesTableBody").addEventListener("click", (e) => {
    const row = e.target.closest(".sale-row");
    if (!row) return;
    const sale = filteredSales.find((s) => s.id === row.dataset.saleId);
    if (sale) openSaleDetail(sale);
  });
  document.getElementById("saleDetailClose").addEventListener("click", () => {
    document.getElementById("saleDetailOverlay").classList.add("hidden");
  });
}

function openSaleDetail(sale) {
  document.getElementById("saleDetailTitle").textContent = `Receipt #${sale.receiptNumber}`;
  const items = (sale.items || [])
    .map(
      (l) => `
      <div class="sale-detail-line">
        <span>${escapeHtml(l.name)} — ${l.qty} ${escapeHtml(l.unitLabel)}</span>
        <span>${formatKsh(l.lineTotal)}</span>
      </div>`
    )
    .join("");

  document.getElementById("saleDetailBody").innerHTML = `
    <div class="sale-detail-line"><span>Date</span><span>${sale.createdAt ? formatDateTime(sale.createdAt.toDate()) : "—"}</span></div>
    <div class="sale-detail-line"><span>Customer</span><span>${escapeHtml(sale.customerName || "Walk-in")}</span></div>
    <div class="sale-detail-line"><span>Served by</span><span>${escapeHtml(sale.servedByName)} (${sale.servedByRole === "manager" ? "Main" : "Seller"})</span></div>
    <div class="sale-detail-divider"></div>
    ${items}
    <div class="sale-detail-divider"></div>
    <div class="sale-detail-line"><span>Subtotal</span><span>${formatKsh(sale.subtotal)}</span></div>
    <div class="sale-detail-line"><span>Discount</span><span>${formatKsh(sale.discount)}</span></div>
    <div class="sale-detail-line" style="font-weight:600;"><span>Total</span><span>${formatKsh(sale.total)}</span></div>
    <div class="sale-detail-line"><span>Payment</span><span>${sale.paymentMethod === "cash" ? "Cash" : "Mobile"}</span></div>
  `;
  document.getElementById("saleDetailOverlay").classList.remove("hidden");
}

/* ----- Exports -------------------------------------------------------------------------- */
function wireExports() {
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("exportPdfBtn").addEventListener("click", exportPdf);
}

function exportCsv() {
  if (filteredSales.length === 0) {
    showToast("No sales in this range to export.", "warning");
    return;
  }
  const rows = [["Receipt #", "Date", "Customer", "Items", "Subtotal", "Discount", "Total", "Payment", "Served by"]];
  filteredSales.forEach((s) => {
    rows.push([
      s.receiptNumber,
      s.createdAt ? formatDateTime(s.createdAt.toDate()) : "",
      s.customerName || "Walk-in",
      (s.items || []).map((i) => `${i.name} (${i.qty} ${i.unitLabel})`).join("; "),
      s.subtotal,
      s.discount,
      s.total,
      s.paymentMethod,
      s.servedByName,
    ]);
  });
  downloadCsv(`sales-report-${document.getElementById("fromDateInput").value}-to-${document.getElementById("toDateInput").value}.csv`, rows);
}

function exportPdf() {
  if (filteredSales.length === 0) {
    showToast("No sales in this range to export.", "warning");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const from = document.getElementById("fromDateInput").value;
  const to = document.getElementById("toDateInput").value;
  const total = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);

  doc.setFontSize(16);
  doc.text(businessInfoR.companyName || "Misty Code", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Sales report: ${from} to ${to}`, 14, 25);
  doc.text(`Total: ${formatKsh(total)}  |  Transactions: ${filteredSales.length}`, 14, 31);

  const rows = filteredSales.map((s) => [
    s.receiptNumber,
    s.createdAt ? formatDateTime(s.createdAt.toDate()) : "",
    s.customerName || "Walk-in",
    (s.items || []).length,
    formatKsh(s.discount || 0),
    formatKsh(s.total || 0),
    s.paymentMethod === "cash" ? "Cash" : "Mobile",
    s.servedByName || "",
  ]);

  doc.autoTable({
    startY: 37,
    head: [["Receipt #", "Date", "Customer", "Items", "Discount", "Total", "Payment", "Served by"]],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [27, 73, 101] },
  });

  doc.save(`sales-report-${from}-to-${to}.pdf`);
}
