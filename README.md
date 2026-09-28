# Neon Currency Converter Extension

Neon Currency is a Chrome extension that helps you translate prices you see online into the exchange rate that Neon (Swiss banking app) would apply. Select an amount on any web page, right-click, and the extension will fetch the latest Mastercard FX rates (no API key required) and apply your bank fee so you know the estimated amount you will be charged.

## Core Features
- Floating price tooltip (like Augmented Steam): hover a price on any site to see it converted into your main and quick currencies, with country flags and bank fee.
- Context menu action that parses selected prices and detects the currency automatically.
- Manual fallback flow when the currency cannot be determined or you want to override the amount/date.
- Popup for ad-hoc conversions with quick-access target currencies you configure.
- Options page to define your main currency, shortcut currencies, preferred detection currencies, bank fee, card currency, and the background-page fallback.
- Storage-backed settings and request history so your defaults sync with your Chrome profile.

## Project Structure

```
Neon Currency/
├── manifest.json
├── src/
│   ├── assets/flags/         # Country flag SVGs (flag-icons, MIT)
│   ├── background/           # Service worker: context menu + conversion orchestration
│   ├── content/              # Content script: price detection + hover tooltip
│   ├── converter/            # Popup window launched on context conversions
│   ├── data/                 # Static currency metadata
│   ├── lib/                  # Shared utilities, storage helpers, Mastercard rate client
│   ├── options/              # Extension options page
│   └── popup/                # Browser action popup (manual conversions)
```

## Loading the Extension in Chrome

1. Download `neon-currency-vX.Y.Z.zip` from the [latest release](https://github.com/isikerkan/Neon-Currency/releases/latest) and extract it (or clone this repository).
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top right toggle).
4. Click **Load unpacked** and select the extracted folder (the one containing `manifest.json`).
5. Pin the extension so its popup is always reachable.

### Publishing a Release

Bump `version` in `manifest.json`, merge to `main`, then push a matching tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

`.github/workflows/release.yml` checks that the tag matches the manifest version, zips the extension and attaches it to a GitHub release. Alternatively run the *Release* workflow manually from the Actions tab; it tags the selected commit with `v<manifest version>`.

## Configuring Settings

Open the extension popup and click the ⚙️ button or visit the options page directly from `chrome://extensions`.

- **Main currency**: the default currency you want amounts converted into (CHF by default).
- **Quick currency shortcuts**: currencies that appear as buttons inside the popup for one-click conversions.
- **Preferred currencies**: prioritized list used when parsing selections that contain ambiguous currency codes.
- **Bank fee (%)**: a surcharge applied to converted amounts to simulate Neon’s markup.
- **Allow selecting conversion date**: toggles historical rate selection in the popup/converter interface.

### Mastercard Rates (no API key)

Mastercard does not hand out keys for its Currency Conversion API to individuals. The extension therefore uses the same public endpoint that Mastercard's own [currency converter page](https://www.mastercard.com/ch/de/pers%C3%B6nlich/get-support/currency-exchange-rate-converter.html) calls:

```
GET https://www.mastercard.com/marketingservices/public/mccom-services/currency-conversions/conversion-rates
    ?exchange_date=YYYY-MM-DD
    &transaction_currency=USD
    &cardholder_billing_currency=CHF
    &bank_fee=0
    &transaction_amount=1
```

Response (relevant fields):

```json
{ "data": { "conversionRate": 0.8012, "crdhldBillAmt": 0.8012, "fxDate": "2026-09-27", "transCurr": "USD", "crdhldBillCurr": "CHF" } }
```

The endpoint sits behind Akamai bot protection, so the service worker fetches it in two stages (`src/lib/mastercardClient.js`):

1. **Direct request** from the service worker. `host_permissions` bypass CORS; a `declarativeNetRequest` session rule sets `Referer`/`Origin` to the converter page. Since the request comes from your real Chrome (browser TLS fingerprint, residential IP, Mastercard cookies), this usually passes.
2. **Background page fallback** – if Akamai answers with 403 or an HTML challenge, the converter page is opened in a minimized window, the same request runs inside that page (`chrome.scripting.executeScript`, `world: "MAIN"`, same origin and cookies), and the window is closed afterwards. One window serves all target currencies of a conversion. Can be disabled in the options.

Additional behaviour:

- **Latest rate**: without an explicit date the client tries today and walks back up to 5 days until Mastercard returns a published rate. The date actually used is shown in the UI.
- **Cache**: rates are cached in `chrome.storage.local` (`fxRateCache`) – the latest rate per pair for 30 minutes, dated rates indefinitely (max. 200 entries).
- **Conversion** happens locally (`amount × conversionRate`); the bank fee from the options is applied afterwards by the service worker.

> This is an undocumented endpoint of Mastercard's website, not an official API. Parameters or protection can change without notice; check the endpoint in the DevTools network tab of the converter page if requests start failing. Intended for personal use.

## Usage Flow

- **Hover tooltip**: move the mouse over a price (e.g. `$19.99`, `CHF 29.–`, `1 299,00 zł`). After ~350 ms a floating card shows the amount converted into your main and quick currencies, incl. bank fee and rate date. Hover a row for the exchange rate; `Esc` or scrolling closes it. Ambiguous symbols are resolved by the site's domain (`$` on `.ca` → CAD, `kr` on `.no` → NOK). Can be disabled in the options.
- **Context menu conversion**: highlight a price (e.g., `€149.95`), right-click, and choose *Convert to Neon price*. A mini window opens showing the result. If the extension cannot determine the currency, you will be prompted to specify it manually.
- **Popup conversion**: click the extension icon, type an amount and its currency, then hit one of your quick currency buttons. Results are shown instantly inside the popup and the last conversion is persisted for reference.

## Development Notes

- All scripts are standard ES modules; no bundler is required.
- Files are written in plain JavaScript/HTML/CSS to keep the setup lightweight.
- The extension relies on `chrome.storage.sync` for settings and `chrome.storage.local` for transient conversion data/history.
- No external dependencies are required; if you need advanced UI components consider adding a build step or using Web Components.

## Next Steps
- Optional fallback to a second rate source (e.g. ECB) when Mastercard is unreachable.
- Add automated tests (e.g., using Puppeteer) to verify context-menu flows.
- Expand the currency list or source it from a maintained API if you need full ISO-4217 coverage.
