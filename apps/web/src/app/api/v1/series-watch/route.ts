import { handleSeriesWatch } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function GET(request: Request) {
  return handleSeriesWatch(request, await apiContext());
}
