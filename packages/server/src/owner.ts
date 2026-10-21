import { authUser, type Db } from "@rwt/db";

/** True once the single account exists (registration is closed from then on). */
export async function hasOwner(db: Db): Promise<boolean> {
  const rows = await db.select({ id: authUser.id }).from(authUser).limit(1);
  return rows.length > 0;
}
