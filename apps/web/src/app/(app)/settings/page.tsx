import { listDevices } from "@rwt/server";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { approveDeviceAction, revokeDeviceAction } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const KIND_LABELS = { extension: "Browser-Extension", shield: "Nvidia Shield", phone: "iPhone-Kurzbefehl" } as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const rawCode = (await searchParams).code;
  // Prefilled from the QR code on the Shield (/pair?code=…); only code characters are kept.
  const code = typeof rawCode === "string" ? rawCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";
  const devices = await listDevices(await getDb());

  return (
    <main className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Einstellungen</h1>

      <section id="geraete" className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-1 text-base font-semibold">Gerät koppeln</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Die Browser-Extension bzw. die Shield-App zeigt einen sechsstelligen Code an.
        </p>
        <ActionForm action={approveDeviceAction} submitLabel="Koppeln" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Code
            <input
              name="code"
              defaultValue={code}
              required
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="K7P3QX"
              className={`${inputClass} w-32 font-mono tracking-widest uppercase`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Gerätename (optional)
            <input name="name" maxLength={100} placeholder="z. B. Shield Wohnzimmer" className={inputClass} />
          </label>
        </ActionForm>
      </section>

      <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-3 text-base font-semibold">Gekoppelte Geräte</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Noch kein Gerät gekoppelt.</p>
        ) : (
          <ul className="space-y-3">
            {devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium break-words">{device.name}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {" "}
                    · {KIND_LABELS[device.kind]} · {device.lastSeenAt ? `zuletzt ${formatDateTime(device.lastSeenAt)}` : "noch nie gesehen"}
                  </span>
                  {device.revokedAt ? <span className="ml-2 text-red-700 dark:text-red-400">widerrufen</span> : null}
                </div>
                {device.revokedAt ? null : (
                  <ActionForm action={revokeDeviceAction} submitLabel="Widerrufen" danger className="flex items-center gap-3">
                    <input type="hidden" name="deviceId" value={device.id} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-1 text-base font-semibold">Seiten</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Freigeschaltete Seiten, Regeln und Domain-Umzüge verwalten:{" "}
          <Link href="/settings/sites" className="underline">
            Seiten öffnen
          </Link>
        </p>
      </section>
    </main>
  );
}
