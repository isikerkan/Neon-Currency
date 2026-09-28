# Privacy Policy – Card Currency Converter

_Last updated: 2026-09-28_

Card Currency Converter ("the extension") converts prices shown on websites into your chosen currencies using Mastercard exchange rates. It is designed to work without collecting personal data.

## What the extension processes

| Data | Where it is processed | Leaves your device? |
|------|----------------------|---------------------|
| Text of the element under your mouse pointer (max. 40 characters) to detect a price | Locally, in the page | No |
| Text you select and convert via the context menu | Locally, in the extension | No |
| Your settings (currencies, bank fee, toggles) | `chrome.storage.sync` | Synced by Chrome to your Google account, if Chrome Sync is enabled |
| Recent conversions and cached exchange rates | `chrome.storage.local` | No |
| Currency pair and date (e.g. `USD → CHF, 2026-09-28`) | Sent to `www.mastercard.com` to fetch the exchange rate | Yes, to Mastercard |

The amount of a price is **never** sent anywhere: the extension requests the rate for an amount of 1 and calculates the result locally. No page URLs, browsing history, or personal identifiers are transmitted by the extension.

## Requests to Mastercard

Exchange rates are read from the public endpoint behind Mastercard's currency converter page. Like any request from your browser, it carries your IP address and the cookies your browser holds for mastercard.com. If Mastercard blocks the direct request, the extension opens the Mastercard converter page in a minimized window and requests the rate from there; the window is closed afterwards. Mastercard's own privacy policy applies to these requests: https://www.mastercard.com/global/en/vision/corp-responsibility/commitment-to-privacy/privacy.html

## What the extension does not do

- No analytics, tracking, advertising, or telemetry.
- No sale or transfer of data to third parties.
- No remote code: all code ships inside the extension package.

## Deleting data

Removing the extension deletes its local data. Synced settings can be removed by resetting Chrome Sync or reinstalling and saving default settings.

## Contact

Questions: open an issue at https://github.com/isikerkan/Neon-Currency/issues
