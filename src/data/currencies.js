export const currencies = [
  { code: "AED", name: "United Arab Emirates Dirham", symbol: "د.إ" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "$" },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "ILS", name: "Israeli New Shekel", symbol: "₪" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "$" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "RSD", name: "Serbian Dinar", symbol: "дин." },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "SGD", name: "Singapore Dollar", symbol: "$" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "USD", name: "United States Dollar", symbol: "$" },
  { code: "ZAR", name: "South African Rand", symbol: "R" }
];

export function findCurrency(code) {
  return currencies.find((currency) => currency.code === code.toUpperCase());
}
