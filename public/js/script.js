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
let allProducts = [];
let selectedStockProduct=null;
let selectedStockVariant=null;

async function loadProduct(){
    try {
        const response=await fetch("/api/products");
        const products=await response.json();
        allProducts=products;
        displayProducts(products);
        setupAddStockSearch();
    } catch(error){
        console.error("Error Loading Products:",error);
    }
}
loadProduct();

async function refreshProduct() {
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
                <p>Price: ₹${product.price}</p>
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
    document.getElementById("details-price").textContent=`Price: ₹${product.price}`;
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

addStockButton.addEventListener("click",()=>{

    productsContainer.classList.add("hidden");
    productDetails.classList.add("hidden");
    addStockForm.classList.remove("hidden");
});

//Add stock search functionality
function setupAddStockSearch(){
    const artInput=document.getElementById("stock-art-number");
    const suggestions=document.getElementById("art-suggestions");
    artInput.addEventListener("input",()=>{
        const searchText=artInput.value.trim().toLowerCase();
        suggestions.innerHTML="";
        if(searchText===""){
            suggestions.classList.add("hidden");
            return;
        }
        const matchingProducts=allProducts.filter(product=>
            product.art_number.toString()
            .toLowerCase()
            .includes(searchText) 
        );
        if(matchingProducts.length===0){
            suggestions.innerHTML="<p>No Products Found</p>";
            suggestions.classList.remove("hidden");
            return;
        }
        matchingProducts.forEach(product=>{
            const suggestion=document.createElement("div");
            suggestion.className="art-suggestion";
            suggestion.textContent=product.art_number;
            suggestion.addEventListener("click",()=>{
                artInput.value=product.art_number;
                suggestions.classList.add("hidden");
                loadStockColours(product);
           
        });
        suggestions.appendChild(suggestion);
        });
        suggestions.classList.remove("hidden");
    });
}
function loadStockColours(product){
    selectedStockProduct=product;
    selectedStockVariant=null;

    const colourSelect=document.getElementById("stock-colour");
    colourSelect.innerHTML='<option value="">Select Colour</option>';
    product.variants.forEach(variant=>{
        const option=document.createElement("option");
        option.value=variant.colour;
        option.textContent=variant.colour;
        colourSelect.appendChild(option);
    });
}
//Colour Selection functionality
const stockColourSelect=document.getElementById("stock-colour");
stockColourSelect.addEventListener("change",()=>{
    const selectedColour=stockColourSelect.value;
    if(!selectedStockProduct||selectedColour===""){
        selectedStockVariant=null;
        return;
    }
    selectedStockVariant=selectedStockProduct.variants.find(
        variant=>variant.colour==selectedColour
    );

    console.log("Selected Product:",selectedStockProduct);
    console.log("Selected Variant:",selectedStockVariant);
});


const stockForm =document.getElementById("stock-form");
stockForm.addEventListener("submit",handleAddStock);

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
        await refreshProduct();
        stockForm.reset();
        
        addStockForm.classList.add("hidden");
        productsContainer.classList.remove("hidden");
    }catch(error){
        console.error("Error:ADDING STOCK",error)

        alert("Failed To Add Stock!!");
    }
}