import React, { useEffect, useRef, useState, useCallback } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const PARIS_FALLBACK = { lat: 48.8566, lng: 2.3522 };

// Adds a header that skips the ngrok free-tier warning interstitial when the
// backend is reached through an ngrok tunnel (used for quick phone testing).
// Harmless against any other host — real hosts simply ignore this header.
function apiFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: { "ngrok-skip-browser-warning": "true", ...(options.headers || {}) },
  });
}

function timeAgoFr(iso) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const h = Math.round(diffMin / 60);
  return `il y a ${h} h`;
}

function gaugeColor(confidence) {
  if (confidence >= 0.8) return "var(--verified)";
  if (confidence >= 0.55) return "var(--likely)";
  return "var(--tocheck)";
}

function ResultCard({ item, onReport }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${item.store.lat},${item.store.lng}`;
  const wazeUrl = `https://waze.com/ul?ll=${item.store.lat},${item.store.lng}&navigate=yes`;

  return (
    <div className="card" style={{ position: "relative" }}>
      <div className="card-top">
        <div>
          <div className="card-title">{item.product.brand} {item.product.model}</div>
          <div className="card-store">{item.store.name} · {item.store.address}</div>
        </div>
        <div className="price">{item.price.toFixed(2)} €</div>
      </div>

      <div className="spec-row">
        <span><b>{item.product.btu}</b> BTU</span>
        <span><b>{item.product.coolingCapacityM2}</b> m²</span>
        {item.product.noiseDb && <span><b>{item.product.noiseDb}</b> dB</span>}
      </div>

      <div className="badge-row">
        <span className="badge distance">{item.distanceKm} km</span>
        {item.quantityHint === "last_unit" && <span className="badge last_unit">Dernière unité</span>}
      </div>

      <div className="gauge">
        <div className="gauge-track">
          <div className="gauge-fill" style={{ width: `${Math.round(item.confidence * 100)}%`, background: gaugeColor(item.confidence) }} />
        </div>
        <span className="gauge-label">{Math.round(item.confidence * 100)}% · {timeAgoFr(item.lastVerifiedAt)}</span>
      </div>

      <div className="card-actions">
        <a className="btn btn-primary" href={item.store.retailerUrl} target="_blank" rel="noreferrer">
          Réserver
        </a>
        <a className="btn btn-secondary" href={gmapsUrl} target="_blank" rel="noreferrer">
          M'y rendre
        </a>
        <button className="btn btn-ghost" onClick={() => setMenuOpen((v) => !v)} aria-label="Signaler">⋯</button>
      </div>

      {menuOpen && (
        <div className="report-menu">
          <button onClick={() => { onReport(item.stockEntryId, "confirmed"); setMenuOpen(false); }}>
            ✓ Stock confirmé
          </button>
          <button onClick={() => { onReport(item.stockEntryId, "last_unit"); setMenuOpen(false); }}>
            ⚠ C'était la dernière unité
          </button>
          <button onClick={() => { onReport(item.stockEntryId, "out_of_stock"); setMenuOpen(false); }}>
            ✕ Déjà en rupture
          </button>
          <a href={wazeUrl} target="_blank" rel="noreferrer" style={{ display: "block", padding: "8px 10px", fontSize: 13 }}>
            Ouvrir dans Waze
          </a>
        </div>
      )}
    </div>
  );
}

function AlertModal({ position, filters, onClose }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(null);

  async function submit() {
    if (!email) return;
    setStatus("sending");
    try {
      const res = await apiFetch(`${API_URL}/api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          lat: position.lat,
          lng: position.lng,
          radius_km: filters.radiusKm,
          min_btu: filters.minBtu || null,
          max_price: filters.maxPrice || null,
          brand: filters.brand || null,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Créer une alerte stock</h3>
        <p>On vous prévient dès qu'un climatiseur correspondant redevient disponible dans votre rayon.</p>
        {status === "done" ? (
          <p style={{ color: "var(--verified)" }}>Alerte créée ✓</p>
        ) : (
          <>
            <input
              type="email"
              placeholder="[email protected]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
              <button className="btn btn-primary" onClick={submit} disabled={status === "sending"}>
                {status === "sending" ? "Envoi…" : "Activer l'alerte"}
              </button>
            </div>
            {status === "error" && <p style={{ color: "var(--accent)" }}>Erreur, réessayez.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function MapView({ results, position }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!window.maplibregl || mapRef.current) return;
    mapRef.current = new window.maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [position.lng, position.lat],
      zoom: 11,
    });
    mapRef.current.addControl(new window.maplibregl.NavigationControl(), "top-right");
  }, [position]);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const userMarker = new window.maplibregl.Marker({ color: "#0F3D3E" })
      .setLngLat([position.lng, position.lat])
      .addTo(mapRef.current);
    markersRef.current.push(userMarker);

    results.forEach((item) => {
      const popup = new window.maplibregl.Popup({ offset: 16 }).setHTML(
        `<div class="popup-title">${item.product.brand} ${item.product.model}</div>
         <div class="popup-price">${item.price.toFixed(2)} €</div>
         <div style="font-size:12px;color:#5B6B6C;margin-top:2px;">${item.store.name} · ${item.distanceKm} km</div>`
      );
      const marker = new window.maplibregl.Marker({ color: "#E8491D" })
        .setLngLat([item.store.lng, item.store.lat])
        .setPopup(popup)
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    });
  }, [results, position]);

  return <div className="map-wrap"><div id="map" ref={containerRef} /></div>;
}

export default function App() {
  const [position, setPosition] = useState(null);
  const [geoStatus, setGeoStatus] = useState("locating");
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ radiusKm: 15, sort: "distance", brand: "", minBtu: "", maxPrice: "" });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");
  const [alertOpen, setAlertOpen] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setPosition(PARIS_FALLBACK);
      setGeoStatus("fallback");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoStatus("located");
      },
      () => {
        setPosition(PARIS_FALLBACK);
        setGeoStatus("fallback");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    apiFetch(`${API_URL}/api/meta/brands`).then((r) => r.json()).then(setBrands).catch(() => {});
  }, []);

  const runSearch = useCallback(async () => {
    if (!position) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        lat: position.lat,
        lng: position.lng,
        radius_km: filters.radiusKm,
        sort: filters.sort,
      });
      if (filters.brand) params.set("brand", filters.brand);
      if (filters.minBtu) params.set("min_btu", filters.minBtu);
      if (filters.maxPrice) params.set("max_price", filters.maxPrice);

      const res = await apiFetch(`${API_URL}/api/search?${params.toString()}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [position, filters]);

  useEffect(() => { runSearch(); }, [runSearch]);

  async function handleReport(stockEntryId, reportType) {
    try {
      await apiFetch(`${API_URL}/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_entry_id: stockEntryId, report_type: reportType }),
      });
      runSearch();
    } catch {}
  }

  if (!position) return null;

  return (
    <div className="app">
      <div className="header">
        <div className="header-top">
          <div className="logo">Clim<span>Close</span></div>
        </div>
        <div className="tagline">Climatiseurs disponibles près de vous, maintenant.</div>
        <div className="geo-status">
          {geoStatus === "located" ? "📍 Position détectée" : "📍 Position par défaut (Paris) — géolocalisation refusée"}
        </div>
      </div>

      <div className="filterbar">
        <div className="chip-slider">
          Rayon
          <input
            type="range" min="1" max="50" value={filters.radiusKm}
            onChange={(e) => setFilters((f) => ({ ...f, radiusKm: parseInt(e.target.value, 10) }))}
          />
          {filters.radiusKm} km
        </div>
        <div className="chip-select">
          <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
            <option value="distance">Distance</option>
            <option value="price">Prix</option>
            <option value="btu">Puissance (BTU)</option>
            <option value="cooling">Surface</option>
            <option value="brand">Marque</option>
          </select>
        </div>
        <div className="chip-select">
          <select value={filters.brand} onChange={(e) => setFilters((f) => ({ ...f, brand: e.target.value }))}>
            <option value="">Toutes marques</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="view-toggle">
          <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Liste</button>
          <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Carte</button>
        </div>
      </div>

      {view === "list" ? (
        <>
          <div className="result-count">
            {loading ? "Recherche en cours…" : `${results.length} climatiseur(s) disponible(s) dans un rayon de ${filters.radiusKm} km`}
          </div>
          <div className="results">
            {!loading && results.length === 0 && (
              <div className="empty-state">
                <h3>Rien de fiable pour le moment</h3>
                <p>Aucun stock vérifié dans ce rayon. Élargissez la zone ou créez une alerte.</p>
              </div>
            )}
            {results.map((item) => (
              <ResultCard key={item.stockEntryId} item={item} onReport={handleReport} />
            ))}
          </div>
        </>
      ) : (
        <MapView results={results} position={position} />
      )}

      <div className="alert-cta">
        <button onClick={() => setAlertOpen(true)}>🔔 Prévenez-moi si tout est en rupture</button>
      </div>

      {alertOpen && (
        <AlertModal position={position} filters={filters} onClose={() => setAlertOpen(false)} />
      )}
    </div>
  );
}
