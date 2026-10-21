import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession, hasOwnerAccount } from "@/lib/auth";
import { signInAction } from "../actions";

export default async function LoginPage() {
  if (!(await hasOwnerAccount())) redirect("/setup");
  if (await getSession()) redirect("/");
  return (
    <AuthForm
      action={signInAction}
      submitLabel="Anmelden"
      fields={[
        { name: "email", label: "E-Mail-Adresse", type: "email", autoComplete: "username" },
        { name: "password", label: "Passwort", type: "password", autoComplete: "current-password" },
      ]}
    />
  );
}
