import { ArrowLeft, User, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import logo from "../../../design/vantage-logo.png";

export function Brand({ large = false }: { large?: boolean }) {
  if (large) {
    return <span className="brand-large"><img src={logo} alt="VANTAGE" width="450" height="806" /></span>;
  }
  return (
    <div className="brand" aria-label="VANTAGE">
      <span className="brand-mark"><img src={logo} alt="" width="450" height="806" /></span>
      <span className="brand-type" aria-hidden="true">VANTAGE<small>Premium car sharing</small></span>
    </div>
  );
}

export function Header({ onProfile, onBack }: { onProfile?: () => void; onBack?: () => void }) {
  return (
    <header className="app-header">
      {onBack ? (
        <button className="icon-button" type="button" onClick={onBack} aria-label="К поездке">
          <ArrowLeft aria-hidden="true" size={21} />
        </button>
      ) : <Brand />}
      {onProfile && (
        <button className="icon-button" type="button" onClick={onProfile} aria-label="Профиль">
          <User aria-hidden="true" size={21} />
        </button>
      )}
    </header>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={ref} className="modal" aria-labelledby={label}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-inner">
        <header className="modal-header">
          <h2 id={label}>{title}</h2>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
