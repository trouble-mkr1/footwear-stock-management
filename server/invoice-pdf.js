"use strict";

// Dependency-free, server-side PDF invoice. Uses the standard PDF Helvetica fonts,
// so hosts need no Chromium installation, third-party PDF package, or font files.
// The standard fonts support Latin characters; unsupported symbols are replaced.
const PAGE_W = 595.28;
const PAGE_H = 841.89; // A4
const LEFT = 43;
const RIGHT = 552;

function pdfText(value) {
    const text = String(value ?? "-").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    // Helvetica core fonts do not support arbitrary Unicode; avoid malformed PDFs.
    return text.replace(/[^\x20-\x7E]/g, "?").replace(/[\\()]/g, "\\$&");
}
function normalText(value) {
    return String(value ?? "-").normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
}
function validInvoice(order) {
    if (!order || !Number.isSafeInteger(Number(order.id)) || Number(order.id) <= 0 ||
        !Array.isArray(order.items) || order.items.length === 0 || order.items.length > 500) {
        const error = new Error("Invoice cannot be prepared for an empty or invalid order.");
        error.statusCode = 409;
        throw error;
    }
    for (const item of order.items) {
        if (item.unit_price == null || item.unit_price === "" ||
            !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) <= 0 ||
            !Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0 ||
            (item.mrp != null && item.mrp !== "" && !Number.isFinite(Number(item.mrp)))) {
            const error = new Error(`Order #${order.id} has missing or invalid prices/quantities. Invoice cannot be prepared.`);
            error.statusCode = 409;
            throw error;
        }
    }
}
function money(paise) {
    return `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function wrap(value, maxChars, maxLines = 3) {
    const result = [];
    let text = normalText(value).replace(/\s+/g, " ").trim();
    while (text.length && result.length < maxLines) {
        if (text.length <= maxChars) { result.push(text); break; }
        let position = text.lastIndexOf(" ", maxChars);
        if (position < maxChars / 2) position = maxChars;
        result.push(text.slice(0, position).trim());
        text = text.slice(position).trim();
    }
    if (text.length && result.length === maxLines && result.join(" ").length < normalText(value).length) {
        const last = result.length - 1;
        result[last] = result[last].slice(0, maxChars - 3) + "...";
    }
    return result.length ? result : ["-"];
}

function buildInvoicePdf(order) {
    validInvoice(order);
    const pages = [];
    let commands = [];
    let y = 0;
    const add = command => commands.push(command);
    const text = (x, baseline, value, size = 10, bold = false, colour = "0.10 0.17 0.30") => {
        add(`${colour} rg BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${pdfText(value)}) Tj ET`);
    };
    const line = (x1, y1, x2, y2) => add(`0.79 0.84 0.92 RG 0.8 w ${x1} ${y1} m ${x2} ${y2} l S`);
    const rect = (x, by, w, h, colour) => add(`${colour} rg ${x} ${by} ${w} ${h} re f`);
    const headings = [
        [48, "Art No."], [164, "Colour"], [246, "Size"], [282, "Qty"],
        [320, "MRP"], [396, "Unit Price"], [478, "Amount"]
    ];
    const tableHeader = () => {
        rect(LEFT, y - 12, RIGHT - LEFT, 27, "0.90 0.94 0.99");
        for (const [x, label] of headings) text(x, y - 2, label, 9, true, "0.05 0.22 0.48");
        y -= 27;
    };
    const startPage = (continued = false) => {
        commands = [];
        rect(0, PAGE_H - 7, PAGE_W, 7, "0.04 0.30 0.70");
        text(LEFT, 796, "HAWA TRADERS", 20, true, "0.04 0.30 0.70");
        text(467, 796, "INVOICE", 17, true, "0.04 0.30 0.70");
        line(LEFT, 779, RIGHT, 779);
        text(LEFT, 758, `Invoice / Order No.: #${order.id}`, 10, true);
        text(360, 758, `Status: ${normalText(order.status || "Pending")}`.slice(0, 32), 9);
        if (continued) {
            text(LEFT, 737, "Items (continued)", 10, true);
            y = 700;
        } else {
            y = 738;
            for (const label of [
                `Customer / Shop: ${normalText(order.company_name)}`,
                `Address: ${normalText(order.address)}`
            ]) {
                for (const part of wrap(label, 94, 12)) {
                    text(LEFT, y, part, 10);
                    y -= 16;
                }
            }
            y -= 24;
        }
        tableHeader();
    };
    const finishPage = () => {
        line(LEFT, 42, RIGHT, 42);
        text(LEFT, 27, "HAWA TRADERS | Invoice generated from recorded order prices", 8);
        text(516, 27, `${pages.length + 1}`, 9);
        pages.push(commands.join("\n") + "\n");
    };

    startPage();
    let totalPaise = 0;
    for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        const qty = Number(item.quantity);
        const unitPaise = Math.round(Number(item.unit_price) * 100);
        const mrpPaise = item.mrp == null || item.mrp === "" ? null : Math.round(Number(item.mrp) * 100);
        const amountPaise = unitPaise * qty;
        totalPaise += amountPaise;
        const artLines = wrap(item.art_number, 16, 4);
        const colourLines = wrap(item.colour, 13, 4);
        const rowHeight = Math.max(30, 14 + 13 * Math.max(artLines.length, colourLines.length));
        if (y - rowHeight < 112) { finishPage(); startPage(true); }
        if (i % 2 === 1) rect(LEFT, y - rowHeight + 5, RIGHT - LEFT, rowHeight, "0.975 0.983 0.998");
        for (let n = 0; n < artLines.length; n++) text(48, y - 9 - n * 13, artLines[n], 9);
        for (let n = 0; n < colourLines.length; n++) text(164, y - 9 - n * 13, colourLines[n], 9);
        text(246, y - 9, item.size, 9);
        text(282, y - 9, qty, 9);
        text(319, y - 9, mrpPaise == null ? "-" : money(mrpPaise).replace("Rs. ", ""), 9);
        text(395, y - 9, money(unitPaise).replace("Rs. ", ""), 9);
        text(474, y - 9, money(amountPaise).replace("Rs. ", ""), 9);
        y -= rowHeight;
        line(LEFT, y + 2, RIGHT, y + 2);
    }
    if (y < 111) { finishPage(); startPage(true); }
    rect(LEFT, y - 44, RIGHT - LEFT, 38, "0.90 0.94 0.99");
    text(324, y - 31, "TOTAL", 12, true, "0.04 0.30 0.70");
    text(400, y - 31, money(totalPaise), 12, true, "0.04 0.30 0.70");
    finishPage();

    // Assemble valid PDF 1.4 objects and cross-reference offsets.
    const objects = [null];
    const set = (index, data) => { objects[index] = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1"); };
    set(1, "<< /Type /Catalog /Pages 2 0 R >>");
    set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    for (let i = 0; i < pages.length; i++) {
        const contentId = 5 + i * 2;
        const pageId = contentId + 1;
        const stream = Buffer.from(pages[i], "latin1");
        set(contentId, Buffer.concat([
            Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, "ascii"),
            stream,
            Buffer.from("endstream", "ascii")
        ]));
        set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
        kids.push(`${pageId} 0 R`);
    }
    set(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`);
    const parts = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets = [0];
    let length = parts[0].length;
    for (let i = 1; i < objects.length; i++) {
        offsets.push(length);
        const part = Buffer.concat([
            Buffer.from(`${i} 0 obj\n`, "ascii"), objects[i], Buffer.from("\nendobj\n", "ascii")
        ]);
        parts.push(part);
        length += part.length;
    }
    const xrefOffset = length;
    const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`];
    for (let i = 1; i < offsets.length; i++) xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    parts.push(Buffer.from(xref.join(""), "ascii"));
    return Buffer.concat(parts);
}

module.exports = { buildInvoicePdf };
