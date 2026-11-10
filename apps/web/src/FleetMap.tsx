import { Car as CarIcon, MapPin } from "@phosphor-icons/react";
import { divIcon, latLngBounds, point as pixel } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapSettings } from "./api";
import { insideZone } from "./rental";
import type { Car, Point } from "./rental";

const offsets = [[0, 0], [-48, 0], [48, 0], [0, -48], [0, 48], [-48, -48], [48, -48]];
type MapCar = Car & { active: boolean };

type MapProps = {
  settings: MapSettings;
  markers?: MapCar[];
  onCar?: (id: number) => void;
  point?: Point | null;
  onPoint?: (point: Point) => void;
  title?: string;
  header: ReactNode;
  children?: ReactNode;
};

function MapLayout({ field, zone }: { field: RefObject<HTMLDivElement | null>; zone: MapSettings["zone"] }) {
  const map = useMap();
  useEffect(() => {
    const area = field.current;
    if (!area) return;
    const canvas = map.getContainer();
    function fit() {
      if (!area) return;
      map.invalidateSize({ pan: false });
      const viewport = canvas.getBoundingClientRect();
      const visible = area.getBoundingClientRect();
      map.fitBounds(latLngBounds(zone), {
        paddingTopLeft: pixel(visible.left - viewport.left + 21, visible.top - viewport.top + 18),
        paddingBottomRight: pixel(viewport.right - visible.right + 21, viewport.bottom - visible.bottom + 27),
        maxZoom: 15,
        animate: false,
      });
    }

    const observer = new ResizeObserver(fit);
    observer.observe(area);
    fit();
    return () => observer.disconnect();
  }, [field, map, zone]);
  return null;
}

function CarPin({ car, position, onCar }: { car: MapCar; position: Point; onCar?: (id: number) => void }) {
  const marker = useRef<LeafletMarker>(null);
  const [content] = useState(() => document.createElement("span"));
  const icon = useMemo(() => divIcon({
    html: content, className: "car-marker", iconSize: [48, 48], iconAnchor: [24, 24],
  }), [content]);

  useEffect(() => {
    const element = marker.current?.getElement();
    if (!element) return;
    if (onCar) {
      element.setAttribute("aria-label", car.name);
      element.setAttribute("aria-pressed", String(car.active));
    } else {
      element.setAttribute("aria-hidden", "true");
    }
    element.dataset.active = String(car.active);
  }, [car.active, car.name, onCar]);

  return (
    <>
      <Marker ref={marker} position={position} icon={icon} keyboard={Boolean(onCar)}
        interactive={Boolean(onCar)} title={car.name} zIndexOffset={car.active ? 200 : 0}
        eventHandlers={{ click: () => onCar?.(car.id) }} />
      {createPortal(<CarIcon size={17} aria-hidden="true" />, content)}
    </>
  );
}

function CarPins({ cars, onCar }: { cars: MapCar[]; onCar?: (id: number) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const placed: ReturnType<typeof pixel>[] = [];

  return cars.map((car) => {
    const origin = map.project(car.position, zoom);
    const free = offsets.map(([x, y]) => origin.add(pixel(x, y)))
      .find((candidate) => placed.every((other) => candidate.distanceTo(other) >= 46)) ?? origin;
    placed.push(free);
    return <CarPin key={`${car.id}-${Boolean(onCar)}`} car={car} position={map.unproject(free, zoom)} onCar={onCar} />;
  });
}

function ParkingPicker({ point, onPoint, zone, field }: {
  point: Point | null;
  onPoint: (point: Point) => void;
  zone: MapSettings["zone"];
  field: RefObject<HTMLDivElement | null>;
}) {
  const map = useMapEvents({ click: (event) => onPoint({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  const [content] = useState(() => document.createElement("span"));
  const icon = useMemo(() => divIcon({
    html: content, className: "end-marker", iconSize: [36, 36], iconAnchor: [18, 34],
  }), [content]);

  useEffect(() => {
    const element = map.getContainer();
    element.classList.add("map-target");
    element.setAttribute("aria-label", "Выбрать точку на карте");
    element.setAttribute("aria-description", "Нажмите Enter и используйте клавиши со стрелками.");
    function pick(event: KeyboardEvent) {
      if (event.target !== element) return;
      const movement: Record<string, [number, number]> = {
        ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16],
        Enter: [0, 0], " ": [0, 0],
      };
      const offset = movement[event.key];
      if (!offset) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = field.current?.getBoundingClientRect();
      const viewport = element.getBoundingClientRect();
      const origin = point ? map.latLngToContainerPoint(point)
        : pixel(bounds ? bounds.left + bounds.width / 2 - viewport.left : viewport.width / 2,
          bounds ? bounds.top + bounds.height / 2 - viewport.top : viewport.height / 2);
      const next = map.containerPointToLatLng(origin.add(pixel(...offset)));
      onPoint({ lat: next.lat, lng: next.lng });
    }
    element.addEventListener("keydown", pick);
    return () => {
      element.removeEventListener("keydown", pick);
      element.classList.remove("map-target");
      element.removeAttribute("aria-label");
      element.removeAttribute("aria-description");
    };
  }, [field, map, onPoint, point]);

  return point ? (
    <>
      <Marker position={point} icon={icon} keyboard={false} interactive={false} />
      {createPortal(<MapPin size={36} weight="fill" color={insideZone(point, zone) ? "var(--green)" : "var(--error)"}
        aria-hidden="true" />, content)}
    </>
  ) : null;
}

export function FleetMap({ settings, markers = [], onCar, point, onPoint, title, header, children }: MapProps) {
  const field = useRef<HTMLDivElement>(null);
  const [tileIssue, setTileIssue] = useState(false);
  const [tileAttempt, setTileAttempt] = useState(0);
  const hasTiles = useRef(false);

  return (
    <section className="map-scene">
      <div className="map-canvas">
        <MapContainer center={latLngBounds(settings.zone).getCenter()} zoom={14} minZoom={11} maxZoom={19}
          zoomSnap={0.5} zoomControl={false} attributionControl={false} scrollWheelZoom={true}>
          <TileLayer key={tileAttempt} url={settings.tileUrl} maxZoom={19} keepBuffer={2} eventHandlers={{
            loading: () => { hasTiles.current = false; },
            tileload: () => { hasTiles.current = true; setTileIssue(false); },
            load: () => { if (!hasTiles.current) setTileIssue(true); },
          }} />
          <MapLayout field={field} zone={settings.zone} />
          <Polygon positions={settings.zone} interactive={false}
            pathOptions={{ color: "#aeb8aa", weight: 1, opacity: 0.85, fillOpacity: 0.035, dashArray: "4 5" }} />
          <CarPins cars={markers} onCar={onCar} />
          {onPoint && <ParkingPicker point={point ?? null} onPoint={onPoint} zone={settings.zone} field={field} />}
        </MapContainer>
      </div>
      {title && <h1 className="sr-only" tabIndex={-1}>{title}</h1>}
      {header}
      <div className="map-field" ref={field}>
        {tileIssue && <div className="map-tile-error" role="status">
          Карта временно недоступна
          <button type="button" onClick={() => { setTileIssue(false); setTileAttempt((value) => value + 1); }}>
            Повторить
          </button>
        </div>}
        <a className="map-attribution" href={settings.attributionUrl} target="_blank" rel="noopener noreferrer">
          {settings.attribution}
        </a>
      </div>
      {children}
    </section>
  );
}
