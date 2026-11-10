import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export async function migrate(pool: Pool, directory: string) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    // Allow only one instance to apply the VANTAGE migrations at a time.
    await client.query("SELECT pg_advisory_xact_lock(72465217)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    );
    const applied = new Set(rows.map((row) => row.filename));

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(join(directory, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
        file,
      ]);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
