// fetch("/api/products")
//     .then(response => response.json())
//     .then(products => {

//         const container = document.getElementById("products-container");

//         container.innerHTML = "";

//         products.forEach(product => {
//             const productCard = document.createElement("div");

//             productCard.innerHTML = `
//                 <h2>Art No: ${product.art_number}</h2>
//                 <p>Price: ₹${product.price}</p>
//                 `;

//             container.appendChild(productCard);
//         });

//     })
//     .catch(error => {
//         console.error("Error:", error);
//     });

//console.log("Footwear Stock Management loaded");
console.log("Scripts running");

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
    .then(response => response.json())
    .then(products => {
        allProducts = products;
        displayProducts(products);
    })
    .catch(error => {
        console.error("Error Loading Products:", error);
    });

async function refreshProducts() {
    try {
        const response=await fetch("/api/products");
        const products=await response.json();
        allProducts=products;
        displayProducts(products);
    } catch(error){
        console.error("Error in Refreshing Products!! ",error);
    }
}

function displayProducts(products){
    const container=document.getElementById("products-container");
    container.innerHTML="";
    if(products.length===0){//if table is empty or does not contain the value  
        container.innerHTML="<p>'No Products Found'</p>";
        return;
    }
    products.forEach(product=>{
        let totalstock=0;
        let image="";
        product.variants.forEach(variant=>{
            image=variant.image;
            variant.stock.forEach(stockItem=>{
                totalstock+=Number(stockItem.quantity);
            });
        });
        const card=document.createElement("div");
        card.className="product-card";
        card.innerHTML=`
            <img
                src="/images/${image}"
                alt="Footwear ${product.art_number}"
                class="product-image"
            >
            <div class="product-info">
                <h3>Art No: ${product.art_number}</h3>
                <p>MRP: ₹${product.mrp ?? "Not Set"}</p>
                <p>Unit Price: ₹${product.price}</p>
                <p>
                    ${
                        totalstock>0
                        ?`Available Stock: ${totalstock}`
                        :"Out of Stock"
                    }
               </p>
            </div>
        `;
        card.addEventListener("click",()=>{
            console.log("product:",product);
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
function showVariant(selectedVariant,allVariants){
    const image=document.getElementById("details-image");
    image.src=`/images/${selectedVariant.image}`;
    const tableBody=document.getElementById("stock-table-body");
    tableBody.innerHTML="";
    selectedVariant.stock.forEach(stockItem=>{
        const row=document.createElement("tr");

        row.innerHTML=`
        <td>${stockItem.size}</td>
        <td>${stockItem.quantity}</td>
        `;
        tableBody.appendChild(row);
    });

    //upadting active colour button
    const buttons=document.querySelectorAll(".colour-button");
    buttons.forEach(button=>{
        button.classList.toggle(
            "active-colour",
            button.textContent===selectedVariant.colour
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



const stockForm =document.getElementById("stock-form");
stockForm.addEventListener("submit",handleAddStock);

const addNewProductButton=document.getElementById("add-new-product-button");
const addNewProductForm=document.getElementById("add-new-product-form");

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

    if(artNumber===""||colour===""||size===""||quantity===""){
        alert("Please Fill All The Fields.");
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
        
        addStockForm.classList.add("hidden");
        productsContainer.classList.remove("hidden");
    }catch(error){
        console.error("Error:ADDING STOCK",error)

        alert(error.message);
    }
}

const newProductForm=document.getElementById("new-product-form");
const newImage = document.getElementById("new-image");
const imagePreview = document.getElementById("image-preview");
const cancelNewProduct = document.getElementById("cancel-new-product");
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
    });

cancelNewProduct.addEventListener("click", () => {
    newProductForm.reset();
    imagePreview.src = "";
    imagePreview.classList.add("hidden");
    addNewProductForm.classList.add("hidden");
    productsContainer.classList.remove("hidden");
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
   
    if(artNumber === "" ||
        colour === "" ||
        mrp === "" ||
        price === "" ||
        size === "" ||
        quantity === ""||
        !image
    ){
        alert("Please Fill all the Fields!!");
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

        addNewProductForm.classList.add("hidden");
        productsContainer.classList.remove("hidden");

        await refreshProducts();
    }catch(error) {
        console.error("Error!! Adding Products:",error);
        alert(error.message);
    }
}); 

//Order-Page
let allOrders = [];

fetch("/api/orders")
    .then(response => response.json())
    .then(orders => {
        allOrders = orders;
        displayOrders(orders);
    })
    .catch(error => {
        console.error("Error Loading Orders", error);
    });

const ordersButton = document.getElementById("orders-button");
const ordersPage = document.getElementById("orders-page");
const ordersContainer = document.getElementById("orders-container");
const orderSearch = document.getElementById("order-search");

orderSearch.addEventListener("input", () =>{
    const searchText = orderSearch.value.toLowerCase();
    const filteredOrder = allOrders.filter(order =>
        order.company_name.toLowerCase().includes(searchText) ||
        order.art_number.toLowerCase().includes(searchText)
    );
    displayOrders(filteredOrder);
});

const addOrderButton = document.getElementById("add-order-button");
const addOrderForm = document.getElementById("add-order-form");
const cancelOrder = document.getElementById("cancel-order");
const orderForm = document.getElementById("order-form");
const orderItemsContainer = document.getElementById("order-items-container");
const addOrderItemButton = document.getElementById("add-order-item");

const orderDetailsPage = document.getElementById("order-details-page");
const orderDetailsContainer = document.getElementById("order-details-container");
const backToOrders = document.getElementById("back-to-orders");

// Orders navigation
ordersButton.addEventListener("click", () => {
    hideAllMainSections();
    ordersPage.classList.remove("hidden");

    updateActiveNav(ordersButton);
    loadOrders();
});


addOrderButton.addEventListener("click", () => {
    ordersPage.classList.add("hidden");
    addOrderForm.classList.remove("hidden");
});
cancelOrder.addEventListener("click", () => {
    ordersPage.classList.remove("hidden");
    addOrderForm.classList.add("hidden");

    loadOrders();
});

addOrderItemButton.addEventListener("click", () => {
    const newItem = document.createElement("div");
    newItem.classList.add("order-item");
    newItem.innerHTML = `<label> Art No: <label>
    <input 
        type = "text"
        class = "order-art-number"
        placeholder = "Enter Art Number"
        required
    >   
    <label> Colour: <label>
    <input
        type = "text"
        class = "order-colour"
        placeholder = "Enter Colour"
        required
    >
    <label> Size: <label>
    <input
        type = "number" 
        class = "order-size"
        placeholder = "Enter Size"
        required
    >
    <label> Quantity: <label>
    <input
        type = "number"
        class = "order-quantity"
        placeholder = "Enter Quantity"
        required
    > 
    `;
    orderItemsContainer.appendChild(newItem);
});

orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const companyName = document.getElementById("order-company-name").value;
    const address = document.getElementById("order-address").value;
    const orderItems = document.querySelectorAll(".order-item");
    const items = [];
    orderItems.forEach(item => {
        const artNumber = item.querySelector(".order-art-number").value;
        const colour = item.querySelector(".order-colour").value;
        const size = item.querySelector(".order-size").value;
        const quantity = item.querySelector(".order-quantity").value;

        items.push({
            art_number: artNumber,
            colour: colour,
            size: size,
            quantity: quantity
        });
    });

    try {
        const response = await fetch("/api/orders", {
            method: "POST",
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

        if(!response.ok) {
            alert(data.error || "Failed To Add Orders!!!");
            return;
        }
        alert("Order Added Sucessfully..");
        orderForm.reset();

        addOrderForm.classList.add("hidden");
        ordersPage.classList.remove("hidden");

        loadOrders();
    } catch (error) {
        console.error("ERROR: FAILED IN ADDING ORDER!!!", error);
        alert("Something Went Wrong While Adding The Order..");
    }
});

async function loadOrders() {
    try {
        const response = await fetch("/api/orders");
        const orders = await response.json();
        displayOrders(orders);
    }catch (error) {
        console.error("ERROR IN LOADING ORDERS!!!", error);
        ordersContainer.innerHTML = "Failed To Load Orders!!!";
    }
}

function displayOrders(orders) {
    ordersContainer.innerHTML = "";
    if (orders.length === 0){
        ordersContainer.innerHTML = "<p>NO Pending Orders.</p>";
        return;
    }
    orders.forEach(order => {
        const orderCard = document.createElement("div");
        orderCard.classList.add("order-card");
        orderCard.innerHTML = `
        <div class="order-info"> 
            <h3 class="order-company-name" data-id="${order.id}">
            ${order.company_name}
            </h3>
            <p>Address: ${order.address}</p>
            <p>Status: ${order.status}</p>
        </div>
        <button class="complete-order-button" data-id="${order.id}">COMPLETE</button>    
        `;
        ordersContainer.appendChild(orderCard);
    });
}

ordersContainer.addEventListener("click", async (event) => {
    if(!event.target.classList.contains("order-company-name")) {
        return;
    }

    const orderId = event.target.dataset.id;
    await loadOrderDetails(orderId);
})

async function loadOrderDetails(orderId) {
    try {
        const response = await fetch(`/api/orders/${orderId}`);

        const order = await response.json();
        if(!response.ok) {
            alert(order.error || "Failed To Load Order Detalis!!");
            return;
        }
        orderDetailsContainer.innerHTML = `
        <div class="order-deatls-card">
            <h3>${order.company_name}</h3>
             <p><strong>Address:</strong>
                ${order.address}</p>
            <p><strong>Status:</strong>
                ${order.status}</p>
            <h4>Order Items:</h4>
            <div class="order-items-list">
                ${order.items.map(item =>`
                     <div class="order-items-details">
                        <p><strong>Art No:</strong>
                         ${item.art_number}</p>
                        <p><strong>Colour:</strong>
                            ${item.colour}</p>
                        <p><strong>Size:</strong>
                            ${item.size}</p>
                        <p><strong>Quantity:</strong>
                            ${item.quantity}</p>
            </div>
            `).join("")};    
        </div>
         `;
        ordersPage.classList.add("hidden");
        addOrderForm.classList.add("hidden");
        orderDetailsPage.classList.remove("hidden");
    } catch(error) {
        console.error("ERROR: IN LOADING DETAILS!!!", error);
        alert("Something Went Wrong While Loading Details.");
    }
}


ordersContainer.addEventListener("click", async (event) => {
    if(!event.target.classList.contains("complete-order-button")) {
        return;
    }

    const orderId = event.target.dataset.id;

    try {
        const respone = await fetch(`/api/orders/${orderId}/complete`, {
            method: "PUT"
        });

        const data = await respone.json();
        if(!respone.ok) {
            alert(data.error || "Failed To Complete Orders!!");
            return;
        }

        alert("Order Completed Successfully..");

        loadOrders();
    } catch (error) {
        console.error("ERROR: IN COMPLETING ORDER!!!", error);
        alert("Something Went Wrong While Completing The Order..");
    }
});

backToOrders.addEventListener("click", () => {
    orderDetailsPage.classList.add("hidden");
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
});

cancelNewVariant.addEventListener("click", () => {
    newVariantForm.reset();
    variantImagePreview.src = "";
    variantImagePreview.classList.add("hidden");

    addNewVariantForm.classList.add("hidden");
    addStockForm.classList.remove("hidden");
});

newVariantForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const artNumber = document.getElementById("variant-art-number").value.trim();
    const colour = document.getElementById("variant-colour").value.trim();
    const size = document.getElementById("variant-size").value;
    const quantity = document.getElementById("variant-quantity").value;
    const image = variantImage.files[0];

    if (!artNumber || !colour || !size || !quantity || !image) {
        alert("Please fill all fields.");
        return;
    }

    if (!Number.isInteger(Number(size)) || Number(size) <= 0) {
        alert("Size must be a positive whole number.");
        return;
    }

    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
        alert("Quantity must be a positive whole number.");
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
        variantImagePreview.src = "";
        variantImagePreview.classList.add("hidden");

        addNewVariantForm.classList.add("hidden");
        productsContainer.classList.remove("hidden");

        await refreshProducts();

    } catch (error) {
        console.error("Add colour error:", error);
        alert(error.message);
    }
});
