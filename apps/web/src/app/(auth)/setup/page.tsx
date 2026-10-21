import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { hasOwnerAccount } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-config";
import { setupAction } from "../actions";

export default async function SetupPage() {
  if (await hasOwnerAccount()) redirect("/login");
  return (
    <>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        Einmalige Einrichtung: Lege dein Konto an. Danach ist keine weitere Registrierung möglich.
      </p>
      <AuthForm
        action={setupAction}
        submitLabel="Konto anlegen"
        fields={[
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
