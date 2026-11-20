import { useEffect, useRef, useState } from "react";
import { MapPinOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type MapPin = { id: string; lat: number; lng: number; title: string };

// Minimal shapes of the Google Maps JS API used here (no @types dependency).
type LatLng = { lat(): number; lng(): number };
type MapsEvent = { latLng: LatLng };
type Listener = { remove(): void };
type GMap = {
  addListener(e: string, fn: (ev: MapsEvent) => void): Listener;
  setCenter(p: { lat: number; lng: number }): void;
  getZoom(): number;
  setZoom(z: number): void;
  fitBounds(b: unknown): void;
};
type GMarker = {
  setMap(m: GMap | null): void;
  addListener(e: string, fn: (ev: MapsEvent) => void): Listener;
};
type GoogleNs = {
  maps: {
    Map: new (el: HTMLElement, opts: object) => GMap;
    Marker: new (opts: object) => GMarker;
    LatLngBounds: new () => { extend(p: { lat: number; lng: number }): void };
  };
};
type JanelaComMapa = Window & { google?: GoogleNs; __pattyMapsReady?: () => void };

/** Browser key restricted to the site's domain (Google Cloud › Maps JavaScript API). */
const CHAVE = import.meta.env["VITE_GOOGLE_MAPS_KEY"] as string | undefined;
const mapaConfigurado = Boolean(CHAVE);

let carregando: Promise<GoogleNs> | null = null;
function carregarGoogleMaps(): Promise<GoogleNs> {
  const w = window as JanelaComMapa;
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  if (carregando) return carregando;
  carregando = new Promise((resolve, reject) => {
    w.__pattyMapsReady = () =>
      w.google ? resolve(w.google) : reject(new Error("Mapa indisponível"));
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CHAVE ?? "")}&loading=async&callback=__pattyMapsReady&language=pt-BR&region=BR`;
    s.async = true;
    s.onerror = () => {
      carregando = null;
      reject(new Error("Não foi possível carregar o mapa."));
    };
    document.head.appendChild(s);
  });
  return carregando;
}

const BRASIL = { lat: -15.78, lng: -47.93 };

/**
 * Map with markers. With `onPick`, clicking the map or dragging the marker sets the position;
 * with `onSelect`, clicking a marker opens that point.
 */
export function MapaPontos({
  pins,
  onPick,
  onSelect,
  className,
}: {
  pins: MapPin[];
  onPick?: ((lat: number, lng: number) => void) | undefined;
  onSelect?: ((id: string) => void) | undefined;
  className?: string | undefined;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<GMap | null>(null);
  const google = useRef<GoogleNs | null>(null);
  const marcadores = useRef<GMarker[]>([]);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState("");
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!mapaConfigurado) return;
    let vivo = true;
    carregarGoogleMaps()
      .then((g) => {
        if (!vivo || !el.current) return;
        google.current = g;
        mapa.current = new g.maps.Map(el.current, {
          center: BRASIL,
          zoom: 4,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: true,
        });
        mapa.current.addListener("click", (e) => pickRef.current?.(e.latLng.lat(), e.latLng.lng()));
        setPronto(true);
      })
      .catch((e: Error) => setErro(e.message));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const g = google.current;
    const m = mapa.current;
    if (!pronto || !g || !m) return;
    marcadores.current.forEach((x) => x.setMap(null));
    marcadores.current = pins.map((p) => {
      const mk = new g.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: m,
        title: p.title,
        draggable: Boolean(pickRef.current),
      });
      mk.addListener("dragend", (e) => pickRef.current?.(e.latLng.lat(), e.latLng.lng()));
      mk.addListener("click", () => selectRef.current?.(p.id));
      return mk;
    });
    const primeiro = pins[0];
    if (pins.length === 1 && primeiro) {
      m.setCenter({ lat: primeiro.lat, lng: primeiro.lng });
      if (m.getZoom() < 14) m.setZoom(16);
    } else if (pins.length > 1) {
      const b = new g.maps.LatLngBounds();
      pins.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      m.fitBounds(b);
    }
  }, [pronto, pins]);

  return (
    <div
      className={cn("relative overflow-hidden rounded-2xl border bg-muted/40", className ?? "h-80")}
    >
      <div ref={el} className="absolute inset-0" />
      {(!mapaConfigurado || erro) && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          <div className="max-w-sm space-y-2">
            <MapPinOff className="mx-auto size-8 opacity-60" />
            <p>
              {erro ||
                "O mapa ainda não foi configurado (falta a chave do Google Maps). Os pontos e as coordenadas funcionam normalmente."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default MapaPontos;
