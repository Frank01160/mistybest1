/* ==========================================================================
   REPORTS.JS — sales reports logic
   ========================================================================== */

let repUser = null;
let allSales = [];
let filteredSales = [];
let allCashTx = [];
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
  listenToCashTx();
})();

/* ----- Normalizing payments: new split-payment sales use `payments[]`;
   sales made before this feature only have a single `paymentMethod` +
   `total`. This turns either shape into the same array so every other
   function below can stay simple. Per the agreed default, old "mobile"
   sales count as Shop M-Pesa. ---------------------------------------------- */
function getSalePayments(sale) {
  if (Array.isArray(sale.payments) && sale.payments.length > 0) return sale.payments;
  if (sale.paymentMethod === "cash") return [{ method: "cash", amount: sale.total || 0 }];
  return [{ method: "mobile_transfer", channel: "shop", amount: sale.total || 0 }];
}

function paymentSummaryLabel(sale) {
  return getSalePayments(sale)
    .map((p) => {
      if (p.method === "cash") return `Cash ${formatKsh(p.amount)}`;
      if (p.method === "mobile_transfer") return `${p.channel === "manager" ? "Manager" : "Shop"} M-Pesa ${formatKsh(p.amount)}`;
      return `${p.bankName || "Withdrawal"} ${formatKsh(p.amount)}`;
    })
    .join(" + ");
}

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
  document.getElementById("fromDateInput").addEventListener("change", () => { applyFilters(); applyCashTxFilter(); });
  document.getElementById("toDateInput").addEventListener("change", () => { applyFilters(); applyCashTxFilter(); });
  document.getElementById("paymentFilterSelect").addEventListener("change", applyFilters);
  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setDefaultDateRange(btn.dataset.range);
      applyFilters();
      applyCashTxFilter();
    });
  });
}

function listenToSales() {
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

/* Separately tracks how much of today's/any day's sales cash got claimed by
   withdrawals that ran short of the standalone withdrawal-cash pool — used
   only for the reconciliation line, independent of the sales query above. */
function listenToCashTx() {
  db.collection("cashTransactions")
    .orderBy("createdAt", "desc")
    .limit(2000)
    .onSnapshot(
      (snap) => {
        allCashTx = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        applyCashTxFilter();
      },
      (err) => console.error(err)
    );
}

let filteredDeductedFromSalesCash = 0;
function applyCashTxFilter() {
  const fromVal = document.getElementById("fromDateInput").value;
  const toVal = document.getElementById("toDateInput").value;
  filteredDeductedFromSalesCash = allCashTx
    .filter((tx) => {
      if (tx.type !== "withdrawal" || !(tx.fundedFromSalesCash > 0)) return false;
      if (!tx.createdAt) return false;
      const d = tx.createdAt.toDate();
      if (fromVal && d < startOfDay(fromVal)) return false;
      if (toVal && d > endOfDay(toVal)) return false;
      return true;
    })
    .reduce((sum, tx) => sum + tx.fundedFromSalesCash, 0);
  renderReconcileCard();
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

    if (payment !== "all") {
      const payments = getSalePayments(s);
      const matches =
        (payment === "cash" && payments.some((p) => p.method === "cash")) ||
        (payment === "shop_mpesa" && payments.some((p) => p.method === "mobile_transfer" && p.channel === "shop")) ||
        (payment === "manager_mpesa" && payments.some((p) => p.method === "mobile_transfer" && p.channel === "manager")) ||
        (payment === "mobile_withdrawal" && payments.some((p) => p.method === "mobile_withdrawal"));
      if (!matches) return false;
    }
    return true;
  });

  renderSummary();
  renderTable();
}

function renderSummary() {
  const total = filteredSales.reduce((sum, s) => sum + (s.total || 0), 0);
  let cash = 0, shopMpesa = 0, managerMpesa = 0;

  filteredSales.forEach((s) => {
    getSalePayments(s).forEach((p) => {
      if (p.method === "cash" || p.method === "mobile_withdrawal") cash += p.amount || 0;
      else if (p.method === "mobile_transfer" && p.channel === "manager") managerMpesa += p.amount || 0;
      else if (p.method === "mobile_transfer") shopMpesa += p.amount || 0;
    });
  });

  document.getElementById("summaryTotal").textContent = formatKsh(total);
  document.getElementById("summaryCount").textContent = filteredSales.length;
  document.getElementById("summaryCash").textContent = formatKsh(cash);
  document.getElementById("summaryShopMpesa").textContent = formatKsh(shopMpesa);
  document.getElementById("summaryManagerMpesa").textContent = formatKsh(managerMpesa);

  filteredCashGross = cash;
  renderReconcileCard();
}

let filteredCashGross = 0;
function renderReconcileCard() {
  const card = document.getElementById("cashReconcileCard");
  if (filteredCashGross === 0 && filteredDeductedFromSalesCash === 0) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  document.getElementById("reconcileGross").textContent = formatKsh(filteredCashGross);
  document.getElementById("reconcileDeducted").textContent = `− ${formatKsh(filteredDeductedFromSalesCash)}`;
  document.getElementById("reconcileNet").textContent = formatKsh(Math.max(0, filteredCashGross - filteredDeductedFromSalesCash));
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
      const itemCount = (s.items || []).length;
      return `
      <tr class="sale-row" data-sale-id="${s.id}">
        <td>${escapeHtml(s.receiptNumber || "—")}</td>
        <td>${s.createdAt ? formatDateTime(s.createdAt.toDate()) : "—"}</td>
        <td>${escapeHtml(s.customerName || "Walk-in")}</td>
        <td>${itemCount} item${itemCount === 1 ? "" : "s"}</td>
        <td>${formatKsh(s.discount || 0)}</td>
        <td>${formatKsh(s.total || 0)}</td>
        <td>${escapeHtml(paymentSummaryLabel(s))}</td>
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

  const paymentLines = getSalePayments(sale)
    .map((p) => {
      const label = p.method === "cash" ? "Cash" : p.method === "mobile_transfer" ? `${p.channel === "manager" ? "Manager" : "Shop"} M-Pesa` : `${p.bankName || "Withdrawal"} (mobile withdrawal)`;
      return `<div class="sale-detail-line"><span>${escapeHtml(label)}</span><span>${formatKsh(p.amount)}</span></div>`;
    })
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
    <div class="sale-detail-divider"></div>
    ${paymentLines}
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
      paymentSummaryLabel(s),
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
    paymentSummaryLabel(s),
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
