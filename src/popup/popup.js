import { getSettings, getLastConversion } from "../lib/storage.js";
import { createRequestId, formatCurrencyValue } from "../lib/utils.js";

const amountInput = document.getElementById("amount-input");
const sourceCurrencyInput = document.getElementById("source-currency-input");
const rateDateInput = document.getElementById("rate-date-input");
const rateDateField = document.getElementById("popup-date-field");
const quickButtonsContainer = document.getElementById("quick-buttons");
const settingsButton = document.getElementById("settings-button");
const resultSection = document.getElementById("result-section");
const resultContent = document.getElementById("result-content");
const historySection = document.getElementById("history-section");
const historyContent = document.getElementById("history-content");

let settings = null;
let pendingRequestId = null;

init().catch((error) => {
  resultSection.hidden = false;
  resultContent.textContent = typeof error === "string" ? error : error.message;
});

async function init() {
  settings = await getSettings();
  amountInput.value = "";
  sourceCurrencyInput.value = settings.mastercard?.cardCurrency || settings.mainCurrency || "";
  if (!settings.allowHistoricalRates) {
    rateDateField.hidden = true;
  }

  renderQuickButtons();
  await renderHistory();

  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
}

function renderQuickButtons() {
  quickButtonsContainer.innerHTML = "";
  const targets = new Set(settings.quickCurrencies || []);
  targets.add(settings.mainCurrency);

  if (!targets.size) {
    const info = document.createElement("p");
    info.textContent = "Configure quick currencies in settings.";
    quickButtonsContainer.appendChild(info);
    return;
  }

  for (const currency of targets) {
    if (!currency) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = currency;
    button.addEventListener("click", () => triggerConversion(currency));
    quickButtonsContainer.appendChild(button);
  }
}

async function triggerConversion(targetCurrency) {
  const amount = Number.parseFloat(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Enter a valid amount.");
    return;
  }
  const sourceCurrency = sourceCurrencyInput.value.trim().toUpperCase();
  if (!sourceCurrency) {
    alert("Enter a source currency.");
    return;
  }
  const rateDate = settings.allowHistoricalRates ? rateDateInput.value || null : null;

  const requestId = createRequestId();
  pendingRequestId = requestId;
  setButtonsDisabled(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "conversion:retry",
      payload: {
        id: requestId,
        sourceText: "Popup conversion",
        amount,
        sourceCurrency,
        rateDate,
        targetCurrencies: [targetCurrency]
      }
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to start conversion.");
    }
  } catch (error) {
    showPopupError(error instanceof Error ? error.message : String(error));
    setButtonsDisabled(false);
    pendingRequestId = null;
  }
}

function handleRuntimeMessage(message) {
  if (!message || !message.payload) {
    return;
  }
  if (message.type === "conversion:completed") {
    if (message.payload.id === pendingRequestId) {
      renderResult(message.payload);
      setButtonsDisabled(false);
      pendingRequestId = null;
    }
    renderHistory();
  }
  if (message.type === "conversion:failed" && message.payload.id === pendingRequestId) {
    showPopupError(message.payload.errorMessage || "Conversion failed.");
    setButtonsDisabled(false);
    pendingRequestId = null;
  }
}

function renderResult(state) {
  resultSection.hidden = false;
  resultContent.innerHTML = "";
  const title = document.createElement("p");
  title.textContent = `${state.amount} ${state.sourceCurrency}`;
  resultContent.appendChild(title);

  if (state.rateDate) {
    const rateInfo = document.createElement("p");
    rateInfo.className = "result-rate";
    rateInfo.textContent = `Rate date: ${state.rateDate}`;
    resultContent.appendChild(rateInfo);
  }

  for (const conversion of state.conversions || []) {
    const row = document.createElement("div");
    row.className = "result-row";
    const amountText = formatCurrencyValue(conversion.totalWithFee ?? conversion.convertedAmount, conversion.currency);
    row.innerHTML = `<span>${conversion.currency}</span><span>${amountText}</span>`;
    resultContent.appendChild(row);
  }
}

async function renderHistory() {
  const last = await getLastConversion();
  if (!last || !Array.isArray(last.conversions)) {
    historySection.hidden = true;
    return;
  }
  historySection.hidden = false;
  historyContent.innerHTML = "";
  const title = document.createElement("p");
  title.textContent = `${last.amount} ${last.sourceCurrency}`;
  historyContent.appendChild(title);

  if (last.rateDate) {
    const rateInfo = document.createElement("p");
    rateInfo.className = "result-rate";
    rateInfo.textContent = `Rate date: ${last.rateDate}`;
    historyContent.appendChild(rateInfo);
  }

  for (const conversion of last.conversions) {
    const row = document.createElement("div");
    row.className = "result-row";
    const amountText = formatCurrencyValue(
      conversion.totalWithFee ?? conversion.convertedAmount,
      conversion.currency
    );
    row.innerHTML = `<span>${conversion.currency}</span><span>${amountText}</span>`;
    historyContent.appendChild(row);
  }
}

function showPopupError(message) {
  resultSection.hidden = false;
  resultContent.textContent = message;
}

function setButtonsDisabled(disabled) {
  for (const button of quickButtonsContainer.querySelectorAll("button")) {
    button.disabled = disabled;
  }
}
