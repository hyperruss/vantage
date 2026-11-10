export type Point = { lat: number; lng: number };
export type Car = {
  id: number;
  fleetNumber: number;
  name: string;
  plate: string;
  bodyStyle: string;
  available: boolean;
  walkMinutes: number | null;
  position: Point;
  photoUrl: string | null;
};

export const rentalConfig = {
  bookingMinutes: 20,
  hours: [1, 2, 3],
  hourlyPrice: 599,
  minutePrice: 13,
};

export type Plan = { mode: "fixed"; hours: number } | { mode: "metered" };
export type Rental = { carId: number; plan: Plan };
export type Ride = Rental & { startedAt: number; reservationId?: number };
export type Receipt = Ride & { elapsed: number; total: number };

export type Flow =
  | { step: "fleet" }
  | { step: "reserved"; booking: Rental & { id: number; expiresAt: number } }
  | { step: "ride"; ride: Ride }
  | { step: "payment" | "receipt"; receipt: Receipt };

export type Session = {
  flow: Flow;
  dismissedReservation?: number;
};

const currency = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const money = (value: number) => currency.format(value);

export function clock(seconds: number, withHours = false) {
  const value = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, "0");
  if (withHours || minutes >= 60) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${rest}`;
  }
  return `${String(minutes).padStart(2, "0")}:${rest}`;
}

export function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const rest = seconds % 60;
  return [hours && `${hours} ч`, minutes && `${minutes} мин`, (!hours || rest > 0) && `${rest} с`]
    .filter(Boolean).join(" ");
}

export function planName(plan: Plan) {
  return plan.mode === "fixed" ? `На срок · ${plan.hours} ч` : "По факту";
}

export function price(plan: Plan, elapsed: number) {
  const paidSeconds = plan.mode === "fixed" ? Math.max(0, elapsed - plan.hours * 3600) : elapsed;
  const base = plan.mode === "fixed" ? plan.hours * rentalConfig.hourlyPrice : 0;
  return base + Math.round((paidSeconds / 60) * rentalConfig.minutePrice * 100) / 100;
}

export function insideZone({ lat: y, lng: x }: Point, zone: [number, number][]) {
  let inside = false;
  for (let index = 0; index < zone.length; index++) {
    const [ay, ax] = zone[index];
    const [by, bx] = zone[(index + 1) % zone.length];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
      && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) {
      inside = !inside;
    }
  }
  return inside;
}
