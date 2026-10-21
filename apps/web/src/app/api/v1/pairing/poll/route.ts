import { handlePairingPoll } from "@rwt/server";
import { apiContext } from "@/lib/api-context";

export async function POST(request: Request) {
  return handlePairingPoll(request, await apiContext());
}
