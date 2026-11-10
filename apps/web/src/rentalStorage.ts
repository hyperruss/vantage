import type { User } from "./api";
import type { Car, Flow, Session } from "./rental";

const legacyKey = "vantage.local-session.v1";
const rentalKey = (userId: string) => `vantage.rental.v3.${userId}`;
const initialSession: Session = { flow: { step: "fleet" } };

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function legacySession() {
  const value = readStored<Session & { name: string }>(legacyKey);
  return typeof value?.name === "string" ? value : null;
}

export function legacyName() {
  return legacySession()?.name ?? "";
}

function restoreFlow(flow: Flow | undefined, ids: Map<number, number>): Flow {
  if (flow?.step === "ride") {
    const carId = ids.get(flow.ride.carId);
    if (carId !== undefined) return { ...flow, ride: { ...flow.ride, carId } };
  }
  if (flow?.step === "payment" || flow?.step === "receipt") {
    const carId = ids.get(flow.receipt.carId);
    if (carId !== undefined) return { ...flow, receipt: { ...flow.receipt, carId } };
  }
  return { step: "fleet" };
}

export function restoreRental(user: User, cars: Car[]): Session {
  const existing = readStored<Session>(rentalKey(user.id))
    ?? readStored<Session>(`vantage.rental.v2.${user.id}`);
  const legacy = legacySession();
  const saved = existing ?? (legacy?.name === user.name ? legacy : null);
  if (!saved) return initialSession;

  const ids = new Map(cars.map(({ id, fleetNumber }) => [existing ? id : fleetNumber, id]));
  try {
    return { flow: restoreFlow(saved.flow, ids), dismissedReservation: saved.dismissedReservation };
  } catch {
    return initialSession;
  }
}

export function saveRental(user: User, session: Session) {
  try {
    localStorage.setItem(rentalKey(user.id), JSON.stringify(session));
    if (legacySession()?.name === user.name) localStorage.removeItem(legacyKey);
  } catch {
    // The current trip remains usable when the browser blocks storage.
  }
}
