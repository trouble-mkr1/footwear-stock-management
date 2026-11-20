'use strict';
// Matrix UI: one transaction per Save, regardless of number of colours/sizes.
(() => {
    const el = id => document.getElementById(id);
    const area = el('inventory-matrix-page');
    const form = el('matrix-form');
    const colours = el('matrix-colours');
    const heading = el('matrix-heading');
    const art = el('matrix-art');
    const addColour = el('matrix-add-colour');
    const save = el('matrix-save');
    const tagsList = el('matrix-tags');
    const tagInput = el('matrix-tag-input');
    let mode = 'product';
    let tags = [];
    let busy = false;

    function addSize(card, size = '', quantity = '') {
        if (card.querySelectorAll('.matrix-size-row').length >= 25) {
            HawaUI.toast('Maximum 25 sizes per colour.', 'warning'); return;
        }
        const row = document.createElement('div');
        row.className = 'matrix-size-row';
        row.innerHTML = `
            <label>Size <input class="matrix-size" type="number" min="1" max="999" step="1" placeholder="Size" required></label>
            <label><span class="matrix-quantity-label">${mode === 'stock' ? 'Add qty' : 'Qty'}</span>
                <input class="matrix-qty" type="number" min="${mode === 'stock' ? 1 : 0}" max="1000000" step="1" placeholder="${mode === 'stock' ? 'Add qty' : '0'}" required></label>
            <span class="matrix-current-stock" aria-live="polite"></span>
            <button type="button" class="matrix-remove-size secondary-action" aria-label="Remove size">×</button>`;
        row.querySelector('.matrix-size').value = size;
        row.querySelector('.matrix-qty').value = quantity;
        card.querySelector('.matrix-size-rows').appendChild(row);
        updateCurrentStock(row);
    }

    function addColourCard() {
        if (colours.children.length >= 12) {
            HawaUI.toast('Maximum 12 colours in one submission.', 'warning'); return;
        }
        const card = document.createElement('div');
        card.className = 'matrix-colour-card';
        const colourNumber = colours.children.length + 1;
        const imageFields = mode === 'stock' ? '' : `
            <div class="matrix-image-fields">
                <label>Choose Photo
                    <input class="matrix-image" type="file" accept="image/jpeg,image/png,image/webp" required>
                </label>
                <img class="matrix-preview hidden" alt="Selected colour photo preview">
            </div>`;
        card.innerHTML = `
            <div class="matrix-card-header">
                <h3 class="matrix-colour-heading">Colour ${colourNumber}</h3>
                <button type="button" class="matrix-remove-colour secondary-action">Remove Colour</button>
            </div>
            <label>Colour Name
                <input class="matrix-colour-name" list="matrix-existing-colours" maxlength="60" placeholder="e.g. Black" required autocomplete="off">
            </label>
            ${imageFields}
            <div class="matrix-sizes-heading"><h4>Sizes and quantities</h4>
                <span class="matrix-muted">Add size rows as needed</span></div>
            <div class="matrix-size-rows"></div>
            <button type="button" class="matrix-add-size secondary-action">+ Add Size</button>`;
        colours.appendChild(card);
        addSize(card);
        updateColourHeadings();
    }

    function updateColourHeadings() {
        [...colours.children].forEach((card, idx) => {
            card.querySelector('.matrix-colour-heading').textContent = `Colour ${idx+1}`;
        });
    }

    function renderTags() {
        tagsList.replaceChildren();
        for (const tag of tags) {
            const item = document.createElement('span');
            item.className = 'matrix-tag';
            const label = document.createElement('span');
            label.textContent = tag;
            const remove = document.createElement('button');
            remove.type = 'button'; remove.textContent = '×';
            remove.setAttribute('aria-label', `Remove tag ${tag}`);
            remove.addEventListener('click', () => { tags = tags.filter(t => t !== tag); renderTags(); });
            item.append(label, remove); tagsList.appendChild(item);
        }
    }

    function commitTags() {
        const input = tagInput.value.trim();
        if (!input) return;
        for (const raw of input.split(',')) {
            const value = raw.trim();
            if (!value) continue;
            if (value.length > 40 || tags.length >= 20) {
                HawaUI.toast('Tags: 40 characters each, maximum 20.', 'warning'); break;
            }
            if (!tags.some(t => t.toLowerCase() === value.toLowerCase())) tags.push(value);
        }
        tagInput.value = ''; renderTags();
    }

    function updateExistingColourSuggestions() {
        let list = el('matrix-existing-colours');
        if (!list) {
            list = document.createElement('datalist'); list.id = 'matrix-existing-colours';
            area.appendChild(list);
        }
        list.replaceChildren();
        const product = allProducts.find(p => String(p.art_number) === art.value.trim());
        for (const variant of product?.variants || []) {
            const option = document.createElement('option'); option.value = variant.colour;
            list.appendChild(option);
        }
        colours.querySelectorAll('.matrix-size-row').forEach(updateCurrentStock);
    }

    function updateCurrentStock(row) {
        if (mode !== 'stock') return;
        const product = allProducts.find(p => String(p.art_number) === art.value.trim());
        const name = row.closest('.matrix-colour-card')?.querySelector('.matrix-colour-name')?.value.trim().toLowerCase();
        const variant = product?.variants?.find(v => v.colour.trim().toLowerCase() === name);
        const size = Number(row.querySelector('.matrix-size').value);
        const existing = variant?.stock?.find(s => Number(s.size) === size);
        row.querySelector('.matrix-current-stock').textContent = variant && size > 0
            ? `Current: ${existing ? existing.quantity : 0}` : '';
    }

    function open(nextMode) {
        mode = nextMode;
        tags = []; renderTags();
        form.reset(); colours.replaceChildren();
        const isProduct = mode === 'product';
        area.querySelectorAll('.matrix-product-only').forEach(field => field.classList.toggle('hidden', !isProduct));
        el('matrix-brand').required = isProduct;
        el('matrix-price').required = isProduct;
        el('matrix-mrp').required = isProduct;
        heading.textContent = isProduct ? 'Add New Product' : mode === 'colour' ? 'Add New Colour' : 'Add Stock';
        el('matrix-intro').textContent = isProduct
            ? 'Add multiple colours and any sizes in a single save.'
            : mode === 'colour' ? 'Select an existing art number, then add new colours and sizes.'
            : 'Select an existing art number and colour, then add quantities for multiple sizes.';
        save.textContent = isProduct ? 'Save Product' : mode === 'colour' ? 'Save New Colour(s)' : 'Add Stock';
        art.placeholder = isProduct ? 'New art number' : 'Existing art number';
        const dataList = el('matrix-art-options'); dataList.replaceChildren();
        if (!isProduct) for (const product of allProducts) {
            const option = document.createElement('option'); option.value = product.art_number; dataList.appendChild(option);
        }
        hideAllMainSections(); area.classList.remove('hidden');
        updateActiveNav(productButton);
        addColourCard(); updateExistingColourSuggestions();
        art.focus();
    }

    addStockButton.addEventListener('click', () => open('stock'));
    addNewProductButton.addEventListener('click', () => open('product'));
    addNewVariantButton.addEventListener('click', () => open('colour'));
    el('matrix-back').addEventListener('click', returnToProductsPage);
    el('matrix-cancel').addEventListener('click', returnToProductsPage);
    addColour.addEventListener('click', addColourCard);
    el('matrix-add-tag').addEventListener('click', commitTags);
    tagInput.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitTags(); } });
    art.addEventListener('input', updateExistingColourSuggestions);
    colours.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        const card = button.closest('.matrix-colour-card');
        if (button.classList.contains('matrix-add-size')) addSize(card);
        if (button.classList.contains('matrix-remove-size')) button.closest('.matrix-size-row').remove();
        if (button.classList.contains('matrix-remove-colour')) { card.remove(); updateColourHeadings(); }
    });
    colours.addEventListener('input', e => {
        if (e.target.matches('.matrix-size,.matrix-colour-name')) {
            const card = e.target.closest('.matrix-colour-card');
            card.querySelectorAll('.matrix-size-row').forEach(updateCurrentStock);
        }
    });
    colours.addEventListener('change', e => {
        if (!e.target.matches('.matrix-image')) return;
        const file = e.target.files[0];
        const preview = e.target.closest('.matrix-colour-card').querySelector('.matrix-preview');
        if (!file) { preview.classList.add('hidden'); preview.removeAttribute('src'); return; }
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5*1024*1024) {
            e.target.value = ''; HawaUI.alert('Use a JPG, PNG or WEBP image smaller than 5 MB.'); return;
        }
        const url = URL.createObjectURL(file);
        preview.onload = () => URL.revokeObjectURL(url);
        preview.src = url; preview.classList.remove('hidden');
    });

    function getPayload() {
        commitTags();
        const data = { mode, art_number: art.value.trim() };
        if (!data.art_number) throw Error('Enter an art number.');
        if (mode === 'product') {
            data.brand = el('matrix-brand').value.trim();
            data.price = Number(el('matrix-price').value);
            data.mrp = Number(el('matrix-mrp').value);
            data.tags = [...tags];
            if (!data.brand) throw Error('Enter the brand / company (or Local / Unbranded).');
            if (!Number.isFinite(data.price) || data.price <= 0 ||
                !Number.isFinite(data.mrp) || data.mrp <= 0) throw Error('Enter valid prices.');
        }
        const cards = [...colours.querySelectorAll('.matrix-colour-card')];
        if (!cards.length) throw Error('Add at least one colour.');
        const files = [];
        data.variants = cards.map(card => {
            const colour = card.querySelector('.matrix-colour-name').value.trim();
            if (!colour) throw Error('Enter a name for each colour.');
            const rows = [...card.querySelectorAll('.matrix-size-row')];
            if (!rows.length) throw Error(`Add at least one size for ${colour}.`);
            const used = new Set();
            const sizes = rows.map(row => {
                const sizeValue = row.querySelector('.matrix-size').value;
                const qtyValue = row.querySelector('.matrix-qty').value;
                const size = Number(sizeValue), quantity = Number(qtyValue);
                if (!sizeValue || !Number.isSafeInteger(size) || size < 1 || size > 999)
                    throw Error(`${colour}: enter a valid size (1–999).`);
                if (!qtyValue || !Number.isSafeInteger(quantity) || quantity < (mode === 'stock' ? 1 : 0))
                    throw Error(`${colour}, size ${size}: enter a valid quantity.`);
                if (used.has(size)) throw Error(`${colour}: size ${size} was entered twice.`);
                used.add(size);
                return { size, quantity };
            });
            if (mode !== 'stock') {
                const file = card.querySelector('.matrix-image').files[0];
                if (!file) throw Error(`Choose an image for ${colour}.`);
                files.push(file);
            }
            return { colour, sizes };
        });
        if (new Set(data.variants.map(v => v.colour.toLowerCase())).size !== data.variants.length)
            throw Error('Each colour must have a different name.');
        return { data, files };
    }

    form.addEventListener('submit', async e => {
        e.preventDefault();
        if (busy) return;
        let payload;
        try { payload = getPayload(); }
        catch (error) { HawaUI.alert(error.message, { title: 'Please check the matrix' }); return; }
        const data = new FormData();
        data.append('data', JSON.stringify(payload.data));
        for (const file of payload.files) data.append('images', file);
        busy = true; save.disabled = true;
        try {
            const response = await fetch('/api/inventory/bulk', { method: 'POST', body: data });
            const result = await response.json();
            if (!response.ok) throw Error(result.error || 'Unable to save inventory.');
            HawaUI.toast(result.message);
            await refreshProducts();
            await loadDashboard();
            returnToProductsPage();
        } catch (error) { HawaUI.alert(error.message, { title: 'Inventory not saved' }); }
        finally { busy = false; save.disabled = false; }
    });
})();
