import { normalizeCurrencyCode, uniqueList } from "./utils.js";

export async function convertAmounts({ amount, sourceCurrency, targetCurrencies, rateDate }, settings) {
  if (!Number.isFinite(amount)) {
    throw new Error("Amount is missing or invalid.");
  }
  const source = normalizeCurrencyCode(sourceCurrency);
  if (!source) {
    throw new Error("Source currency must be provided.");
  }

  const targets = uniqueList(targetCurrencies.map((code) => normalizeCurrencyCode(code))).filter(
    (code) => code && code !== source
  );
  if (!targets.length) {
    throw new Error("No target currencies supplied.");
  }

  const requestPayload = {
    amount,
    sourceCurrency: source,
    targetCurrencies: targets,
    rateDate: rateDate ?? null
  };

  const mastercardSettings = settings?.mastercard ?? {};
  const proxyUrl = (mastercardSettings.proxyUrl || "").trim();
  if (proxyUrl) {
    return callProxy(proxyUrl, requestPayload);
  }

  throw new Error(
    "Mastercard API credentials are not configured. Set a proxy URL or provide signed request handling."
  );
}

async function callProxy(proxyUrl, payload) {
  const endpoint = new URL(proxyUrl);
  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await safeReadText(response);
    throw new Error(message || `Proxy request failed with status ${response.status}.`);
  }

  const data = await response.json();
  validateProxyResponse(data);
  return data;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function validateProxyResponse(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Proxy response is empty.");
  }
  if (!Array.isArray(data.conversions)) {
    throw new Error("Proxy response is missing conversions.");
  }
}
