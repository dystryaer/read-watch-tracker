import { handleShareConfirm } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function POST(request: Request) {
  return handleShareConfirm(request, await apiContext());
}
