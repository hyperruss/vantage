import { fileURLToPath } from "node:url";
import express from "express";
import { Pool } from "pg";
import { migrate } from "./migrate.js";
import { sessionRouter } from "./session.js";
import { mapConfig } from "./map.js";
import { expireReservations, liveReservation, reservationRouter } from "./reservations.js";

const port = 3000;
const migrations = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));
const web = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const db = new Pool({ connectionTimeoutMillis: 3000 });

db.on("error", (error) => console.error("PostgreSQL connection lost", error));

const app = express();
app.disable("x-powered-by");
app.use("/api/session", sessionRouter(db));
app.use("/api/reservations", reservationRouter(db));
app.get("/api/map", (_request, response) => response.json(mapConfig));

app.get("/api/health", async (_request, response) => {
  response.set("Cache-Control", "no-store");
  try {
    await db.query("SELECT 1 FROM cars LIMIT 1");
    response.json({ status: "ok" });
  } catch (error) {
    console.error("Database health check failed", error);
    response.status(503).json({ status: "unavailable" });
  }
});

app.get("/api/cars", async (_request, response) => {
  response.set("Cache-Control", "no-store");
  try {
    const { rows } = await db.query(`
      SELECT c.id, c.make, c.model, c.body_style AS "bodyStyle", c.plate, c.latitude, c.longitude,
             c.fleet_number AS "fleetNumber", c.available AND NOT EXISTS (
               SELECT 1 FROM reservations WHERE car_id = c.id AND (${liveReservation})
             ) AS available, c.walk_minutes AS "walkMinutes", c.photo_url AS "photoUrl"
      FROM cars AS c
      ORDER BY c.id
    `);
    response.json({ cars: rows });
  } catch (error) {
    console.error("Could not load cars", error);
    response.status(503).json({ error: "fleet_unavailable" });
  }
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "not_found" });
});
app.use(express.static(web));

try {
  await migrate(db, migrations);
  const expiration = setInterval(() => {
    void expireReservations(db).catch((error) => console.error("Could not expire reservations", error));
  }, 15_000);
  expiration.unref();
  const server = app.listen(port, "0.0.0.0", (error) => {
    if (error) {
      console.error("Could not start VANTAGE API", error);
      process.exitCode = 1;
      void db.end();
      return;
    }

    console.log(`VANTAGE is listening on port ${port}`);
  });

  function shutdown() {
    clearInterval(expiration);
    server.close(() => void db.end());
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
} catch (error) {
  console.error("Could not apply database migrations", error);
  await db.end();
  process.exitCode = 1;
}
