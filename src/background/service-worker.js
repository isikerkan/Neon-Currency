import { detectCurrency } from "../lib/currencyDetection.js";
import { convertAmounts } from "../lib/mastercardClient.js";
import {
  getSettings,
  upsertConversionRequest,
  updateConversionRequest,
  setLastConversion
} from "../lib/storage.js";
import { createRequestId, uniqueList, normalizeCurrencyCode } from "../lib/utils.js";

const CONTEXT_MENU_ID = "neon-currency-convert";
const CONVERTER_WINDOW_SIZE = { width: 420, height: 620 };

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) {
    return;
  }
  await handleConversionRequest(info.selectionText);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "conversion:retry") {
    handleManualConversion(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

async function ensureContextMenu() {
  try {
    await chrome.contextMenus.remove(CONTEXT_MENU_ID);
  } catch {
    // silent if the menu entry did not exist
  }
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Convert to Neon price",
    contexts: ["selection"]
  });
}

async function handleConversionRequest(selectionText) {
  const settings = await getSettings();
  const detection = detectCurrency(selectionText, settings.preferredCurrencies);
  const requestId = createRequestId();
  const targets = deriveTargetCurrencies(settings);

  const baseState = {
    id: requestId,
    status: detection.currency && detection.amount !== null ? "pending" : "awaitingInput",
    sourceText: detection.sourceText,
    amount: detection.amount,
    sourceCurrency: detection.currency,
    targetCurrencies: targets,
    requestedAt: Date.now(),
    rateDate: settings.allowHistoricalRates ? settings.defaultRateDate : null
  };

  await upsertConversionRequest(requestId, baseState);
  await openConverterInterface(requestId);

  if (baseState.status === "awaitingInput") {
    chrome.runtime.sendMessage({
      type: "conversion:awaiting-input",
      payload: baseState
    });
    return;
  }

  await runConversion(requestId, baseState, settings);
}

async function handleManualConversion(payload) {
  const settings = await getSettings();
  const requestedTargets = Array.isArray(payload.targetCurrencies) ? payload.targetCurrencies : null;
  const targets = requestedTargets?.length
    ? prepareTargetCurrencies(requestedTargets)
    : deriveTargetCurrencies(settings);
  const requestId = payload.id ?? createRequestId();
  const amount = Number.parseFloat(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Please provide a valid amount.");
  }
  const sourceCurrency = payload.sourceCurrency?.toUpperCase();
  if (!sourceCurrency) {
    throw new Error("Source currency is required.");
  }

  const state = {
    id: requestId,
    status: "pending",
    sourceText: payload.sourceText ?? "",
    amount,
    sourceCurrency,
    targetCurrencies: targets,
    requestedAt: Date.now(),
    rateDate: payload.rateDate ?? null
  };
  await upsertConversionRequest(requestId, state);
  await runConversion(requestId, state, settings);
}

async function runConversion(requestId, requestState, settings) {
  try {
    const response = await convertAmounts(
      {
        amount: requestState.amount,
        sourceCurrency: requestState.sourceCurrency,
        targetCurrencies: requestState.targetCurrencies,
        rateDate: requestState.rateDate
      },
      settings
    );

    const normalizedConversions = sanitizeConversions(response.conversions);
    const conversionsWithFees = enhanceWithBankFee(
      normalizedConversions,
      settings.bankFeePercent
    );

    const completedState = {
      ...requestState,
      status: "completed",
      completedAt: Date.now(),
      conversions: conversionsWithFees,
      rateDate: response.rateDate ?? requestState.rateDate ?? null,
      metadata: response.metadata ?? null
    };

    await updateConversionRequest(requestId, completedState);
    await setLastConversion(completedState);

    chrome.runtime.sendMessage({
      type: "conversion:completed",
      payload: completedState
    });
  } catch (error) {
    const failedState = {
      ...requestState,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      failedAt: Date.now()
    };
    await updateConversionRequest(requestId, failedState);
    chrome.runtime.sendMessage({
      type: "conversion:failed",
      payload: failedState
    });
  }
}

function deriveTargetCurrencies(settings) {
  const main = settings.mainCurrency ? [settings.mainCurrency] : [];
  const quick = Array.isArray(settings.quickCurrencies) ? settings.quickCurrencies : [];
  return uniqueList([...main, ...quick].map((code) => normalizeCurrencyCode(code)));
}

function prepareTargetCurrencies(codes) {
  return uniqueList(
    codes
      .map((code) => normalizeCurrencyCode(code))
      .filter((code) => Boolean(code))
  );
}

async function openConverterInterface(requestId) {
  const url = chrome.runtime.getURL(`src/converter/converter.html?requestId=${requestId}`);
  await chrome.windows.create({
    url,
    type: "popup",
    focused: true,
    width: CONVERTER_WINDOW_SIZE.width,
    height: CONVERTER_WINDOW_SIZE.height
  });
}

function enhanceWithBankFee(conversions, bankFeePercent) {
  if (!Number.isFinite(bankFeePercent) || bankFeePercent <= 0) {
    return conversions;
  }
  const percent = bankFeePercent / 100;
  return conversions.map((conversion) => {
    const feeAmount = conversion.convertedAmount * percent;
    return {
      ...conversion,
      bankFeePercent,
      bankFeeAmount: feeAmount,
      totalWithFee: conversion.convertedAmount + feeAmount
    };
  });
}

function sanitizeConversions(conversions) {
  if (!Array.isArray(conversions)) {
    return [];
  }
  return conversions.map((conversion) => {
    const parsedRate = Number.parseFloat(conversion.rate);
    const parsedAmount = Number.parseFloat(conversion.convertedAmount);
    return {
      ...conversion,
      rate: Number.isFinite(parsedRate) ? parsedRate : conversion.rate,
      convertedAmount: Number.isFinite(parsedAmount) ? parsedAmount : conversion.convertedAmount
    };
  });
}
