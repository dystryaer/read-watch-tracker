import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession, hasOwnerAccount } from "@/lib/auth";
import { safeNextPath } from "@/lib/next-path";
import { signInAction } from "../actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const next = safeNextPath((await searchParams).next);
  if (!(await hasOwnerAccount())) redirect("/setup");
  if (await getSession()) redirect(next);
  return (
    <AuthForm
      action={signInAction}
      hidden={{ next }}
      submitLabel="Anmelden"
      fields={[
        { name: "email", label: "E-Mail-Adresse", type: "email", autoComplete: "username" },
        { name: "password", label: "Passwort", type: "password", autoComplete: "current-password" },
      ]}
    />
  );
}
