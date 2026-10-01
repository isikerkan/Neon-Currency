# Development

Technical notes, CI/CD and Chrome Web Store publishing. User instructions are in the [README](../README.md).

## Project Structure

```
Card Currency Converter/
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
├── tests/                    # node:test unit tests (price parser, Mastercard client)
├── scripts/                  # check, build, Chrome Web Store upload, asset rendering
├── store/                    # Chrome Web Store listing text and assets
└── PRIVACY.md                # Privacy policy (required by the Chrome Web Store)
```

## Mastercard Rates (no API key)

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

## CI/CD

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `ci.yml` | Pull requests, pushes to `main` | `scripts/check.mjs` (JS syntax, manifest structure, referenced files, flags) → unit tests (`tests/`) → zip build as artifact |
| `release.yml` | Every push/merge to `main`, tag `v*`, or manual run | Version bump if needed → same checks → zip → GitHub release with the zip → Chrome Web Store upload + submit for review (if configured) |

Local equivalents (Node 22, no dependencies): `npm run check`, `npm test`, `npm run build`.

### Releasing

Every merged PR is released automatically:

- If `v<manifest version>` is already released, `release.yml` bumps the patch version (e.g. 0.3.2 → 0.3.3), commits `Release vX.Y.Z [skip ci]` to `main` and releases that commit.
- If a PR raises the version itself (e.g. to 0.4.0 for a feature), exactly that version is released.
- Releases are serialized (`concurrency: release`); the bump commit does not trigger CI or another release.

Manual alternatives: push a tag matching the manifest version, or run *Actions → Release → Run workflow*.

### Chrome Web Store

The first submission is manual; afterwards `release.yml` uploads every release via the [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api).

1. Register a developer account at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time fee).
2. *New item* → upload the zip from the latest GitHub release. Fill in the listing, privacy tab and assets from [`store/LISTING.md`](../store/LISTING.md); privacy policy: [`PRIVACY.md`](../PRIVACY.md). Submit for review.
3. Enable the API: Google Cloud project → enable *Chrome Web Store API* → OAuth consent screen → OAuth client (type *Desktop app*) → obtain a refresh token for scope `https://www.googleapis.com/auth/chromewebstore` ([guide](https://developer.chrome.com/docs/webstore/using-api)).
4. GitHub → *Settings → Environments* → create `chrome-web-store` (optionally with required reviewers as manual gate) and add:
   - Variables: `CWS_PUBLISHER_ID` (from the dashboard URL), `CWS_EXTENSION_ID` (item ID)
   - Secrets: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`

   Store variables can also be set as repository variables; the job only runs when `CWS_EXTENSION_ID` is set.

## Development Notes

- All scripts are standard ES modules; no bundler is required.
- Files are written in plain JavaScript/HTML/CSS to keep the setup lightweight.
- The extension relies on `chrome.storage.sync` for settings and `chrome.storage.local` for transient conversion data/history.
- No external dependencies are required; if you need advanced UI components consider adding a build step or using Web Components.

## Next Steps
- Optional fallback to a second rate source (e.g. ECB) when Mastercard is unreachable.
- Add automated tests (e.g., using Puppeteer) to verify context-menu flows.
- Expand the currency list or source it from a maintained API if you need full ISO-4217 coverage.
