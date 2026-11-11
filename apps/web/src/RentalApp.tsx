import { MapPinLine } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, beginRide, cancelReservation, finishRide, getFleetSnapshot, payReservation, reserveCar } from "./api";
import type { FleetSnapshot, MapSettings, Reservation, User } from "./api";
import { Header, Modal } from "./controls";
import { FleetMap } from "./FleetMap";
import { insideZone, legacyPrice } from "./rental";
import type { Car, Flow, Plan, Point, Ride, Session } from "./rental";
import { restoreRental, saveRental } from "./rentalStorage";
import { ActiveRide, FleetSheet, Payment, ReservationSheet, TripReceipt, VehiclePhoto } from "./screens";

function durationSeconds(start: number, end: number) {
  return Math.max(0, Math.floor((end - start) / 1000));
}

function visibleFlow(snapshot: FleetSnapshot, session: Session): Flow {
  const { current, completed } = snapshot;
  if (current?.status === "reserved") return { step: "reserved", booking: current };
  if (current?.status === "active" && current.startedAt !== null) {
    return { step: "ride", ride: { ...current, reservationId: current.id, startedAt: current.startedAt } };
  }

  if (completed && completed.id !== session.dismissedReservation
    && completed.startedAt !== null && completed.elapsedSeconds !== null && completed.amountKopecks !== null) {
    const paid = completed.paidAt !== null
      || (session.flow.step === "receipt" && session.flow.receipt.reservationId === completed.id);
    return {
      step: paid ? "receipt" : "payment",
      receipt: { carId: completed.carId, plan: completed.plan, startedAt: completed.startedAt,
        reservationId: completed.id, elapsed: completed.elapsedSeconds, total: completed.amountKopecks / 100 },
    };
  }

  return session.flow;
}

const errors: Record<string, string> = {
  car_unavailable: "Этот автомобиль уже недоступен. Выберите другую машину.",
  already_has_reservation: "У вас уже есть бронь или активная поездка.",
  reservation_expired: "Время брони истекло. Выберите автомобиль, чтобы забронировать снова.",
  invalid_reservation_state: "Состояние брони изменилось.",
  outside_zone: "Эта точка вне зоны. Выберите место внутри контура.",
  tariff_changed: "Тариф изменился. Проверьте новую цену перед бронированием.",
};

export function RentalApp({ user, initialFleet, map, onSignOut }: {
  user: User; initialFleet: FleetSnapshot; map: MapSettings; onSignOut: () => void;
}) {
  const [snapshot, setSnapshot] = useState(initialFleet);
  const [session, setSession] = useState(() => restoreRental(user, initialFleet.cars));
  const [selection, setSelection] = useState<number | null>(() =>
    initialFleet.cars.find((item) => item.available)?.id ?? null);
  const [plan, setPlan] = useState<Plan>({ mode: "fixed", hours: initialFleet.tariffs.hours[0] });
  const [localNow, setNow] = useState(Date.now);
  const [choosingEnd, setChoosingEnd] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"profile" | Car | null>(null);
  const [pending, setPending] = useState(false);
  const main = useRef<HTMLElement>(null);
  const request = useRef<AbortController | null>(null);
  const changing = useRef(false);
  const lastBooking = useRef<Reservation | null>(snapshot.current);
  const flow = visibleFlow(snapshot, session);
  const stage = flow.step === "ride" && choosingEnd ? "finish" : flow.step;
  const ticking = flow.step === "reserved" || flow.step === "ride";
  const now = localNow + snapshot.clockOffset;
  const { cars, tariffs } = snapshot;
  const fleet = flow.step === "fleet";
  const selectedCar = cars.find((item) => item.id === selection && item.available);
  const currentCar = flow.step === "fleet" ? (selectedCar?.id ?? null) : flow.step === "reserved"
    ? flow.booking.carId : flow.step === "ride" ? flow.ride.carId : flow.receipt.carId;
  const car = cars.find(({ id }) => id === currentCar);
  const remaining = flow.step === "reserved" ? Math.max(0, Math.ceil((flow.booking.expiresAt - now) / 1000)) : 0;
  const elapsed = flow.step === "ride" ? durationSeconds(flow.ride.startedAt, now) : 0;
  const rideTotal = flow.step !== "ride" ? null : flow.ride.reservationId === undefined
    ? legacyPrice(flow.ride.plan, elapsed)
    : snapshot.current?.amountKopecks != null ? snapshot.current.amountKopecks / 100 : null;
  const validPoint = point !== null && insideZone(point, map.zone);
  const localPaymentId = session.flow.step === "receipt"
    ? session.flow.receipt.reservationId ?? session.dismissedReservation : session.dismissedReservation;

  const refresh = useCallback(async () => {
    if (request.current || changing.current) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const updated = await getFleetSnapshot(controller.signal);
      // Before server payments, the browser kept the receipt or its dismissed ID.
      if (updated.completed?.paidAt === null && updated.completed.id === localPaymentId) {
        try {
          updated.completed = await payReservation(localPaymentId, controller.signal);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) throw error;
        }
      }
      if (!controller.signal.aborted) setSnapshot(updated);
    } catch (error) {
      if (!controller.signal.aborted && error instanceof ApiError && error.status === 401) onSignOut();
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [localPaymentId, onSignOut]);

  useEffect(() => {
    const sync = () => { if (!document.hidden) void refresh(); };
    if (localPaymentId !== undefined) sync();
    const interval = window.setInterval(sync, 2000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
      request.current?.abort();
      request.current = null;
    };
  }, [localPaymentId, refresh]);

  useEffect(() => saveRental(user, session), [user, session]);

  useEffect(() => {
    if (stage === "finish") {
      // Leaflet makes its container focusable after mounting.
      const frame = requestAnimationFrame(() => main.current?.querySelector<HTMLElement>(".map-target")?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
    main.current?.querySelector("h1")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [stage]);

  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ticking]);

  useEffect(() => {
    const previous = lastBooking.current;
    if (!snapshot.current && previous?.id === snapshot.closed?.id && snapshot.closed?.status === "expired") {
      setNotice(errors.reservation_expired);
    }
    lastBooking.current = snapshot.current;
  }, [snapshot.current, snapshot.closed]);

  useEffect(() => {
    if (!fleet || pending || selection === null || selectedCar) return;
    const unavailable = cars.find((item) => item.id === selection);
    if (unavailable) setNotice((message) => message || errors.car_unavailable);
    setSelection(cars.find((item) => item.available)?.id ?? null);
  }, [cars, fleet, pending, selectedCar, selection]);

  async function change(action: () => Promise<Reservation>, successNotice = "") {
    if (changing.current) return;
    changing.current = true;
    setPending(true);
    setNotice("");
    request.current?.abort();
    request.current = null;

    try {
      const reservation = await action();
      setNow(Date.now());
      setSnapshot((previous) => ({
        ...previous,
        current: reservation.status === "active" || reservation.status === "reserved" ? reservation
          : previous.current?.id === reservation.id ? null : previous.current,
        completed: reservation.status === "completed" ? reservation : previous.completed,
      }));
      if (reservation.status === "completed") setChoosingEnd(false);
      if (reservation.status === "cancelled") lastBooking.current = null;
      setNotice(successNotice);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignOut();
        return;
      }
      setNotice(error instanceof ApiError && error.code && errors[error.code]
        || "Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      changing.current = false;
      setPending(false);
      await refresh();
    }
  }

  function finish(ride: Ride) {
    if (!point || !validPoint) return;
    const id = ride.reservationId;
    if (id !== undefined) {
      void change(() => finishRide(id, point));
      return;
    }
    const seconds = durationSeconds(ride.startedAt, Date.now());
    setSession({ ...session, flow: { step: "payment", receipt: {
      ...ride, elapsed: seconds, total: legacyPrice(ride.plan, seconds),
    } } });
    setChoosingEnd(false);
  }

  function returnToMap() {
    if (flow.step !== "receipt") return;
    setSelection(flow.receipt.carId);
    setNotice("");
    setSession({ flow: { step: "fleet" }, dismissedReservation: flow.receipt.reservationId ?? session.dismissedReservation });
  }

  const profile = () => setModal("profile");
  const photo = () => { if (car?.photoUrl) setModal(car); };
  const closeModal = () => setModal(null);
  const markers = cars.filter((item) => fleet ? item.available : item.id === currentCar)
    .map((item) => ({ ...item, active: item.id === currentCar }));

  return (
    <main className="rental-app" ref={main}>
      {(fleet || flow.step === "reserved") && (
        <FleetMap settings={map} markers={markers}
          onCar={fleet ? (id) => { setSelection(id); setNotice(""); } : undefined}
          title={fleet ? "Автомобили на карте" : "Бронь автомобиля"}
          header={<Header onProfile={profile} />}>
          {notice && <p className="map-notice" role="status">{notice}</p>}
          {fleet && (car ? (
            <FleetSheet car={car} plan={plan} tariffs={tariffs} onPlan={setPlan} onPhoto={photo} pending={pending}
              onBook={() => void change(() => reserveCar(car.id, plan, tariffs))} onCollapse={() => setSelection(null)} />
          ) : (
            <section className="sheet map-guide" aria-label="Автомобили">
              <MapPinLine size={24} aria-hidden="true" />
              {markers.length > 0
                ? <div><h2>Выберите автомобиль</h2><p>Нажмите на метку на карте</p></div>
                : <div><h2>Свободных машин пока нет</h2><p>Карта обновится автоматически.</p></div>}
            </section>
          ))}
          {flow.step === "reserved" && car && (
            <ReservationSheet car={car} remaining={remaining} pending={pending} onPhoto={photo}
              onStart={() => void change(() => beginRide(flow.booking.id))}
              onCancel={() => void change(() => cancelReservation(flow.booking.id), "Бронь отменена")} />
          )}
        </FleetMap>
      )}
      {flow.step === "ride" && car && !choosingEnd && (
        <ActiveRide ride={flow.ride} car={car} elapsed={elapsed} total={rideTotal} onProfile={profile}
          onFinish={() => { setPoint(null); setNotice(""); setChoosingEnd(true); }} />
      )}
      {stage === "finish" && flow.step === "ride" && (
        <FleetMap settings={map} point={point} onPoint={(value) => { setPoint(value); setNotice(""); }}
          header={<Header onBack={() => setChoosingEnd(false)} />}>
          <section className="sheet finish-sheet" aria-labelledby="finish-heading">
            <h1 id="finish-heading" tabIndex={-1}>Завершение поездки</h1>
            <p className="support" data-invalid={Boolean(notice) || (point !== null && !validPoint)} aria-live="polite">
              {notice || (point === null ? "Укажите на карте место парковки внутри зоны."
                : validPoint ? "Точка парковки находится внутри зоны."
                : "Эта точка вне зоны. Выберите место внутри контура.")}
            </p>
            <button className="action" type="button" onClick={() => finish(flow.ride)} disabled={!validPoint || pending}>
              Завершить здесь
            </button>
          </section>
        </FleetMap>
      )}
      {flow.step === "payment" && car && (
        <Payment receipt={flow.receipt} car={car} onProfile={profile} pending={pending} error={notice}
          onPay={() => {
            const id = flow.receipt.reservationId;
            if (id !== undefined) void change(() => payReservation(id));
            else setSession({ ...session, flow: { step: "receipt", receipt: flow.receipt } });
          }} />
      )}
      {flow.step === "receipt" && car && (
        <TripReceipt receipt={flow.receipt} car={car} onReturn={returnToMap} onProfile={profile} />
      )}
      {modal === "profile" && (
        <Modal title="Профиль" onClose={closeModal}>
          <div className="profile-content">
            <p>{user.name}</p>
            <span>Иркутск</span>
          </div>
        </Modal>
      )}
      {modal && modal !== "profile" && (
        <Modal title="Фото автомобиля" onClose={closeModal}>
          <VehiclePhoto car={modal} />
          <p className="photo-caption">{modal.name}</p>
        </Modal>
      )}
    </main>
  );
}
