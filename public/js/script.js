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
    form.querySelectorAll(".field-error").forEach(error => {
        error.remove();
    });

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



// Load Dashboard Summary
function loadDashboard() {
    fetch("/api/dashboard")
        .then(response => {
            if (!response.ok) {
                throw new Error("Failed to load dashboard data");
            }
            return response.json();
        })
        .then(data => {
            document.getElementById("total-products").textContent =
                data.totalProducts;

            document.getElementById("total-stock").textContent =
                data.totalStock;

            document.getElementById("total-orders").textContent =
                data.totalOrders;

            document.getElementById("low-stock").textContent =
                data.lowStock;
        })
        .catch(error => {
            console.error("Dashboard Error:", error);
        });
}

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
        const response = await fetch("/api/products");

        if (!response.ok) {
            throw new Error("Failed to refresh products.");
        }

        const products = await response.json();

        allProducts = products;
        displayProducts(products);

    } catch (error) {
        console.error("Error in Refreshing Products:", error);
        alert(error.message || "Unable to refresh products.");
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

        const stock = document.createElement("p");
        stock.textContent = totalStock > 0
            ? `Available Stock: ${totalStock}`
            : "Out of Stock";

        info.append(artNumber, mrp, price, stock);
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
    document.getElementById("details-price").textContent=`MRP: ₹${product.mrp ?? "Not Set"} | Unit Price: ₹${product.price}`;
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

//Functions of Add Product
const addStockButton=document.getElementById("add-stock-button");
const addStockForm=document.getElementById("add-stock-form");
const productsContainer=document.getElementById("products-container");
const productDetails=document.getElementById("product-details");
const pageHead = document.getElementById("page-head");
const dashboardButton = document.getElementById("dashboard-button");
const productButton = document.getElementById("product-button");
const dashboardPage = document.getElementById("dashboard-page");

addStockButton.addEventListener("click",()=>{

    pageHead.classList.add("hidden");
    productsContainer.classList.add("hidden");
    productDetails.classList.add("hidden");
    addStockForm.classList.remove("hidden");
});




const stockForm = document.getElementById("stock-form");

const validateStockArt = addInlineValidation(
    document.getElementById("stock-art-number"),
    requiredText
);

const validateStockColour = addInlineValidation(
    document.getElementById("stock-colour"),
    requiredText
);

const validateStockSize = addInlineValidation(
    document.getElementById("stock-size"),
    value => positiveWholeNumber(value, "Size")
);

const validateStockQuantity = addInlineValidation(
    document.getElementById("stock-quantity"),
    value => positiveWholeNumber(value, "Quantity")
);

function validateStockForm() {
    return [
        validateStockArt(),
        validateStockColour(),
        validateStockSize(),
        validateStockQuantity()
    ].every(Boolean);
}

stockForm.addEventListener("submit", handleAddStock);


const addNewProductButton=document.getElementById("add-new-product-button");
const addNewProductForm=document.getElementById("add-new-product-form");


function returnToProductsPage() {
    pageHead.classList.remove("hidden");
    productsContainer.classList.remove("hidden");

    addStockForm.classList.add("hidden");
    addNewProductForm.classList.add("hidden");
    addNewVariantForm.classList.add("hidden");
    productDetails.classList.add("hidden");
}


// Add New Colour Variant
const addNewVariantButton = document.getElementById("add-new-variant-button");
const addNewVariantForm = document.getElementById("add-new-variant-form");

addNewVariantButton.addEventListener("click", () => {
    addStockForm.classList.add("hidden");
    addNewVariantForm.classList.remove("hidden");
});
addNewProductButton.addEventListener("click",()=>{
    addStockForm.classList.add("hidden");
    addNewProductForm.classList.remove("hidden");
});

async function handleAddStock(event){
    event.preventDefault();

    const artNumber=document.getElementById("stock-art-number").value.trim();
    const colour=document.getElementById("stock-colour").value;
    const size=document.getElementById("stock-size").value;
    const quantity=document.getElementById("stock-quantity").value;

    if(!validateStockForm()){
        return;
    }
    try {
        const response=await fetch("/api/stock",{
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body: JSON.stringify({
                art_number:artNumber,
                colour:colour,
                size:Number(size),
                quantity:Number(quantity)
            })
        });
        const result=await response.json();
        if(!response.ok)
        {
            throw new Error(result.error||"Failed To Add Stock");
        }
        alert("Stock Added Successfully!");
        await refreshProducts();
        stockForm.reset();
        clearInlineValidation(stockForm);
        returnToProductsPage();
        
        
    }catch(error){
        console.error("Error:ADDING STOCK",error)

        alert(error.message);
    }
}

const newProductForm=document.getElementById("new-product-form");
const newImage = document.getElementById("new-image");
const imagePreview = document.getElementById("image-preview");
const cancelNewProduct = document.getElementById("cancel-new-product");

const validateNewArt = addInlineValidation(
    document.getElementById("new-art-number"),
    requiredText
);

const validateNewColour = addInlineValidation(
    document.getElementById("new-colour"),
    requiredText
);

const validateNewMrp = addInlineValidation(
    document.getElementById("new-mrp"),
    value => positiveDecimal(value, "MRP")
);

const validateNewPrice = addInlineValidation(
    document.getElementById("new-price"),
    value => positiveDecimal(value, "Unit Price")
);

const validateNewSize = addInlineValidation(
    document.getElementById("new-size"),
    value => positiveWholeNumber(value, "Size")
);

const validateNewQuantity = addInlineValidation(
    document.getElementById("new-quantity"),
    value => positiveWholeNumber(value, "Quantity")
);

const validateNewImage = addInlineValidation(
    newImage,
    () => validateImageFile(newImage.files[0])
);

function validateNewProductForm() {
    return [
        validateNewArt(),
        validateNewColour(),
        validateNewMrp(),
        validateNewPrice(),
        validateNewSize(),
        validateNewQuantity(),
        validateNewImage()
    ].every(Boolean);
}

newImage.addEventListener("change", () => {
        const file = newImage.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                imagePreview.src = event.target.result;
                imagePreview.classList.remove("hidden");
            };
            reader.readAsDataURL(file);
        }
        validateNewImage();
    });

cancelNewProduct.addEventListener("click", () => {
    newProductForm.reset();

    imagePreview.src = "";
    imagePreview.classList.add("hidden");

    clearInlineValidation(newProductForm);

    returnToProductsPage();
});

newProductForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const artNumber = document.getElementById("new-art-number").value.trim();
    const colour = document.getElementById("new-colour").value.trim();
    const mrp = document.getElementById("new-mrp").value;
    const price = document.getElementById("new-price").value;
    const size = document.getElementById("new-size").value;
    const quantity = document.getElementById("new-quantity").value;
    const image = document.getElementById("new-image").files[0];
   
    if(!validateNewProductForm()) {
        return;
    }

    try{
        const formData = new FormData();

        formData.append("art_number", artNumber);
        formData.append("colour", colour);
        formData.append("mrp", mrp);
        formData.append("price", price);
        formData.append("size", size);
        formData.append("quantity", quantity);
        formData.append("image", image);

        const response = await fetch("/api/products", {
            method: "POST",
            body: formData
        });
        
        const responseText = await response.text();
        console.log("Status:", response.status);
        console.log("Response:", responseText);

        const result = JSON.parse(responseText);

        if(!response.ok){
            throw new Error(result.error || "Failed To Add Prodct!!");
        }

        alert("Product Added Sucessfully...");

        newProductForm.reset();
        clearInlineValidation(newProductForm);

        imagePreview.src = "";
        imagePreview.classList.add("hidden");

        await refreshProducts();

        returnToProductsPage();
    }catch(error) {
        console.error("Error!! Adding Products:",error);
        alert(error.message);
    }
}); 



// ORDER MANAGEMENT

let allOrders = [];
let editingOrderId = null;

// Main order page elements
const ordersButton = document.getElementById("orders-button");
const ordersPage = document.getElementById("orders-page");
const ordersContainer = document.getElementById("orders-container");
const orderSearch = document.getElementById("order-search");

// Add / Edit form elements
const addOrderButton = document.getElementById("add-order-button");
const addOrderForm = document.getElementById("add-order-form");
const cancelOrder = document.getElementById("cancel-order");
const orderForm = document.getElementById("order-form");
const orderFormTitle = document.getElementById("order-form-title");
const saveOrderButton = document.getElementById("save-order-button");

const orderItemsContainer = document.getElementById("order-items-container");
const addOrderItemButton = document.getElementById("add-order-item");

// Order details elements
const orderDetailsPage = document.getElementById("order-details-page");
const orderDetailsContainer = document.getElementById("order-details-container");
const backToOrders = document.getElementById("back-to-orders");


// Load orders when the Orders section is opened
ordersButton.addEventListener("click", () => {
    hideAllMainSections();

    ordersPage.classList.remove("hidden");

    updateActiveNav(ordersButton);

    loadOrders();
});


// Search orders by company name, order ID or address
orderSearch.addEventListener("input", () => {
    displayFilteredOrders();
});


function displayFilteredOrders() {

    const searchText = orderSearch.value.trim().toLowerCase();

    const filteredOrders = allOrders.filter(order => {

        const company = String(order.company_name || "").toLowerCase();
        const address = String(order.address || "").toLowerCase();
        const orderId = String(order.id || "");

        return (
            company.includes(searchText) ||
            address.includes(searchText) ||
            orderId.includes(searchText)
        );
    });

    displayOrders(filteredOrders);
}


// Fetch all orders
async function loadOrders() {

    try {
        ordersContainer.textContent = "Loading orders...";

        const response = await fetch("/api/orders");

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Failed to load orders.");
        }

        allOrders = result;

        displayFilteredOrders();

    } catch (error) {

        console.error("Load orders error:", error);

        ordersContainer.textContent =
            error.message || "Failed to load orders.";
    }
}


// Create a full-width order card
function displayOrders(orders) {

    ordersContainer.replaceChildren();

    if (!orders || orders.length === 0) {

        const message = document.createElement("p");

        message.className = "empty-orders-message";
        message.textContent = "No orders found.";

        ordersContainer.appendChild(message);

        return;
    }

    orders.forEach(order => {

        const orderCard = document.createElement("div");

        orderCard.className = "order-card";
        orderCard.dataset.id = order.id;
        orderCard.tabIndex = 0;
        orderCard.setAttribute("role", "button");
        orderCard.setAttribute(
            "aria-label",
            `View order ${order.id} for ${order.company_name}`
        );

        const orderInfo = document.createElement("div");
        orderInfo.className = "order-info";

        const titleRow = document.createElement("div");
        titleRow.className = "order-title-row";

        const companyName = document.createElement("h3");
        companyName.className = "order-company-name";
        companyName.textContent = order.company_name || "Unnamed Company";

        const orderId = document.createElement("span");
        orderId.className = "order-id";
        orderId.textContent = `Order #${order.id}`;

        titleRow.append(companyName, orderId);

        const address = document.createElement("p");
        address.className = "order-address";
        address.textContent = `Address: ${order.address || "Not provided"}`;

        const status = document.createElement("span");
        status.className =
            `order-status ${String(order.status).toLowerCase() === "pending"
                ? "pending"
                : "completed"}`;

        status.textContent = order.status || "Unknown";

        orderInfo.append(titleRow, address, status);

        const actions = document.createElement("div");
        actions.className = "order-actions";

        if (String(order.status).toLowerCase() === "pending") {

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "order-action-button edit-order-button";
            editButton.dataset.id = order.id;
            editButton.textContent = "EDIT ORDER";

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "order-action-button delete-order-button";
            deleteButton.dataset.id = order.id;
            deleteButton.textContent = "DELETE ORDER";

            const completeButton = document.createElement("button");
            completeButton.type = "button";
            completeButton.className = "order-action-button complete-order-button";
            completeButton.dataset.id = order.id;
            completeButton.textContent = "COMPLETE ORDER";

            actions.append(editButton, deleteButton, completeButton);
        }

        orderCard.append(orderInfo, actions);

        ordersContainer.appendChild(orderCard);
    });
}


// Add another item row
addOrderItemButton.addEventListener("click", () => {

    const newItem = document.createElement("div");

    newItem.className = "order-item";

    newItem.innerHTML = `
        <label>Art No</label>
        <input
            type="text"
            class="order-art-number"
            placeholder="Enter Art Number"
            required
        >

        <label>Colour</label>
        <input
            type="text"
            class="order-colour"
            placeholder="Enter Colour"
            required
        >

        <label>Size</label>
        <input
            type="number"
            class="order-size"
            min="1"
            step="1"
            placeholder="Enter Size"
            required
        >

        <label>Quantity</label>
        <input
            type="number"
            class="order-quantity"
            min="1"
            step="1"
            placeholder="Enter Quantity"
            required
        >

        <button type="button" class="remove-order-item">
            REMOVE ITEM
        </button>
    `;

    orderItemsContainer.appendChild(newItem);
});


// Remove an additional item row
orderItemsContainer.addEventListener("click", event => {

    const removeButton = event.target.closest(".remove-order-item");

    if (!removeButton) {
        return;
    }

    const item = removeButton.closest(".order-item");

    if (item) {
        item.remove();
    }
});


// Clear form and return it to Add Order mode
function resetOrderForm() {

    orderForm.reset();

    const itemRows = orderItemsContainer.querySelectorAll(".order-item");

    itemRows.forEach((item, index) => {

        if (index > 0) {
            item.remove();
        } else {
            item.querySelector(".order-art-number").value = "";
            item.querySelector(".order-colour").value = "";
            item.querySelector(".order-size").value = "";
            item.querySelector(".order-quantity").value = "";
        }
    });

    if (typeof clearInlineValidation === "function") {
        clearInlineValidation(orderForm);
    }

    editingOrderId = null;

    orderFormTitle.textContent = "ADD ORDER";
    saveOrderButton.textContent = "SAVE ORDER";
}


// Open Add Order form
addOrderButton.addEventListener("click", () => {

    resetOrderForm();

    hideAllMainSections();

    addOrderForm.classList.remove("hidden");

    updateActiveNav(ordersButton);
});


// Cancel Add / Edit Order
cancelOrder.addEventListener("click", () => {

    resetOrderForm();

    hideAllMainSections();

    ordersPage.classList.remove("hidden");

    loadOrders();
});


// Open the Edit Order form and fill existing information
async function editOrder(orderId) {

    try {

        const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}`
        );

        const order = await response.json();

        if (!response.ok) {
            throw new Error(order.error || "Failed to load order.");
        }

        if (String(order.status).toLowerCase() !== "pending") {
            throw new Error("Only pending orders can be edited.");
        }

        resetOrderForm();

        document.getElementById("order-company-name").value =
            order.company_name || "";

        document.getElementById("order-address").value =
            order.address || "";

        const items = order.items || [];

        if (items.length === 0) {
            throw new Error("This order has no items to edit.");
        }

        // Fill the first existing row
        const firstRow = orderItemsContainer.querySelector(".order-item");

        firstRow.querySelector(".order-art-number").value =
            items[0].art_number;

        firstRow.querySelector(".order-colour").value =
            items[0].colour;

        firstRow.querySelector(".order-size").value =
            items[0].size;

        firstRow.querySelector(".order-quantity").value =
            items[0].quantity;

        // Add remaining item rows
        for (let i = 1; i < items.length; i++) {

            const item = items[i];

            const newItem = document.createElement("div");

            newItem.className = "order-item";

            newItem.innerHTML = `
                <label>Art No</label>
                <input
                    type="text"
                    class="order-art-number"
                    value="${escapeOrderValue(item.art_number)}"
                    required
                >

                <label>Colour</label>
                <input
                    type="text"
                    class="order-colour"
                    value="${escapeOrderValue(item.colour)}"
                    required
                >

                <label>Size</label>
                <input
                    type="number"
                    class="order-size"
                    min="1"
                    step="1"
                    value="${Number(item.size)}"
                    required
                >

                <label>Quantity</label>
                <input
                    type="number"
                    class="order-quantity"
                    min="1"
                    step="1"
                    value="${Number(item.quantity)}"
                    required
                >

                <button type="button" class="remove-order-item">
                    REMOVE ITEM
                </button>
            `;

            orderItemsContainer.appendChild(newItem);
        }

        editingOrderId = orderId;

        orderFormTitle.textContent = `EDIT ORDER #${orderId}`;
        saveOrderButton.textContent = "UPDATE ORDER";

        hideAllMainSections();

        addOrderForm.classList.remove("hidden");

        updateActiveNav(ordersButton);

    } catch (error) {

        console.error("Edit order loading error:", error);

        alert(error.message || "Unable to open this order for editing.");
    }
}


// Escape text before inserting into an HTML attribute
function escapeOrderValue(value) {

    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}


// Submit Add Order or Edit Order
orderForm.addEventListener("submit", async event => {

    event.preventDefault();

    const companyName =
        document.getElementById("order-company-name").value.trim();

    const address =
        document.getElementById("order-address").value.trim();

    const itemRows = orderItemsContainer.querySelectorAll(".order-item");

    const items = [];

    for (const row of itemRows) {

        const artNumber =
            row.querySelector(".order-art-number").value.trim();

        const colour =
            row.querySelector(".order-colour").value.trim();

        const sizeValue =
            row.querySelector(".order-size").value;

        const quantityValue =
            row.querySelector(".order-quantity").value;

        const size = Number(sizeValue);
        const quantity = Number(quantityValue);

        if (!artNumber || !colour || !sizeValue || !quantityValue) {
            alert("Please fill in all order item fields.");
            return;
        }

        if (!Number.isInteger(size) || size <= 0) {
            alert("Please enter a valid whole-number size.");
            return;
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            alert("Please enter a valid whole-number quantity.");
            return;
        }

        items.push({
            art_number: artNumber,
            colour: colour,
            size: size,
            quantity: quantity
        });
    }

    if (!companyName || !address || items.length === 0) {
        alert("Please fill in the company name, address and at least one item.");
        return;
    }

    const isEditing = editingOrderId !== null;

    const url = isEditing
        ? `/api/orders/${encodeURIComponent(editingOrderId)}`
        : "/api/orders";

    const method = isEditing ? "PUT" : "POST";

    saveOrderButton.disabled = true;
    saveOrderButton.textContent = isEditing ? "UPDATING..." : "SAVING...";

    try {

        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                company_name: companyName,
                address: address,
                items: items
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to save order.");
        }

        alert(
            isEditing
                ? `Order #${editingOrderId} updated successfully.`
                : `Order #${data.order_id} created successfully.`
        );

        resetOrderForm();

        hideAllMainSections();

        ordersPage.classList.remove("hidden");

        await loadOrders();

    } catch (error) {

        console.error("Save order error:", error);

        alert(error.message || "Something went wrong while saving the order.");

    } finally {

        saveOrderButton.disabled = false;

        if (editingOrderId !== null) {
            saveOrderButton.textContent = "UPDATE ORDER";
        } else {
            saveOrderButton.textContent = "SAVE ORDER";
        }
    }
});


// Delete a pending order
async function deleteOrder(orderId) {

    const confirmed = confirm(
        `Are you sure you want to delete Order #${orderId}?\n\nThe stock from this pending order will be restored.`
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}`,
            {
                method: "DELETE"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to delete order.");
        }

        alert(`Order #${orderId} deleted. Stock has been restored.`);

        await loadOrders();

    } catch (error) {

        console.error("Delete order error:", error);

        alert(error.message || "Unable to delete this order.");
    }
}


// Complete a pending order
async function completeOrder(orderId) {

    const confirmed = confirm(
        `Mark Order #${orderId} as completed?`
    );

    if (!confirmed) {
        return;
    }

    try {

        const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}/complete`,
            {
                method: "PUT"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Failed to complete order.");
        }

        alert(`Order #${orderId} completed successfully.`);

        await loadOrders();

    } catch (error) {

        console.error("Complete order error:", error);

        alert(error.message || "Unable to complete this order.");
    }
}


// Handle clicks on order cards and their action buttons
ordersContainer.addEventListener("click", async event => {

    const editButton = event.target.closest(".edit-order-button");

    if (editButton) {
        await editOrder(editButton.dataset.id);
        return;
    }

    const deleteButton = event.target.closest(".delete-order-button");

    if (deleteButton) {
        await deleteOrder(deleteButton.dataset.id);
        return;
    }

    const completeButton = event.target.closest(".complete-order-button");

    if (completeButton) {
        await completeOrder(completeButton.dataset.id);
        return;
    }

    const orderCard = event.target.closest(".order-card");

    if (orderCard && ordersContainer.contains(orderCard)) {
        await loadOrderDetails(orderCard.dataset.id);
    }
});


// Keyboard support for opening order cards
ordersContainer.addEventListener("keydown", async event => {

    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const orderCard = event.target.closest(".order-card");

    if (!orderCard || event.target !== orderCard) {
        return;
    }

    event.preventDefault();

    await loadOrderDetails(orderCard.dataset.id);
});


// Load individual order details
async function loadOrderDetails(orderId) {

    try {

        const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}`
        );

        const order = await response.json();

        if (!response.ok) {
            throw new Error(order.error || "Failed to load order details.");
        }

        orderDetailsContainer.replaceChildren();

        const detailsCard = document.createElement("div");
        detailsCard.className = "order-details-card";

        const heading = document.createElement("div");
        heading.className = "order-details-heading";

        const companyName = document.createElement("h3");
        companyName.textContent = order.company_name || "Unnamed Company";

        const orderIdLabel = document.createElement("p");
        orderIdLabel.className = "order-details-id";
        orderIdLabel.textContent = `Order #${order.id}`;

        heading.append(companyName, orderIdLabel);

        const address = document.createElement("p");
        address.textContent = `Address: ${order.address || "Not provided"}`;

        const status = document.createElement("p");
        status.textContent = `Status: ${order.status || "Unknown"}`;

        const itemsHeading = document.createElement("h4");
        itemsHeading.textContent = "ORDER ITEMS";

        const itemsList = document.createElement("div");
        itemsList.className = "order-items-list";

        (order.items || []).forEach((item, index) => {

            const itemDetails = document.createElement("div");
            itemDetails.className = "order-items-details";

            const itemNumber = document.createElement("strong");
            itemNumber.textContent = `Item ${index + 1}`;

            const art = document.createElement("p");
            art.textContent = `Art No: ${item.art_number}`;

            const colour = document.createElement("p");
            colour.textContent = `Colour: ${item.colour}`;

            const size = document.createElement("p");
            size.textContent = `Size: ${item.size}`;

            const quantity = document.createElement("p");
            quantity.textContent = `Quantity: ${item.quantity}`;

            itemDetails.append(
                itemNumber,
                art,
                colour,
                size,
                quantity
            );

            itemsList.appendChild(itemDetails);
        });

        const detailsActions = document.createElement("div");
        detailsActions.className = "order-details-actions";

        if (String(order.status).toLowerCase() === "pending") {

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "order-action-button edit-order-button";
            editButton.textContent = "EDIT ORDER";

            editButton.addEventListener("click", () => {
                editOrder(order.id);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "order-action-button delete-order-button";
            deleteButton.textContent = "DELETE ORDER";

            deleteButton.addEventListener("click", async () => {
                await deleteOrder(order.id);

                if (!allOrders.some(item => Number(item.id) === Number(order.id))) {
                    hideAllMainSections();
                    ordersPage.classList.remove("hidden");
                }
            });

            const completeButton = document.createElement("button");
            completeButton.type = "button";
            completeButton.className = "order-action-button complete-order-button";
            completeButton.textContent = "COMPLETE ORDER";

            completeButton.addEventListener("click", async () => {
                await completeOrder(order.id);

                if (allOrders.some(item =>
                    Number(item.id) === Number(order.id) &&
                    String(item.status).toLowerCase() === "completed"
                )) {
                    await loadOrderDetails(order.id);
                }
            });

            detailsActions.append(editButton, deleteButton, completeButton);
        }

        detailsCard.append(
            heading,
            address,
            status,
            itemsHeading,
            itemsList,
            detailsActions
        );

        orderDetailsContainer.appendChild(detailsCard);

        hideAllMainSections();

        orderDetailsPage.classList.remove("hidden");

        updateActiveNav(ordersButton);

    } catch (error) {

        console.error("Load order details error:", error);

        alert(error.message || "Unable to load order details.");
    }
}


// Back to Orders list
backToOrders.addEventListener("click", () => {

    hideAllMainSections();

    ordersPage.classList.remove("hidden");

    loadOrders();
});

// Hide all main content sections
function hideAllMainSections() {
    dashboardPage.classList.add("hidden");
    pageHead.classList.add("hidden");
    productsContainer.classList.add("hidden");
    productDetails.classList.add("hidden");
    addStockForm.classList.add("hidden");
    addNewProductForm.classList.add("hidden");
    addNewVariantForm.classList.add("hidden");
    ordersPage.classList.add("hidden");
    addOrderForm.classList.add("hidden");
    orderDetailsPage.classList.add("hidden");
    
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
productButton.addEventListener("click", () => {
    hideAllMainSections();
    pageHead.classList.remove("hidden");
    productsContainer.classList.remove("hidden");

    updateActiveNav(productButton);
});


// Add New Colour Variant functionality

const newVariantForm = document.getElementById("new-variant-form");
const variantImage = document.getElementById("variant-image");
const variantImagePreview = document.getElementById("variant-image-preview");
const cancelNewVariant = document.getElementById("cancel-new-variant");



const validateVariantArt = addInlineValidation(
    document.getElementById("variant-art-number"),
    requiredText
);

const validateVariantColour = addInlineValidation(
    document.getElementById("variant-colour"),
    requiredText
);

const validateVariantSize = addInlineValidation(
    document.getElementById("variant-size"),
    value => positiveWholeNumber(value, "Size")
);

const validateVariantQuantity = addInlineValidation(
    document.getElementById("variant-quantity"),
    value => positiveWholeNumber(value, "Quantity")
);

const validateVariantImage = addInlineValidation(
    variantImage,
    () => validateImageFile(variantImage.files[0])
);

function validateNewVariantForm() {
    return [
        validateVariantArt(),
        validateVariantColour(),
        validateVariantSize(),
        validateVariantQuantity(),
        validateVariantImage()
    ].every(Boolean);
}



variantImage.addEventListener("change", () => {
    const file = variantImage.files[0];

    if (file) {
        const reader = new FileReader();

        reader.onload = (event) => {
            variantImagePreview.src = event.target.result;
            variantImagePreview.classList.remove("hidden");
        };

        reader.readAsDataURL(file);
    }

    validateVariantImage();
});


cancelNewVariant.addEventListener("click", () => {
    newVariantForm.reset();
    clearInlineValidation(newVariantForm);

    variantImagePreview.src = "";
    variantImagePreview.classList.add("hidden");

    returnToProductsPage();
});


newVariantForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const artNumber = document.getElementById("variant-art-number").value.trim();
    const colour = document.getElementById("variant-colour").value.trim();
    const size = document.getElementById("variant-size").value;
    const quantity = document.getElementById("variant-quantity").value;
    const image = variantImage.files[0];

    if (!validateNewVariantForm()) {
        return;
    }

    try {
        const formData = new FormData();

        formData.append("colour", colour);
        formData.append("size", size);
        formData.append("quantity", quantity);
        formData.append("image", image);

        const response = await fetch(
            `/api/products/${encodeURIComponent(artNumber)}/variants`,
            {
                method: "POST",
                body: formData
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Failed to add colour.");
        }

        alert("New colour added successfully!");

        newVariantForm.reset();
        clearInlineValidation(newVariantForm);
        variantImagePreview.src = "";
        variantImagePreview.classList.add("hidden");


        await refreshProducts();

        returnToProductsPage();

    } catch (error) {
        console.error("Add colour error:", error);
        alert(error.message);
    }
});


// Open the requested admin section when navigating from another page
const requestedAdminPage =
    new URLSearchParams(window.location.search).get("page");

if (requestedAdminPage === "dashboard") {
    dashboardButton.click();
} else if (requestedAdminPage === "products") {
    productButton.click();
} else if (requestedAdminPage === "orders") {
    ordersButton.click();
}