(() => {
"use strict";
const $ = id => document.getElementById(id);
let customers = [];
function draw() {
    const query = $("customers-search").value.trim().toLowerCase();
    const rows = $("customers-table-body");
    rows.replaceChildren();
    const matches = customers.filter(c => [c.name,c.phone,c.shop_name,c.address,c.gst_number]
        .some(value => String(value || "").toLowerCase().includes(query)));
    if (!matches.length) {
        const row = document.createElement("tr"), cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = customers.length ? "No matching customers." : "No registered customers yet.";
        row.appendChild(cell); rows.appendChild(row);
    } else for (const customer of matches) {
        const row = document.createElement("tr");
        for (const value of [customer.name, customer.phone, customer.shop_name,
            customer.address, customer.gst_number || "Not provided"]) {
            const cell = document.createElement("td");
            cell.textContent = String(value || "—");
            row.appendChild(cell);
        }
        rows.appendChild(row);
    }
    $("customers-message").textContent = `${matches.length} of ${customers.length} customers`;
}
async function loadCustomers() {
    $("customers-message").textContent = "Loading customers...";
    try {
        const response = await fetch("/api/admin/customers", {cache:"no-store"});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Unable to load customers.");
        customers = Array.isArray(data) ? data : [];
        draw();
    } catch (error) {
        $("customers-message").textContent = error.message;
        HawaUI.toast(error.message, "warning");
    }
}
$("customers-button").addEventListener("click", () => {
    hideAllMainSections();
    $("customers-page").classList.remove("hidden");
    updateActiveNav($("customers-button"));
    loadCustomers();
});
$("customers-refresh").addEventListener("click", loadCustomers);
$("customers-search").addEventListener("input", draw);
})();
