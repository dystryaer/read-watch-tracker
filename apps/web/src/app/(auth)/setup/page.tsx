import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { hasOwnerAccount } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-config";
import { MIN_SETUP_TOKEN_LENGTH, setupGate } from "@/lib/setup-token";
import { setupAction } from "../actions";

export default async function SetupPage() {
  if (await hasOwnerAccount()) redirect("/login");
  const gate = setupGate(process.env);

  if (gate === "disabled") {
    return (
      <div role="alert" className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <p className="font-medium">Die Einrichtung ist gesperrt.</p>
        <p>
          Setze <code>SETUP_TOKEN</code> (mindestens {MIN_SETUP_TOKEN_LENGTH} Zeichen) in der Server-Umgebung und starte
          den Server neu. So kann nur, wer den Server verwaltet, das Konto anlegen.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Einmalige Einrichtung: Lege dein Konto an. Danach ist keine weitere Registrierung möglich.
      </p>
      <AuthForm
        action={setupAction}
        submitLabel="Konto anlegen"
        fields={[
          ...(gate === "token"
            ? [
                {
                  name: "setupToken",
                  label: "Einrichtungs-Code (SETUP_TOKEN)",
                  type: "password" as const,
                  autoComplete: "off",
                },
              ]
            : []),
          { name: "name", label: "Name", type: "text", autoComplete: "name" },
          { name: "email", label: "E-Mail-Adresse", type: "email", autoComplete: "username" },
          {
            name: "password",
            label: `Passwort (mindestens ${MIN_PASSWORD_LENGTH} Zeichen)`,
            type: "password",
            autoComplete: "new-password",
            minLength: MIN_PASSWORD_LENGTH,
          },
        ]}
      />
    </>
  );
}
