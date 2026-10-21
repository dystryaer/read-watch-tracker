import { ImageResponse } from "next/og";
import { AppIcon } from "@/components/app-icon";

// The home-screen icon on the iPhone (iOS draws the rounded corners itself).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={size.width} rounded={false} />, size);
}
