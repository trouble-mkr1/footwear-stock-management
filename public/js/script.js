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
        loadDashboard();
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

        loadDashboard();

        returnToProductsPage();
    }catch(error) {
        console.error("Error!! Adding Products:",error);
        alert(error.message);
    }
}); 

// //Order-Page
// let allOrders = [];

// fetch("/api/orders")
//     .then(response => {
//         if (!response.ok) {
//             throw new Error("Failed to load orders.");
//         }

//         return response.json();
//     })
//     .then(orders => {
//         allOrders = orders;
//         displayOrders(orders);
//     })
//     .catch(error => {
//         console.error("Error Loading Orders:", error);
//         document.getElementById("orders-container").textContent =
//             "Failed to load orders. Please try again.";
//     });

// const ordersButton = document.getElementById("orders-button");
// const ordersPage = document.getElementById("orders-page");
// const ordersContainer = document.getElementById("orders-container");
// const orderSearch = document.getElementById("order-search");


// orderSearch.addEventListener("input", () => {
//     const searchText = orderSearch.value.trim().toLowerCase();

//     const filteredOrders = allOrders.filter(order =>
//         (order.company_name || "").toLowerCase().includes(searchText)
//     );

//     displayOrders(filteredOrders);
// });


// const addOrderButton = document.getElementById("add-order-button");
// const addOrderForm = document.getElementById("add-order-form");
// const cancelOrder = document.getElementById("cancel-order");
// const orderForm = document.getElementById("order-form");
// const orderItemsContainer = document.getElementById("order-items-container");
// const addOrderItemButton = document.getElementById("add-order-item");

// const orderDetailsPage = document.getElementById("order-details-page");
// const orderDetailsContainer = document.getElementById("order-details-container");
// const backToOrders = document.getElementById("back-to-orders");

// // Orders navigation
// ordersButton.addEventListener("click", () => {
//     hideAllMainSections();
//     ordersPage.classList.remove("hidden");

//     updateActiveNav(ordersButton);
//     loadOrders();
// });


// addOrderButton.addEventListener("click", () => {
//     ordersPage.classList.add("hidden");
//     addOrderForm.classList.remove("hidden");
// });
// cancelOrder.addEventListener("click", () => {
//     ordersPage.classList.remove("hidden");
//     addOrderForm.classList.add("hidden");

//     loadOrders();
// });

// addOrderItemButton.addEventListener("click", () => {
//     const newItem = document.createElement("div");
//     newItem.classList.add("order-item");

//     newItem.innerHTML = `
//         <label>Art No</label>
//         <input
//             type="text"
//             class="order-art-number"
//             placeholder="Enter Art Number"
//             required
//         >

//         <label>Colour</label>
//         <input
//             type="text"
//             class="order-colour"
//             placeholder="Enter Colour"
//             required
//         >

//         <label>Size</label>
//         <input
//             type="number"
//             class="order-size"
//             min="1"
//             step="1"
//             placeholder="Enter Size"
//             required
//         >

//         <label>Quantity</label>
//         <input
//             type="number"
//             class="order-quantity"
//             min="1"
//             step="1"
//             placeholder="Enter Quantity"
//             required
//         >

//         <button type="button" class="remove-order-item">
//             Remove Item
//         </button>
//     `;

//     orderItemsContainer.appendChild(newItem);
// });

// orderItemsContainer.addEventListener("click", event => {
//     const removeButton = event.target.closest(".remove-order-item");

//     if (!removeButton) {
//         return;
//     }

//     const item = removeButton.closest(".order-item");

//     if (item) {
//         item.remove();
//     }
// });

// orderForm.addEventListener("submit", async (event) => {
//     event.preventDefault();

//     const companyName = document.getElementById("order-company-name").value.trim();
//     const address = document.getElementById("order-address").value.trim();
//     const orderItems = document.querySelectorAll(".order-item");
//     const items = [];
//     orderItems.forEach(item => {
//         const artNumber = item.querySelector(".order-art-number").value.trim();
//         const colour = item.querySelector(".order-colour").value.trim();
//         const size = Number(item.querySelector(".order-size").value);
//         const quantity = Number(item.querySelector(".order-quantity").value);

//         items.push({
//             art_number: artNumber,
//             colour: colour,
//             size: size,
//             quantity: quantity
//         });
//     });

//     try {
//         const response = await fetch("/api/orders", {
//             method: "POST",
//             headers: {
//                 "Content-Type": "application/json"
//             },
//             body: JSON.stringify({
//                 company_name: companyName,
//                 address: address,
//                 items: items
//             })
//         });

//         const data = await response.json();

        
//         if (!response.ok) {
//             throw new Error(data.error || "Failed to add order.");
//         }

//         // Clear the form
//         orderForm.reset();

//         // Remove extra item rows
//         orderItemsContainer.querySelectorAll(".order-item").forEach(
//             (item, index) => {
//                 if (index > 0) {
//                     item.remove();
//                 }
//             }
//         );

//         // Return to Orders page
//         addOrderForm.classList.add("hidden");
//         ordersPage.classList.remove("hidden");

//         // Update both orders and stock immediately
//         await Promise.all([
//             loadOrders(),
//             refreshProducts()
//         ]);

//         // Update dashboard statistics
//         loadDashboard();

//         // Show success after the refresh requests finish
//         alert("Order added successfully!");

//     } catch (error) {
//         console.error("ERROR: FAILED IN ADDING ORDER!!!", error);
//         alert("Something Went Wrong While Adding The Order..");
//     }
// });


// async function loadOrders() {
//     try {
//         const response = await fetch("/api/orders");

//         if (!response.ok) {
//             throw new Error("Failed to load orders.");
//         }

//         const orders = await response.json();

//         allOrders = orders;

//         const searchText = orderSearch.value.trim().toLowerCase();

//         const filteredOrders = allOrders.filter(order =>
//             (order.company_name || "").toLowerCase().includes(searchText)
//         );

//         displayOrders(filteredOrders);

//     } catch (error) {
//         console.error("ERROR IN LOADING ORDERS!!!", error);
//         ordersContainer.textContent = "Failed to load orders.";
//     }
// }


// function displayOrders(orders) {
//     ordersContainer.replaceChildren();

//     if (!orders || orders.length === 0) {
//         const message = document.createElement("p");
//         message.textContent = "No Pending Orders.";
//         ordersContainer.appendChild(message);
//         return;
//     }

//     orders.forEach(order => {
//         const orderCard = document.createElement("div");
//         orderCard.classList.add("order-card");

//         const orderInfo = document.createElement("div");
//         orderInfo.className = "order-info";

//         const companyName = document.createElement("h3");
//         companyName.className = "order-company-name";
//         companyName.dataset.id = order.id;
//         companyName.textContent = order.company_name || "Unnamed Company";

//         const address = document.createElement("p");
//         address.textContent = `Address: ${order.address || "Not provided"}`;

//         const status = document.createElement("p");
//         status.textContent = `Status: ${order.status || "Unknown"}`;

//         const completeButton = document.createElement("button");
//         completeButton.className = "complete-order-button";
//         completeButton.dataset.id = order.id;
//         completeButton.textContent = "COMPLETE";

//         orderInfo.append(companyName, address, status);
//         orderCard.append(orderInfo, completeButton);

//         ordersContainer.appendChild(orderCard);
//     });
// }

// ordersContainer.addEventListener("click", async (event) => {
//     const companyName = event.target.closest(".order-company-name");

//     if (!companyName || !ordersContainer.contains(companyName)) {
//         return;
//     }

//     const orderId = companyName.dataset.id;
//     await loadOrderDetails(orderId);
// });

// async function loadOrderDetails(orderId) {
//     try {
//         const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);

//         const order = await response.json();

//         if (!response.ok) {
//             throw new Error(order.error || "Failed to load order details.");
//         }

//         orderDetailsContainer.replaceChildren();

//         const detailsCard = document.createElement("div");
//         detailsCard.className = "order-deatls-card";

//         const companyName = document.createElement("h3");
//         companyName.textContent = order.company_name || "Unnamed Company";

//         const address = document.createElement("p");
//         address.textContent = `Address: ${order.address || "Not provided"}`;

//         const status = document.createElement("p");
//         status.textContent = `Status: ${order.status || "Unknown"}`;

//         const itemsHeading = document.createElement("h4");
//         itemsHeading.textContent = "Order Items:";

//         const itemsList = document.createElement("div");
//         itemsList.className = "order-items-list";

//         (order.items || []).forEach(item => {
//             const itemDetails = document.createElement("div");
//             itemDetails.className = "order-items-details";

//             const art = document.createElement("p");
//             art.textContent = `Art No: ${item.art_number}`;

//             const colour = document.createElement("p");
//             colour.textContent = `Colour: ${item.colour}`;

//             const size = document.createElement("p");
//             size.textContent = `Size: ${item.size}`;

//             const quantity = document.createElement("p");
//             quantity.textContent = `Quantity: ${item.quantity}`;

//             itemDetails.append(art, colour, size, quantity);
//             itemsList.appendChild(itemDetails);
//         });

//         detailsCard.append(
//             companyName,
//             address,
//             status,
//             itemsHeading,
//             itemsList
//         );

//         orderDetailsContainer.appendChild(detailsCard);

//         ordersPage.classList.add("hidden");
//         addOrderForm.classList.add("hidden");
//         orderDetailsPage.classList.remove("hidden");

//     } catch (error) {
//         console.error("ERROR: IN LOADING DETAILS!!!", error);
//         alert(error.message || "Something went wrong while loading details.");
//     }
// }


// ordersContainer.addEventListener("click", async (event) => {
//     const completeButton = event.target.closest(".complete-order-button");

//     if (!completeButton || !ordersContainer.contains(completeButton)) {
//         return;
//     }

//     const orderId = completeButton.dataset.id;

//     try {
//         const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/complete`, {
//             method: "PUT"
//         });

//         const data = await response.json();

//         if (!response.ok) {
//             throw new Error(data.error || "Failed to complete order.");
//         }

//         alert("Order Completed Successfully!");

//         await loadOrders();
//         await refreshProducts();
//         loadDashboard();

//     } catch (error) {
//         console.error("ERROR: IN COMPLETING ORDER!!!", error);
//         alert(error.message || "Something went wrong while completing the order.");
//     }
// });

// backToOrders.addEventListener("click", () => {
//     orderDetailsPage.classList.add("hidden");
//     ordersPage.classList.remove("hidden");
//     loadOrders();
// });



// Hide all main content sections
function hideAllMainSections() {
    dashboardPage.classList.add("hidden");
    pageHead.classList.add("hidden");
    productsContainer.classList.add("hidden");
    productDetails.classList.add("hidden");
    addStockForm.classList.add("hidden");
    addNewProductForm.classList.add("hidden");
    addNewVariantForm.classList.add("hidden");
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

        loadDashboard();

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