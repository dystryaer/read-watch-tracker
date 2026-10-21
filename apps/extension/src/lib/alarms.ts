export interface AlarmsApi {
  get(name: string): Promise<{ periodInMinutes?: number } | undefined>;
  create(name: string, info: { delayInMinutes?: number; periodInMinutes: number }): Promise<void>;
}

/**
 * Creates a periodic alarm only when it is missing or has another period. Chrome replaces an alarm
 * of the same name, and the service worker starts again on every wake-up: creating it each time
 * would push it back again and again, so it would never fire.
 */
export async function ensureAlarm(alarms: AlarmsApi, name: string, info: { delayInMinutes?: number; periodInMinutes: number }): Promise<void> {
  const existing = await alarms.get(name);
  if (existing?.periodInMinutes === info.periodInMinutes) return;
  await alarms.create(name, info);
}
