const orderSelect = document.getElementById("billing-order-select");
const invoiceContainer = document.getElementById("invoice-container");
const message = document.getElementById("billing-message");
const printButton = document.getElementById("print-invoice");

let billingOrders = [];
let products = [];

async function loadBillingData() {
    try {
        message.textContent = "Loading orders . . . ";

        const [ordersResponse, productsResponse] = await Promise.all([
            fetch("/api/billing/orders"),
            fetch("/api/products")
        ]);

        if (!ordersResponse.ok || !productsResponse.ok) {
            throw new Error("Could not load billing data");
        }

        billingOrders = await ordersResponse.json();
        products = await productsResponse.json();

        orderSelect.innerHTML = '<option value = "">Select an order</option>';

        billingOrders.forEach(order => {
            const option = document.createElement("option");
            option.value = order.id;
            option.textContent = 
                `Order #${order.id} - ${order.company_name} (${order.status})`;
            
            orderSelect.appendChild(option);
        });

        message.textContent = billingOrders.length
            ? "Select an order to prepare its invoice."
            : "No orders found yet.";
    } catch (error) {
        console.error(error);
        message.textContent = 
            "Unable to load a billing data. check that the server is running.";
    } 
}

orderSelect.addEventListener("change", async () => {
    const orderId = orderSelect.value;

    invoiceContainer.innerHTML = "";
    printButton.disabled = true;

    if (!orderId) {
        message.textContent = "Select an order to prepare its invoice.";
        return;
    }

    try {
        message.textContent = "Preparing invoice . . .";

        const response = await fetch(`/api/orders/${orderId}`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                errorData.error || "Could not load order details"
            );
        }

        const order = await response.json();
        renderInvoice(order);
        message.textContent = "";
        printButton.disabled = false;

    } catch (error) {
        console.error("error loading order details:", error);
        message.textContent = error.message || "Unable to load this orders details.";
    }
});

function getProductPrice(artNumber) {
    const product = products.find(
        item => String(item.art_number) === String(artNumber)
    );

    return product ? Number(product.price) : 0;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(amount);
}

function renderInvoice(order) {
    const rows = order.items.map(item => {
        const price = getProductPrice(item.art_number);
        const lineTotal = price * Number(item.quantity);

        return `
            <tr>
                <td>${escapeHTML(item.art_number)}</td>
                <td>${escapeHTML(item.colour)}</td>
                <td>${escapeHTML(String(item.size))}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(price)}</td>
                <td>${formatCurrency(lineTotal)}</td>
            </tr>
        `;
    }).join("");

    const total = order.items.reduce((sum, item) => {
        return sum +
            getProductPrice(item.art_number) * Number(item.quantity);
    }, 0);

    invoiceContainer.innerHTML = `
        <section class = "invoice">
            <h2>INVOICE</h2>
            <p><strong>Invoice / Order No:</strong> #${order.id}</p>
            <p><strong>Customer / Shop:</strong> ${escapeHTML(order.company_name)}</p>
            <p><strong>Address:</strong> ${escapeHTML(order.address)}</p>
            <p><strong>Order Status:</strong> ${escapeHTML(order.status)}</p>

            <table class = "invoice-table">
                <thead>
                    <tr>
                        <th>Art No.</th>
                        <th>Colour</th>
                        <th>Size</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Amount</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>

            <h3 class = "invoice-total">Total: ${formatCurrency(total)}</h3>
            <p>Thank You for your business ^^</p>
        </section>
    `;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

printButton.addEventListener("click", () => {
    window.print();
});

loadBillingData();