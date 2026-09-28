# Chrome Web Store listing

Copy/paste source for the Developer Dashboard. Assets in this folder:

| Asset | File | Required size |
|-------|------|---------------|
| Store icon | `src/assets/icons/icon-128.png` | 128×128 |
| Screenshots | `screenshot-1-tooltip.png`, `screenshot-2-tooltip-eur.png`, `screenshot-3-options.png` | 1280×800 |
| Small promo tile | `promo-tile-440x280.png` | 440×280 |

Regenerate: `node scripts/render-icons.mjs`, `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node scripts/render-store-assets.mjs` (Playwright + Chromium).

## Store listing

**Category:** Shopping (alternative: Tools)
**Language:** English (add German below as second locale if desired)

**Summary (≤ 132 chars, from manifest):**
Convert selected prices to Neon main currencies using the latest Mastercard exchange rates.

**Description (EN):**

Hover any price on any website and instantly see what it costs in your card currency – calculated with the daily Mastercard exchange rate plus your bank's fee.

• Floating price card: move the mouse over a price like $249.99, €129,00 or CHF 29.– and a small card shows the amount in your main and favourite currencies, with country flags.
• Mastercard rates: uses the same daily rates Mastercard applies to card payments, including the rate date.
• Your bank fee: add your card's foreign-currency fee (e.g. 1.5 %) and see the real amount you will be charged.
• Right-click conversion: select any text containing a price and choose "Convert to Neon price" for a detailed breakdown.
• Popup converter: quick manual conversions with one-click currency buttons.
• Smart detection: recognises symbols and ISO codes, 1,234.56 / 1.234,56 / 1'234.50 formats, and resolves $ or kr by the site's country.
• Private by design: no tracking, no analytics; only the currency pair is sent to Mastercard, never the amount or the page.

Not affiliated with Mastercard or Neon Switzerland AG.

**Description (DE):**

Fahre über einen Preis auf einer beliebigen Website und sieh sofort, was er in deiner Kartenwährung kostet – mit dem täglichen Mastercard-Kurs und der Gebühr deiner Bank.

• Schwebende Preiskarte mit Flaggen für Haupt- und Favoritenwährungen
• Offizielle Mastercard-Tageskurse inkl. Kursdatum
• Eigene Bankgebühr (z. B. 1.5 %) wird eingerechnet
• Rechtsklick-Umrechnung und Popup-Rechner
• Erkennt Symbole, ISO-Codes und Formate wie 1'234.50 oder 1.234,56
• Kein Tracking; an Mastercard geht nur das Währungspaar, nie der Betrag oder die Seite

Nicht mit Mastercard oder Neon Switzerland AG verbunden.

## Privacy practices tab

**Single purpose:**
Show prices found on websites converted into the user's chosen currencies using Mastercard exchange rates and the user's bank fee.

**Permission justifications:**

| Permission | Justification |
|------------|---------------|
| `contextMenus` | Adds "Convert to Neon price" to the right-click menu for selected text. |
| `storage` | Stores the user's currency settings, recent conversions and cached exchange rates. |
| `scripting` | Runs the exchange-rate request inside the Mastercard converter page when Mastercard blocks the direct request. Only injected into www.mastercard.com. |
| `declarativeNetRequestWithHostAccess` | Sets the Referer/Origin headers of the extension's own exchange-rate requests to www.mastercard.com so they are accepted. No other requests are modified. |
| Host permission `https://www.mastercard.com/*` | Fetches daily exchange rates from Mastercard's public currency converter endpoint. |
| Content script on `http://*/*`, `https://*/*` | Detects prices under the mouse pointer on any shop page to show the converted amount. Text is processed locally and never transmitted. |

**Remote code:** No, I am not using remote code.

**Data usage:** none of the listed categories is collected. Certify: not sold, not used for unrelated purposes, not used for creditworthiness.

**Privacy policy URL:** https://github.com/isikerkan/Neon-Currency/blob/main/PRIVACY.md
