import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  // Explicit imports instead of WXT's auto-imports: easier to review what each file uses.
  imports: false,
  manifest: {
    name: "Read-Watch-Tracker",
    description: "Merkt sich, bei welchem Kapitel du auf welcher Seite stehst.",
    permissions: ["storage", "alarms", "scripting"],
    optional_permissions: ["history"],
    // No fixed host permissions: each site (and the tracker's own API) is granted on a click.
    optional_host_permissions: ["https://*/*", "http://*/*"],
  },
});
