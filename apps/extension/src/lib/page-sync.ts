const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 10_000;

/**
 * Reads a list page (history, library) now and again whenever it changes – more entries load
 * while scrolling – and hands over the entries when they differ from the last ones. Pages that
 * change constantly are still read at least every ten seconds.
 */
export function syncOnChanges<T>(doc: Document, read: () => T[] | null, send: (entries: T[]) => void): () => void {
  let sent: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstChangeAt: number | undefined;

  const sync = () => {
    firstChangeAt = undefined;
    const entries = read();
    if (!entries || entries.length === 0) return;
    const fingerprint = JSON.stringify(entries);
    if (fingerprint === sent) return;
    sent = fingerprint;
    send(entries);
  };

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    firstChangeAt ??= Date.now();
    timer = setTimeout(sync, Date.now() - firstChangeAt >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  sync();
  return () => {
    observer.disconnect();
    clearTimeout(timer);
  };
}
