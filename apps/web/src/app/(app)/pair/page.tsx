import { redirect } from "next/navigation";

// Target of the QR code shown by the Shield app (SPEC §6.2).
export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) : "";
  redirect(code ? `/settings?code=${code}#geraete` : "/settings#geraete");
}
