"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import type { PhoneTokenState } from "@/app/(app)/settings/actions";

/**
 * "iPhone-Kurzbefehl hinzufügen" (SPEC §6.2): the token is shown exactly once, right here, for the
 * shortcut's import question. It is stored nowhere but in the tracker as a hash.
 */
const noSubscription = () => () => {};
const browserOrigin = () => location.origin;
const noOrigin = () => null;

export function PhoneTokenForm({ action }: { action: (previous: PhoneTokenState, formData: FormData) => Promise<PhoneTokenState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Read in the browser only: the server renders this form without knowing the public address.
  const origin = useSyncExternalStore(noSubscription, browserOrigin, noOrigin);

  if (state && "token" in state && state.token !== dismissed) {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(state.token);
        setCopied(true);
      } catch {
        // No clipboard access (e.g. without https): the field stays selectable for copying by hand.
      }
    };
    const done = async () => {
      // The token belongs in the shortcut only, not in the clipboard or on the screen.
      if (copied) await navigator.clipboard.writeText("").catch(() => undefined);
      setCopied(false);
      setDismissed(state.token);
    };
    return (
      <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <p className="font-medium">Token für „{state.name}“ – wird nur jetzt angezeigt:</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={state.token}
            aria-label="Token"
            className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={copy} className="rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-600">
            {copied ? "Kopiert" : "Kopieren"}
          </button>
        </div>
        <p>
          Beim Hinzufügen des Kurzbefehls „Lesestand“ fragt iOS nach Adresse und Token: Adresse{" "}
          <code className="font-mono">{origin}</code>, Token wie oben. Widerrufen lässt er sich jederzeit unter „Gekoppelte Geräte“.
        </p>
        {origin?.startsWith("http:") ? (
          <p className="font-medium text-red-700 dark:text-red-400">
            Diese Seite läuft ohne https: Der Token ginge unverschlüsselt übers Netz. Für den Kurzbefehl nur eine https-Adresse verwenden.
          </p>
        ) : null}
        <p>Den Kurzbefehl nicht weitergeben – er enthält den Token.</p>
        <button
          type="button"
          onClick={done}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          Fertig
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name (optional)
        <input
          name="name"
          maxLength={100}
          placeholder="iPhone"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600 disabled:opacity-60"
      >
        {pending ? "Bitte warten …" : "iPhone-Kurzbefehl hinzufügen"}
      </button>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
