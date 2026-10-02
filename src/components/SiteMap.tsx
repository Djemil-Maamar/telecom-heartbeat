import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Site, Technician } from "@/lib/ops";

type Props = {
  sites: Site[];
  allSites: Site[];
  techs: Technician[];
  selectedId: string | null;
  focus: { lat: number; lng: number; key: number } | null;
  showZones: boolean;
  onSelect: (id: string) => void;
};

const RANK = { normal: 0, maintenance: 1, alarm: 2 } as Record<string, number>;

export default function SiteMap({ sites, allSites, techs, selectedId, focus, showZones, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const techLayer = useRef<L.LayerGroup | null>(null);
  const zoneLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView([9.08, 7.4], 6);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(m);
    zoneLayer.current = L.layerGroup().addTo(m);
    techLayer.current = L.layerGroup().addTo(m);
    cluster.current = L.markerClusterGroup({
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      iconCreateFunction: (c) => {
        const worst = c.getAllChildMarkers().reduce((w, mk) => Math.max(w, RANK[(mk.options as { status?: string }).status ?? "normal"] ?? 0), 0);
        const st = Object.keys(RANK).find((k) => RANK[k] === worst);
        return L.divIcon({ className: "", html: `<div class="site-cluster site-cluster--${st}">${c.getChildCount()}</div>`, iconSize: [40, 40] });
      },
    }).addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); };
  }, []);

  // Intervention sectors: one zone per region, sized to cover its sites.
  useEffect(() => {
    const g = zoneLayer.current;
    if (!g) return;
    g.clearLayers();
    if (!showZones) return;
    const regions = new Map<string, Site[]>();
    allSites.forEach((s) => regions.set(s.region, [...(regions.get(s.region) ?? []), s]));
    regions.forEach((list, region) => {
      const lat = list.reduce((a, s) => a + s.lat, 0) / list.length;
      const lng = list.reduce((a, s) => a + s.lng, 0) / list.length;
      const radius = Math.max(8000, ...list.map((s) => L.latLng(lat, lng).distanceTo([s.lat, s.lng]) + 4000));
      const alarm = list.some((s) => s.status === "alarm");
      L.circle([lat, lng], { radius, className: `zone ${alarm ? "zone--alarm" : ""}`, interactive: false }).addTo(g);
      L.marker([lat, lng], { interactive: false, icon: L.divIcon({ className: "", html: `<div class="zone-label">${region}</div>`, iconSize: [120, 20], iconAnchor: [60, -radius > 0 ? 28 : 0] }) }).addTo(g);
    });
  }, [allSites, showZones]);

  useEffect(() => {
    const c = cluster.current, t = techLayer.current;
    if (!c || !t || !map.current) return;
    c.clearLayers();
    t.clearLayers();
    for (const tech of techs) {
      L.marker([tech.lat, tech.lng], {
        icon: L.divIcon({ className: "", html: `<div class="tech-pin">${tech.call_sign.split("-")[1] ?? "T"}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
        title: `${tech.name} (${tech.availability})`,
      }).addTo(t);
    }
    const size = window.matchMedia("(pointer: coarse)").matches ? 30 : 22;
    c.addLayers(sites.map((s) =>
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: "", html: `<div class="site-pin site-pin--${s.status}${s.id === selectedId ? " site-pin--selected" : ""}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }),
        title: `${s.code} · ${s.name}`,
        status: s.status,
      } as L.MarkerOptions).on("click", () => onSelectRef.current(s.id)),
    ));
    if (!fitted.current && sites.length) {
      map.current.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lng])), { padding: [40, 40] });
      fitted.current = true;
    }
  }, [sites, techs, selectedId]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], 14, { duration: 0.8 });
  }, [focus]);

  return <div ref={el} className="h-full w-full" aria-label="Carte des sites" />;
}
