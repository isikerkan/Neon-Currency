// Floating price tooltip: detects prices under the mouse and shows the converted amounts
// (Mastercard rate + bank fee) for the main and quick currencies, with country flags.
// Classic content script (no ES modules), so everything it needs lives in this file.
(() => {
  if (window.__cardCurrencyHover) {
    return;
  }
  window.__cardCurrencyHover = true;

  const HOVER_DELAY_MS = 350;
  const HIDE_DELAY_MS = 250;
  const MAX_PRICE_TEXT_LENGTH = 40;
  const MAX_ANCESTOR_DEPTH = 3;

  const TOOLTIP_CSS = `
    .card {
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: #e8f1ff;
      background: rgba(17, 22, 34, 0.96);
      border: 1px solid #2d3a55;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      padding: 8px 10px;
      min-width: 180px;
      max-width: 280px;
    }
    .card[hidden] { display: none; }
    .header, .row { display: flex; align-items: center; gap: 8px; }
    .header {
      font-weight: 600;
      padding-bottom: 6px;
      margin-bottom: 6px;
      border-bottom: 1px solid #2d3a55;
    }
    .rows { display: grid; gap: 4px; }
    .code { color: #9fb2d6; width: 34px; }
    .amount { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 600; }
    .flag {
      width: 20px;
      height: 15px;
      border-radius: 2px;
      object-fit: cover;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
      flex: none;
    }
    .flag.placeholder { display: inline-block; background: #2d3a55; }
    .status { color: #9fb2d6; }
    .status.error { color: #ff8a8a; }
    .footer { margin-top: 6px; font-size: 11px; color: #7d8fb3; }
  `;

  const { CURRENCY_FLAGS, parsePrice: parsePriceText } = globalThis.CardCurrencyPriceParser;
  const tld = location.hostname.split(".").pop();
  const quoteCache = new Map();

  let settings = null;
  let hoverTimer = null;
  let hideTimer = null;
  let activeElement = null;
  let requestSeq = 0;

  const tooltip = createTooltip();

  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) {
      loadSettings();
      quoteCache.clear();
    }
  });

  document.addEventListener("mouseover", onMouseOver, { passive: true });
  document.addEventListener("scroll", () => hideTooltip(true), { passive: true, capture: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip(true);
    }
  });

  async function loadSettings() {
    try {
      const { settings: stored } = await chrome.storage.sync.get("settings");
      settings = stored || {};
    } catch {
      settings = {};
    }
  }

  function isEnabled() {
    return settings && settings.hoverTooltip?.enabled !== false;
  }

  function onMouseOver(event) {
    if (!isEnabled()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element) || tooltip.host.contains(target)) {
      return;
    }
    if (target.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }

    const match = findPriceElement(target);
    if (!match) {
      if (activeElement && !activeElement.contains(target)) {
        scheduleHide();
      }
      return;
    }
    if (match.element === activeElement) {
      clearTimeout(hideTimer);
      return;
    }

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showForPrice(match), HOVER_DELAY_MS);
    match.element.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimer);
      scheduleHide();
    }, { once: true });
  }

  // Prices are often split over several nodes (<span>€</span><span>19</span><sup>99</sup>),
  // so walk up a few ancestors until the short text forms a complete price.
  function findPriceElement(start) {
    let element = start;
    for (let depth = 0; element && depth <= MAX_ANCESTOR_DEPTH; depth += 1) {
      const text = normalizeText(element.textContent || "");
      if (text.length > MAX_PRICE_TEXT_LENGTH) {
        return null;
      }
      const price = parsePriceText(text, tld);
      if (price) {
        return { element, ...price };
      }
      element = element.parentElement;
    }
    return null;
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
  }


  async function showForPrice(price) {
    activeElement = price.element;
    clearTimeout(hideTimer);
    const seq = ++requestSeq;
    renderLoading(price);
    positionTooltip(price.element);

    try {
      const quote = await fetchQuote(price);
      if (seq !== requestSeq) {
        return;
      }
      if (!quote.conversions.length) {
        hideTooltip(true);
        return;
      }
      renderQuote(price, quote);
      positionTooltip(price.element);
    } catch (error) {
      if (seq === requestSeq) {
        renderError(price, error instanceof Error ? error.message : String(error));
      }
    }
  }

  async function fetchQuote(price) {
    const key = `${price.currency}:${price.amount}`;
    if (!quoteCache.has(key)) {
      const pending = chrome.runtime
        .sendMessage({ type: "conversion:quote", payload: { amount: price.amount, sourceCurrency: price.currency } })
        .then((response) => {
          if (!response?.ok) {
            throw new Error(response?.error || "Conversion failed.");
          }
          return response.quote;
        });
      quoteCache.set(key, pending);
      pending.catch(() => quoteCache.delete(key));
    }
    return quoteCache.get(key);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideTooltip(false), HIDE_DELAY_MS);
  }

  function hideTooltip(immediate) {
    if (!immediate && tooltip.host.matches(":hover")) {
      return;
    }
    clearTimeout(hoverTimer);
    requestSeq += 1;
    activeElement = null;
    tooltip.card.hidden = true;
  }

  function createTooltip() {
    const host = document.createElement("card-currency-tooltip");
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = TOOLTIP_CSS;
    const card = document.createElement("div");
    card.className = "card";
    card.hidden = true;
    shadow.append(style, card);
    host.addEventListener("mouseleave", () => scheduleHide());
    host.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    (document.body || document.documentElement).appendChild(host);
    return { host, card };
  }

  function positionTooltip(anchor) {
    const rect = anchor.getBoundingClientRect();
    const card = tooltip.card;
    card.hidden = false;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const margin = 8;

    let top = rect.bottom + margin;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - height - margin);
    }
    let left = rect.left;
    left = Math.min(left, window.innerWidth - width - margin);
    left = Math.max(margin, left);

    tooltip.host.style.top = `${Math.round(top)}px`;
    tooltip.host.style.left = `${Math.round(left)}px`;
  }

  function renderLoading(price) {
    tooltip.card.replaceChildren(
      renderHeader(price),
      element("div", "status", "Loading Mastercard rate…")
    );
  }

  function renderError(price, message) {
    tooltip.card.replaceChildren(renderHeader(price), element("div", "status error", message));
  }

  function renderQuote(price, quote) {
    const rows = element("div", "rows");
    for (const conversion of quote.conversions) {
      const row = element("div", "row");
      row.append(
        flagImage(conversion.currency),
        element("span", "code", conversion.currency),
        element("span", "amount", formatMoney(conversion.totalWithFee ?? conversion.convertedAmount, conversion.currency))
      );
      row.title = `1 ${price.currency} = ${formatRate(conversion.rate)} ${conversion.currency}`;
      rows.appendChild(row);
    }

    const footerParts = ["Mastercard"];
    if (quote.rateDate) {
      footerParts.push(quote.rateDate);
    }
    if (quote.bankFeePercent > 0) {
      footerParts.push(`incl. ${quote.bankFeePercent}% fee`);
    }

    tooltip.card.replaceChildren(renderHeader(price), rows, element("div", "footer", footerParts.join(" · ")));
  }

  function renderHeader(price) {
    const header = element("div", "header");
    header.append(flagImage(price.currency), element("span", "source", formatMoney(price.amount, price.currency)));
    return header;
  }

  function flagImage(currency) {
    const code = CURRENCY_FLAGS[currency];
    if (!code) {
      return element("span", "flag placeholder", "");
    }
    const img = document.createElement("img");
    img.className = "flag";
    img.alt = "";
    img.src = chrome.runtime.getURL(`src/assets/flags/${code}.svg`);
    return img;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function formatMoney(amount, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  function formatRate(rate) {
    return Number.isFinite(rate) ? rate.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : "?";
  }
})();
