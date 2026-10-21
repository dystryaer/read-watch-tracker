"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth, hasOwnerAccount } from "@/lib/auth";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth-config";
import { safeNextPath } from "@/lib/next-path";
import { clientAddress, loginLimiterPerClient } from "@/lib/request";
import { setupGate, setupTokenMatches } from "@/lib/setup-token";

export type FormState = { error: string } | null;

const LoginInput = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});

const SetupInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const requestHeaders = await headers();
  const client = clientAddress(requestHeaders);
  // Only failed attempts count: guessing fails, signing in does not use up the owner's budget.
  if (loginLimiterPerClient.isBlocked(client)) {
    return { error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };
  }
  const input = LoginInput.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!input.success) return { error: "Bitte E-Mail-Adresse und Passwort eingeben." };

  try {
    await (await getAuth()).api.signInEmail({ body: input.data, headers: requestHeaders });
  } catch (error) {
    if (!isAPIError(error)) throw error;
    loginLimiterPerClient.allow(client);
    return { error: "E-Mail-Adresse oder Passwort ist falsch." };
  }
  redirect(safeNextPath(formData.get("next")));
}

export async function setupAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (await hasOwnerAccount()) redirect("/login");
  const requestHeaders = await headers();
  const gate = setupGate(process.env);
  if (gate === "disabled") return { error: "Die Einrichtung ist gesperrt, solange SETUP_TOKEN nicht gesetzt ist." };
  if (gate === "token") {
    const client = clientAddress(requestHeaders);
    if (loginLimiterPerClient.isBlocked(client)) return { error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen." };
    if (!setupTokenMatches(formData.get("setupToken"), process.env.SETUP_TOKEN ?? "")) {
      loginLimiterPerClient.allow(client);
      return { error: "Der Einrichtungs-Code stimmt nicht." };
    }
  }

  const input = SetupInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!input.success) {
    return {
      error: `Bitte Name, gültige E-Mail-Adresse und ein Passwort mit mindestens ${MIN_PASSWORD_LENGTH} Zeichen angeben.`,
    };
  }

  try {
    await (await getAuth()).api.signUpEmail({ body: input.data, headers: requestHeaders });
  } catch (error) {
    if (isAPIError(error)) return { error: "Das Konto konnte nicht angelegt werden." };
    throw error;
  }
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await (await getAuth()).api.signOut({ headers: await headers() });
  redirect("/login");
}
