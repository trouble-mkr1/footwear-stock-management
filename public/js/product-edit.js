(() => {
"use strict";
const byId = id => document.getElementById(id);
const page = byId("edit-product-page");
const form = byId("edit-product-form");
const openButton = byId("edit-product-button");
const input = byId("edit-product-tag-input");
const tagBox = byId("edit-product-tags");
const saveButton = byId("edit-product-save");
let editedArt = null;
let tags = [];

function showTags() {
    tagBox.replaceChildren();
    tags.forEach(tag => {
        const chip = document.createElement("span");
        chip.className = "matrix-tag";
        chip.append(document.createTextNode(tag));
        const remove = document.createElement("button");
        remove.type = "button";
        remove.setAttribute("aria-label", `Remove tag ${tag}`);
        remove.textContent = "×";
        remove.addEventListener("click", () => {
            tags = tags.filter(t => t !== tag);
            showTags();
        });
        chip.appendChild(remove);
        tagBox.appendChild(chip);
    });
}
function addTags() {
    const candidates = input.value.split(",").map(t => t.trim()).filter(Boolean);
    for (const tag of candidates) {
        if (tag.length > 40) {
            HawaUI.toast("Tags must be 40 characters or shorter.", "warning"); return false;
        }
        if (!tags.some(existing => existing.toLowerCase() === tag.toLowerCase())) {
            if (tags.length >= 20) { HawaUI.toast("Maximum 20 tags per product.","warning"); return false; }
            tags.push(tag);
        }
    }
    input.value = "";
    showTags();
    return true;
}
function returnToProduct(product) {
    hideAllMainSections();
    pageHead.classList.remove("hidden");
    productsContainer.classList.remove("hidden");
    byId("admin-brand-filters").classList.remove("hidden");
    if (product) showProductDetails(product);
    else productDetails.classList.add("hidden");
    updateActiveNav(productButton);
}
openButton.addEventListener("click", () => {
    const art = openButton.dataset.artNumber;
    const product = allProducts.find(p => p.art_number === art);
    if (!product) { HawaUI.alert("Please refresh Products and try again."); return; }
    editedArt = art;
    byId("edit-product-art").value = art;
    byId("edit-product-brand").value = product.brand || "";
    byId("edit-product-price").value = product.price ?? "";
    byId("edit-product-mrp").value = product.mrp ?? "";
    input.value = "";
    tags = [...(product.tags || [])];
    showTags();
    hideAllMainSections();
    page.classList.remove("hidden");
    updateActiveNav(productButton);
});
function cancel() {
    returnToProduct(allProducts.find(p => p.art_number === editedArt));
}
byId("edit-product-back").addEventListener("click", cancel);
byId("edit-product-cancel").addEventListener("click", cancel);
byId("edit-product-add-tag").addEventListener("click", addTags);
input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); addTags(); }
});
byId("delete-product-button").addEventListener("click", async () => {
    const button = byId("delete-product-button");
    const art = button.dataset.artNumber;
    if (!art || button.disabled) return;
    const product = allProducts.find(p => p.art_number === art);
    if (!product) return HawaUI.alert("This product is no longer available. Refresh Products.");
    const confirmed = await HawaUI.confirm(
        `Delete Art ${art} and ALL its colours, sizes, stock and product images? This cannot be undone. Existing completed invoices will remain.`,
        { title: "Delete Product", confirmText: "Delete Product", destructive: true }
    );
    if (!confirmed) return;
    button.disabled = true;
    try {
        const response = await fetch(`/api/products/${encodeURIComponent(art)}`, {method: "DELETE"});
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to delete product.");
        if (!await refreshProducts()) throw new Error("Deleted, but Products did not refresh. Reload the page.");
        returnToProduct(null);
        loadDashboard();
        HawaUI.toast(`Art ${art} deleted. Completed invoices are preserved.`);
    } catch (error) { await HawaUI.alert(error.message, {title:"Delete Product"}); }
    finally { button.disabled = false; }
});
form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saveButton.disabled) return;
    if (!addTags()) return;
    const brand = byId("edit-product-brand").value.trim();
    const price = Number(byId("edit-product-price").value);
    const mrp = Number(byId("edit-product-mrp").value);
    if (!brand || brand.length > 100 || !Number.isFinite(price) || price <= 0 ||
        !Number.isFinite(mrp) || mrp <= 0 || Math.abs(Math.round(price * 100) - price * 100) > 1e-6 ||
        Math.abs(Math.round(mrp * 100) - mrp * 100) > 1e-6) {
        HawaUI.toast("Enter a brand and valid unit price/MRP (up to 2 decimal places).","warning");
        return;
    }
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    try {
        const response = await fetch(`/api/products/${encodeURIComponent(editedArt)}/details`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brand, price, mrp, tags })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to save changes.");
        if (!await refreshProducts()) throw new Error("Changes saved, but Products could not refresh. Open Products again.");
        returnToProduct(allProducts.find(p => p.art_number === editedArt));
        loadDashboard();
        HawaUI.toast("Product details updated.");
    } catch (error) {
        HawaUI.alert(error.message, { title: "Product update" });
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Save Changes";
    }
});
})();
