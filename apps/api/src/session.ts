import { createHash, randomBytes } from "node:crypto";
import express from "express";
import type { ErrorRequestHandler } from "express";
import type { Pool } from "pg";

const cookieName = "vantage_session";
const sessionSeconds = 30 * 24 * 60 * 60;

type User = { id: string; name: string };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function findUser(db: Pool, cookies?: string) {
  const prefix = `${cookieName}=`;
  const cookie = cookies?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
  const token = cookie?.slice(prefix.length);
  if (!token || !/^[\w-]{43}$/.test(token)) return null;

  const { rows } = await db.query<User>(`
    SELECT u.id, u.name
    FROM user_sessions AS s
    JOIN users AS u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now()
  `, [tokenHash(token)]);
  return rows[0] ?? null;
}

function registrationName(body: unknown) {
  if (!body || typeof body !== "object" || !("name" in body) || typeof body.name !== "string") return null;
  const name = body.name.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= 40 && !/[\p{Cc}\p{Cs}]/u.test(name) ? name : null;
}

const sessionError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error?.status === 400 || error?.status === 413 || error?.status === 415) {
    response.status(error.status).json({ error: "invalid_request" });
    return;
  }

  console.error("Could not access VANTAGE session", error);
  response.status(503).json({ error: "session_unavailable" });
};

export function sessionRouter(db: Pool) {
  const router = express.Router();

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.get("/", async (request, response) => {
    const user = await findUser(db, request.get("cookie"));
    response.json({ user });
  });

  router.post("/", express.json({ limit: "2kb" }), async (request, response) => {
    const name = registrationName(request.body);
    if (!name) {
      response.status(400).json({ error: "invalid_name" });
      return;
    }

    const existing = await findUser(db, request.get("cookie"));
    if (existing) {
      response.json({ user: existing });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const { rows } = await db.query<{ id: string }>(`
      WITH new_user AS (
        INSERT INTO users (name) VALUES ($1) RETURNING id
      )
      INSERT INTO user_sessions (token_hash, user_id, expires_at)
      SELECT $2, id, now() + $3::integer * interval '1 second' FROM new_user
      RETURNING user_id AS id
    `, [name, tokenHash(token), sessionSeconds]);

    response.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.secure,
      maxAge: sessionSeconds * 1000,
      path: "/api",
    });
    response.status(201).json({ user: { id: rows[0].id, name } });
  });

  router.use(sessionError);
  return router;
}
