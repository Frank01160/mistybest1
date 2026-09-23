/* ==========================================================================
   WITHDRAWALS.JS — Deposit / Withdraw logic
   ========================================================================== */

let wdUser = null;
let wdBanks = [];
let allTransactions = [];
let filteredTransactions = [];
let selectedWdType = "deposit";
let activeBankFilter = "all";

(async function init() {
  wdUser = await requireAuth(["seller", "manager"]);
  wireTabs();
  wireEntryForm();
  wireConfirmModal();
  wireHistoryFilters();
  wireExports();
  listenToBanks();
  setDefaultHistoryRange();
  listenToTransactions();
})();

/* ----- Tabs ------------------------------------------------------------------- */
function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
      document.getElementById(`panel-${btn.dataset.tab}`).classList.remove("hidden");
    });
  });
}

/* ----- Banks (read-only here; managed in Manager → Banks) -------------------- */
function listenToBanks() {
  db.collection("banks")
    .orderBy("name")
    .onSnapshot((snap) => {
      wdBanks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderBankSelect();
      renderBankChips();
    });
}

function renderBankSelect() {
  const select = document.getElementById("wdBankSelect");
  const current = select.value;
  select.innerHTML =
    `<option value="">Select a bank…</option>` +
    wdBanks.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  if ([...select.options].some((o) => o.value === current)) select.value = current;
  validateEntryForm();
}

function renderBankChips() {
  const wrap = document.getElementById("bankChips");
  wrap.querySelectorAll("[data-bank]:not([data-bank='all'])").forEach((el) => el.remove());
  wdBanks.forEach((b) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.dataset.bank = b.id;
    chip.textContent = b.name;
    chip.addEventListener("click", () => setBankFilter(b.id));
    wrap.appendChild(chip);
  });
}

function setBankFilter(bankId) {
  activeBankFilter = bankId;
  document.querySelectorAll("#bankChips .chip").forEach((c) => c.classList.toggle("active", c.dataset.bank === bankId));
  applyHistoryFilters();
}

document.getElementById("bankChips").addEventListener("click", (e) => {
  if (e.target.dataset.bank === "all") setBankFilter("all");
});

/* ----- Entry form -------------------------------------------------------------- */
function wireEntryForm() {
  document.querySelectorAll(".wd-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wd-type-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedWdType = btn.dataset.wdType;
    });
  });

  document.getElementById("wdBankSelect").addEventListener("change", validateEntryForm);
  document.getElementById("wdAmountInput").addEventListener("input", validateEntryForm);

  document.getElementById("wdSubmitBtn").addEventListener("click", openConfirmModal);
}

function validateEntryForm() {
  const bankId = document.getElementById("wdBankSelect").value;
  const amount = parseInt(document.getElementById("wdAmountInput").value, 10);
  const valid = !!bankId && Number.isInteger(amount) && amount > 0;
  document.getElementById("wdSubmitBtn").disabled = !valid;
}

/* ----- Confirm modal ------------------------------------------------------------ */
function wireConfirmModal() {
  document.getElementById("wdConfirmClose").addEventListener("click", closeConfirmModal);
  document.getElementById("wdConfirmCancel").addEventListener("click", closeConfirmModal);
  document.getElementById("wdConfirmSave").addEventListener("click", saveTransaction);
}

function openConfirmModal() {
  const bankId = document.getElementById("wdBankSelect").value;
  const bank = wdBanks.find((b) => b.id === bankId);
  const amount = parseInt(document.getElementById("wdAmountInput").value, 10);
  const customerName = document.getElementById("wdCustomerInput").value.trim();

  if (!bank || !amount || amount <= 0) return;

  document.getElementById("wdConfirmBody").innerHTML = `
    <div class="wd-confirm-amount" style="color: ${selectedWdType === "deposit" ? "var(--color-success)" : "var(--color-danger)"};">
      ${selectedWdType === "deposit" ? "Deposit" : "Withdrawal"} — ${formatKsh(amount)}
    </div>
    <div class="wd-confirm-line"><span>Bank / channel</span><span>${escapeHtml(bank.name)}</span></div>
    <div class="wd-confirm-line"><span>Customer</span><span>${escapeHtml(customerName || "Not provided")}</span></div>
    <div class="wd-confirm-line"><span>Entered by</span><span>${escapeHtml(wdUser.displayName)}</span></div>
  `;
  document.getElementById("wdConfirmOverlay").classList.remove("hidden");
}

function closeConfirmModal() {
  document.getElementById("wdConfirmOverlay").classList.add("hidden");
}

async function saveTransaction() {
  const bankId = document.getElementById("wdBankSelect").value;
  const bank = wdBanks.find((b) => b.id === bankId);
  const amount = parseInt(document.getElementById("wdAmountInput").value, 10);
  const customerName = document.getElementById("wdCustomerInput").value.trim();

  if (!bank || !amount) return;

  const saveBtn = document.getElementById("wdConfirmSave");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const bankRef = db.collection("banks").doc(bank.id);
    await db.runTransaction(async (t) => {
      const bankDoc = await t.get(bankRef);
      if (!bankDoc.exists) throw new Error("This bank no longer exists.");
      const nextSeq = (bankDoc.data().seqCounter || 0) + 1;
      const transactionNumber = String(nextSeq).padStart(4, "0") + bank.code;

      t.update(bankRef, { seqCounter: nextSeq });
      t.set(db.collection("cashTransactions").doc(), {
        type: selectedWdType,
        bankId: bank.id,
        bankName: bank.name,
        bankCode: bank.code,
        amount,
        customerName: customerName || null,
        transactionNumber,
        enteredBy: wdUser.uid,
        enteredByName: wdUser.displayName,
        enteredByRole: wdUser.role,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    showToast(`${selectedWdType === "deposit" ? "Deposit" : "Withdrawal"} saved.`, "success");
    closeConfirmModal();
    document.getElementById("wdAmountInput").value = "";
    document.getElementById("wdCustomerInput").value = "";
    document.getElementById("wdBankSelect").value = "";
    validateEntryForm();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't save the transaction.", "danger");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Confirm";
  }
}

/* ----- History ------------------------------------------------------------------- */
function setDefaultHistoryRange() {
  const today = new Date();
  document.getElementById("wdFromDate").value = formatDateInput(today);
  document.getElementById("wdToDate").value = formatDateInput(today);
}

function wireHistoryFilters() {
  document.getElementById("wdFromDate").addEventListener("change", applyHistoryFilters);
  document.getElementById("wdToDate").addEventListener("change", applyHistoryFilters);
  document.getElementById("wdTypeFilter").addEventListener("change", applyHistoryFilters);
}

function listenToTransactions() {
  db.collection("cashTransactions")
    .orderBy("createdAt", "desc")
    .limit(2000)
    .onSnapshot(
      (snap) => {
        allTransactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        applyHistoryFilters();
      },
      (err) => {
        console.error(err);
        showToast("Couldn't load transaction history.", "danger");
      }
    );
}

function applyHistoryFilters() {
  const fromVal = document.getElementById("wdFromDate").value;
  const toVal = document.getElementById("wdToDate").value;
  const typeVal = document.getElementById("wdTypeFilter").value;

  filteredTransactions = allTransactions.filter((tx) => {
    if (!tx.createdAt) return false;
    const d = tx.createdAt.toDate();
    if (fromVal && d < startOfDay(fromVal)) return false;
    if (toVal && d > endOfDay(toVal)) return false;
    if (typeVal !== "all" && tx.type !== typeVal) return false;
    if (activeBankFilter !== "all" && tx.bankId !== activeBankFilter) return false;
    return true;
  });

  renderHistorySummary();
  renderHistoryTable();
}

function renderHistorySummary() {
  const deposits = filteredTransactions.filter((t) => t.type === "deposit").reduce((sum, t) => sum + t.amount, 0);
  const withdrawals = filteredTransactions.filter((t) => t.type === "withdrawal").reduce((sum, t) => sum + t.amount, 0);
  document.getElementById("wdSummaryDeposits").textContent = formatKsh(deposits);
  document.getElementById("wdSummaryWithdrawals").textContent = formatKsh(withdrawals);
  document.getElementById("wdSummaryCount").textContent = filteredTransactions.length;
}

function renderHistoryTable() {
  const tbody = document.getElementById("wdHistoryBody");
  const emptyEl = document.getElementById("wdHistoryEmpty");

  if (filteredTransactions.length === 0) {
    tbody.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  tbody.innerHTML = filteredTransactions
    .map(
      (tx) => `
      <tr>
        <td>${escapeHtml(tx.transactionNumber)}</td>
        <td>${tx.createdAt ? formatDateTime(tx.createdAt.toDate()) : "—"}</td>
        <td><span class="wd-type-badge ${tx.type}">${tx.type === "deposit" ? "Deposit" : "Withdrawal"}</span></td>
        <td>${escapeHtml(tx.bankName)}</td>
        <td>${formatKsh(tx.amount)}</td>
        <td>${escapeHtml(tx.customerName || "—")}</td>
        <td>${escapeHtml(tx.enteredByName || "—")}</td>
      </tr>`
    )
    .join("");
}

/* ----- Exports -------------------------------------------------------------------- */
function wireExports() {
  document.getElementById("wdExportCsvBtn").addEventListener("click", exportWdCsv);
  document.getElementById("wdExportPdfBtn").addEventListener("click", exportWdPdf);
}

function exportWdCsv() {
  if (filteredTransactions.length === 0) {
    showToast("No transactions in this range to export.", "warning");
    return;
  }
  const rows = [["Transaction #", "Date", "Type", "Bank", "Amount", "Customer", "Entered by"]];
  filteredTransactions.forEach((tx) => {
    rows.push([
      tx.transactionNumber,
      tx.createdAt ? formatDateTime(tx.createdAt.toDate()) : "",
      tx.type,
      tx.bankName,
      tx.amount,
      tx.customerName || "",
      tx.enteredByName || "",
    ]);
  });
  downloadCsv(`deposits-withdrawals-${document.getElementById("wdFromDate").value}-to-${document.getElementById("wdToDate").value}.csv`, rows);
}

function exportWdPdf() {
  if (filteredTransactions.length === 0) {
    showToast("No transactions in this range to export.", "warning");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const from = document.getElementById("wdFromDate").value;
  const to = document.getElementById("wdToDate").value;
  const deposits = filteredTransactions.filter((t) => t.type === "deposit").reduce((sum, t) => sum + t.amount, 0);
  const withdrawals = filteredTransactions.filter((t) => t.type === "withdrawal").reduce((sum, t) => sum + t.amount, 0);

  doc.setFontSize(16);
  doc.text("Deposits & Withdrawals", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Range: ${from} to ${to}`, 14, 25);
  doc.text(`Deposits: ${formatKsh(deposits)}   Withdrawals: ${formatKsh(withdrawals)}   Transactions: ${filteredTransactions.length}`, 14, 31);

  const rows = filteredTransactions.map((tx) => [
    tx.transactionNumber,
    tx.createdAt ? formatDateTime(tx.createdAt.toDate()) : "",
    tx.type === "deposit" ? "Deposit" : "Withdrawal",
    tx.bankName,
    formatKsh(tx.amount),
    tx.customerName || "—",
    tx.enteredByName || "",
  ]);

  doc.autoTable({
    startY: 37,
    head: [["Transaction #", "Date", "Type", "Bank", "Amount", "Customer", "Entered by"]],
    body: rows,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [27, 73, 101] },
  });

  doc.save(`deposits-withdrawals-${from}-to-${to}.pdf`);
}
