"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Loads fresh data when the page becomes visible again: iOS resumes the installed web app with the
 * screen it had, while a device may have moved a title on in the meantime.
 */
export function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [router]);
  return null;
}
