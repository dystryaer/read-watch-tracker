import { describePairing, listDevices } from "@rwt/server";
import Form from "next/form";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { getAuthorizedDb } from "@/lib/dal";
import { formatAge, formatDateTime } from "@/lib/format";
import { PhoneTokenForm } from "@/components/phone-token";
import { addPhoneAction, approveDeviceAction, revokeDeviceAction } from "./actions";

const inputClass =
  "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const KIND_LABELS = { extension: "Browser-Extension", shield: "Nvidia Shield", phone: "iPhone-Kurzbefehl" } as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[]; paired?: string | string[] }>;
}) {
  const params = await searchParams;
  // From the code form or the QR code on the Shield (/pair?code=…); only code characters are kept.
  const code = typeof params.code === "string" ? params.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";
  const db = await getAuthorizedDb();
  const [devices, pairing] = await Promise.all([listDevices(db), code ? describePairing(db, code) : null]);

  return (
    <main className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Einstellungen</h1>

      <section id="geraete" className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-1 text-base font-semibold">Gerät koppeln</h2>
        {pairing ? (
          // Step 2: show what asks to be paired, so a code someone else sent is recognizable.
          <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            <p>
              <span className="font-medium break-words">{pairing.deviceName}</span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {" "}
                · {KIND_LABELS[pairing.kind]} · angefragt {formatAge(pairing.requestedAt)}
              </span>
            </p>
            <p>
              Nur bestätigen, wenn du dieses Gerät gerade vor dir hast und den Code selbst dort abgelesen hast. Ein
              gekoppeltes Gerät kann Fortschritt in deinen Tracker schreiben.
            </p>
            <ActionForm action={approveDeviceAction} submitLabel="Koppeln bestätigen" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="code" value={pairing.code} />
              <label className="flex flex-col gap-1">
                Gerätename (optional)
                <input name="name" maxLength={100} placeholder={pairing.deviceName} className={inputClass} />
              </label>
            </ActionForm>
            <Link href="/settings" className="inline-block underline">
              Abbrechen
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Die Browser-Extension bzw. die Shield-App zeigt einen sechsstelligen Code an.
            </p>
            <Form action="/settings" scroll={false} className="flex flex-wrap items-end gap-3">
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
              <button
                type="submit"
                className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Weiter
              </button>
            </Form>
            {code ? (
              <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
                Code unbekannt, abgelaufen oder schon benutzt.
              </p>
            ) : params.paired === "1" ? (
              <p role="status" className="mt-2 text-sm text-teal-800 dark:text-teal-300">
                Gerät gekoppelt. Es meldet sich in wenigen Sekunden.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="border-t border-zinc-200 py-5 dark:border-zinc-800">
        <h2 className="mb-1 text-base font-semibold">iPhone-Kurzbefehl</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Für Light Novels und E-Books: „Teilen“ in der WebNovel- oder Kindle-App, Kapitel bzw. Prozent bestätigen.
        </p>
        <PhoneTokenForm action={addPhoneAction} />
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
