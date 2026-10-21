const DEBOUNCE_MS = 500;

/**
 * Sends the last of quick changes once, 500 ms after it (SPEC §4.2). `flush` sends a waiting
 * change at once – when the screen goes away or the app is put in the background.
 */
export class DebouncedSender {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly send: () => void,
    private readonly delayMs = DEBOUNCE_MS,
  ) {}

  get waiting(): boolean {
    return this.timer !== undefined;
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.send();
  }
}
