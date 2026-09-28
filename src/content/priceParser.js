// Price detection shared by the hover tooltip (content script) and the unit tests.
// Classic script: exposes globalThis.CardCurrencyPriceParser.
(() => {
  const CURRENCY_FLAGS = {
    AED: "ae", AUD: "au", BRL: "br", CAD: "ca", CHF: "ch", CNY: "cn", CZK: "cz", DKK: "dk",
    EUR: "eu", GBP: "gb", HKD: "hk", HRK: "hr", HUF: "hu", ILS: "il", INR: "in", JPY: "jp",
    KRW: "kr", MXN: "mx", NOK: "no", NZD: "nz", PLN: "pl", RON: "ro", RSD: "rs", RUB: "ru",
    SAR: "sa", SEK: "se", SGD: "sg", THB: "th", TRY: "tr", USD: "us", ZAR: "za"
  };
  const CURRENCY_CODES = Object.keys(CURRENCY_FLAGS);

  // Longest tokens first so "HK$" wins over "$".
  const SYMBOLS = [
    ["US$", "USD"], ["HK$", "HKD"], ["NZ$", "NZD"], ["A$", "AUD"], ["C$", "CAD"], ["S$", "SGD"],
    ["R$", "BRL"], ["Mex$", "MXN"], ["€", "EUR"], ["£", "GBP"], ["¥", "JPY"], ["₩", "KRW"],
    ["₺", "TRY"], ["₽", "RUB"], ["₹", "INR"], ["₪", "ILS"], ["฿", "THB"], ["zł", "PLN"],
    ["Kč", "CZK"], ["Ft", "HUF"], ["lei", "RON"], ["kr", "SEK"], ["Fr.", "CHF"], ["$", "USD"]
  ];

  // Ambiguous symbols resolved by the site's top-level domain.
  const TLD_OVERRIDES = {
    $: { ca: "CAD", au: "AUD", nz: "NZD", sg: "SGD", hk: "HKD", mx: "MXN" },
    kr: { no: "NOK", dk: "DKK" },
    "¥": { cn: "CNY" }
  };

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const currencyToken = [...SYMBOLS.map(([symbol]) => escapeRegex(symbol)), ...CURRENCY_CODES].join("|");
  const numberToken = "\\d{1,3}(?:[.,'’\\u00a0\\u202f ]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
  const swissDash = "(?:[.,][-–—])?";
  const PRICE_REGEX = new RegExp(
    `(?:(${currencyToken})\\s?(${numberToken})${swissDash})|(?:(${numberToken})${swissDash}\\s?(${currencyToken}))`
  );

  function parsePrice(text, tld = "") {
    const match = PRICE_REGEX.exec(text);
    if (!match) {
      return null;
    }
    const token = match[1] ?? match[4];
    const numberText = match[2] ?? match[3];
    const currency = resolveCurrency(token, tld);
    const amount = parseAmount(numberText);
    if (!currency || !Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    return { currency, amount, text: match[0] };
  }

  function resolveCurrency(token, tld) {
    const upper = token.toUpperCase();
    if (CURRENCY_FLAGS[upper] && token === upper) {
      return upper;
    }
    const override = TLD_OVERRIDES[token]?.[tld];
    if (override) {
      return override;
    }
    const symbol = SYMBOLS.find(([candidate]) => candidate === token);
    return symbol ? symbol[1] : null;
  }

  // Handles 1,234.56 / 1.234,56 / 1'234.50 / 1 234,56 / 19.-
  function parseAmount(raw) {
    const compact = raw.replace(/[\s  '’]/g, "");
    const lastDot = compact.lastIndexOf(".");
    const lastComma = compact.lastIndexOf(",");
    let normalized = compact;

    if (lastDot !== -1 && lastComma !== -1) {
      const decimalSeparator = lastDot > lastComma ? "." : ",";
      const thousandsSeparator = decimalSeparator === "." ? "," : ".";
      normalized = compact.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
    } else if (lastDot !== -1 || lastComma !== -1) {
      const separator = lastDot !== -1 ? "." : ",";
      const parts = compact.split(separator);
      const isThousands = parts.length > 2 || parts[parts.length - 1].length === 3;
      normalized = isThousands ? parts.join("") : parts.join(".");
    }
    return Number.parseFloat(normalized);
  }

  globalThis.CardCurrencyPriceParser = { CURRENCY_FLAGS, parsePrice, parseAmount, resolveCurrency };
})();
