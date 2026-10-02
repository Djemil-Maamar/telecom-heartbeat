import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Site, Technician } from "@/lib/ops";

type Props = {
  sites: Site[];
  techs: Technician[];
  selectedId: string | null;
  focus: { lat: number; lng: number; key: number } | null;
  onSelect: (id: string) => void;
};

export default function SiteMap({ sites, techs, selectedId, focus, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, tap: true } as L.MapOptions).setView([9.08, 7.4], 6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g || !map.current) return;
    g.clearLayers();
    for (const t of techs) {
      L.marker([t.lat, t.lng], {
        icon: L.divIcon({ className: "", html: `<div class="tech-pin">${t.call_sign.split("-")[1] ?? "T"}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: `${t.name} (${t.availability})`,
        zIndexOffset: -100,
      }).addTo(g);
    }
    for (const s of sites) {
      const size = window.matchMedia("(pointer: coarse)").matches ? 30 : 22;
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: "", html: `<div class="site-pin site-pin--${s.status}${s.id === selectedId ? " site-pin--selected" : ""}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        title: `${s.code} · ${s.name}`,
        keyboard: true,
        zIndexOffset: s.status === "alarm" ? 1000 : 0,
      })
        .on("click", () => onSelectRef.current(s.id))
        .addTo(g);
    }
    if (!fitted.current && sites.length) {
      map.current.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lng])), { padding: [40, 40] });
      fitted.current = true;
    }
  }, [sites, techs, selectedId]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], 13, { duration: 0.8 });
  }, [focus]);

  return <div ref={el} className="h-full w-full" aria-label="Carte des sites" />;
}
