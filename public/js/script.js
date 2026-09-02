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
fetch("/api/products")
    .then(response =>response.json())
    .then(products=>{
        allProducts=products;
        displayProducts(products);
    })
    .catch(error=>{
        console.error("Error Loading Products:",error);
    });
function displayProducts(products){
    const container=document.getElementById("products-container");
    container.innerHTML="";
    if(products.length===0){//if table is empty 
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