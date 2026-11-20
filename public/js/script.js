console.log("Scripts running");



// Reusable inline validation helper
function addInlineValidation(input, validationRule) {
    const errorMessage = document.createElement("small");
    errorMessage.className = "field-error";
    errorMessage.setAttribute("aria-live", "polite");

    input.insertAdjacentElement("afterend", errorMessage);

    function validate() {
        const message = validationRule(input.value, input);

        errorMessage.textContent = message;
        input.classList.toggle("input-invalid", Boolean(message));
        input.classList.toggle("input-valid", !message && input.value.trim() !== "");

        return !message;
    }

    input.addEventListener("input", validate);
    input.addEventListener("change", validate);

    return validate;
}


function clearInlineValidation(form) {

    // Clear validation messages without removing their elements
    form.querySelectorAll(".field-error").forEach(error => {
        error.textContent = "";
    });

    // Remove previous input styling
    form.querySelectorAll(".input-invalid, .input-valid").forEach(input => {
        input.classList.remove("input-invalid", "input-valid");
    });
}


function requiredText(value) {
    return value.trim() ? "" : "This field is required.";
}

function positiveWholeNumber(value, fieldName) {
    if (value.trim() === "") {
        return `${fieldName} is required.`;
    }

    const number = Number(value);

    if (!Number.isInteger(number) || number <= 0) {
        return `${fieldName} must be a positive whole number.`;
    }

    return "";
}

function positiveDecimal(value, fieldName) {
    if (value.trim() === "") {
        return `${fieldName} is required.`;
    }

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        return `${fieldName} must be greater than zero.`;
    }

    return "";
}

function validateImageFile(file) {
    if (!file) {
        return "Please select an image.";
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
        return "Only JPG, PNG and WEBP images are allowed.";
    }

    if (file.size > 5 * 1024 * 1024) {
        return "Image must be smaller than 5 MB.";
    }

    return "";
}




// Dashboard summary and low-stock drill-down
function renderLowStockTable(products) {
    const rows = document.getElementById("low-stock-table-body");
    const empty = document.getElementById("low-stock-empty");
    rows.replaceChildren();
    const list = Array.isArray(products) ? products : [];
    empty.classList.toggle("hidden", list.length !== 0);

    list.forEach(product => {
        const tr = document.createElement("tr");
        for (const value of [
            String(product.art_number),
            String(product.total_stock),
            Number(product.total_stock) === 0 ? "Out of stock" : "Low stock"
        ]) {
            const cell = document.createElement("td");
            cell.textContent = value;
            tr.appendChild(cell);
        }
        rows.appendChild(tr);
    });
}

async function loadDashboard() {
    try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load dashboard.");
        const data = await response.json();
        document.getElementById("total-products").textContent = data.totalProducts;
        document.getElementById("total-stock").textContent = data.totalStock;
        document.getElementById("total-orders").textContent = data.totalOrders;
        document.getElementById("low-stock").textContent = data.lowStock;
        document.getElementById("pending-orders").textContent = data.pendingOrders;
        document.getElementById("completed-orders").textContent = data.completedOrders;
        renderLowStockTable(data.lowStockProducts);
    } catch (error) {
        console.error("Dashboard error:", error);
        HawaUI.toast("Dashboard could not refresh. Please try again.", "warning");
    }
}

function openOrdersWithStatus(status) {
    document.getElementById("order-status-filter").value = status;
    document.getElementById("order-search").value = "";
    document.getElementById("orders-button").click();
}

document.getElementById("pending-orders-card").addEventListener("click", () => {
    openOrdersWithStatus("pending");
});
document.getElementById("completed-orders-card").addEventListener("click", () => {
    openOrdersWithStatus("completed");
});

const lowStockPanel = document.getElementById("low-stock-panel");
const lowStockCard = document.getElementById("low-stock-card");
lowStockCard.addEventListener("click", () => {
    const show = lowStockPanel.classList.contains("hidden");
    lowStockPanel.classList.toggle("hidden", !show);
    lowStockCard.setAttribute("aria-expanded", String(show));
    if (show) lowStockPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document.getElementById("close-low-stock").addEventListener("click", () => {
    lowStockPanel.classList.add("hidden");
    lowStockCard.setAttribute("aria-expanded", "false");
    lowStockCard.focus();
});

// Load dashboard when the page opens
loadDashboard();

let allProducts = [];

fetch("/api/products")
    .then(response => {
        if (!response.ok) {
            throw new Error("Failed to load products.");
        }

        return response.json();
    })
    .then(products => {
        allProducts = products;
        displayProducts(products);
    })
    .catch(error => {
        console.error("Error Loading Products:", error);
        document.getElementById("products-container").textContent =
            "Failed to load products. Please refresh the page.";
    });

async function refreshProducts() {
    try {
        const response = await fetch("/api/products", {
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("Failed to refresh products.");
        }

        const products = await response.json();

        allProducts = products;

        const searchText = document
            .getElementById("product-search")
            .value.trim();

        displayProducts(filterAdminProducts(searchText));

        return true;

    } catch (error) {
        console.error("Error refreshing products:", error);
        return false;
    }
}

function filterAdminProducts(search) {
    const query = String(search || '').trim().toLocaleLowerCase();
    if (!query) return allProducts;
    return allProducts.filter(product => [
        String(product.art_number), product.brand || '',
        ...(Array.isArray(product.tags) ? product.tags : []),
        ...((product.variants || []).map(variant => variant.colour || ''))
    ].some(value => String(value).toLocaleLowerCase().includes(query)));
}

function adminText(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(value);
    return element;
}

const formatAdminCurrency = value => {
    if (value === null || value === undefined || value === '') return 'Not set';
    const amount = Number(value);
    return Number.isFinite(amount) ? `₹${amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'Not set';
};

function renderAdminTags(tags, className = 'admin-tag-list') {
    const list = document.createElement('div');
    list.className = className;
    for (const tag of (Array.isArray(tags) ? tags : [])) {
        list.appendChild(adminText('span', 'admin-tag', tag));
    }
    return list;
}

function displayProducts(products) {
    const container = document.getElementById('products-container');
    container.replaceChildren();

    if (!products?.length) {
        container.appendChild(adminText('p', 'admin-no-results', 'No products found.'));
        return;
    }

    products.forEach(product => {
        const totalStock = (product.variants || []).reduce((sum, variant) =>
            sum + (variant.stock || []).reduce((n, row) => n + Number(row.quantity || 0), 0), 0);
        const image = product.variants?.find(v => v.image)?.image;
        const card = document.createElement('article');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.className = 'product-card admin-product-card';
        card.setAttribute('aria-label', `View product ${product.art_number}`);
        if (image) {
            const picture = document.createElement('img');
            picture.className = 'product-image';
            picture.alt = `Footwear ${product.art_number}`;
            picture.loading = 'lazy';
            picture.src = `/images/${encodeURIComponent(image)}`;
            card.appendChild(picture);
        }
        const info = document.createElement('div');
        info.className = 'product-info';
        info.appendChild(adminText('h3', 'admin-product-title', `Art No: ${product.art_number}`));
        info.appendChild(adminText('span', 'admin-brand-label', product.brand || 'Unbranded'));
        const prices = document.createElement('div');
        prices.className = 'admin-product-prices';
        prices.appendChild(adminText('span', 'admin-product-price', `Unit price ${formatAdminCurrency(product.price)}`));
        prices.appendChild(adminText('span', 'admin-product-mrp', `MRP ${formatAdminCurrency(product.mrp)}`));
        info.appendChild(prices);
        if (Array.isArray(product.tags) && product.tags.length) info.appendChild(renderAdminTags(product.tags));
        info.appendChild(adminText('p', `admin-stock-label ${totalStock > 0 ? 'in-stock' : 'out-of-stock'}`,
            totalStock > 0 ? `Total stock: ${totalStock}` : 'Out of stock'));
        card.appendChild(info);
        card.addEventListener('click', () => showProductDetails(product));
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showProductDetails(product);
            }
        });
        container.appendChild(card);
    });
}

function showProductDetails(product) {
    const productsContainer = document.getElementById('products-container');
    const productDetails = document.getElementById('product-details');
    productsContainer.classList.add('hidden');
    productDetails.classList.remove('hidden');
    document.getElementById('details-art-number').textContent = `Art No: ${product.art_number}`;
    const priceBox = document.getElementById('details-price');
    priceBox.replaceChildren();
    for (const [label, value] of [
        ['Brand / Company', product.brand || 'Unbranded'],
        ['MRP', formatAdminCurrency(product.mrp)],
        ['Unit price', formatAdminCurrency(product.price)]
    ]) {
        const fact = document.createElement('div');
        fact.className = 'details-fact';
        fact.append(adminText('span', 'details-fact-name', label), adminText('strong', '', value));
        priceBox.appendChild(fact);
    }
    const tagBox = document.getElementById('details-tags');
    tagBox.replaceChildren(renderAdminTags(product.tags, 'admin-tag-list'));
    const colourButtons = document.getElementById('colour-buttons');
    colourButtons.replaceChildren();
    (product.variants || []).forEach((variant, index) => {
        const button = adminText('button', 'colour-button', variant.colour);
        button.type = 'button';
        button.addEventListener('click', () => showVariant(variant));
        colourButtons.appendChild(button);
        if (index === 0) showVariant(variant);
    });
}

//fetching variant details 
function showVariant(selectedVariant, allVariants) {
    const image = document.getElementById("details-image");
    const tableBody = document.getElementById("stock-table-body");

    image.src = selectedVariant.image
        ? `/images/${encodeURIComponent(selectedVariant.image)}`
        : "";

    tableBody.replaceChildren();

    selectedVariant.stock.forEach(stockItem => {
        const row = document.createElement("tr");

        const sizeCell = document.createElement("td");
        sizeCell.textContent = stockItem.size;

        const quantityCell = document.createElement("td");
        quantityCell.textContent = stockItem.quantity;

        row.append(sizeCell, quantityCell);
        tableBody.appendChild(row);
    });

    const buttons = document.querySelectorAll(".colour-button");

    buttons.forEach(button => {
        button.classList.toggle(
            "active-colour",
            button.textContent === selectedVariant.colour
        );
    });
}

//Back button functionality
document.getElementById("back-button").addEventListener("click",()=>{
    const productsContainer=document.getElementById("products-container");
    const productDetails=document.getElementById("product-details");
    productDetails.classList.add("hidden");
    productsContainer.classList.remove("hidden");
});

//search bar functionality
const searchInput=document.getElementById("product-search");
searchInput.addEventListener("input",()=>{
    const searchText=searchInput.value.trim();
    displayProducts(filterAdminProducts(searchText));
});

// Inventory matrix actions are handled in inventory-matrix.js.
const addStockButton = document.getElementById("add-stock-button");
const addNewProductButton = document.getElementById("add-new-product-button");
const productsContainer = document.getElementById("products-container");
const productDetails = document.getElementById("product-details");
const pageHead = document.getElementById("page-head");
const dashboardButton = document.getElementById("dashboard-button");
const productButton = document.getElementById("product-button");
const dashboardPage = document.getElementById("dashboard-page");
const inventoryMatrixPage = document.getElementById("inventory-matrix-page");

function returnToProductsPage() {
    hideAllMainSections();
    pageHead.classList.remove("hidden");
    productsContainer.classList.remove("hidden");
    updateActiveNav(productButton);
}

// Hide all main content sections
function hideAllMainSections() {
    dashboardPage.classList.add("hidden");
    pageHead.classList.add("hidden");
    productsContainer.classList.add("hidden");
    productDetails.classList.add("hidden");
    inventoryMatrixPage.classList.add("hidden");
    document.getElementById("orders-page").classList.add("hidden");
    document.getElementById("add-order-form").classList.add("hidden");
    document.getElementById("order-details-page").classList.add("hidden");
    
}

// Update the active sidebar button
function updateActiveNav(activeButton) {
    document.querySelectorAll(".nav-button").forEach(button => {
        button.classList.remove("active");
    });

    activeButton.classList.add("active");
}

// Dashboard navigation
dashboardButton.addEventListener("click", () => {
    hideAllMainSections();
    dashboardPage.classList.remove("hidden");

    updateActiveNav(dashboardButton);
    loadDashboard();
});

// Product navigation
productButton.addEventListener("click", async () => {
    hideAllMainSections();
    pageHead.classList.remove("hidden");
    productsContainer.classList.remove("hidden");

    updateActiveNav(productButton);
    await refreshProducts();
});


