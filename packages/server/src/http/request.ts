export type Parsed<T> = { ok: true; value: T } | { ok: false; response: Response };

/** JSON response that is never cached by browsers or proxies. */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorResponse(error: string, status: number, headers: Record<string, string> = {}): Response {
  return jsonResponse({ error }, status, headers);
}

function trustedProxyHops(): number {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(hops) && hops >= 1 ? hops : 1;
}

/**
 * Client address behind proxies, only used as a rate-limit key. Read from the right of
 * X-Forwarded-For: the left entries come from the client and can be forged, the entry `hops`
 * from the right was added by the trusted proxy (Vercel: 1, one nginx or Caddy in front: 1).
 */
export function clientAddress(headers: Headers, hops = trustedProxyHops()): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const forwarded = entries.length >= hops ? entries[entries.length - hops] : undefined;
  return forwarded ?? headers.get("x-real-ip") ?? "unknown";
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

/**
 * Reads a JSON body with a hard size limit, counted while streaming so a client cannot make the
 * server buffer more than `maxBytes` even when it lies about Content-Length.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<Parsed<unknown>> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: errorResponse("unsupported_media_type", 415) };
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, response: errorResponse("payload_too_large", 413) };
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, response: errorResponse("payload_too_large", 413) };
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, response: errorResponse("invalid_json", 400) };
  }
}
