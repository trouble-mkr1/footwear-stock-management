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
        container.appendChild(card);
    });
}