import { handleShare } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function POST(request: Request) {
  return handleShare(request, await apiContext());
}
