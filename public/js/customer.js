(() => {
    "use strict";
    const byId = id => document.getElementById(id);
    const productsPage = byId("customer-products-page");
    const ordersPage = byId("customer-orders-page");
    const productsTab = byId("customer-products-tab");
    const ordersTab = byId("customer-orders-tab");
    const state = { products: [], orders: [], cart: [], stockIssues: [] };
    const cartPanel = byId("customer-cart-panel");
    const mobileCartToggle = byId("mobile-cart-toggle");
    const cartBackdrop = byId("customer-cart-backdrop");
    let cartOpen = false;

    function setCartOpen(open) {
        cartOpen = Boolean(open) && window.matchMedia("(max-width: 970px)").matches;
        cartPanel.classList.toggle("is-open", cartOpen);
        document.body.classList.toggle("customer-cart-open", cartOpen);
        cartBackdrop.hidden = !cartOpen;
        mobileCartToggle.setAttribute("aria-expanded", String(cartOpen));
        if (cartOpen && window.matchMedia("(max-width: 970px)").matches) {
            byId("close-cart-button").focus();
        }
    }

    function sameCartItem(a, b) {
        return a && b && String(a.art_number).trim().toLowerCase() === String(b.art_number).trim().toLowerCase()
            && String(a.colour).trim().toLowerCase() === String(b.colour).trim().toLowerCase()
            && Number(a.size) === Number(b.size);
    }

    function clearStockIssue(changedItem) {
        if (changedItem) {
            // Correcting one line should not hide warnings on other unavailable lines.
            state.stockIssues = state.stockIssues.filter(issue => !sameCartItem(issue.item, changedItem));
        } else {
            state.stockIssues = [];
        }
    }

    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = String(text);
        return el;
    }
    const money = amount => `₹${Number(amount || 0).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    function showPage(page) {
        const products = page === "products";
        if (!products) setCartOpen(false);
        productsPage.classList.toggle("hidden", !products);
        ordersPage.classList.toggle("hidden", products);
        productsTab.classList.toggle("active", products);
        ordersTab.classList.toggle("active", !products);
        if (products) {
            productsTab.setAttribute("aria-current", "page");
            ordersTab.removeAttribute("aria-current");
        } else {
            ordersTab.setAttribute("aria-current", "page");
            productsTab.removeAttribute("aria-current");
            loadOrders();
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    async function api(route, options = {}) {
        const response = await fetch(route, options);
        if (response.status === 401) {
            window.location.replace("/");
            throw new Error("Please sign in again.");
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || "Something went wrong. Please try again.");
            if (typeof data.code === "string") error.code = data.code;
            if (data.item && typeof data.item === "object") error.item = data.item;
            if (Array.isArray(data.issues)) error.issues = data.issues;
            throw error;
        }
        return data;
    }
    function imageFor(variant) {
        if (!variant?.image || !/^[a-zA-Z0-9_.-]+$/.test(variant.image)) return null;
        return `/images/${encodeURIComponent(variant.image)}`;
    }
    function findProduct(art) { return state.products.find(p => p.art_number === art); }

    function renderProducts() {
        const list = byId("customer-products");
        list.replaceChildren();
        const search = byId("customer-search").value.trim().toLowerCase();
        const products = state.products.filter(p => [String(p.art_number), p.brand || '', ...(p.tags || [])]
            .some(value => value.toLowerCase().includes(search)));
        if (!products.length) {
            list.appendChild(node("p", "empty-state", "No products found."));
            return;
        }
        for (const product of products) {
            const card = node("article", "product-card");
            const picture = node("img", "product-image");
            picture.alt = `Footwear art number ${product.art_number}`;
            picture.loading = "lazy";
            const fallback = node("div", "product-image-fallback", "Footwear");
            function updatePicture(variant) {
                const src = imageFor(variant);
                if (!src) { picture.remove(); if (!fallback.isConnected) card.prepend(fallback); return; }
                fallback.remove();
                picture.src = src;
                if (!picture.isConnected) card.prepend(picture);
            }
            picture.addEventListener("error", () => {
                picture.remove();
                if (!fallback.isConnected) card.prepend(fallback);
            });
            const body = node("div", "product-card-body");
            const header = node("div", "product-card-header");
            const pricing = node("div", "customer-pricing");
            pricing.appendChild(node("span", "price", `Unit: ${money(product.price)}`));
            if (product.mrp !== null && product.mrp !== undefined && product.mrp !== '' && Number(product.mrp) > 0) {
                pricing.appendChild(node("span", "customer-mrp", `MRP: ${money(product.mrp)}`));
            }
            header.append(node("h3", "", `Art No: ${product.art_number}`), pricing);
            body.append(header);
            if (product.brand) body.append(node("p", "muted", `Brand: ${product.brand}`));
            if (Array.isArray(product.tags) && product.tags.length) {
                const chips = node('div', 'customer-tags');
                for (const tag of product.tags) chips.appendChild(node('span', 'customer-tag', tag));
                body.appendChild(chips);
            }
            const variantField = node("div", "field");
            const variantLabel = node("label", "", "Colour");
            const variants = node("select");
            for (const variant of product.variants || []) {
                const option = node("option", "", variant.colour);
                option.value = variant.colour;
                variants.appendChild(option);
            }
            variantLabel.append(variants); variantField.append(variantLabel);
            const fields = node("div", "row-fields");
            const sizeField = node("div", "field");
            const sizeLabel = node("label", "", "Size");
            const sizes = node("select");
            sizeLabel.appendChild(sizes); sizeField.appendChild(sizeLabel);
            const qtyField = node("div", "field");
            const qtyLabel = node("label", "", "Quantity");
            const quantity = node("input");
            quantity.type = "number"; quantity.min = "1"; quantity.max = "1000"; quantity.step = "1"; quantity.value = "1";
            qtyLabel.appendChild(quantity); qtyField.appendChild(qtyLabel);
            fields.append(sizeField, qtyField);
            const addButton = node("button", "primary-btn", "Add to Order");
            addButton.type = "button";
            function updateVariant() {
                const selected = (product.variants || []).find(v => v.colour === variants.value);
                sizes.replaceChildren();
                for (const size of selected?.sizes || []) {
                    const option = node("option", "", size);
                    option.value = String(size);
                    sizes.appendChild(option);
                }
                addButton.disabled = sizes.options.length === 0;
                updatePicture(selected);
            }
            variants.addEventListener("change", updateVariant);
            addButton.addEventListener("click", () => {
                const qty = Number(quantity.value);
                if (!Number.isInteger(qty) || qty < 1 || qty > 1000 || !sizes.value) {
                    HawaUI.alert("Enter a valid quantity (1–1000) and select a size.");
                    return;
                }
                const art = product.art_number, colour = variants.value, size = Number(sizes.value);
                const existing = state.cart.find(i => i.art_number === art && i.colour === colour && i.size === size);
                if (existing) {
                    if (existing.quantity + qty > 1000) {
                        HawaUI.alert("Please limit each item to 1,000 pairs."); return;
                    }
                    existing.quantity += qty;
                } else {
                    if (state.cart.length >= 30) {
                        HawaUI.alert("Maximum 30 items in one order."); return;
                    }
                    state.cart.push({art_number: art, colour, size, quantity: qty});
                }
                clearStockIssue({ art_number: art, colour, size });
                renderCart();
                HawaUI.toast("Added to your order.");
            });
            body.append(variantField, fields, addButton);
            card.appendChild(body);
            list.appendChild(card);
            updateVariant();
        }
    }

    function renderCart() {
        const cart = byId("customer-cart");
        cart.replaceChildren();
        byId("cart-count").textContent = `${state.cart.length} item ${state.cart.length === 1 ? "type" : "types"}`;
        byId("mobile-cart-label").textContent = `View Order (${state.cart.length})`;
        const issue = byId("cart-stock-error");
        issue.classList.toggle("hidden", state.stockIssues.length === 0);
        issue.replaceChildren();
        if (state.stockIssues.length) {
            issue.appendChild(node("strong", "", `${state.stockIssues.length} ${state.stockIssues.length === 1 ? "item needs" : "items need"} attention:`));
            const list = node("ul", "cart-stock-issue-list");
            for (const problem of state.stockIssues) list.appendChild(node("li", "", problem.message));
            issue.appendChild(list);
        }
        byId("place-order-button").disabled = state.cart.length === 0;
        if (!state.cart.length) {
            cart.appendChild(node("p", "muted", "Your order is empty."));
        }
        let total = 0;
        for (const item of state.cart) {
            const product = findProduct(item.art_number);
            const price = Number(product?.price || 0);
            total += price * item.quantity;
            const row = node("div", "cart-item");
            if (state.stockIssues.some(issue => sameCartItem(item, issue.item))) {
                row.classList.add("cart-item-stock-issue");
                row.setAttribute("data-stock-issue", "true");
            }
            const info = node("div");
            info.append(node("strong", "", `Art ${item.art_number} · ${item.colour} · Size ${item.size}`),
                node("p", "", `${money(price)} per pair`));
            const input = node("input");
            input.type = "number"; input.min = "1"; input.max = "1000"; input.step = "1";
            input.value = String(item.quantity); input.setAttribute("aria-label", `Quantity for art ${item.art_number}`);
            input.addEventListener("change", () => {
                const value = Number(input.value);
                if (!Number.isInteger(value) || value < 1 || value > 1000) {
                    input.value = String(item.quantity);
                    HawaUI.toast("Quantity must be between 1 and 1,000.", "warning");
                    return;
                }
                item.quantity = value;
                clearStockIssue(item);
                // Do not replace a focused number input from inside its own change event.
                // Rebuild on the next event-loop turn to avoid nested blur/change dispatch.
                setTimeout(renderCart, 0);
            });
            const remove = node("button", "cart-remove", "Remove");
            remove.type = "button";
            remove.addEventListener("click", () => {
                state.cart = state.cart.filter(entry => entry !== item);
                clearStockIssue(item);
                renderCart();
            });
            row.append(info, input, remove); cart.append(row);
        }
        byId("cart-total").textContent = `Estimated total: ${money(total)}`;
        byId("mobile-cart-total").textContent = money(total);
    }

    async function placeOrder() {
        if (!state.cart.length) return;
        const approved = await HawaUI.confirm("Place this order with the selected items and quantities?", {
            title: "Confirm Order", confirmText: "Place Order"
        });
        if (!approved) return;
        const button = byId("place-order-button");
        button.disabled = true;
        try {
            const result = await api("/api/customer/orders", {
                method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ items: state.cart })
            });
            state.cart = [];
            clearStockIssue();
            renderCart();
            setCartOpen(false);
            HawaUI.toast(`Order #${result.order_id} placed successfully.`);
            showPage("orders");
        } catch (error) {
            const issues = Array.isArray(error.issues) && error.issues.length
                ? error.issues
                : (error.item ? [{ code: error.code, item: error.item, message: error.message }] : []);
            if (issues.length && issues.every(issue =>
                (issue.code === "INSUFFICIENT_STOCK" || issue.code === "ITEM_UNAVAILABLE") && issue.item)) {
                state.stockIssues = issues.map(issue => ({ item: issue.item, message: issue.message || error.message }));
                renderCart();
                setCartOpen(true);
                byId("cart-stock-error").focus();
            } else {
                await HawaUI.alert(error.message, {title: "Unable to place order"});
            }
        } finally {
            button.disabled = state.cart.length === 0;
        }
    }

    function renderOrders() {
        const list = byId("customer-orders");
        list.replaceChildren();
        if (!state.orders.length) {
            list.appendChild(node("p", "empty-state", "You have not placed any orders yet."));
            return;
        }
        for (const order of state.orders) {
            const card = node("article", "customer-order-card");
            const header = node("div", "customer-order-header");
            const delivered = order.status === "Received";
            header.append(node("h3", "", `Order #${order.id}`),
                node("span", `delivery-tag ${delivered ? "delivered" : "pending"}`, order.status));
            card.appendChild(header);
            const items = node("ul", "order-detail-list");
            let total = 0;
            for (const item of order.items || []) {
                total += Number(item.unit_price || 0) * Number(item.quantity || 0);
                items.appendChild(node("li", "", `Art ${item.art_number} · ${item.colour} · Size ${item.size} · Qty ${item.quantity} · ${money(item.unit_price)} per pair`));
            }
            card.append(items);
            const summary = node("div", "order-summary");
            summary.appendChild(node("strong", "", `Order total: ${money(total)}`));
            if (delivered) {
                const reorder = node("button", "outline-btn", "Order Again");
                reorder.type = "button";
                reorder.addEventListener("click", () => {
                    const copied = (order.items || []).map(item => ({
                        art_number: item.art_number, colour: item.colour,
                        size: Number(item.size), quantity: Number(item.quantity)
                    }));
                    if (!copied.length) return;
                    if (copied.length > 30) { HawaUI.alert("Too many items to reorder together."); return; }
                    state.cart = copied;
                    clearStockIssue();
                    renderCart();
                    showPage("products");
                    if (window.matchMedia("(max-width: 970px)").matches) {
                        setCartOpen(true);
                    } else {
                        byId("customer-cart-panel").scrollIntoView({behavior: "smooth", block: "start"});
                    }
                    HawaUI.toast("Previous items copied. Review current prices and quantities before placing your order.", "warning");
                });
                summary.appendChild(reorder);
            }
            card.appendChild(summary);
            list.appendChild(card);
        }
    }

    async function loadOrders() {
        try {
            state.orders = await api("/api/customer/orders");
            renderOrders();
        } catch (error) {
            byId("customer-orders").replaceChildren(node("p", "empty-state", error.message));
        }
    }

    async function contact() {
        try {
            const result = await api("/api/customer/contact");
            await HawaUI.alert(result.phone
                ? `Call HAWA TRADERS: ${result.phone}`
                : "Contact details will be added by HAWA TRADERS soon.", {title:"Contact Us"});
        } catch (error) { await HawaUI.alert(error.message); }
    }

    async function boot() {
        productsTab.addEventListener("click", () => showPage("products"));
        ordersTab.addEventListener("click", () => showPage("orders"));
        byId("customer-search").addEventListener("input", renderProducts);
        byId("place-order-button").addEventListener("click", placeOrder);
        mobileCartToggle.addEventListener("click", () => setCartOpen(true));
        cartBackdrop.addEventListener("click", () => setCartOpen(false));
        byId("close-cart-button").addEventListener("click", () => {
            setCartOpen(false);
            mobileCartToggle.focus();
        });
        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && cartOpen) {
                setCartOpen(false);
                mobileCartToggle.focus();
            }
        });
        window.matchMedia("(max-width: 970px)").addEventListener("change", () => setCartOpen(false));
        byId("refresh-orders").addEventListener("click", loadOrders);
        byId("contact-button").addEventListener("click", contact);
        byId("customer-logout").addEventListener("click", async () => {
            try {
                await api("/api/auth/logout", {method:"POST"});
                window.location.replace("/");
            } catch (error) { HawaUI.alert(error.message); }
        });
        try {
            const [profile, products] = await Promise.all([
                api("/api/customer/profile"), api("/api/customer/products")
            ]);
            byId("welcome-title").textContent = `Welcome, ${profile.name}`;
            byId("welcome-shop").textContent = profile.shop_name;
            state.products = products;
            renderProducts();
            renderCart();
        } catch (error) {
            byId("customer-products").replaceChildren(node("p", "empty-state", error.message));
        }
    }
    boot();
})();
