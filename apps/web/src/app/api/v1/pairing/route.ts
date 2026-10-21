import { handlePairingStart } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function POST(request: Request) {
  return handlePairingStart(request, await apiContext());
}
