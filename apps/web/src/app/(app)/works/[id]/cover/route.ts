import { getCoverImage } from "@rwt/server";
import { z } from "zod";
import { getAuthorizedDb } from "@/lib/dal";

/**
 * The work's picture, only for the signed-in owner. Its URL carries a version, so browsers keep it
 * until it changes. The type comes from the stored bytes (never SVG); nosniff is set globally.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const cover = await getCoverImage(await getAuthorizedDb(), id.data);
  if (!cover) return new Response(null, { status: 404 });
  return new Response(Buffer.from(cover.image), {
    headers: {
      "content-type": cover.mime,
      "cache-control": "private, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
