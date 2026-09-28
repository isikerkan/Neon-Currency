import { normalizeCurrencyCode, uniqueList } from "./utils.js";

// Public endpoint used by Mastercard's own currency converter page. No API key required,
// but it sits behind Akamai bot protection, so requests must look like they come from that page.
export const MASTERCARD_ORIGIN = "https://www.mastercard.com";
export const MASTERCARD_RATES_PATH =
  "/marketingservices/public/mccom-services/currency-conversions/conversion-rates";
export const MASTERCARD_CONVERTER_PAGE =
  `${MASTERCARD_ORIGIN}/ch/de/pers%C3%B6nlich/get-support/currency-exchange-rate-converter.html`;

const RATE_CACHE_KEY = "fxRateCache";
const LATEST_RATE_TTL_MS = 30 * 60 * 1000;
const MAX_DAYS_BACK = 5;
const TAB_LOAD_TIMEOUT_MS = 25000;
const CACHE_MAX_ENTRIES = 200;

// Remembered for the lifetime of the service worker: once Akamai rejects direct calls,
// go straight to the page-context fallback.
let directRequestsBlocked = false;

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

  const allowTabFallback = settings?.mastercard?.backgroundTabFallback !== false;
  const fetcher = createFetcher({ allowTabFallback });

  try {
    const rates = await Promise.all(
      targets.map((target) => resolveRate(fetcher, source, target, rateDate ?? null))
    );

    const conversions = rates.map((entry, index) => ({
      currency: targets[index],
      rate: entry.rate,
      convertedAmount: roundAmount(amount * entry.rate),
      rateDate: entry.fxDate
    }));

    return {
      rateDate: rates[0]?.fxDate ?? rateDate ?? null,
      metadata: {
        source: "mastercard",
        transport: fetcher.usedTab ? "page" : "direct",
        cached: rates.every((entry) => entry.cached)
      },
      conversions
    };
  } finally {
    await fetcher.dispose();
  }
}

async function resolveRate(fetcher, source, target, rateDate) {
  const cache = await readCache();

  if (rateDate) {
    const cached = cache[cacheKey(source, target, rateDate)];
    if (cached) {
      return { ...cached, cached: true };
    }
    const fresh = await fetchRateForDate(fetcher, source, target, rateDate);
    await writeCache({ [cacheKey(source, target, fresh.fxDate)]: fresh });
    return fresh;
  }

  const latest = cache[cacheKey(source, target, "latest")];
  if (latest && Date.now() - latest.fetchedAt < LATEST_RATE_TTL_MS) {
    return { ...latest, cached: true };
  }

  // Rates for "today" may not be published yet (time zones, publishing cut-off),
  // so walk back day by day until Mastercard returns a rate.
  let lastError = null;
  for (let daysBack = 0; daysBack <= MAX_DAYS_BACK; daysBack += 1) {
    const date = isoDateDaysAgo(daysBack);
    try {
      const fresh = await fetchRateForDate(fetcher, source, target, date);
      await writeCache({
        [cacheKey(source, target, "latest")]: fresh,
        [cacheKey(source, target, fresh.fxDate)]: fresh
      });
      return fresh;
    } catch (error) {
      if (error instanceof TransportError) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError ?? new Error(`No Mastercard rate available for ${source} → ${target}.`);
}

async function fetchRateForDate(fetcher, source, target, date) {
  const url = buildRatesUrl({ source, target, date });
  const payload = await fetcher.getJson(url);
  const data = payload?.data;

  if (!data || data.errorCode || data.errorMessage) {
    const reason = data?.errorMessage || data?.errorCode || "unexpected response";
    throw new Error(`Mastercard: ${reason} (${source} → ${target}, ${date}).`);
  }

  const rate = Number.parseFloat(data.conversionRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Mastercard returned no conversion rate for ${source} → ${target}.`);
  }

  return {
    rate,
    fxDate: data.fxDate || date,
    fetchedAt: Date.now(),
    cached: false
  };
}

function buildRatesUrl({ source, target, date }) {
  const url = new URL(MASTERCARD_RATES_PATH, MASTERCARD_ORIGIN);
  url.searchParams.set("exchange_date", date);
  url.searchParams.set("transaction_currency", source);
  url.searchParams.set("cardholder_billing_currency", target);
  // Bank fee is applied by the extension itself (settings.bankFeePercent).
  url.searchParams.set("bank_fee", "0");
  // Amount is irrelevant for the rate; conversion happens locally so the rate can be cached.
  url.searchParams.set("transaction_amount", "1");
  return url.toString();
}

/**
 * Fetch strategy:
 *  1. Direct request from the service worker. host_permissions bypass CORS, a session
 *     declarativeNetRequest rule (see registerMastercardHeaderRules) adds Referer/Origin.
 *  2. If Akamai blocks that (403 / HTML challenge), open the converter page in a minimized
 *     window and run the same request inside the page, i.e. with Mastercard's own origin,
 *     cookies and bot-manager tokens. The window is reused for all requests of one conversion.
 */
function createFetcher({ allowTabFallback }) {
  let pagePromise = null;

  const fetcher = {
    usedTab: false,

    async getJson(url) {
      if (!directRequestsBlocked) {
        const direct = await requestDirect(url);
        if (direct.ok) {
          return direct.json;
        }
        if (!direct.blocked) {
          throw new TransportError(direct.error);
        }
        directRequestsBlocked = true;
      }

      if (!allowTabFallback) {
        throw new TransportError(
          "Mastercard blocked the direct request. Enable the background tab fallback in the settings."
        );
      }

      pagePromise ??= openMastercardPage();
      const tabId = await pagePromise;
      fetcher.usedTab = true;
      const viaPage = await requestInPage(tabId, url);
      if (!viaPage.ok) {
        throw new TransportError(viaPage.error);
      }
      return viaPage.json;
    },

    async dispose() {
      if (!pagePromise) {
        return;
      }
      try {
        const tabId = await pagePromise;
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.remove(tab.windowId);
      } catch {
        // window already gone or never opened
      }
    }
  };

  return fetcher;
}

async function requestDirect(url) {
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json, text/plain, */*" }
    });
  } catch (error) {
    // Network errors are frequently Akamai resets as well; let the page fallback try.
    return { ok: false, blocked: true, error: error.message };
  }
  return parseResponse(response.status, await safeReadText(response));
}

async function requestInPage(tabId, url) {
  let injection;
  try {
    [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [url],
      func: async (requestUrl) => {
        try {
          const response = await fetch(requestUrl, {
            credentials: "include",
            headers: { accept: "application/json, text/plain, */*" }
          });
          return { status: response.status, text: await response.text() };
        } catch (error) {
          return { status: 0, text: "", error: String(error) };
        }
      }
    });
  } catch (error) {
    return { ok: false, error: `Could not query Mastercard page: ${error.message}` };
  }

  const result = injection?.result;
  if (!result || result.error) {
    return { ok: false, error: result?.error || "Mastercard page returned no result." };
  }
  const parsed = parseResponse(result.status, result.text);
  if (!parsed.ok && parsed.blocked) {
    return {
      ok: false,
      error: "Mastercard rejected the request even from its own page. Open the Mastercard converter once in a normal tab and retry."
    };
  }
  return parsed;
}

function parseResponse(status, text) {
  const looksLikeJson = /^\s*[{[]/.test(text);
  if (status === 403 || status === 429 || (!looksLikeJson && status === 200)) {
    return { ok: false, blocked: true, error: `Mastercard blocked the request (HTTP ${status}).` };
  }
  if (status < 200 || status >= 300) {
    return { ok: false, blocked: false, error: `Mastercard request failed with HTTP ${status}.` };
  }
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, blocked: true, error: "Mastercard returned an unreadable response." };
  }
}

async function openMastercardPage() {
  const created = await chrome.windows.create({
    url: MASTERCARD_CONVERTER_PAGE,
    focused: false,
    state: "minimized"
  });
  const tabId = created.tabs?.[0]?.id;
  if (tabId === undefined) {
    throw new TransportError("Could not open the Mastercard page in the background.");
  }
  await waitForTabComplete(tabId);
  return tabId;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new TransportError("Timed out loading the Mastercard page."));
    }, TAB_LOAD_TIMEOUT_MS);

    const isLoaded = (tab) =>
      tab.status === "complete" && (tab.url || "").startsWith(MASTERCARD_ORIGIN);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && isLoaded(tab)) {
        cleanup();
        resolve();
      }
    };

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
    }

    chrome.tabs.onUpdated.addListener(listener);
    // The tab may have finished loading before the listener was attached.
    chrome.tabs.get(tabId).then((tab) => {
      if (isLoaded(tab)) {
        cleanup();
        resolve();
      }
    }, () => {});
  });
}

/**
 * Adds Referer/Origin headers to requests the service worker sends to the rates endpoint,
 * matching what the converter page itself sends. Session rules survive service worker
 * restarts, the fixed rule id keeps this idempotent. tabIds [-1] limits it to non-tab
 * requests, i.e. the extension's own background fetches.
 */
export async function registerMastercardHeaderRules() {
  const ruleId = 1;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [ruleId],
    addRules: [
      {
        id: ruleId,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "referer", operation: "set", value: MASTERCARD_CONVERTER_PAGE },
            { header: "origin", operation: "set", value: MASTERCARD_ORIGIN }
          ]
        },
        condition: {
          urlFilter: `|${MASTERCARD_ORIGIN}${MASTERCARD_RATES_PATH}`,
          resourceTypes: ["xmlhttprequest", "other"],
          tabIds: [chrome.tabs.TAB_ID_NONE]
        }
      }
    ]
  });
}

async function readCache() {
  const { [RATE_CACHE_KEY]: cache = {} } = await chrome.storage.local.get(RATE_CACHE_KEY);
  return cache;
}

// Conversions resolve several targets in parallel; serialize read-modify-write cycles.
let cacheWriteQueue = Promise.resolve();

function writeCache(entries) {
  cacheWriteQueue = cacheWriteQueue.then(() => persistCacheEntries(entries)).catch(() => {});
  return cacheWriteQueue;
}

async function persistCacheEntries(entries) {
  const cache = await readCache();
  const stored = Object.fromEntries(
    Object.entries(entries).map(([key, { cached, ...entry }]) => [key, entry])
  );
  const next = { ...cache, ...stored };
  const keys = Object.keys(next);
  if (keys.length > CACHE_MAX_ENTRIES) {
    keys
      .sort((a, b) => (next[a].fetchedAt ?? 0) - (next[b].fetchedAt ?? 0))
      .slice(0, keys.length - CACHE_MAX_ENTRIES)
      .forEach((key) => delete next[key]);
  }
  await chrome.storage.local.set({ [RATE_CACHE_KEY]: next });
}

function cacheKey(source, target, date) {
  return `${source}>${target}@${date}`;
}

function isoDateDaysAgo(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function roundAmount(value) {
  return Math.round(value * 1e6) / 1e6;
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

class TransportError extends Error {}
