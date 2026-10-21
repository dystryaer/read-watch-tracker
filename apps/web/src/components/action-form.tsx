"use client";

import { type ReactNode, useActionState } from "react";

export type FormState = { error: string } | { message: string } | null;

/** Form bound to a Server Action that reports success or an error message next to the button. */
export function ActionForm({
  action,
  submitLabel,
  children,
  danger = false,
  className = "space-y-3",
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  danger?: boolean;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const buttonColors = danger
    ? "bg-red-700 hover:bg-red-600 focus-visible:outline-red-700"
    : "bg-teal-700 hover:bg-teal-600 focus-visible:outline-teal-700";
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${buttonColors}`}
        >
          {pending ? "Bitte warten …" : submitLabel}
        </button>
        {state && "error" in state ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {state.error}
          </p>
        ) : state ? (
          <p role="status" className="text-sm text-teal-800 dark:text-teal-300">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
