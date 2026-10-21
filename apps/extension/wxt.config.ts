import { defineConfig } from "wxt";

// End-to-end tests cannot click permission prompts, so only that build gets local host access.
const e2e = process.env.RWT_E2E === "1";

export default defineConfig({
  srcDir: "src",
  outDir: e2e ? ".output-e2e" : ".output",
  // Explicit imports instead of WXT's auto-imports: easier to review what each file uses.
  imports: false,
  manifest: {
    name: "Read-Watch-Tracker",
    description: "Merkt sich, bei welchem Kapitel du auf welcher Seite stehst.",
    // activeTab: read the URL of the tab the user opened the popup on – nothing else.
    permissions: ["storage", "alarms", "scripting", "activeTab"],
    optional_permissions: ["history"],
    // No fixed host permissions: each site (and the tracker's own API) is granted on a click.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    ...(e2e ? { host_permissions: ["http://localhost/*", "http://127.0.0.1/*"] } : {}),
  },
});
