import { Check, ImageSquare, Minus } from "@phosphor-icons/react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Brand, Header } from "./controls";
import type { Tariffs } from "./api";
import { bookingMinutes, clock, duration, money, planName } from "./rental";
import type { Car, Plan, Receipt, Ride } from "./rental";

export function Splash() {
  return (
    <main className="launch" aria-busy="true" aria-label="Загрузка VANTAGE">
      <div className="launch-brand"><Brand large /></div>
    </main>
  );
}

export function Registration({ initialName, onRegister }: {
  initialName: string; onRegister: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const clean = name.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 40 || /[\p{Cc}\p{Cs}]/u.test(clean)) {
      setError("Введите имя длиной до 40 символов.");
      return;
    }

    setPending(true);
    setError("");
    try {
      await onRegister(clean);
    } catch {
      setError("Не удалось сохранить имя. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="entry screen-enter">
      <div className="entry-brand"><Brand large /></div>
      <section className="entry-form" aria-labelledby="entry-heading">
        <div>
          <p className="overline">Каршеринг в Иркутске</p>
          <h1 id="entry-heading">Добро пожаловать</h1>
          <p className="support">Введите имя, чтобы открыть карту и выбрать автомобиль.</p>
        </div>
        <form onSubmit={submit} aria-busy={pending}>
          <label htmlFor="name">Ваше имя</label>
          <input id="name" name="name" autoComplete="given-name" maxLength={40} required
            placeholder="Например, Анна" value={name} readOnly={pending}
            onChange={(event) => { setName(event.target.value); setError(""); }} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="action" type="submit" disabled={pending || !name.trim()}>
            {pending ? "Продолжаем…" : "Продолжить"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function LoadIssue({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <main className="journey screen-enter">
      <Header />
      <div className="journey-body">
        <div className="journey-lead" role="alert">
          <h1>{title}</h1>
          <p className="support">Проверьте подключение и попробуйте ещё раз.</p>
        </div>
        <div className="journey-footer">
          <button className="action" type="button" onClick={onRetry}>Повторить</button>
        </div>
      </div>
    </main>
  );
}

export function VehiclePhoto({ car }: { car: Car }) {
  const [failed, setFailed] = useState(false);
  return car.photoUrl && !failed
    ? <img className="car-photo" src={car.photoUrl} alt={car.name} width={1536} height={1024}
        onError={() => setFailed(true)} />
    : <p className="photo-unavailable support" role="status">Не удалось загрузить фото.</p>;
}

function Vehicle({ car, onPhoto, status }: {
  car: Car; onPhoto: () => void; status: "Свободен" | "Забронирован" | "Недоступен";
}) {
  return (
    <div className="vehicle">
      <div className="vehicle-meta">
        <span>Автомобиль {String(car.fleetNumber).padStart(2, "0")}</span>
        {status === "Свободен" && car.walkMinutes !== null && <span>{car.walkMinutes} мин пешком</span>}
      </div>
      <div className="vehicle-main">
        <h2>{car.name}</h2>
        {car.photoUrl && (
          <button className="photo-button" type="button" onClick={onPhoto}>
            <ImageSquare size={17} aria-hidden="true" /> Фото
          </button>
        )}
      </div>
      <div className="vehicle-details">
        <span>{car.bodyStyle} <span aria-hidden="true">·</span> {car.plate}</span>
        <span className="availability" data-unavailable={status === "Недоступен"}>{status}</span>
      </div>
    </div>
  );
}

export function FleetSheet({ car, plan, tariffs, onPlan, onBook, onPhoto, onCollapse, pending }: {
  car: Car; plan: Plan; tariffs: Tariffs; onPlan: (plan: Plan) => void; onBook: () => void; onPhoto: () => void;
  onCollapse: () => void; pending: boolean;
}) {
  return (
    <section className="sheet fleet-sheet" aria-label="Автомобиль и условия аренды">
      <button className="sheet-handle" type="button" onClick={onCollapse} aria-label="Свернуть карточку">
        <Minus size={29} aria-hidden="true" />
      </button>
      <Vehicle car={car} onPhoto={onPhoto} status={car.available ? "Свободен" : "Недоступен"} />
      {!car.available && <p className="unavailable-note support">Выберите другой автомобиль на карте.</p>}
      {car.available && <>
      <fieldset className="plans">
        <legend>Вариант аренды</legend>
        <div className="plans-grid">
          <label className="plan">
            <input type="radio" name="plan" checked={plan.mode === "fixed"}
              onChange={() => onPlan({ mode: "fixed", hours: tariffs.hours[0] })} />
            <span><strong>На срок</strong><small>{money(tariffs.fixedHourKopecks / 100)} в час</small></span>
          </label>
          <label className="plan">
            <input type="radio" name="plan" checked={plan.mode === "metered"}
              onChange={() => onPlan({ mode: "metered" })} />
            <span><strong>По факту</strong><small>{money(tariffs.meteredMinuteKopecks / 100)} в минуту</small></span>
          </label>
        </div>
      </fieldset>
      <div className="plan-detail">
        {plan.mode === "fixed" ? (
          <fieldset className="terms">
            <legend>Срок аренды</legend>
            <div className="term-options">
              {tariffs.hours.map((hours) => (
                <button type="button" key={hours} aria-pressed={hours === plan.hours}
                  onClick={() => onPlan({ mode: "fixed", hours })}>{hours} ч</button>
              ))}
            </div>
          </fieldset>
        ) : <p className="plan-note">Оплата за фактическое время поездки</p>}
      </div>
      <button className="action" type="button" onClick={onBook} disabled={pending}>Забронировать</button>
      <p className="sheet-note">Бронь бесплатна {bookingMinutes} минут</p>
      </>}
    </section>
  );
}

export function ReservationSheet({ car, remaining, onPhoto, onStart, onCancel, pending }: {
  car: Car; remaining: number; onPhoto: () => void; onStart: () => void; onCancel: () => void; pending: boolean;
}) {
  return (
    <section className="sheet reservation-sheet" aria-label="Бронь автомобиля">
      <Vehicle car={car} onPhoto={onPhoto} status="Забронирован" />
      <div className="reserve-timing">
        <span>До начала поездки</span>
        <strong role="timer">{clock(remaining)}</strong>
      </div>
      <button className="action" type="button" onClick={onStart} disabled={pending || remaining === 0}>Начать поездку</button>
      <button className="action action-quiet" type="button" onClick={onCancel} disabled={pending}>Отменить бронь</button>
    </section>
  );
}

function Journey({ children, onProfile }: { children: ReactNode; onProfile: () => void }) {
  return (
    <section className="journey screen-enter">
      <Header onProfile={onProfile} />
      <div className="journey-body">{children}</div>
    </section>
  );
}

export function ActiveRide({ ride, car, elapsed, total, onFinish, onProfile }: {
  ride: Ride; car: Car; elapsed: number; total: number | null; onFinish: () => void; onProfile: () => void;
}) {
  const remaining = ride.plan.mode === "fixed" ? ride.plan.hours * 3600 - elapsed : 0;
  const fixed = ride.plan.mode === "fixed";
  const value = fixed ? Math.abs(remaining) : elapsed;

  return (
    <Journey onProfile={onProfile}>
      <div className="journey-lead">
        <p className="status-line"><span className="availability">Поездка активна</span></p>
        <h1 tabIndex={-1}>{car.name}</h1>
        <p className="support">{car.plate} <span aria-hidden="true">·</span> {planName(ride.plan)}</p>
      </div>
      <div className="instrument">
        <p className="overline">{!fixed ? "Время в пути" : remaining >= 0 ? "Осталось по тарифу" : "Сверх выбранного срока"}</p>
        <p className="instrument-value" role="timer">{clock(value, true)}</p>
      </div>
      <div className="metric-row">
        <span>{fixed && remaining >= 0 ? "Стоимость периода" : "Текущая сумма"}</span>
        <strong>{total === null ? "…" : money(total)}</strong>
      </div>
      <div className="journey-footer">
        <button className="action" type="button" onClick={onFinish}>Завершить поездку</button>
      </div>
    </Journey>
  );
}

export function Payment({ receipt, car, pending, error, onPay, onProfile }: {
  receipt: Receipt; car: Car; pending: boolean; error: string; onPay: () => void; onProfile: () => void;
}) {
  return (
    <Journey onProfile={onProfile}>
      <div className="journey-lead">
        <p className="overline">Поездка завершена</p>
        <h1 tabIndex={-1}>К оплате</h1>
        <p className="support">{car.name} <span aria-hidden="true">·</span> {car.plate}</p>
      </div>
      <div className="instrument">
        <p className="overline">Итоговая сумма</p>
        <p className="instrument-value instrument-amount">{money(receipt.total)}</p>
      </div>
      <div className="metric-row"><span>Длительность</span><strong>{duration(receipt.elapsed)}</strong></div>
      <div className="journey-footer">
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="action" type="button" disabled={pending} onClick={onPay}>
          {pending ? "Сохраняем оплату…" : "Оплатить"}
        </button>
      </div>
    </Journey>
  );
}

export function TripReceipt({ receipt, car, onReturn, onProfile }: {
  receipt: Receipt; car: Car; onReturn: () => void; onProfile: () => void;
}) {
  return (
    <Journey onProfile={onProfile}>
      <div className="journey-lead">
        <span className="receipt-check"><Check aria-hidden="true" size={26} /></span>
        <h1 tabIndex={-1}>Поездка оплачена</h1>
      </div>
      <dl className="receipt-list">
        <div><dt>Автомобиль</dt><dd>{car.name}</dd></div>
        <div><dt>Тариф</dt><dd>{planName(receipt.plan)}</dd></div>
        <div><dt>Длительность</dt><dd>{duration(receipt.elapsed)}</dd></div>
        <div className="receipt-total"><dt>Итого</dt><dd>{money(receipt.total)}</dd></div>
      </dl>
      <div className="journey-footer">
        <button className="action" type="button" onClick={onReturn}>На карту</button>
      </div>
    </Journey>
  );
}
