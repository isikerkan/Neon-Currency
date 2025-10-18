import { getConversionRequest, getSettings } from "../lib/storage.js";
import { formatCurrencyValue } from "../lib/utils.js";

const manualSection = document.getElementById("manual-section");
const conversionSection = document.getElementById("conversion-section");
const errorSection = document.getElementById("error-section");
const resultsBody = document.getElementById("results-body");
const selectionTextEl = document.getElementById("selection-text");
const rateDateEl = document.getElementById("rate-date");
const errorMessageEl = document.getElementById("error-message");
const manualForm = document.getElementById("manual-form");
const manualAmount = document.getElementById("manual-amount");
const manualCurrency = document.getElementById("manual-currency");
const manualDate = document.getElementById("manual-date");
const dateField = document.getElementById("date-field");
const retryButton = document.getElementById("retry-button");
const settingsButton = document.getElementById("open-settings");

const params = new URLSearchParams(window.location.search);
const requestId = params.get("requestId");

let settings = null;
let currentState = null;

init().catch((error) => {
  displayError(typeof error === "string" ? error : error.message);
});

async function init() {
  settings = await getSettings();
  if (!settings.allowHistoricalRates) {
    dateField.setAttribute("hidden", "true");
  }
  if (!requestId) {
    displayError("Conversion request not found.");
    return;
  }
  const state = await getConversionRequest(requestId);
  if (!state) {
    displayError("Conversion request expired or missing.");
    return;
  }
  applyState(state);

  chrome.runtime.onMessage.addListener(handleRuntimeMessage);

  manualForm.addEventListener("submit", onManualSubmit);
  retryButton.addEventListener("click", retryConversion);
  settingsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

function handleRuntimeMessage(message) {
  if (!message || !message.payload || message.payload.id !== requestId) {
    return;
  }
  if (message.type === "conversion:completed") {
    applyState(message.payload);
  }
  if (message.type === "conversion:failed") {
    applyState(message.payload);
  }
}

function applyState(state) {
  currentState = state;
  hideAllSections();

  if (state.status === "pending") {
    showManualSection(state, true);
    return;
  }

  if (state.status === "awaitingInput") {
    showManualSection(state, false);
    return;
  }

  if (state.status === "completed") {
    showConversion(state);
    return;
  }

  if (state.status === "error") {
    displayError(state.errorMessage || "Conversion failed.");
  }
}

function hideAllSections() {
  manualSection.hidden = true;
  conversionSection.hidden = true;
  errorSection.hidden = true;
}

function showManualSection(state, isPending) {
  manualSection.hidden = false;
  if (state.amount && !manualAmount.value) {
    manualAmount.value = state.amount;
  }
  if (state.sourceCurrency && !manualCurrency.value) {
    manualCurrency.value = state.sourceCurrency;
  }
  if (state.rateDate && !manualDate.value) {
    manualDate.value = state.rateDate;
  }
  manualForm.dataset.state = isPending ? "pending" : "input";
}

function showConversion(state) {
  conversionSection.hidden = false;
  selectionTextEl.textContent = state.sourceText || "";
  if (state.rateDate) {
    rateDateEl.textContent = `Rate date: ${state.rateDate}`;
    rateDateEl.hidden = false;
  } else {
    rateDateEl.hidden = true;
  }

  resultsBody.innerHTML = "";
  let hasFeeColumn = false;
  let hasTotalColumn = false;

  for (const conversion of state.conversions || []) {
    const row = document.createElement("tr");
    const feeAmount = conversion.bankFeeAmount ?? null;
    const totalWithFee = conversion.totalWithFee ?? null;
    if (Number.isFinite(feeAmount)) {
      hasFeeColumn = true;
    }
    if (Number.isFinite(totalWithFee)) {
      hasTotalColumn = true;
    }
    row.innerHTML = `
      <td>${conversion.currency}</td>
      <td>${formatRate(conversion.rate)}</td>
      <td class="amount-column">${formatCurrencyValue(conversion.convertedAmount, conversion.currency)}</td>
      <td class="fee-column">${formatOptionalAmount(feeAmount, conversion.currency)}</td>
      <td class="total-column">${formatOptionalAmount(totalWithFee, conversion.currency)}</td>
    `;
    resultsBody.appendChild(row);
  }

  toggleColumnVisibility("fee-column", hasFeeColumn);
  toggleColumnVisibility("total-column", hasTotalColumn);
}

function displayError(message) {
  hideAllSections();
  errorSection.hidden = false;
  errorMessageEl.textContent = message;
}

function toggleColumnVisibility(className, shouldShow) {
  const cells = document.querySelectorAll(`.${className}`);
  cells.forEach((cell) => {
    cell.hidden = !shouldShow;
  });
  const header = document.querySelector(`th.${className}`);
  if (header) {
    header.hidden = !shouldShow;
  }
}

function formatRate(rate) {
  if (!Number.isFinite(rate)) {
    return "-";
  }
  return rate.toFixed(6);
}

function formatOptionalAmount(amount, currency) {
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return formatCurrencyValue(amount, currency);
}

async function onManualSubmit(event) {
  event.preventDefault();
  const amount = Number.parseFloat(manualAmount.value);
  const sourceCurrency = manualCurrency.value.trim().toUpperCase();
  const rateDate = manualDate.value || null;

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Please enter a valid amount.");
    return;
  }

  if (!sourceCurrency) {
    alert("Please provide a source currency.");
    return;
  }

  await retryConversion({ amount, sourceCurrency, rateDate });
}

async function retryConversion(override = null) {
  if (!currentState) {
    return;
  }
  const payload = {
    id: currentState.id,
    sourceText: currentState.sourceText,
    amount: override?.amount ?? Number.parseFloat(manualAmount.value),
    sourceCurrency: override?.sourceCurrency ?? manualCurrency.value.trim().toUpperCase(),
    rateDate: override?.rateDate ?? (manualDate.value || null)
  };

  try {
    manualSection.classList.add("loading");
    const response = await chrome.runtime.sendMessage({
      type: "conversion:retry",
      payload
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Failed to restart conversion.");
    }
  } catch (error) {
    displayError(error instanceof Error ? error.message : String(error));
  } finally {
    manualSection.classList.remove("loading");
  }
}
