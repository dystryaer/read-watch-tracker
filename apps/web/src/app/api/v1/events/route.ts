import { handleEvents } from "@rwt/server";
import { apiContext } from "@/lib/api-context";
import { fillCoversLater } from "@/lib/cover-fill";

export async function POST(request: Request) {
  const response = await handleEvents(request, await apiContext());
  // Pictures named by the pages come after the answer, so the extension never waits for them.
  if (response.ok) fillCoversLater();
  return response;
}
