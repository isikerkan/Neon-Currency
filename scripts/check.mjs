// Static checks for the extension: JS syntax, manifest structure and referenced files.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname;
const errors = [];
const fail = (message) => errors.push(message);

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, predicate, out);
    else if (predicate(path)) out.push(path);
  }
  return out;
}

// 1. Syntax of every script.
for (const file of walk(join(root, "src"), (p) => p.endsWith(".js"))) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    fail(`Syntax error in ${file}:\n${error.stderr}`);
  }
}

// 2. Manifest structure and referenced files.
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
} catch (error) {
  fail(`manifest.json is not valid JSON: ${error.message}`);
}

const requireFile = (relative, context) => {
  if (!existsSync(join(root, relative))) fail(`${context}: missing file ${relative}`);
};

if (manifest) {
  if (manifest.manifest_version !== 3) fail("manifest_version must be 3");
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? "")) fail(`invalid version "${manifest.version}"`);
  if ((manifest.description ?? "").length > 132) fail("description exceeds 132 characters (Chrome Web Store limit)");

  requireFile(manifest.background?.service_worker, "background.service_worker");
  requireFile(manifest.action?.default_popup, "action.default_popup");
  requireFile(manifest.options_page, "options_page");
  for (const [size, path] of Object.entries(manifest.icons ?? {})) requireFile(path, `icons.${size}`);
  for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) requireFile(path, `action.default_icon.${size}`);
  if (!manifest.icons?.["128"]) fail("icons.128 is required for the Chrome Web Store");
  for (const script of manifest.content_scripts ?? []) {
    for (const path of [...(script.js ?? []), ...(script.css ?? [])]) requireFile(path, "content_scripts");
  }
  for (const entry of manifest.web_accessible_resources ?? []) {
    for (const resource of entry.resources ?? []) {
      if (!resource.includes("*")) requireFile(resource, "web_accessible_resources");
    }
  }
}

// 3. Every currency the tooltip knows has a bundled flag.
const parserContext = vm.createContext({});
vm.runInContext(readFileSync(join(root, "src/content/priceParser.js"), "utf8"), parserContext);
for (const [currency, country] of Object.entries(parserContext.CardCurrencyPriceParser.CURRENCY_FLAGS)) {
  requireFile(`src/assets/flags/${country}.svg`, `flag for ${currency}`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✓ checks passed (manifest v${manifest.version})`);
