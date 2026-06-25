import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import L from "leaflet";

type PlayerInfo = { nickname: string; role: string; status: string };
type LocationData = { lat: number; lng: number; nickname: string; role: string; self?: boolean };

export default function GamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const playerId = localStorage.getItem("han_player_id") || "";
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const endpointRef = useRef<L.Marker | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const watchRef = useRef<number | null>(null);

  const [myRole, setMyRole] = useState<string>("hider");
  const [myStatus, setMyStatus] = useState<string>("alive");
  const [players, setPlayers] = useState<Record<string, PlayerInfo>>({});
  const [pingActive, setPingActive] = useState(false);
  const [nextPingIn, setNextPingIn] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(1800);
  const [pendingCatch, setPendingCatch] = useState<{ seeker_id: string; seeker_name: string } | null>(null);
  const [gameOver, setGameOver] = useState<{ reason: string; survivors?: string[] } | null>(null);
  const [showPlayerList, setShowPlayerList] = useState(false);

  // Init map
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    mapRef.current = L.map(mapDivRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([50.0, 8.5], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(mapRef.current);

    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
  }, []);

  // GPS watch
  useEffect(() => {
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        wsRef.current?.send(JSON.stringify({
          type: "location",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
        // Center map on self
        if (mapRef.current) {
          mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], mapRef.current.getZoom());
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // Poll for pending catch (for hiders)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (myRole !== "hider" || myStatus !== "alive") return;
      const res = await fetch(`/api/game/pending-catch/${playerId}`);
      const data = await res.json();
      if (data.pending) setPendingCatch(data);
      else setPendingCatch(null);
    }, 3000);
    return () => clearInterval(interval);
  }, [myRole, myStatus, playerId]);

  const confirmCatch = async (confirm: boolean) => {
    if (!pendingCatch) return;
    await fetch("/api/game/confirm-catch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hider_id: playerId, seeker_id: pendingCatch.seeker_id, confirm }),
    });
    setPendingCatch(null);
  };

  const initiateCatch = async (hiderId: string) => {
    const res = await fetch("/api/game/catch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seeker_id: playerId, hider_id: hiderId }),
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.detail);
    }
  };

  // WebSocket
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/${code}/${playerId}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "state") {
        const me = msg.players[playerId];
        if (me) { setMyRole(me.role); setMyStatus(me.status); }
        setPlayers(msg.players);
        setElapsed(msg.elapsed);
        setTotal(msg.total);
        setPingActive(msg.ping_active);
        setNextPingIn(msg.next_ping_in);

        // Update zone circle
        if (msg.center && mapRef.current) {
          if (!circleRef.current) {
            circleRef.current = L.circle([msg.center.lat, msg.center.lng], {
              radius: msg.radius_km * 1000,
              color: "#c8f135",
              fillColor: "#c8f135",
              fillOpacity: 0.04,
              weight: 2,
            }).addTo(mapRef.current);
          } else {
            circleRef.current.setLatLng([msg.center.lat, msg.center.lng]);
            circleRef.current.setRadius(msg.radius_km * 1000);
          }
        }

        // Update endpoint marker
        if (msg.endpoint && mapRef.current) {
          if (!endpointRef.current) {
            const icon = L.divIcon({
              html: `<div style="width:14px;height:14px;background:#c8f135;border-radius:50%;border:2px solid #000;box-shadow:0 0 8px #c8f135"></div>`,
              iconSize: [14, 14], iconAnchor: [7, 7], className: ""
            });
            endpointRef.current = L.marker([msg.endpoint.lat, msg.endpoint.lng], { icon })
              .addTo(mapRef.current)
              .bindTooltip("🏁 Endpunkt", { permanent: true, direction: "top", className: "bg-black text-nite-accent border-none text-xs" });
          }
        }

        // Update player markers
        Object.entries(msg.locations as Record<string, LocationData | null>).forEach(([pid, loc]) => {
          if (!loc || !mapRef.current) return;
          const isMe = pid === playerId;
          const isSeeker = loc.role === "seeker";
          const color = isMe ? "#ffffff" : isSeeker ? "#ff4444" : "#4488ff";
          const size = isMe ? 16 : 12;

          if (!markersRef.current[pid]) {
            const icon = L.divIcon({
              html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid #000;box-shadow:0 0 6px ${color}"></div>`,
              iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: ""
            });
            markersRef.current[pid] = L.marker([loc.lat, loc.lng], { icon })
              .addTo(mapRef.current)
              .bindTooltip(loc.nickname, { permanent: false, direction: "top" });
          } else {
            markersRef.current[pid].setLatLng([loc.lat, loc.lng]);
          }
        });
      }

      if (msg.type === "game_over") setGameOver(msg);
      if (msg.type === "ping_start") setPingActive(true);
      if (msg.type === "ping_end") setPingActive(false);
    };

    return () => ws.close();
  }, [code, playerId]);

  const timeLeft = Math.max(0, total - elapsed);
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  const aliveHiders = Object.entries(players).filter(([, p]) => p.role === "hider" && p.status === "alive");
  const seekers = Object.entries(players).filter(([, p]) => p.role === "seeker");

  return (
    <div className="h-full flex flex-col relative">
      {/* Map */}
      <div ref={mapDivRef} className="flex-1 w-full" />

      {/* HUD — top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex items-start justify-between px-4 pt-4 gap-3 pointer-events-none">
        {/* Timer */}
        <div className={`bg-black/80 backdrop-blur rounded-2xl px-4 py-2 font-mono text-2xl font-bold pointer-events-auto ${timeLeft < 120 ? "text-nite-warn" : "text-white"}`}>
          {mm}:{ss}
        </div>

        {/* Ping indicator */}
        <div className={`bg-black/80 backdrop-blur rounded-2xl px-4 py-2 pointer-events-auto transition-all ${pingActive ? "border border-nite-accent" : "border border-transparent"}`}>
          {pingActive
            ? <span className="text-nite-accent font-mono text-sm font-bold animate-pulse">📡 ALLE SICHTBAR</span>
            : <span className="text-zinc-500 font-mono text-xs">Ping in {nextPingIn ?? "…"}s</span>
          }
        </div>

        {/* Role badge */}
        <div className={`bg-black/80 backdrop-blur rounded-2xl px-4 py-2 pointer-events-auto font-display font-bold text-sm ${myRole === "seeker" ? "text-nite-seeker" : "text-nite-hider"}`}>
          {myRole === "seeker" ? "🔍 SEEKER" : "🚲 HIDER"}
        </div>
      </div>

      {/* Seeker: Catch buttons */}
      {myRole === "seeker" && (
        <div className="absolute bottom-24 left-4 right-4 z-[1000]">
          <button
            onClick={() => setShowPlayerList(v => !v)}
            className="w-full bg-nite-seeker text-white font-display font-bold py-4 rounded-2xl text-lg shadow-lg"
          >
            🤚 Person fangen
          </button>
          {showPlayerList && (
            <div className="mt-2 bg-black/90 backdrop-blur rounded-2xl overflow-hidden">
              {aliveHiders.map(([pid, p]) => (
                <button
                  key={pid}
                  onClick={() => { initiateCatch(pid); setShowPlayerList(false); }}
                  className="w-full flex items-center justify-between px-5 py-4 border-b border-nite-border last:border-0 text-white hover:bg-white/5"
                >
                  <span className="font-display font-medium">{p.nickname}</span>
                  <span className="text-nite-seeker text-sm">Gefangen →</span>
                </button>
              ))}
              {aliveHiders.length === 0 && <p className="text-zinc-500 text-center py-4 text-sm">Keine Hider mehr aktiv</p>}
            </div>
          )}
        </div>
      )}

      {/* Hider: Catch confirmation prompt */}
      {pendingCatch && myRole === "hider" && (
        <div className="absolute inset-0 bg-black/70 z-[2000] flex items-center justify-center px-6">
          <div className="bg-nite-surface border border-nite-seeker rounded-3xl p-6 w-full max-w-sm">
            <p className="text-lg font-display font-bold text-center mb-1">Wurdest du gefangen?</p>
            <p className="text-zinc-400 text-center text-sm mb-6">
              <span className="text-nite-seeker font-medium">{pendingCatch.seeker_name}</span> behauptet, dich gefangen zu haben
            </p>
            <div className="flex gap-3">
              <button onClick={() => confirmCatch(false)} className="flex-1 py-3 rounded-xl bg-nite-border text-white font-display font-medium">Nein ✋</button>
              <button onClick={() => confirmCatch(true)} className="flex-1 py-3 rounded-xl bg-nite-seeker text-white font-display font-bold">Ja, erwischt</button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameOver && (
        <div className="absolute inset-0 bg-black/85 z-[3000] flex items-center justify-center px-6">
          <div className="bg-nite-surface border border-nite-border rounded-3xl p-8 w-full max-w-sm text-center">
            <p className="text-5xl mb-4">{gameOver.reason === "all_caught" ? "🔍" : "🏁"}</p>
            <h2 className="font-display text-2xl font-bold mb-2">
              {gameOver.reason === "all_caught" ? "Alle gefangen!" : "Zeit abgelaufen!"}
            </h2>
            {gameOver.survivors && (
              <p className="text-zinc-400 text-sm mb-6">Überlebt: {gameOver.survivors.join(", ")}</p>
            )}
            <button
              onClick={() => navigate("/")}
              className="w-full bg-nite-accent text-black font-display font-bold py-4 rounded-2xl text-lg"
            >
              Zurück zur Startseite
            </button>
          </div>
        </div>
      )}

      {/* My status overlay (caught/out) */}
      {myStatus === "caught" && myRole === "hider" && (
        <div className="absolute bottom-4 left-4 right-4 z-[1000] bg-nite-seeker/20 border border-nite-seeker rounded-2xl px-5 py-4 text-center">
          <p className="text-nite-seeker font-display font-bold">Du wurdest gefangen 😵</p>
          <p className="text-zinc-400 text-sm">Du schaust jetzt zu</p>
        </div>
      )}
    </div>
  );
}
