const SETTINGS_KEY = "settings";
const REQUESTS_KEY = "conversionRequests";
const LAST_CONVERSION_KEY = "lastConversion";

export async function getSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.sync.get(SETTINGS_KEY);
  return mergeSettings(settings);
}

export async function saveSettings(settings) {
  const nextValue = mergeSettings(settings);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: nextValue });
  return nextValue;
}

export function getDefaultSettings() {
  return {
    mainCurrency: "CHF",
    quickCurrencies: ["EUR", "USD"],
    preferredCurrencies: ["CHF", "EUR", "USD", "GBP"],
    bankFeePercent: 0,
    allowHistoricalRates: false,
    defaultRateDate: null,
    mastercard: {
      environment: "sandbox",
      consumerKey: "",
      signingKey: "",
      proxyUrl: "",
      cardCurrency: "CHF"
    }
  };
}

export async function getConversionRequest(requestId) {
  const { [REQUESTS_KEY]: requests = {} } = await chrome.storage.local.get(REQUESTS_KEY);
  return requests?.[requestId] ?? null;
}

export async function upsertConversionRequest(requestId, request) {
  const { [REQUESTS_KEY]: requests = {} } = await chrome.storage.local.get(REQUESTS_KEY);
  const nextRequests = { ...requests, [requestId]: request };
  await chrome.storage.local.set({ [REQUESTS_KEY]: nextRequests });
  return request;
}

export async function updateConversionRequest(requestId, partial) {
  const current = await getConversionRequest(requestId);
  if (!current) {
    return null;
  }
  const next = { ...current, ...partial };
  await upsertConversionRequest(requestId, next);
  return next;
}

export async function setLastConversion(conversion) {
  await chrome.storage.local.set({ [LAST_CONVERSION_KEY]: conversion });
}

export async function getLastConversion() {
  const { [LAST_CONVERSION_KEY]: last } = await chrome.storage.local.get(LAST_CONVERSION_KEY);
  return last ?? null;
}

function mergeSettings(partial) {
  const defaults = getDefaultSettings();
  return {
    ...defaults,
    ...(partial || {}),
    quickCurrencies: Array.isArray(partial?.quickCurrencies)
      ? partial.quickCurrencies
      : defaults.quickCurrencies,
    preferredCurrencies: Array.isArray(partial?.preferredCurrencies)
      ? partial.preferredCurrencies
      : defaults.preferredCurrencies,
    mastercard: {
      ...defaults.mastercard,
      ...((partial && partial.mastercard) || {})
    }
  };
}
