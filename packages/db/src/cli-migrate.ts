import { createDb } from "./index";
import { migrateDb } from "./migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const handle = await createDb(url);
try {
  await migrateDb(handle);
  console.log(`Migrations applied (${handle.driver}).`);
} finally {
  await handle.close();
}
