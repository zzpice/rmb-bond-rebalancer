// Loads the REAL v1.0.1 computation core from index.html without any DOM.
// The pure calculation section of the inline <script> ends right before
// `const SUMMARY_IDS=`; everything after that is DOM/UI wiring.
// This file re-exports the real functions so golden expectations are derived
// from actually running the released v1.0.1 code, never from reimplementation.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(path.join(repoRoot, "index.html"), "utf8");

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error("inline script not found in index.html");
const script = scriptMatch[1];

const cutMarker = "const SUMMARY_IDS=";
const cutIndex = script.indexOf(cutMarker);
if (cutIndex < 0) throw new Error("core/UI boundary marker not found");
const coreSource = script.slice(0, cutIndex);

// `const` bindings do not attach to the vm sandbox object, so append an
// explicit export statement evaluated in the same scope as the core code.
const exportSource = coreSource + "\n;globalThis.__core = {" +
  "DEN,CENTS_PER_WAN,FUNDS,DEFAULTS,SETTING_DEFINITIONS,SELL_POLICIES," +
  "computePlan,targetCents,bounds,outerBreaches,updateBands,toCents," +
  "getConfig:()=>({...CONFIG})};";

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(exportSource, sandbox, { filename: "index.html#core" });

export const {
  DEN,
  CENTS_PER_WAN,
  FUNDS,
  DEFAULTS,
  SETTING_DEFINITIONS,
  SELL_POLICIES,
  computePlan,
  targetCents,
  bounds,
  outerBreaches,
  updateBands,
  toCents,
  getConfig
} = sandbox.__core;

export { repoRoot };
