# Neon Currency Converter Extension

Neon Currency is a Chrome extension that helps you translate prices you see online into the exchange rate that Neon (Swiss banking app) would apply. Select an amount on any web page, right-click, and the extension will fetch the latest Mastercard FX rates (through your configured proxy or credentials) and apply your bank fee so you know the estimated amount you will be charged.

## Core Features
- Context menu action that parses selected prices and detects the currency automatically.
- Manual fallback flow when the currency cannot be determined or you want to override the amount/date.
- Popup for ad-hoc conversions with quick-access target currencies you configure.
- Options page to define your main currency, shortcut currencies, preferred detection currencies, bank fee, and Mastercard API connection settings.
- Storage-backed settings and request history so your defaults sync with your Chrome profile.

## Project Structure

```
Neon Currency/
├── manifest.json
├── src/
│   ├── background/           # Service worker: context menu + conversion orchestration
│   ├── converter/            # Popup window launched on context conversions
│   ├── data/                 # Static currency metadata
│   ├── lib/                  # Shared utilities, storage helpers, Mastercard client
│   ├── options/              # Extension options page
│   └── popup/                # Browser action popup (manual conversions)
```

## Loading the Extension in Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked** and select the `Neon Currency` folder inside this repository (`c:\Users\erkan\Downloads\Code\neoncurrency\Neon Currency`).
4. Pin the extension so its popup is always reachable.

## Configuring Settings

Open the extension popup and click the ⚙️ button or visit the options page directly from `chrome://extensions`.

- **Main currency**: the default currency you want amounts converted into (CHF by default).
- **Quick currency shortcuts**: currencies that appear as buttons inside the popup for one-click conversions.
- **Preferred currencies**: prioritized list used when parsing selections that contain ambiguous currency codes.
- **Bank fee (%)**: a surcharge applied to converted amounts to simulate Neon’s markup.
- **Allow selecting conversion date**: toggles historical rate selection in the popup/converter interface.

### Mastercard API Connectivity

The extension expects a secure endpoint that returns Mastercard FX data. Because storing private keys inside a packaged extension is unsafe, the default approach is to route requests through a proxy that you host.

1. **Proxy URL** – point this to your service that signs Mastercard requests and forwards them to the official API (for example, a small HTTPS function).  
2. **Consumer key & Signing key** – optional fields if you decide to let the extension call Mastercard directly. Only use this in trusted environments; keep the PEM in PKCS#8 format.
3. **Environment** – `sandbox` or `production`.
4. **Card currency** – the billing currency of your Neon card; used to pre-fill the popup.

The extension sends a JSON payload to the proxy:

```json
{
  "amount": 120.5,
  "sourceCurrency": "USD",
  "targetCurrencies": ["CHF", "EUR"],
  "rateDate": "2025-01-05"
}
```

Your proxy should respond with:

```json
{
  "rateDate": "2025-01-05",
  "metadata": {
    "source": "mastercard"
  },
  "conversions": [
    {
      "currency": "CHF",
      "rate": 0.86432,
      "convertedAmount": 104.87
    },
    {
      "currency": "EUR",
      "rate": 0.91211,
      "convertedAmount": 109.8
    }
  ]
}
```

The service worker will apply your configured bank fee and surface the totals in the UI.

## Usage Flow

- **Context menu conversion**: highlight a price (e.g., `€149.95`), right-click, and choose *Convert to Neon price*. A mini window opens showing the result. If the extension cannot determine the currency, you will be prompted to specify it manually.
- **Popup conversion**: click the extension icon, type an amount and its currency, then hit one of your quick currency buttons. Results are shown instantly inside the popup and the last conversion is persisted for reference.

## Development Notes

- All scripts are standard ES modules; no bundler is required.
- Files are written in plain JavaScript/HTML/CSS to keep the setup lightweight.
- The extension relies on `chrome.storage.sync` for settings and `chrome.storage.local` for transient conversion data/history.
- No external dependencies are required; if you need advanced UI components consider adding a build step or using Web Components.

## Next Steps
- Implement the direct Mastercard signing flow if you prefer to avoid a proxy.
- Add automated tests (e.g., using Puppeteer) to verify context-menu flows.
- Expand the currency list or source it from a maintained API if you need full ISO-4217 coverage.
