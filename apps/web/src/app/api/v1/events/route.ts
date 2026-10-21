import { handleEvents } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function POST(request: Request) {
  return handleEvents(request, await apiContext());
}
