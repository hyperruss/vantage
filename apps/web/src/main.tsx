import "@fontsource-variable/roboto";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import logo from "../../../design/vantage-logo.png";
import { ApiError, getFleetSnapshot, getMapSettings, getUser, registerUser } from "./api";
import type { FleetSnapshot, MapSettings, User } from "./api";
import { RentalApp } from "./RentalApp";
import { legacyName } from "./rentalStorage";
import { LoadIssue, Registration, Splash } from "./screens";
import "./styles.css";

type AppState =
  | { step: "checking" | "entry" | "session-error" }
  | { step: "fleet-loading" | "fleet-error"; user: User }
  | { step: "ready"; user: User; fleet: FleetSnapshot; map: MapSettings };

function App() {
  const [state, setState] = useState<AppState>({ step: "checking" });
  const [brandReady, setBrandReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer = 0;
    const emblem = new Image();
    emblem.src = logo;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minimum = new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, reduced ? 0 : 620);
    });
    void Promise.all([minimum, emblem.decode().catch(() => {})]).then(() => {
      if (mounted) setBrandReady(true);
    });
    return () => {
      mounted = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (state.step !== "checking" && state.step !== "fleet-loading") return;
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        if (state.step === "checking") {
          const user = await getUser(signal);
          if (!signal.aborted) setState(user ? { step: "fleet-loading", user } : { step: "entry" });
        } else if (state.step === "fleet-loading") {
          const [fleet, map] = await Promise.all([getFleetSnapshot(signal), getMapSettings(signal)]);
          if (!signal.aborted) setState({ step: "ready", user: state.user, fleet, map });
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setState({ step: "entry" });
          return;
        }
        setState(state.step === "fleet-loading"
          ? { step: "fleet-error", user: state.user }
          : { step: "session-error" });
      }
    }

    void load();
    return () => controller.abort();
  }, [state]);

  if (!brandReady || state.step === "checking" || state.step === "fleet-loading") return <Splash />;
  if (state.step === "session-error") {
    return <LoadIssue title="Не удалось восстановить вход" onRetry={() => setState({ step: "checking" })} />;
  }
  if (state.step === "fleet-error") {
    return <LoadIssue title="Не удалось загрузить автомобили"
      onRetry={() => setState({ step: "fleet-loading", user: state.user })} />;
  }
  if (state.step === "ready") return <RentalApp key={state.user.id} user={state.user}
    initialFleet={state.fleet} map={state.map} onSignOut={() => setState({ step: "entry" })} />;
  return <Registration initialName={legacyName()} onRegister={async (name) => {
    const user = await registerUser(name);
    setState({ step: "fleet-loading", user });
  }} />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
