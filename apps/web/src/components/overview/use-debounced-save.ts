"use client";

import { useEffect, useRef, useState } from "react";
import { DebouncedSender } from "@/lib/debounced-sender";

/**
 * Saves the last of quick changes 500 ms after it. A change still waiting is sent at once when the
 * control goes away (a link tapped right after [+]) or the page is hidden (app switch, screen
 * lock): no tap is lost, and no timer fires later on a screen that is out of date by then.
 * Returns the function that schedules the save.
 */
export function useDebouncedSave(send: () => void): () => void {
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  const [sender] = useState(() => new DebouncedSender(() => sendRef.current()));

  useEffect(() => {
    const flush = () => sender.flush();
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") sender.flush();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flush);
      sender.flush();
    };
  }, [sender]);

  return () => sender.schedule();
}
