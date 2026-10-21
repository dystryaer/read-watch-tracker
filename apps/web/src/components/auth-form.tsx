"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/actions";

interface Field {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: string;
  minLength?: number;
}

export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden = {},
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {fields.map((field) => (
        <label key={field.name} className="block space-y-1">
          <span className="text-sm font-medium">{field.label}</span>
          <input
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            minLength={field.minLength}
            required
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
      {state?.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60"
      >
        {pending ? "Bitte warten …" : submitLabel}
      </button>
    </form>
  );
}
