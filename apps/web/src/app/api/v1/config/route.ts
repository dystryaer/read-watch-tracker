import { handleConfig } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function GET(request: Request) {
  return handleConfig(request, await apiContext());
}
