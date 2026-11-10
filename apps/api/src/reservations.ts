import express from "express";
import type { ErrorRequestHandler, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { zonePolygon } from "./map.js";
import { findUser } from "./session.js";

type Reservation = {
  id: number;
  car_id: number;
  mode: "fixed" | "metered";
  hours: number | null;
  status: "reserved" | "active" | "cancelled" | "expired" | "completed";
  expires_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

export const liveReservation = "status = 'active' OR (status = 'reserved' AND expires_at > statement_timestamp())";

function serialize(row: Reservation) {
  return {
    id: row.id,
    carId: row.car_id,
    plan: row.mode === "fixed" ? { mode: row.mode, hours: row.hours } : { mode: row.mode },
    status: row.status,
    expiresAt: row.expires_at.getTime(),
    startedAt: row.started_at?.getTime() ?? null,
    finishedAt: row.finished_at?.getTime() ?? null,
  };
}

async function locked<T>(db: Pool, action: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // The small fleet shares one transaction lock for reservation state changes.
    await client.query("SELECT pg_advisory_xact_lock(72465218)");
    const value = await action(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function expire(client: PoolClient) {
  await client.query(`
    UPDATE reservations SET status = 'expired'
    WHERE status = 'reserved' AND expires_at <= statement_timestamp()
  `);
}

export function expireReservations(db: Pool) {
  return locked(db, expire);
}

function fail(response: Response, status: number, error: string) {
  response.status(status).json({ error });
}

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error?.status === 400 || error?.status === 413 || error?.status === 415) {
    fail(response, error.status, "invalid_request");
    return;
  }
  console.error("Could not access VANTAGE reservations", error);
  fail(response, 503, "reservations_unavailable");
};

function positiveId(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
}

export function reservationRouter(db: Pool) {
  const router = express.Router();
  router.use(async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    const user = await findUser(db, request.get("cookie"));
    if (!user) return fail(response, 401, "sign_in_required");
    response.locals.userId = user.id;
    next();
  });

  router.get("/", async (_request, response) => {
    const { rows } = await db.query<Reservation & { kind: "current" | "completed" | "closed" }>(`
      (SELECT 'current' AS kind, r.* FROM reservations r WHERE user_id = $1 AND (${liveReservation}) LIMIT 1)
      UNION ALL
      (SELECT 'completed' AS kind, r.* FROM reservations r WHERE user_id = $1 AND status = 'completed' ORDER BY id DESC LIMIT 1)
      UNION ALL
      (SELECT 'closed' AS kind, r.* FROM reservations r WHERE user_id = $1 AND (
        status IN ('expired', 'cancelled') OR (status = 'reserved' AND expires_at <= statement_timestamp())
      ) ORDER BY id DESC LIMIT 1)
    `, [response.locals.userId]);
    const current = rows.find((row) => row.kind === "current");
    const completed = rows.find((row) => row.kind === "completed");
    const closed = rows.find((row) => row.kind === "closed");
    response.json({
      current: current ? serialize(current) : null,
      completed: completed ? serialize(completed) : null,
      closed: closed ? { id: closed.id, status: closed.status === "cancelled" ? "cancelled" : "expired" } : null,
      serverTime: Date.now(),
    });
  });

  router.post("/", express.json({ limit: "2kb" }), async (request, response) => {
    const { carId, mode, hours } = request.body ?? {};
    if (!positiveId(carId) || !(mode === "fixed" && [1, 2, 3].includes(hours)
      || mode === "metered" && hours === undefined)) {
      return fail(response, 400, "invalid_reservation");
    }
    const userId = response.locals.userId;
    const result = await locked(db, async (client) => {
      await expire(client);
      const existing = await client.query<Reservation>(`
        SELECT * FROM reservations WHERE user_id = $1 AND status IN ('reserved', 'active')
      `, [userId]);
      if (existing.rowCount) return { error: "already_has_reservation" } as const;

      const car = await client.query<{ available: boolean }>("SELECT available FROM cars WHERE id = $1 FOR UPDATE", [carId]);
      if (!car.rows[0]?.available) return { error: "car_unavailable" } as const;
      const busy = await client.query(`
        SELECT 1 FROM reservations WHERE car_id = $1 AND status IN ('reserved', 'active')
      `, [carId]);
      if (busy.rowCount) return { error: "car_unavailable" } as const;

      const { rows } = await client.query<Reservation>(`
        INSERT INTO reservations (user_id, car_id, mode, hours, created_at, expires_at)
        VALUES ($1, $2, $3, $4, statement_timestamp(), statement_timestamp() + interval '20 minutes')
        RETURNING *
      `, [userId, carId, mode, hours ?? null]);
      return { reservation: serialize(rows[0]) };
    });
    if (result.error) return fail(response, 409, result.error);
    response.status(201).json({ reservation: result.reservation });
  });

  async function change(response: Response, id: number, action: "cancel" | "start" | "finish", point?: { lat: number; lng: number }) {
    const result = await locked(db, async (client) => {
      await expire(client);
      const { rows: [row] } = await client.query<Reservation>(
        "SELECT * FROM reservations WHERE id = $1 AND user_id = $2", [id, response.locals.userId],
      );
      if (!row) return { error: "reservation_not_found", status: 404 } as const;
      if (row.status === "expired") return { error: "reservation_expired", status: 409 } as const;

      if (action === "cancel" && row.status === "cancelled"
        || action === "start" && row.status === "active"
        || action === "finish" && row.status === "completed") return { reservation: serialize(row) };

      if (action === "finish" ? row.status !== "active" : row.status !== "reserved") {
        return { error: "invalid_reservation_state", status: 409 } as const;
      }

      if (action === "finish" && point) {
        const result = await client.query(`
          UPDATE cars SET latitude = $1, longitude = $2
          WHERE id = $3 AND point($2, $1) <@ $4::polygon
        `, [point.lat, point.lng, row.car_id, zonePolygon]);
        if (!result.rowCount) return { error: "outside_zone", status: 400 } as const;
      }

      const { rows } = await client.query<Reservation>(`
        UPDATE reservations SET
          status = $2,
          started_at = CASE WHEN $2 = 'active' THEN statement_timestamp() ELSE started_at END,
          finished_at = CASE WHEN $2 = 'completed' THEN statement_timestamp() ELSE finished_at END
        WHERE id = $1 AND ($2 <> 'active' OR expires_at > statement_timestamp())
        RETURNING *
      `, [id, action === "start" ? "active" : action === "finish" ? "completed" : "cancelled"]);
      if (!rows[0]) {
        await expire(client);
        return { error: "reservation_expired", status: 409 } as const;
      }
      return { reservation: serialize(rows[0]) };
    });
    if (result.error) return fail(response, result.status, result.error);
    response.json({ reservation: result.reservation });
  }

  router.delete("/:id", async (request, response) => {
    const id = Number(request.params.id);
    if (!positiveId(id)) return fail(response, 400, "invalid_reservation");
    await change(response, id, "cancel");
  });
  router.post("/:id/start", async (request, response) => {
    const id = Number(request.params.id);
    if (!positiveId(id)) return fail(response, 400, "invalid_reservation");
    await change(response, id, "start");
  });
  router.post("/:id/finish", express.json({ limit: "2kb" }), async (request, response) => {
    const id = Number(request.params.id);
    const { lat, lng } = request.body ?? {};
    if (!positiveId(id) || !Number.isFinite(lat) || Math.abs(lat) > 85
      || !Number.isFinite(lng) || Math.abs(lng) > 180) return fail(response, 400, "invalid_point");
    await change(response, id, "finish", { lat, lng });
  });

  router.use(handleError);
  return router;
}
