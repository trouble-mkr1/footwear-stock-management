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

        const filteredProducts = allProducts.filter(product =>
            String(product.art_number).includes(searchText)
        );

        displayProducts(filteredProducts);

        return true;

    } catch (error) {
        console.error("Error refreshing products:", error);
        return false;
    }
}

function displayProducts(products) {
    const container = document.getElementById("products-container");
    container.replaceChildren();

    if (!products || products.length === 0) {
        const message = document.createElement("p");
        message.textContent = "No Products Found";
        container.appendChild(message);
        return;
    }

    products.forEach(product => {
        let totalStock = 0;
        let image = "";

        product.variants.forEach(variant => {
            image = variant.image;

            variant.stock.forEach(stockItem => {
                totalStock += Number(stockItem.quantity);
            });
        });

        const card = document.createElement("div");
        card.className = "product-card";

        const productImage = document.createElement("img");
        productImage.className = "product-image";
        productImage.alt = `Footwear ${product.art_number}`;

        if (image) {
            productImage.src = `/images/${encodeURIComponent(image)}`;
        }

        const info = document.createElement("div");
        info.className = "product-info";

        const artNumber = document.createElement("h3");
        artNumber.textContent = `Art No: ${product.art_number}`;

        const mrp = document.createElement("p");
        mrp.textContent = `MRP: ₹${product.mrp ?? "Not Set"}`;

        const price = document.createElement("p");
        price.textContent = `Unit Price: ₹${product.price}`;

        const brand = document.createElement("p");
        brand.textContent = `Brand: ${product.brand || "Not Set"}`;

        const tags = document.createElement("p");
        tags.textContent = Array.isArray(product.tags) && product.tags.length
            ? `Tags: ${product.tags.join(", ")}` : "";

        const stock = document.createElement("p");
        stock.textContent = totalStock > 0
            ? `Available Stock: ${totalStock}`
            : "Out of Stock";

        info.append(artNumber, brand, tags, mrp, price, stock);
        card.append(productImage, info);

        card.addEventListener("click", () => {
            showProductDetails(product);
        });

        container.appendChild(card);
    });
}

// shows product details 
function showProductDetails(product){
    const productsContainer=document.getElementById("products-container");
    const productDetails=document.getElementById("product-details");
    

    //Hide Catalogue Ass
    productsContainer.classList.add("hidden");//basically calling from css bro
    //shows product  info
    productDetails.classList.remove("hidden");
    document.getElementById("details-art-number").textContent=`Art No:${product.art_number}`;
    document.getElementById("details-price").textContent=
        `Brand: ${product.brand || "Not Set"} | MRP: ₹${product.mrp ?? "Not Set"} | Unit Price: ₹${product.price}`;
    const colourButtons=document.getElementById("colour-buttons");
    colourButtons.innerHTML="";

    product.variants.forEach((variant,index)=>{
        const button=document.createElement("button");
        button.textContent=variant.colour;
        button.className="colour-button";
        button.addEventListener("click",()=>{
            showVariant(variant,product.variants);
        });
        colourButtons.appendChild(button);
        if(index===0){//shows first variant from the table 
            showVariant(variant,product.variants);
            button.classList.add("active-colour");
        }
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
    const filteredProducts=allProducts.filter(product=>{
        return product.art_number.toString()
        .includes(searchText);
    });
    displayProducts(filteredProducts);
});

// Inventory matrix actions are handled in inventory-matrix.js.
const addStockButton = document.getElementById("add-stock-button");
const addNewProductButton = document.getElementById("add-new-product-button");
const addNewVariantButton = document.getElementById("add-new-variant-button");
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


