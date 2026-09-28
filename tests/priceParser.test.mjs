import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/content/priceParser.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { parsePrice, parseAmount } = context.NeonCurrencyPriceParser;

const price = (text, tld) => {
  const result = parsePrice(text, tld);
  return result ? { currency: result.currency, amount: result.amount } : null;
};

test("symbol before amount", () => {
  assert.deepEqual(price("$19.99"), { currency: "USD", amount: 19.99 });
  assert.deepEqual(price("£0.99"), { currency: "GBP", amount: 0.99 });
  assert.deepEqual(price("€ 5"), { currency: "EUR", amount: 5 });
});

test("symbol after amount", () => {
  assert.deepEqual(price("19,99 €"), { currency: "EUR", amount: 19.99 });
  assert.deepEqual(price("1 299,00 zł"), { currency: "PLN", amount: 1299 });
});

test("ISO codes", () => {
  assert.deepEqual(price("CHF 29.90"), { currency: "CHF", amount: 29.9 });
  assert.deepEqual(price("1,299 USD"), { currency: "USD", amount: 1299 });
});

test("swiss dash notation", () => {
  assert.deepEqual(price("CHF 29.–"), { currency: "CHF", amount: 29 });
  assert.deepEqual(price("Fr. 12.-"), { currency: "CHF", amount: 12 });
});

test("longer symbols win over $", () => {
  assert.deepEqual(price("HK$ 88"), { currency: "HKD", amount: 88 });
  assert.deepEqual(price("R$ 49,90"), { currency: "BRL", amount: 49.9 });
});

test("TLD resolves ambiguous symbols", () => {
  assert.deepEqual(price("$10", "ca"), { currency: "CAD", amount: 10 });
  assert.deepEqual(price("249 kr", "no"), { currency: "NOK", amount: 249 });
  assert.deepEqual(price("249 kr", "se"), { currency: "SEK", amount: 249 });
  assert.deepEqual(price("¥100", "cn"), { currency: "CNY", amount: 100 });
});

test("amount formats", () => {
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1'234.50"), 1234.5);
  assert.equal(parseAmount("1’234.50"), 1234.5);
  assert.equal(parseAmount("1 234,56"), 1234.56);
  assert.equal(parseAmount("1.500"), 1500);
  assert.equal(parseAmount("19.99"), 19.99);
  assert.equal(parseAmount("1.234.567"), 1234567);
});

test("non-prices are ignored", () => {
  assert.equal(price("Version 2.0 released 2024"), null);
  assert.equal(price("5 ft tall"), null);
  assert.equal(price("usd"), null);
  assert.equal(price("$0"), null);
});
