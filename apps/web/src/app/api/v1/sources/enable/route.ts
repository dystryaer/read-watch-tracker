import { handleEnableSource } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function POST(request: Request) {
  return handleEnableSource(request, await apiContext());
}
