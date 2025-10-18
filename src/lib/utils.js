export function createRequestId() {
  return crypto.randomUUID();
}

export function normalizeCurrencyCode(code) {
  return code ? code.trim().toUpperCase() : "";
}

export function parseAmount(value) {
  if (!value) {
    return null;
  }
  const normalized = value
    .replace(/[^\d,.\-]/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatCurrencyValue(amount, currency) {
  if (!Number.isFinite(amount)) {
    return "";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amount);
}

export function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}
