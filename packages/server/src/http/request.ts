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

/** Client address behind a proxy such as Vercel; only used as a rate-limit key. */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
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
