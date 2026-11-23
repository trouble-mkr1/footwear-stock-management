const orderSelect = document.getElementById("billing-order-select");
const invoiceContainer = document.getElementById("invoice-container");
const message = document.getElementById("billing-message");
const printButton = document.getElementById("print-invoice");
const shareButton = document.getElementById("share-invoice-pdf");
let preparedPdf = null;
let preparedOrderId = null;

let billingOrders = [];

async function loadBillingData() {
    try {
        message.textContent = "Loading orders . . . ";

        const ordersResponse = await fetch("/api/billing/orders");

        if (!ordersResponse.ok) {
            throw new Error("Could not load billing data");
        }

        billingOrders = await ordersResponse.json();

        orderSelect.innerHTML = '<option value = "">Select an order</option>';

        billingOrders.forEach(order => {

            const option = document.createElement("option");

            option.value = order.id;

            option.textContent =
                `#${order.id} | ${order.company_name} | ${order.address || "No address"} | ${order.status}`;

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
    shareButton.disabled = true;
    preparedPdf = null;
    preparedOrderId = null;

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
        if (orderSelect.value !== orderId) return;
        renderInvoice(order);
        message.textContent = "Preparing PDF for sharing...";
        printButton.disabled = false;

        // Fetch before the Share tap, preserving browser user activation when
        // navigator.share() is invoked on a mobile phone.
        try {
            const pdfResponse = await fetch(`/api/billing/orders/${encodeURIComponent(orderId)}/pdf`, {cache: "no-store"});
            if (!pdfResponse.ok) {
                const data = await pdfResponse.json().catch(() => ({}));
                throw new Error(data.error || "Unable to generate invoice PDF.");
            }
            const pdfBlob = await pdfResponse.blob();
            if (pdfBlob.type !== "application/pdf" || pdfBlob.size < 100) {
                throw new Error("The server did not return a valid PDF.");
            }
            if (orderSelect.value !== orderId) return; // user changed selection
            preparedPdf = new File([pdfBlob], `HAWA-Invoice-${orderId}.pdf`, {type: "application/pdf"});
            preparedOrderId = orderId;
            shareButton.disabled = false;
            message.textContent = "Invoice ready for printing or sharing.";
        } catch (pdfError) {
            if (orderSelect.value === orderId) {
                console.error("PDF preparation failed:", pdfError);
                message.textContent = `Invoice ready for printing, but PDF is unavailable: ${pdfError.message}`;
            }
        }
    } catch (error) {
        console.error("error loading order details:", error);
        message.textContent = error.message || "Unable to load this orders details.";
    }
});

function formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(amount);
}

function renderInvoice(order) {
    // An invoice must never silently turn a missing price into ₹0.
    if (!Array.isArray(order.items) || order.items.length === 0) {
        throw new Error("This order has no items. Invoice cannot be prepared.");
    }

    for (const item of order.items) {
        if (item.unit_price === null || item.unit_price === undefined ||
            item.unit_price === "" || !Number.isFinite(Number(item.unit_price)) ||
            Number(item.unit_price) <= 0) {
            throw new Error(
                `Order #${order.id} has a missing/invalid unit price for art ${item.art_number}. Please correct the historical record before printing.`
            );
        }
        if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
            throw new Error(`Order #${order.id} contains an invalid item quantity.`);
        }
    }

    const rows = order.items.map(item => {
        const mrp = item.mrp;
        const price = Number(item.unit_price);
        const quantity = Number(item.quantity);
        const lineTotal = price * quantity;

        return `
            <tr>
                <td>${escapeHTML(item.art_number)}</td>
                <td>${escapeHTML(item.colour)}</td>
                <td>${escapeHTML(String(item.size))}</td>
                <td>${quantity}</td>
                <td>${mrp != null && mrp !==""
                    ? formatCurrency(Number(mrp))
                    : "-"}</td>
                <td>${formatCurrency(price)}</td>
                <td>${formatCurrency(lineTotal)}</td>
            </tr>
        `;
    }).join("");

    const total = order.items.reduce((sum, item) => {
        const price = Number(item.unit_price);
        return sum + price * Number(item.quantity);
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
                        <th>MRP</th>
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

function downloadPreparedPdf(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

shareButton.addEventListener("click", async () => {
    const file = preparedPdf;
    if (!file || preparedOrderId !== orderSelect.value) return;
    // The native file-share call happens immediately during this click.
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ title: `HAWA TRADERS Invoice #${preparedOrderId}`, files: [file] });
            return;
        } catch (error) {
            if (error.name === "AbortError") return; // user closed share sheet
            console.warn("Native PDF sharing unavailable:", error);
        }
    }
    // Desktop and unsupported browsers: download the same PDF; Print still works.
    downloadPreparedPdf(file);
    if (window.HawaUI?.toast) {
        HawaUI.toast("PDF downloaded. You can attach it in any app.", "warning");
    } else {
        message.textContent = "PDF downloaded. You can attach it in any app.";
    }
});

loadBillingData();