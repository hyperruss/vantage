import type { Car, Plan, Point } from "./rental";

export type User = { id: string; name: string };
export type MapSettings = {
  tileUrl: string;
  attribution: string;
  attributionUrl: string;
  zone: [number, number][];
};
export type Reservation = {
  id: number;
  carId: number;
  plan: Plan;
  status: "reserved" | "active" | "completed" | "cancelled";
  expiresAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};
export type FleetSnapshot = {
  cars: Car[];
  current: Reservation | null;
  completed: Reservation | null;
  closed: { id: number; status: "cancelled" | "expired" } | null;
  clockOffset: number;
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(`Request failed: ${status}`);
  }
}

type CatalogCar = Omit<Car, "name" | "position"> & {
  make: string;
  model: string;
  latitude: number;
  longitude: number;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const caller = options.signal;
  const abort = () => controller.abort(caller?.reason);
  if (caller?.aborted) abort();
  caller?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(path, { ...options, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(response.status, body?.error);
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
    caller?.removeEventListener("abort", abort);
  }
}

export async function getUser(signal: AbortSignal) {
  const { user } = await request<{ user: User | null }>("/api/session", { signal });
  return user;
}

export async function registerUser(name: string) {
  const { user } = await request<{ user: User }>("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return user;
}

async function getCars(signal: AbortSignal): Promise<Car[]> {
  const { cars } = await request<{ cars: CatalogCar[] }>("/api/cars", { signal });
  return cars.map(({ make, model, latitude, longitude, ...details }) => ({
    ...details,
    name: `${make} ${model}`,
    position: { lat: latitude, lng: longitude },
  }));
}

export function getMapSettings(signal: AbortSignal) {
  return request<MapSettings>("/api/map", { signal });
}

export async function getFleetSnapshot(signal: AbortSignal): Promise<FleetSnapshot> {
  const [cars, { current, completed, closed, serverTime }] = await Promise.all([
    getCars(signal),
    request<Omit<FleetSnapshot, "cars" | "clockOffset"> & { serverTime: number }>(
      "/api/reservations", { signal },
    ),
  ]);
  return { cars, current, completed, closed, clockOffset: serverTime - Date.now() };
}

async function reservationChange(path: string, method: "POST" | "DELETE", body?: object) {
  const { reservation } = await request<{ reservation: Reservation }>(`/api/reservations${path}`, {
    method,
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  return reservation;
}

export const reserveCar = (carId: number, plan: Plan) => reservationChange("", "POST", { carId, ...plan });
export const cancelReservation = (id: number) => reservationChange(`/${id}`, "DELETE");
export const beginRide = (id: number) => reservationChange(`/${id}/start`, "POST");
export const finishRide = (id: number, point: Point) => reservationChange(`/${id}/finish`, "POST", point);
