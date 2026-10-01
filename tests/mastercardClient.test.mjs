import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Minimal chrome.* mock covering what mastercardClient.js uses.
const store = {};
const calls = [];
let responder = () => new Response("{}", { status: 500 });

globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (values) => Object.assign(store, structuredClone(values))
    }
  },
  tabs: {
    TAB_ID_NONE: -1,
    get: async (id) => ({ id, windowId: 7, status: "complete", url: "https://www.mastercard.com/ch/de/x.html" }),
    onUpdated: { addListener() {}, removeListener() {} }
  },
  windows: {
    create: async () => {
      calls.push("window:open");
      return { tabs: [{ id: 42 }] };
    },
    remove: async () => calls.push("window:close")
  },
  scripting: {
    executeScript: async ({ func, args }) => {
      calls.push("page-fetch");
      return [{ result: await func(...args) }];
    }
  },
  declarativeNetRequest: { updateSessionRules: async () => {} }
};

globalThis.fetch = async (url, options = {}) => {
  const params = new URL(url).searchParams;
  const request = {
    via: options.method === "GET" ? "direct" : "page",
    source: params.get("transaction_currency"),
    target: params.get("cardholder_billing_currency"),
    date: params.get("exchange_date")
  };
  calls.push(`${request.via}:${request.source}>${request.target}@${request.date}`);
  return responder(request);
};

const rateResponse = (rate, date) => Response.json({ data: { conversionRate: rate, fxDate: date } });
const isoDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const { convertAmounts } = await import("../src/lib/mastercardClient.js");
const settings = { mastercard: { backgroundTabFallback: true } };

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
  calls.length = 0;
});

test("converts locally with the Mastercard rate", async () => {
  responder = ({ target, date }) => rateResponse(target === "CHF" ? 0.8 : 0.9, date);
  const result = await convertAmounts(
    { amount: 100, sourceCurrency: "usd", targetCurrencies: ["CHF", "EUR", "USD"], rateDate: "2026-09-01" },
    settings
  );
  assert.equal(result.rateDate, "2026-09-01");
  assert.deepEqual(
    result.conversions.map(({ currency, rate, convertedAmount }) => [currency, rate, convertedAmount]),
    [["CHF", 0.8, 80], ["EUR", 0.9, 90]]
  );
  assert.equal(result.metadata.source, "mastercard");
});

test("walks back to the last published date and caches the latest rate", async () => {
  const today = isoDaysAgo(0);
  responder = ({ date }) =>
    date === today
      ? Response.json({ data: { errorCode: "104", errorMessage: "Rate not available" } })
      : rateResponse(0.8, date);

  const first = await convertAmounts({ amount: 10, sourceCurrency: "USD", targetCurrencies: ["CHF"] }, settings);
  assert.equal(first.rateDate, isoDaysAgo(1));
  assert.equal(first.metadata.cached, false);

  calls.length = 0;
  const second = await convertAmounts({ amount: 20, sourceCurrency: "USD", targetCurrencies: ["CHF"] }, settings);
  assert.equal(second.conversions[0].convertedAmount, 16);
  assert.equal(second.metadata.cached, true);
  assert.deepEqual(calls, []);
});

test("walks back when a missing date is reported as HTTP 4xx with a JSON body", async () => {
  const today = isoDaysAgo(0);
  responder = ({ date }) =>
    date === today
      ? Response.json({ message: "Rate not available for date" }, { status: 400 })
      : rateResponse(0.8, date);

  const result = await convertAmounts({ amount: 10, sourceCurrency: "EUR", targetCurrencies: ["CHF"] }, settings);
  assert.equal(result.rateDate, isoDaysAgo(1));
  assert.equal(result.conversions[0].convertedAmount, 8);
});

test("falls back to the Mastercard page when the direct request gets HTTP 401", async () => {
  responder = ({ via, date }) =>
    via === "direct" ? new Response("Unauthorized", { status: 401 }) : rateResponse(1.1, date);

  const result = await convertAmounts(
    { amount: 10, sourceCurrency: "SEK", targetCurrencies: ["CHF"], rateDate: "2026-09-03" },
    settings
  );
  assert.equal(result.metadata.transport, "page");
  assert.equal(result.conversions[0].convertedAmount, 11);
});

test("reports status and body when the page request is rejected too", async () => {
  responder = () => new Response("<html><body>Unauthorized</body></html>", { status: 401 });
  await assert.rejects(
    convertAmounts({ amount: 1, sourceCurrency: "NOK", targetCurrencies: ["CHF"], rateDate: "2026-09-04" }, settings),
    /HTTP 401\): Unauthorized/
  );
});

test("falls back to the Mastercard page when Akamai blocks direct requests", async () => {
  responder = ({ via, target, date }) =>
    via === "direct" ? new Response("<HTML>Access Denied</HTML>", { status: 403 }) : rateResponse(target === "CHF" ? 1.1 : 1.2, date);

  const result = await convertAmounts(
    { amount: 10, sourceCurrency: "GBP", targetCurrencies: ["CHF", "EUR"], rateDate: "2026-09-02" },
    settings
  );
  assert.equal(result.metadata.transport, "page");
  assert.deepEqual(result.conversions.map((c) => c.convertedAmount), [11, 12]);
  assert.equal(calls.filter((c) => c === "window:open").length, 1, "one window for all targets");
  assert.ok(calls.includes("window:close"));
});

test("rejects invalid input", async () => {
  await assert.rejects(convertAmounts({ amount: Number.NaN, sourceCurrency: "USD", targetCurrencies: ["CHF"] }, settings));
  await assert.rejects(convertAmounts({ amount: 1, sourceCurrency: "USD", targetCurrencies: ["USD"] }, settings));
});
