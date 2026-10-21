import type { PairingPollResponse } from "@rwt/core";
import type { ApiResult } from "./api-client";
import { apiOrigin, loadSettings, updateSettings } from "./settings";
import type { Store } from "./storage";

interface PairingApi {
  startPairing(apiUrl: string, name: string): Promise<ApiResult<{ code: string; pollSecret: string; expiresAt: string }>>;
  pollPairing(apiUrl: string, pollSecret: string): Promise<ApiResult<PairingPollResponse>>;
}

interface Deps {
  store: Store;
  api: PairingApi;
}

/** Device flow, step 1 (SPEC §6.2): ask for a code the user then enters in the web app. */
export async function startPairing(
  { store, api }: Deps,
  rawApiUrl: string,
  deviceName: string,
): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; message: string }> {
  const apiUrl = apiOrigin(rawApiUrl);
  if (!apiUrl) return { ok: false, message: "Bitte die Adresse des Trackers angeben (https://…)." };

  const started = await api.startPairing(apiUrl, deviceName);
  if (!started.ok) return { ok: false, message: started.message };
  await updateSettings(store, { deviceName, pairing: { apiUrl, ...started.value } });
  return { ok: true, code: started.value.code, expiresAt: started.value.expiresAt };
}

/** Device flow, step 3: one poll. The token is stored once the user approved the code. */
export async function pollPairing({ store, api }: Deps, now = Date.now()): Promise<"idle" | "pending" | "paired" | "expired" | "error"> {
  const { pairing } = await loadSettings(store);
  if (!pairing) return "idle";
  if (Date.parse(pairing.expiresAt) <= now) {
    await updateSettings(store, { pairing: null });
    return "expired";
  }

  const polled = await api.pollPairing(pairing.apiUrl, pairing.pollSecret);
  if (!polled.ok) return "error";
  if (polled.value.status === "pending") return "pending";
  if (polled.value.status === "expired") {
    await updateSettings(store, { pairing: null });
    return "expired";
  }
  await updateSettings(store, { apiUrl: pairing.apiUrl, deviceToken: polled.value.deviceToken, pairing: null });
  return "paired";
}
