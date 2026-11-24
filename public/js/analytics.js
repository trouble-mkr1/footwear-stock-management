(() => {
    "use strict";
    const byId = id => document.getElementById(id);
    const page = byId("analytics-page");
    const button = byId("analytics-button");
    if (!page || !button) return;

    const money = amount => `₹${Number(amount || 0).toLocaleString("en-IN", {minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const integer = amount => Number(amount || 0).toLocaleString("en-IN");
    const el = (tag, value, className) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value !== undefined) node.textContent = String(value);
        return node;
    };
    function ranking(elementId, rows, nameKey, extraKey) {
        const container = byId(elementId);
        container.replaceChildren();
        if (!rows?.length) {
            container.appendChild(el("p", "No delivered-order data yet.", "analytics-empty"));
            return;
        }
        const max = Math.max(...rows.map(row => Number(row.units || 0)), 1);
        rows.forEach((row, index) => {
            const item = el("div", undefined, "analytics-rank");
            const heading = el("div", undefined, "analytics-rank-heading");
            heading.append(el("span", `${index+1}. ${row[nameKey]}`), el("strong", `${integer(row.units)} pairs`));
            const track = el("div", undefined, "analytics-bar-track");
            track.setAttribute("role", "img");
            track.setAttribute("aria-label", `${row[nameKey]}: ${integer(row.units)} pairs`);
            const fill = el("div", undefined, "analytics-bar-fill");
            fill.style.width = `${Math.max(1,Math.min(100,(Number(row.units)/max)*100))}%`;
            track.appendChild(fill);
            const detail = el("p", `${integer(row.orders)} delivered orders · ${money(row.value)} recorded sales`, "analytics-rank-detail");
            item.append(heading,track,detail);
            if (extraKey && row[extraKey]) item.appendChild(el("p", row[extraKey], "analytics-rank-detail"));
            container.appendChild(item);
        });
    }
    function table(elementId, rows, keys, formatters={}) {
        const body = byId(elementId);
        body.replaceChildren();
        if (!rows.length) {
            const tr=el("tr"); const td=el("td","No delivered-order data yet.");
            td.colSpan=keys.length; tr.appendChild(td); body.appendChild(tr); return;
        }
        rows.forEach(row => {
            const tr = el("tr");
            keys.forEach(key => tr.appendChild(el("td",formatters[key] ? formatters[key](row[key]) : row[key] ?? "—")));
            body.appendChild(tr);
        });
    }
    function drawTrend(rows) {
        const chart = byId("analytics-trend");
        chart.replaceChildren();
        if (!rows?.length) { chart.append(el("p","No dated deliveries yet.")); return; }
        const peak=Math.max(1,...rows.map(row=>Number(row.units)));
        rows.forEach(row => {
            const col = el("div", undefined, "analytics-week");
            const bar = el("div", undefined, "analytics-week-bar");
            bar.style.height=`${Math.max(2,Math.min(100,Number(row.units)/peak*100))}%`;
            bar.title=`${integer(row.units)} pairs, ${integer(row.orders)} orders`;
            col.append(el("strong",integer(row.units),"analytics-week-count"));
            const wrap=el("div",undefined,"analytics-week-track"); wrap.appendChild(bar);
            col.append(wrap,el("span",row.weekLabel,"analytics-week-label"));
            chart.appendChild(col);
        });
    }
    async function loadAnalytics() {
        byId("analytics-error").classList.add("hidden");
        byId("analytics-content").classList.add("hidden");
        byId("analytics-loading").classList.remove("hidden");
        try {
            const response=await fetch("/api/analytics",{cache:"no-store"});
            if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || "Unable to load analytics.");
            const data=await response.json();
            byId("analytics-delivered").textContent=integer(data.summary.deliveredOrders);
            byId("analytics-pairs").textContent=integer(data.summary.pairsDelivered);
            byId("analytics-value").textContent=money(data.summary.knownSalesValue);
            byId("analytics-undated").textContent=integer(data.summary.undatedOrders);
            byId("analytics-unpriced-note").textContent=data.summary.unpricedLines
                ? `${integer(data.summary.unpricedLines)} historical item lines have no valid saved price and are excluded from the sales-value total.`
                : "Sales value uses saved order prices; only delivered orders are included.";
            ranking("analytics-brands",data.brands,"brand");
            ranking("analytics-articles",data.articles,"artNumber","brand");
            table("analytics-sizes",data.sizes,["size","units","orders"],{units:integer,orders:integer});
            table("analytics-shops",data.shops,["shop","topArtNumber","topArticleUnits","shopTotal"],{topArticleUnits:integer,shopTotal:integer});
            drawTrend(data.trends);
            byId("analytics-content").classList.remove("hidden");
        } catch (error) {
            byId("analytics-error").textContent=error.message;
            byId("analytics-error").classList.remove("hidden");
        } finally {
            byId("analytics-loading").classList.add("hidden");
        }
    }
    button.addEventListener("click", () => {
        hideAllMainSections();
        page.classList.remove("hidden");
        updateActiveNav(button);
        loadAnalytics();
    });
    byId("analytics-refresh").addEventListener("click",loadAnalytics);
})();
