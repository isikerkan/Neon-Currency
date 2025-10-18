import { currencies } from "../data/currencies.js";
import { getSettings, saveSettings, getDefaultSettings } from "../lib/storage.js";
import { uniqueList, normalizeCurrencyCode } from "../lib/utils.js";

const form = document.getElementById("settings-form");
const mainCurrencySelect = document.getElementById("main-currency");
const quickCurrenciesSelect = document.getElementById("quick-currencies");
const preferredCurrenciesSelect = document.getElementById("preferred-currencies");
const bankFeeInput = document.getElementById("bank-fee");
const allowHistoricalCheckbox = document.getElementById("allow-historical");
const defaultDateWrapper = document.getElementById("default-date-wrapper");
const defaultDateInput = document.getElementById("default-date");
const proxyUrlInput = document.getElementById("proxy-url");
const consumerKeyInput = document.getElementById("consumer-key");
const signingKeyInput = document.getElementById("signing-key");
const environmentSelect = document.getElementById("environment");
const cardCurrencyInput = document.getElementById("card-currency");
const statusElement = document.getElementById("status");

init().catch((error) => {
  showStatus(typeof error === "string" ? error : error.message, true);
});

async function init() {
  populateCurrencySelect(mainCurrencySelect);
  populateCurrencySelect(quickCurrenciesSelect);
  populateCurrencySelect(preferredCurrenciesSelect);

  const settings = await getSettings();
  applySettings(settings);

  allowHistoricalCheckbox.addEventListener("change", () => {
    toggleDefaultDate();
  });

  form.addEventListener("submit", onSubmit);
}

function populateCurrencySelect(select) {
  select.innerHTML = "";
  for (const currency of currencies) {
    const option = document.createElement("option");
    option.value = currency.code;
    option.textContent = `${currency.code} – ${currency.name}`;
    select.appendChild(option);
  }
}

function applySettings(settings) {
  mainCurrencySelect.value = settings.mainCurrency;
  selectOptions(quickCurrenciesSelect, settings.quickCurrencies);
  selectOptions(preferredCurrenciesSelect, settings.preferredCurrencies);

  bankFeeInput.value = settings.bankFeePercent ?? 0;
  allowHistoricalCheckbox.checked = Boolean(settings.allowHistoricalRates);
  if (settings.defaultRateDate) {
    defaultDateInput.value = settings.defaultRateDate;
  }
  proxyUrlInput.value = settings.mastercard?.proxyUrl ?? "";
  consumerKeyInput.value = settings.mastercard?.consumerKey ?? "";
  signingKeyInput.value = settings.mastercard?.signingKey ?? "";
  environmentSelect.value = settings.mastercard?.environment ?? "sandbox";
  cardCurrencyInput.value = settings.mastercard?.cardCurrency ?? "";
  toggleDefaultDate();
}

function selectOptions(select, values) {
  const set = new Set((values || []).map((code) => normalizeCurrencyCode(code)));
  for (const option of select.options) {
    option.selected = set.has(option.value);
  }
}

async function onSubmit(event) {
  event.preventDefault();
  const defaults = getDefaultSettings();
  const bankFee = Number.parseFloat(bankFeeInput.value);

  const payload = {
    mainCurrency: mainCurrencySelect.value || defaults.mainCurrency,
    quickCurrencies: getSelectedValues(quickCurrenciesSelect),
    preferredCurrencies: getSelectedValues(preferredCurrenciesSelect),
    bankFeePercent: Number.isFinite(bankFee) && bankFee >= 0 ? bankFee : defaults.bankFeePercent,
    allowHistoricalRates: allowHistoricalCheckbox.checked,
    defaultRateDate: allowHistoricalCheckbox.checked ? defaultDateInput.value || null : null,
    mastercard: {
      proxyUrl: proxyUrlInput.value.trim(),
      consumerKey: consumerKeyInput.value.trim(),
      signingKey: signingKeyInput.value.trim(),
      environment: environmentSelect.value,
      cardCurrency: normalizeCurrencyCode(cardCurrencyInput.value) || defaults.mastercard.cardCurrency
    }
  };

  payload.quickCurrencies = sanitizeCurrencies(payload.quickCurrencies, payload.mainCurrency);
  payload.preferredCurrencies = sanitizeCurrencies(payload.preferredCurrencies);

  try {
    await saveSettings(payload);
    showStatus("Settings saved.", false);
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), true);
  }
}

function getSelectedValues(select) {
  return Array.from(select.selectedOptions).map((option) => option.value);
}

function sanitizeCurrencies(codes, mainCurrency = null) {
  const normalized = codes.map((code) => normalizeCurrencyCode(code)).filter(Boolean);
  if (mainCurrency) {
    normalized.push(normalizeCurrencyCode(mainCurrency));
  }
  return uniqueList(normalized);
}

function toggleDefaultDate() {
  defaultDateWrapper.hidden = !allowHistoricalCheckbox.checked;
}

function showStatus(message, isError) {
  statusElement.textContent = message;
  statusElement.style.color = isError ? "#c53030" : "#2f855a";
  setTimeout(() => {
    statusElement.textContent = "";
  }, 3000);
}
