import { normalizeCurrencyCode, parseAmount } from "./utils.js";

const symbolCurrencyMap = new Map([
  ["$", "USD"],
  ["€", "EUR"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₩", "KRW"],
  ["₺", "TRY"],
  ["₽", "RUB"],
  ["₹", "INR"],
  ["₣", "CHF"],
  ["Fr", "CHF"],
  ["CHF", "CHF"],
  ["$", "USD"],
  ["A$", "AUD"],
  ["C$", "CAD"],
  ["S$", "SGD"],
  ["HK$", "HKD"],
  ["NZ$", "NZD"],
  ["R$", "BRL"],
  ["kr", "SEK"],
  ["Kč", "CZK"],
  ["Ft", "HUF"],
  ["zł", "PLN"],
  ["lei", "RON"],
  ["R", "ZAR"],
  ["د.إ", "AED"],
  ["﷼", "SAR"],
  ["₪", "ILS"]
]);

const currencyCodeRegex = /\b([A-Z]{3})\b/gi;

export function detectCurrency(rawText, preferredCurrencies = []) {
  if (!rawText || typeof rawText !== "string") {
    return { sourceText: rawText ?? "", normalizedText: "", amount: null, currency: null };
  }

  const normalizedText = rawText.trim();
  const amount = parseAmount(normalizedText);

  const knownSymbolMatch = findSymbolCurrency(normalizedText);
  if (knownSymbolMatch) {
    return {
      sourceText: rawText,
      normalizedText,
      amount,
      currency: knownSymbolMatch.currency,
      detection: "symbol",
      matched: knownSymbolMatch.match
    };
  }

  const codeMatch = findCurrencyCode(normalizedText, preferredCurrencies);
  if (codeMatch) {
    return {
      sourceText: rawText,
      normalizedText,
      amount,
      currency: codeMatch,
      detection: "code",
      matched: codeMatch
    };
  }

  if (preferredCurrencies.length === 1) {
    return {
      sourceText: rawText,
      normalizedText,
      amount,
      currency: normalizeCurrencyCode(preferredCurrencies[0]) || null,
      detection: "fallback"
    };
  }

  return {
    sourceText: rawText,
    normalizedText,
    amount,
    currency: null,
    detection: "unknown"
  };
}

function findSymbolCurrency(text) {
  for (const [symbol, currency] of symbolCurrencyMap.entries()) {
    if (text.includes(symbol)) {
      return { currency, match: symbol };
    }
  }
  return null;
}

function findCurrencyCode(text, preferredCurrencies) {
  const matches = text.match(currencyCodeRegex);
  if (!matches) {
    return null;
  }

  const normalizedMatches = matches.map((code) => normalizeCurrencyCode(code));
  const preferredSet = new Set((preferredCurrencies || []).map((code) => normalizeCurrencyCode(code)));

  const preferredMatch = normalizedMatches.find((code) => preferredSet.has(code));
  if (preferredMatch) {
    return preferredMatch;
  }

  return normalizedMatches[0] ?? null;
}
