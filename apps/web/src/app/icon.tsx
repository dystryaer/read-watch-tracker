import { ImageResponse } from "next/og";
import { AppIcon } from "@/components/app-icon";

// Large enough for the install prompt and launcher on Android; browsers scale it down for tabs.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIcon size={size.width} />, size);
}
