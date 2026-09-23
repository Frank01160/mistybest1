/* ==========================================================================
   POS.JS — selling screen logic
   ========================================================================== */

let currentUser = null;
let allProducts = [];
let allCategories = [];
let activeCategory = "all";
let searchTerm = "";
let basket = []; // { lineId, productId, name, unitSold, unitLabel, qty, minorUnitsDeducted, pricePerUnitSold, lineTotal }
let selectedPaymentMethod = "cash";
let businessInfo = { companyName: "Misty Code", address: "", phone: "" };

// ----- Modal state for the product being configured -----------------------
let modalProduct = null;
let modalUnitMode = null; // "major" | "minor" | "single"
let modalQty = 0;

(async function init() {
  currentUser = await requireAuth(["seller", "manager"]);
  loadBusinessInfo();
  listenToCategories();
  listenToProducts();
  wireStaticUI();
  setInterval(checkOfflineLockout, 15000);
  checkOfflineLockout();
})();

function loadBusinessInfo() {
  db.collection("businessConfig")
    .doc("main")
    .onSnapshot((doc) => {
      if (doc.exists) businessInfo = { ...businessInfo, ...doc.data() };
    });
}

/* ----- Data loading ---------------------------------------------------------- */
function listenToCategories() {
  db.collection("categories")
    .orderBy("name")
    .onSnapshot((snap) => {
      allCategories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCategoryChips();
    });
}

function listenToProducts() {
  db.collection("products")
    .where("active", "==", true)
    .onSnapshot(
      (snap) => {
        allProducts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        document.getElementById("productSkeleton")?.remove();
        renderProductGrid();
      },
      (err) => {
        console.error(err);
        showToast("Couldn't load products. Check your connection.", "danger");
      }
    );
}

/* ----- Category chips --------------------------------------------------------- */
function renderCategoryChips() {
  const wrap = document.getElementById("categoryChips");
  const existing = wrap.querySelectorAll("[data-category]:not([data-category='all'])");
  existing.forEach((el) => el.remove());

  allCategories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    btn.addEventListener("click", () => setActiveCategory(cat.id));
    wrap.appendChild(btn);
  });
}

function setActiveCategory(categoryId) {
  activeCategory = categoryId;
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.category === categoryId);
  });
  renderProductGrid();
}

document.getElementById("categoryChips").addEventListener("click", (e) => {
  if (e.target.dataset.category === "all") setActiveCategory("all");
});

/* ----- Search ------------------------------------------------------------------- */
document.getElementById("searchInput").addEventListener(
  "input",
  debounce((e) => {
    searchTerm = e.target.value.trim().toLowerCase();
    renderProductGrid();
  }, 200)
);

/* ----- Product grid --------------------------------------------------------------- */
function getBasketReservedMinor(productId) {
  return basket
    .filter((line) => line.productId === productId)
    .reduce((sum, line) => sum + line.minorUnitsDeducted, 0);
}

function renderProductGrid() {
  const grid = document.getElementById("productGrid");
  const emptyEl = document.getElementById("productEmpty");

  let list = allProducts;
  if (activeCategory !== "all") {
    list = list.filter((p) => p.categoryId === activeCategory);
  }
  if (searchTerm) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm) ||
        (p.categoryName || "").toLowerCase().includes(searchTerm)
    );
  }

  grid.querySelectorAll(".product-card").forEach((el) => el.remove());

  if (list.length === 0) {
    emptyEl.classList.remove("hidden");
    return;
  }
  emptyEl.classList.add("hidden");

  list.forEach((product) => {
    const reserved = getBasketReservedMinor(product.id);
    const available = product.stockMinorUnits - reserved;
    const isOut = available <= 0;
    const isLow = !isOut && available <= (product.lowStockThreshold || 0);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "product-card";
    card.disabled = isOut;

    const priceLabel =
      product.unitType === "single"
        ? `${formatKsh(product.price)} / ${product.unitName}`
        : `${formatKsh(product.pricePerMajor)}/${product.majorUnitName} · ${formatKsh(product.pricePerMinor)}/${product.minorUnitName}`;

    const stockLabel =
      product.unitType === "single"
        ? `${roundKsh(available)} ${pluralize(product.unitName, roundKsh(available))} left`
        : `${formatDoubleUnitStock(available, product)} left`;

    card.innerHTML = `
      <span class="product-name">${escapeHtml(product.name)}</span>
      <span class="product-price">${priceLabel}</span>
      <span class="product-stock ${isOut ? "out" : isLow ? "low" : ""}">${isOut ? "Out of stock" : stockLabel}</span>
    `;
    card.addEventListener("click", () => openUnitModal(product));
    grid.appendChild(card);
  });
}

/* ----- Unit / quantity modal ---------------------------------------------------- */
const unitModalOverlay = document.getElementById("unitModalOverlay");

function openUnitModal(product) {
  modalProduct = product;
  modalQty = 0;
  document.getElementById("unitModalTitle").textContent = product.name;
  document.getElementById("qtyError").classList.add("hidden");

  const toggle = document.getElementById("unitToggle");
  const majorSection = document.getElementById("majorUnitQty");
  const minorSection = document.getElementById("minorUnitQty");
  const singleSection = document.getElementById("singleUnitQty");
  toggle.innerHTML = "";
  majorSection.classList.add("hidden");
  minorSection.classList.add("hidden");
  singleSection.classList.add("hidden");

  if (product.unitType === "single") {
    modalUnitMode = "single";
    singleSection.classList.remove("hidden");
    document.getElementById("singleUnitLabel").textContent = `Quantity (${product.unitName})`;
    const input = document.getElementById("singleQtyInput");
    input.value = 1;
    input.max = product.stockMinorUnits - getBasketReservedMinor(product.id);
    input.oninput = () => {
      modalQty = parseFloat(input.value) || 0;
      validateModalQty();
    };
    modalQty = 1;
  } else {
    modalUnitMode = "major";
    toggle.innerHTML = `
      <button type="button" class="active" data-mode="major">Sell by ${product.majorUnitName}</button>
      <button type="button" data-mode="minor">Sell by ${product.minorUnitName}</button>
    `;
    toggle.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        toggle.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        modalUnitMode = btn.dataset.mode;
        majorSection.classList.toggle("hidden", modalUnitMode !== "major");
        minorSection.classList.toggle("hidden", modalUnitMode !== "minor");
        if (modalUnitMode === "major") {
          modalQty = parseInt(document.getElementById("majorQtyInput").value, 10) || 0;
        } else {
          modalQty = parseFloat(document.getElementById("minorQtyInput").value) || 0;
        }
        validateModalQty();
      });
    });

    // Major unit section — whole numbers only (e.g. full sacks)
    document.getElementById("majorUnitLabel").textContent = `Quantity (${product.majorUnitName})`;
    const majorInput = document.getElementById("majorQtyInput");
    const maxMajor = Math.floor((product.stockMinorUnits - getBasketReservedMinor(product.id)) / product.minorPerMajor);
    majorInput.value = maxMajor > 0 ? 1 : 0;
    majorInput.min = 1;
    majorInput.max = Math.max(maxMajor, 1);
    modalQty = maxMajor > 0 ? 1 : 0;

    function setMajorQty(value) {
      const clamped = Math.max(1, Math.min(Math.round(value), Math.max(maxMajor, 1)));
      majorInput.value = clamped;
      modalQty = clamped;
      validateModalQty();
    }
    majorInput.oninput = () => setMajorQty(parseInt(majorInput.value, 10) || 1);
    document.getElementById("majorStepDown").onclick = () => setMajorQty((parseInt(majorInput.value, 10) || 1) - 1);
    document.getElementById("majorStepUp").onclick = () => setMajorQty((parseInt(majorInput.value, 10) || 1) + 1);

    // Minor unit section — decimal allowed (e.g. loose kg)
    document.getElementById("minorUnitLabel").textContent = `Quantity (${product.minorUnitName})`;
    const minorInput = document.getElementById("minorQtyInput");
    minorInput.value = "";
    minorInput.oninput = () => {
      modalQty = parseFloat(minorInput.value) || 0;
      validateModalQty();
    };

    majorSection.classList.remove("hidden");
  }

  updateStockAvailableNote();
  unitModalOverlay.classList.remove("hidden");
}

function updateStockAvailableNote() {
  const note = document.getElementById("stockAvailableNote");
  const product = modalProduct;
  const available = product.stockMinorUnits - getBasketReservedMinor(product.id);
  if (product.unitType === "single") {
    note.textContent = `${roundKsh(available)} ${pluralize(product.unitName, roundKsh(available))} available.`;
  } else {
    note.textContent = `${formatDoubleUnitStock(available, product)} available.`;
  }
}

function getModalMinorDeduction() {
  const product = modalProduct;
  if (modalUnitMode === "single") return modalQty;
  if (modalUnitMode === "major") return majorToMinor(modalQty, product.minorPerMajor);
  return modalQty; // minor
}

function validateModalQty() {
  const product = modalProduct;
  const available = product.stockMinorUnits - getBasketReservedMinor(product.id);
  const deduction = getModalMinorDeduction();
  const errorEl = document.getElementById("qtyError");
  const addBtn = document.getElementById("unitModalAdd");

  const invalid = deduction <= 0 || deduction > available + 0.0001;
  errorEl.classList.toggle("hidden", !invalid);
  if (deduction > available) {
    errorEl.textContent = `Not enough stock. Only ${
      product.unitType === "single"
        ? roundKsh(available) + " " + pluralize(product.unitName, roundKsh(available))
        : formatDoubleUnitStock(available, product)
    } available.`;
  }
  addBtn.disabled = invalid;
}

document.getElementById("unitModalClose").addEventListener("click", closeUnitModal);
document.getElementById("unitModalCancel").addEventListener("click", closeUnitModal);
function closeUnitModal() {
  unitModalOverlay.classList.add("hidden");
  modalProduct = null;
}

document.getElementById("unitModalAdd").addEventListener("click", () => {
  const product = modalProduct;
  const deduction = getModalMinorDeduction();
  if (deduction <= 0) return;

  let unitLabel, pricePerUnitSold, qty;
  if (modalUnitMode === "single") {
    unitLabel = product.unitName;
    pricePerUnitSold = product.price;
    qty = modalQty;
  } else if (modalUnitMode === "major") {
    unitLabel = product.majorUnitName;
    pricePerUnitSold = product.pricePerMajor;
    qty = modalQty;
  } else {
    unitLabel = product.minorUnitName;
    pricePerUnitSold = product.pricePerMinor;
    qty = modalQty;
  }

  basket.push({
    lineId: "l" + Date.now() + Math.random().toString(16).slice(2),
    productId: product.id,
    name: product.name,
    unitSold: modalUnitMode,
    unitLabel,
    qty,
    minorUnitsDeducted: deduction,
    pricePerUnitSold,
    lineTotal: roundKsh(pricePerUnitSold * qty),
  });

  closeUnitModal();
  renderBasket();
  renderProductGrid();
  showToast(`Added ${qty} ${unitLabel} of ${product.name}`, "success");
});

/* ----- Basket ------------------------------------------------------------------------ */
function renderBasket() {
  const linesEl = document.getElementById("basketLines");
  const emptyEl = document.getElementById("basketEmpty");

  linesEl.querySelectorAll(".basket-line").forEach((el) => el.remove());

  if (basket.length === 0) {
    emptyEl.classList.remove("hidden");
  } else {
    emptyEl.classList.add("hidden");
    basket.forEach((line) => {
      const row = document.createElement("div");
      row.className = "basket-line anim-line-in";
      row.dataset.lineId = line.lineId;
      row.innerHTML = `
        <div class="basket-line-info">
          <div class="basket-line-name">${escapeHtml(line.name)}</div>
          <div class="basket-line-qty">${line.qty} ${escapeHtml(line.unitLabel)} × ${formatKsh(line.pricePerUnitSold)}</div>
        </div>
        <div class="basket-line-actions">
          <span class="basket-line-total">${formatKsh(line.lineTotal)}</span>
          <button class="basket-line-remove" aria-label="Remove" data-line-id="${line.lineId}">✕</button>
        </div>
      `;
      linesEl.appendChild(row);
    });
  }

  updateTotals();
  document.getElementById("completeSaleBtn").disabled = basket.length === 0;
}

document.getElementById("basketLines").addEventListener("click", (e) => {
  const btn = e.target.closest(".basket-line-remove");
  if (!btn) return;
  const lineId = btn.dataset.lineId;
  const row = btn.closest(".basket-line");
  row.classList.add("anim-line-out");
  setTimeout(() => {
    basket = basket.filter((l) => l.lineId !== lineId);
    renderBasket();
    renderProductGrid();
  }, 180);
});

document.getElementById("clearBasketBtn").addEventListener("click", () => {
  if (basket.length === 0) return;
  basket = [];
  renderBasket();
  renderProductGrid();
});

document.getElementById("discountInput").addEventListener("input", updateTotals);

function getSubtotal() {
  return basket.reduce((sum, l) => sum + l.lineTotal, 0);
}

function updateTotals() {
  const subtotal = getSubtotal();
  const discountRaw = parseFloat(document.getElementById("discountInput").value) || 0;
  const discount = Math.max(0, Math.min(discountRaw, subtotal));
  const total = Math.max(0, roundKsh(subtotal - discount));

  document.getElementById("subtotalValue").textContent = formatKsh(subtotal);
  document.getElementById("totalValue").textContent = formatKsh(total);
}

/* ----- Payment method toggle ----------------------------------------------------------- */
document.querySelectorAll(".payment-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".payment-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedPaymentMethod = btn.dataset.method;
  });
});

/* ----- Offline lockout ------------------------------------------------------------------- */
function checkOfflineLockout() {
  const overlay = document.getElementById("offlineLockOverlay");
  if (isOfflineLockedOut()) {
    overlay.classList.remove("hidden");
    document.getElementById("completeSaleBtn").disabled = true;
  } else {
    overlay.classList.add("hidden");
    if (basket.length > 0) document.getElementById("completeSaleBtn").disabled = false;
  }
}
document.getElementById("offlineRetryBtn").addEventListener("click", checkOfflineLockout);

/* ----- Complete sale --------------------------------------------------------------------- */
document.getElementById("completeSaleBtn").addEventListener("click", async () => {
  if (basket.length === 0) return;
  if (isOfflineLockedOut()) {
    checkOfflineLockout();
    return;
  }

  const btn = document.getElementById("completeSaleBtn");
  btn.disabled = true;
  btn.textContent = "Completing…";

  const subtotal = getSubtotal();
  const discountRaw = parseFloat(document.getElementById("discountInput").value) || 0;
  const discount = Math.max(0, Math.min(discountRaw, subtotal));
  const total = Math.max(0, roundKsh(subtotal - discount));
  const customerName = document.getElementById("customerNameInput").value.trim();

  // Aggregate deductions per product (basket may have multiple lines for the same product).
  const deductionsByProduct = {};
  basket.forEach((line) => {
    deductionsByProduct[line.productId] = (deductionsByProduct[line.productId] || 0) + line.minorUnitsDeducted;
  });
  const productIds = Object.keys(deductionsByProduct);

  try {
    const receiptNumber = await getNextReceiptNumber();
    const saleRef = db.collection("sales").doc();

    const lowStockItems = await db.runTransaction(async (t) => {
      const productRefs = productIds.map((id) => db.collection("products").doc(id));
      const productDocs = await Promise.all(productRefs.map((ref) => t.get(ref)));

      const lowStock = [];
      productDocs.forEach((doc, i) => {
        const id = productIds[i];
        if (!doc.exists) throw new Error(`Product ${id} no longer exists.`);
        const data = doc.data();
        const deduction = deductionsByProduct[id];
        const newStock = data.stockMinorUnits - deduction;
        if (newStock < -0.0001) {
          throw new Error(`Not enough stock for ${data.name}. Someone may have just sold the last of it.`);
        }
        t.update(productRefs[i], { stockMinorUnits: Math.max(0, newStock) });
        if (newStock <= (data.lowStockThreshold || 0)) {
          lowStock.push({ name: data.name, remaining: Math.max(0, newStock), unitLabel: data.unitType === "single" ? data.unitName : data.minorUnitName });
        }
      });

      t.set(saleRef, {
        receiptNumber,
        servedBy: currentUser.uid,
        servedByRole: currentUser.role,
        servedByName: currentUser.displayName,
        customerName: customerName || null,
        items: basket.map((l) => ({
          productId: l.productId,
          name: l.name,
          unitSold: l.unitSold,
          unitLabel: l.unitLabel,
          qty: l.qty,
          pricePerUnitSold: l.pricePerUnitSold,
          lineTotal: l.lineTotal,
        })),
        subtotal: roundKsh(subtotal),
        discount: roundKsh(discount),
        total,
        paymentMethod: selectedPaymentMethod,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      return lowStock;
    });

    showReceipt({ receiptNumber, customerName, total, subtotal, discount, items: basket, paymentMethod: selectedPaymentMethod, servedByName: currentUser.displayName, servedByRole: currentUser.role });

    basket = [];
    document.getElementById("discountInput").value = 0;
    document.getElementById("customerNameInput").value = "";
    renderBasket();
    renderProductGrid();

    if (lowStockItems.length > 0) {
      showLowStockAlert(lowStockItems);
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || "Couldn't complete the sale. Please try again.", "danger");
  } finally {
    btn.textContent = "Complete sale";
    btn.disabled = basket.length === 0;
  }
});

/* ----- Low stock alert modal --------------------------------------------------------------- */
function showLowStockAlert(items) {
  const list = document.getElementById("lowStockList");
  list.innerHTML = items
    .map((item) => `<li>${escapeHtml(item.name)} — ${roundKsh(item.remaining)} ${escapeHtml(item.unitLabel)} left</li>`)
    .join("");
  document.getElementById("lowStockMessage").textContent =
    items.length === 1 ? "One item just dropped to its low stock threshold." : `${items.length} items just dropped to their low stock threshold.`;
  document.getElementById("lowStockOverlay").classList.remove("hidden");
}
document.getElementById("lowStockDismiss").addEventListener("click", () => {
  document.getElementById("lowStockOverlay").classList.add("hidden");
});

/* ----- Receipt ------------------------------------------------------------------------------- */
function showReceipt(sale) {
  const area = document.getElementById("receiptPrintArea");
  const dateStr = formatDateTime(new Date());

  const itemRows = sale.items
    .map(
      (l) => `
        <div class="receipt-row">
          <span class="receipt-item-name">${escapeHtml(l.name)}<br/><span>${l.qty} ${escapeHtml(l.unitLabel)} × ${formatKsh(l.pricePerUnitSold)}</span></span>
          <span>${formatKsh(l.lineTotal)}</span>
        </div>`
    )
    .join("");

  area.innerHTML = `
    <div class="receipt-center">
      <div class="receipt-bold">${escapeHtml(businessInfo.companyName || "Misty Code")}</div>
      ${businessInfo.address ? `<div>${escapeHtml(businessInfo.address)}</div>` : ""}
      ${businessInfo.phone ? `<div>${escapeHtml(businessInfo.phone)}</div>` : ""}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-row"><span>Receipt #</span><span>${sale.receiptNumber}</span></div>
    <div class="receipt-row"><span>Date</span><span>${dateStr}</span></div>
    <div class="receipt-row"><span>Served by</span><span>${escapeHtml(sale.servedByName)} (${sale.servedByRole === "manager" ? "Main" : "Seller"})</span></div>
    ${sale.customerName ? `<div class="receipt-row"><span>Customer</span><span>${escapeHtml(sale.customerName)}</span></div>` : ""}
    <div class="receipt-divider"></div>
    ${itemRows}
    <div class="receipt-divider"></div>
    <div class="receipt-row"><span>Subtotal</span><span>${formatKsh(sale.subtotal)}</span></div>
    <div class="receipt-row"><span>Discount</span><span>${formatKsh(sale.discount)}</span></div>
    <div class="receipt-row receipt-total-row"><span>TOTAL</span><span>${formatKsh(sale.total)}</span></div>
    <div class="receipt-row"><span>Payment</span><span>${sale.paymentMethod === "cash" ? "Cash" : "Mobile"}</span></div>
    <div class="receipt-divider"></div>
    <div class="receipt-center">Thank you for your business!</div>
  `;

  document.getElementById("receiptOverlay").classList.remove("hidden");
}

document.getElementById("receiptCancelBtn").addEventListener("click", () => {
  document.getElementById("receiptOverlay").classList.add("hidden");
});
document.getElementById("receiptPrintBtn").addEventListener("click", () => {
  window.print();
});

/* ----- Static UI wiring ---------------------------------------------------------------------- */
function wireStaticUI() {
  // placeholder for any additional one-time wiring needed later
}
