// Orders page
// this contsins order cards, details, create/edit/delete options.

(() => {
"use strict";

let allOrders = [];
let editingOrderId = null;

const ordersButton = document.getElementById("orders-button");
const ordersPage = document.getElementById("orders-page");
const ordersContainer = document.getElementById("orders-container");
const orderSearch = document.getElementById("order-search");
const orderStatusFilter = document.getElementById("order-status-filter");
const addOrderButton = document.getElementById("add-order-button");
const addOrderForm = document.getElementById("add-order-form");
const cancelOrder = document.getElementById("cancel-order");
const orderForm = document.getElementById("order-form");
const orderFormTitle = document.getElementById("order-form-title");
const saveOrderButton = document.getElementById("save-order-button");
const orderItemsContainer = document.getElementById("order-items-container");
const addOrderItemButton = document.getElementById("add-order-item");
const orderDetailsPage = document.getElementById("order-details-page");
const orderDetailsContainer = document.getElementById("order-details-container");
const backToOrders = document.getElementById("back-to-orders");

function orderField(className, row) {
    return row.querySelector(`.${className}`);
}


// Art number suggestions are prefix-filtered; colour/size options depend on art.
// Uses the existing admin-only catalogue API, so no duplicate backend endpoint.
let orderCatalogue = [];
let orderRowSequence = 0;
async function loadOrderCatalogue() {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load the product catalogue for order entry.");
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Invalid product catalogue response.");
    orderCatalogue = data;
    // The form resets/recreates its rows after this fetch. The server-rendered
    // initial row intentionally has no suggestion list and is replaced entirely.
}
function option(value, label = value) {
    const el = document.createElement("option");
    el.value = String(value);
    el.textContent = String(label);
    return el;
}
function findOrderProduct(art) {
    return orderCatalogue.find(p => String(p.art_number).toLowerCase() === String(art).trim().toLowerCase());
}
function hideOrderArtSuggestions(row) {
    row.querySelector(".order-art-suggestions").hidden = true;
}
function fillOrderArtOptions(row) {
    const art = orderField("order-art-number",row);
    const list = row.querySelector(".order-art-suggestions");
    const query = art.value.trim().toLowerCase();
    list.replaceChildren();
    const matches = orderCatalogue.filter(p => String(p.art_number).toLowerCase().startsWith(query)).slice(0,30);
    if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "order-art-suggestion-empty";
        empty.textContent = "No matching art numbers";
        list.appendChild(empty);
    }
    for (const product of matches) {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "order-art-suggestion";
        choice.setAttribute("role","option");
        choice.textContent = String(product.art_number);
        // Avoid submitting the surrounding order form when selecting an article.
        choice.addEventListener("mousedown",event => event.preventDefault());
        choice.addEventListener("click",() => {
            art.value = String(product.art_number);
            fillOrderColours(row);
            hideOrderArtSuggestions(row);
            art.focus({preventScroll:true});
        });
        list.appendChild(choice);
    }
}
function fillOrderSizes(row, preferred = "") {
    const sizes = orderField("order-size",row);
    const colour = orderField("order-colour",row).value;
    const product = findOrderProduct(orderField("order-art-number",row).value);
    const variant = product?.variants?.find(v => v.colour === colour);
    sizes.replaceChildren(option("", "Select size"));
    for (const stock of variant?.stock || []) sizes.appendChild(option(stock.size));
    if (preferred && [...sizes.options].some(op => op.value === String(preferred))) sizes.value = String(preferred);
    sizes.disabled = !variant;
}
function fillOrderColours(row, preferredColour = "", preferredSize = "") {
    const colours = orderField("order-colour",row);
    const product = findOrderProduct(orderField("order-art-number",row).value);
    colours.replaceChildren(option("", "Select colour"));
    for (const variant of product?.variants || []) colours.appendChild(option(variant.colour));
    if (preferredColour && [...colours.options].some(op => op.value.toLowerCase() === String(preferredColour).toLowerCase())) {
        colours.value = [...colours.options].find(op => op.value.toLowerCase() === String(preferredColour).toLowerCase()).value;
    }
    colours.disabled = !product;
    fillOrderSizes(row,preferredSize);
}
function createOrderItemRow(item = null) {
    const row = document.createElement("div");
    row.className = "order-item";
    const id = `order-art-suggestions-${++orderRowSequence}`;
    row.innerHTML = `
        <div class="order-item-header">
            <strong class="order-item-title">Order Item</strong>
            <button type="button" class="remove-order-item secondary-action">Remove Item</button>
        </div>
        <div class="order-art-field">
            <label for="${id}-input">Art No</label>
            <input id="${id}-input" type="text" class="order-art-number" placeholder="Type art number (e.g. 1)..." autocomplete="off" aria-controls="${id}" aria-autocomplete="list" required>
            <div class="order-art-suggestions" id="${id}" role="listbox" hidden></div>
        </div>
        <label>Colour<select class="order-colour" required><option value="">Select art number first</option></select></label>
        <label>Size<select class="order-size" required><option value="">Select colour first</option></select></label>
        <label>Quantity<input type="number" class="order-quantity" min="1" step="1" placeholder="Enter Quantity" required></label>
    `;
    const artInput = orderField("order-art-number",row);
    artInput.addEventListener("focus", () => {
        fillOrderArtOptions(row);
        row.querySelector(".order-art-suggestions").hidden = false;
    });
    artInput.addEventListener("input", () => {
        fillOrderArtOptions(row);
        row.querySelector(".order-art-suggestions").hidden = false;
        fillOrderColours(row);
    });
    artInput.addEventListener("keydown", event => {
        const suggestions = row.querySelector(".order-art-suggestions");
        if (event.key === "Escape") hideOrderArtSuggestions(row);
        if (event.key === "Enter" && !suggestions.hidden) {
            const first = suggestions.querySelector(".order-art-suggestion");
            if (first) { event.preventDefault(); first.click(); }
        }
        if (event.key === "ArrowDown" && !suggestions.hidden) {
            const first = suggestions.querySelector(".order-art-suggestion");
            if (first) { event.preventDefault(); first.focus(); }
        }
    });
    row.addEventListener("focusout", () => {
        setTimeout(() => {
            if (!row.querySelector(".order-art-field").contains(document.activeElement)) hideOrderArtSuggestions(row);
        },0);
    });
    orderField("order-colour",row).addEventListener("change",() => fillOrderSizes(row));
    fillOrderArtOptions(row);
    if (item) populateOrderRow(row,item);
    else fillOrderColours(row);
    return row;
}

function updateOrderItemRows() {
    const rows = [...orderItemsContainer.querySelectorAll(".order-item")];
    rows.forEach((row, index) => {
        row.querySelector(".order-item-title").textContent = `Item ${index + 1}`;
    });
    document.getElementById("order-items-empty").classList.toggle("hidden", rows.length !== 0);
}

function populateOrderRow(row, item) {
    orderField("order-art-number", row).value = item.art_number ?? "";
    fillOrderArtOptions(row);
    fillOrderColours(row, item.colour ?? "", item.size ?? "");
    orderField("order-quantity", row).value = item.quantity ?? "";
}


function resetOrderForm() {
    orderForm.reset();
    orderItemsContainer.replaceChildren(createOrderItemRow());
    updateOrderItemRows();
    editingOrderId = null;
    orderFormTitle.textContent = "ADD ORDER";
    saveOrderButton.textContent = "SAVE ORDER";
    saveOrderButton.disabled = false;
}

function openOrdersPage() {
    hideAllMainSections();
    ordersPage.classList.remove("hidden");
    updateActiveNav(ordersButton);
}

function makeOrderAction(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `order-action-button ${className}`;
    button.textContent = label;
    button.addEventListener("click", async event => {
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        try {
            await handler();
        } finally {
            button.disabled = false;
        }
    });
    return button;
}

function orderActions(order, fromDetails = false) {
    const actions = document.createElement("div");
    actions.className = fromDetails ? "order-details-actions" : "order-actions";

    if (String(order.status).toLowerCase() !== "pending") {
        return actions;
    }

    actions.append(
        makeOrderAction("EDIT ORDER", "edit-order-button", () => editOrder(order.id)),
        makeOrderAction("DELETE ORDER", "delete-order-button", () => deleteOrder(order.id)),
        makeOrderAction("COMPLETE ORDER", "complete-order-button", () => completeOrder(order.id))
    );
    return actions;
}

function filterOrders() {
    const query = orderSearch.value.trim().toLowerCase().replace(/^#/, "");
    const selectedStatus = orderStatusFilter.value;

    return allOrders.filter(order => {
        const actualStatus = String(order.status ?? "").trim().toLowerCase();
        const matchesStatus = selectedStatus === "all" || actualStatus === selectedStatus;
        const matchesSearch = [
            order.id, order.company_name, order.address, order.status
        ].some(value => String(value ?? "").toLowerCase().includes(query));

        return matchesStatus && matchesSearch;
    });
}

function displayOrders() {
    ordersContainer.replaceChildren();
    const orders = filterOrders();

    if (orders.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-orders-message";
        empty.textContent = "No orders found.";
        ordersContainer.appendChild(empty);
        return;
    }

    orders.forEach(order => {
        const card = document.createElement("article");
        card.className = "order-card";
        card.tabIndex = 0;
        card.setAttribute("aria-label", `Order ${order.id} for ${order.company_name}. View details.`);

        const info = document.createElement("div");
        info.className = "order-info";
        const heading = document.createElement("div");
        heading.className = "order-title-row";

        const company = document.createElement("h3");
        company.className = "order-company-name";
        company.textContent = order.company_name || "Unnamed company";

        const id = document.createElement("span");
        id.className = "order-id";
        id.textContent = `Order #${order.id}`;
        heading.append(company, id);

        const address = document.createElement("p");
        address.className = "order-address";
        address.textContent = `Address: ${order.address || "Not provided"}`;

        const status = document.createElement("span");
        status.className = `order-status ${String(order.status).toLowerCase() === "pending" ? "pending" : "completed"}`;
        status.textContent = order.status || "Unknown";

        info.append(heading, address, status);
        card.append(info, orderActions(order));

        card.addEventListener("click", () => loadOrderDetails(order.id));
        card.addEventListener("keydown", event => {
            if (event.target === card && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                loadOrderDetails(order.id);
            }
        });
        ordersContainer.appendChild(card);
    });
}

async function readOrderResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status}).`);
    }
    return data;
}

async function loadOrders() {
    try {
        const response = await fetch("/api/orders", { cache: "no-store" });
        const data = await readOrderResponse(response);
        if (!Array.isArray(data)) throw new Error("Invalid orders response.");
        allOrders = data;
        displayOrders();
        return true;
    } catch (error) {
        console.error("Loading orders failed:", error);
        ordersContainer.textContent = error.message;
        return false;
    }
}

async function refreshOrderAndStock() {
    const [ordersOk, productsOk] = await Promise.all([
        loadOrders(), refreshProducts()
    ]);
    loadDashboard();
    if (!ordersOk || !productsOk) {
        HawaUI.toast("Saved, but some pages could not refresh. Open the page again to update them.", "warning");
        return false;
    }
    return true;
}

async function loadOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const order = await readOrderResponse(response);

        const card = document.createElement("div");
        card.className = "order-details-card";
        const heading = document.createElement("div");
        heading.className = "order-details-heading";

        const company = document.createElement("h3");
        company.textContent = order.company_name || "Unnamed company";
        const id = document.createElement("span");
        id.className = "order-id";
        id.textContent = `Order #${order.id}`;
        heading.append(company, id);

        const address = document.createElement("p");
        address.textContent = `Address: ${order.address || "Not provided"}`;
        const status = document.createElement("p");
        status.textContent = `Status: ${order.status}`;
        const itemsHeading = document.createElement("h4");
        itemsHeading.textContent = "ORDER ITEMS";
        const list = document.createElement("div");
        list.className = "order-items-list";

        (order.items || []).forEach((item, index) => {
            const row = document.createElement("div");
            row.className = "order-items-details";
            const title = document.createElement("strong");
            title.textContent = `Item ${index + 1}`;
            row.appendChild(title);

            for (const [label, value] of [
                ["Art No", item.art_number], ["Colour", item.colour],
                ["Size", item.size], ["Quantity", item.quantity]
            ]) {
                const p = document.createElement("p");
                p.textContent = `${label}: ${value}`;
                row.appendChild(p);
            }
            list.appendChild(row);
        });

        card.append(heading, address, status, itemsHeading, list, orderActions(order, true));
        orderDetailsContainer.replaceChildren(card);
        hideAllMainSections();
        orderDetailsPage.classList.remove("hidden");
        updateActiveNav(ordersButton);
    } catch (error) {
        console.error("Order details failed:", error);
        HawaUI.alert(error.message, { title: "Unable to load order details" });
    }
}

async function editOrder(orderId) {
    try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
        const order = await readOrderResponse(response);
        if (String(order.status).toLowerCase() !== "pending") {
            throw new Error("Only pending orders can be edited.");
        }
        if (!Array.isArray(order.items) || order.items.length === 0) {
            throw new Error("This order has no items to edit.");
        }

        await loadOrderCatalogue();
        resetOrderForm();
        document.getElementById("order-company-name").value = order.company_name || "";
        document.getElementById("order-address").value = order.address || "";
        orderItemsContainer.replaceChildren(...order.items.map(createOrderItemRow));
        updateOrderItemRows();
        editingOrderId = order.id;
        orderFormTitle.textContent = `EDIT ORDER #${order.id}`;
        saveOrderButton.textContent = "UPDATE ORDER";
        hideAllMainSections();
        addOrderForm.classList.remove("hidden");
        updateActiveNav(ordersButton);
    } catch (error) {
        console.error("Edit order failed:", error);
        HawaUI.alert(error.message, { title: "Unable to edit order" });
    }
}

async function deleteOrder(orderId) {
    const confirmed = await HawaUI.confirm(
        `Delete Order #${orderId}? Its reserved stock will be restored. This cannot be undone.`,
        { title: "Delete order", confirmText: "Delete Order", destructive: true }
    );
    if (!confirmed) return;
    try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
        await readOrderResponse(response);
        openOrdersPage();
        const refreshed = await refreshOrderAndStock();
        if (refreshed) HawaUI.toast(`Order #${orderId} deleted. Stock restored.`);
    } catch (error) {
        console.error("Delete order failed:", error);
        HawaUI.alert(error.message, { title: "Unable to delete order" });
    }
}

async function completeOrder(orderId) {
    const confirmed = await HawaUI.confirm(
        `Mark Order #${orderId} as completed? Completed orders cannot be edited or deleted.`,
        { title: "Complete order", confirmText: "Complete Order" }
    );
    if (!confirmed) return;
    try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/complete`, { method: "PUT" });
        await readOrderResponse(response);
        const showingDetails = !orderDetailsPage.classList.contains("hidden");
        const refreshed = await refreshOrderAndStock();
        if (showingDetails) await loadOrderDetails(orderId);
        if (refreshed) HawaUI.toast(`Order #${orderId} completed.`);
    } catch (error) {
        console.error("Complete order failed:", error);
        HawaUI.alert(error.message, { title: "Unable to complete order" });
    }
}

ordersButton.addEventListener("click", () => {
    openOrdersPage();
    loadOrders();
});
orderSearch.addEventListener("input", displayOrders);
orderStatusFilter.addEventListener("change", displayOrders);

addOrderButton.addEventListener("click", async () => {
    try { await loadOrderCatalogue(); }
    catch (error) { HawaUI.alert(error.message); return; }
    resetOrderForm();
    hideAllMainSections();
    addOrderForm.classList.remove("hidden");
    updateActiveNav(ordersButton);
});

cancelOrder.addEventListener("click", () => {
    resetOrderForm();
    openOrdersPage();
    loadOrders();
});

addOrderItemButton.addEventListener("click", () => {
    const row = createOrderItemRow();
    orderItemsContainer.appendChild(row);
    updateOrderItemRows();
    row.querySelector(".order-art-number").focus();
});

orderItemsContainer.addEventListener("click", event => {
    const removeButton = event.target.closest(".remove-order-item");
    if (!removeButton) return;
    removeButton.closest(".order-item")?.remove();
    updateOrderItemRows();
});

document.getElementById("back-to-order-form").addEventListener("click", () => {
    cancelOrder.click();
});

orderForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (saveOrderButton.disabled) return;
    const companyName = document.getElementById("order-company-name").value.trim();
    const address = document.getElementById("order-address").value.trim();
    const rows = [...orderItemsContainer.querySelectorAll(".order-item")];
    const items = rows.map(row => ({
        art_number: orderField("order-art-number", row).value.trim(),
        colour: orderField("order-colour", row).value.trim(),
        size: Number(orderField("order-size", row).value),
        quantity: Number(orderField("order-quantity", row).value)
    }));

    if (!companyName || !address || items.length === 0 || items.some(item =>
        !findOrderProduct(item.art_number) || !item.colour || !Number.isInteger(item.size) || item.size <= 0 ||
        !Number.isInteger(item.quantity) || item.quantity <= 0
    )) {
        HawaUI.toast("Fill in company, address, and valid art number, colour, size and quantity for every item.", "warning");
        return;
    }

    const orderId = editingOrderId;
    const editing = orderId !== null;
    saveOrderButton.disabled = true;
    saveOrderButton.textContent = editing ? "UPDATING..." : "SAVING...";

    try {
        const response = await fetch(editing ? `/api/orders/${encodeURIComponent(orderId)}` : "/api/orders", {
            method: editing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_name: companyName, address, items })
        });
        await readOrderResponse(response);
        resetOrderForm();
        openOrdersPage();
        const refreshed = await refreshOrderAndStock();
        if (refreshed) HawaUI.toast(editing ? `Order #${orderId} updated.` : "Order created successfully.");
    } catch (error) {
        console.error("Save order failed:", error);
        HawaUI.alert(error.message, { title: "Unable to save order" });
    } finally {
        saveOrderButton.disabled = false;
        saveOrderButton.textContent = editingOrderId !== null ? "UPDATE ORDER" : "SAVE ORDER";
    }
});

backToOrders.addEventListener("click", () => {
    openOrdersPage();
    loadOrders();
});

// Initial orders retrieval and navigation from billing links.
loadOrders();
const requestedAdminPage = new URLSearchParams(window.location.search).get("page");
if (requestedAdminPage === "orders") ordersButton.click();
else if (requestedAdminPage === "products") productButton.click();
else if (requestedAdminPage === "dashboard") dashboardButton.click();

})();
