import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type Player = { nickname: string; role: string };
type Settings = {
  game_mode: string;
  start_radius_km: number;
  end_radius_km: number;
  round_duration_minutes: number;
  seeker_count: number;
  ping_interval_seconds: number;
  ping_duration_seconds: number;
  out_of_zone_seconds: number;
  endpoint_hold_seconds: number;
  endpoint_random: boolean;
};

export default function LobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const playerId = localStorage.getItem("han_player_id") || "";
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [hostId, setHostId] = useState("");
  const [settings, setSettings] = useState<Settings>({
    game_mode: "elimination",
    start_radius_km: 5,
    end_radius_km: 0.5,
    round_duration_minutes: 30,
    seeker_count: 1,
    ping_interval_seconds: 120,
    ping_duration_seconds: 10,
    out_of_zone_seconds: 60,
    endpoint_hold_seconds: 60,
    endpoint_random: true,
  });
  const [ws, setWs] = useState<WebSocket | null>(null);
  const isHost = playerId === hostId;

  useEffect(() => {
    fetch(`/api/lobby/${code}`)
      .then(r => r.json())
      .then(d => {
        setPlayers(d.players);
        setHostId(d.host_id);
        setSettings(d.settings);
      });

    const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${code}/${playerId}`);
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "player_joined" || msg.type === "player_left") {
        fetch(`/api/lobby/${code}`).then(r => r.json()).then(d => setPlayers(d.players));
      }
      if (msg.type === "game_started") {
        navigate(`/game/${code}`);
      }
    };
    setWs(socket);
    return () => socket.close();
  }, [code]);

  const saveSettings = async () => {
    await fetch("/api/lobby/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_id: playerId, settings }),
    });
  };

  const startGame = async () => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await saveSettings();
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      });
      if (res.ok) {
        ws?.send(JSON.stringify({ type: "game_started" }));
        navigate(`/game/${code}`);
      }
    });
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-3 border-b border-nite-border last:border-0">
      <span className="text-zinc-400 text-sm">{label}</span>
      <div className="text-white font-medium">{children}</div>
    </div>
  );

  const Stepper = ({ value, min, max, step = 1, onChange }: any) => (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - step))} className="w-8 h-8 rounded-lg bg-nite-border text-white text-lg flex items-center justify-center">−</button>
      <span className="w-12 text-center font-mono">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} className="w-8 h-8 rounded-lg bg-nite-border text-white text-lg flex items-center justify-center">+</button>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-nite-bg overflow-y-auto">
      <div className="px-5 pt-8 pb-4">
        <p className="text-zinc-500 text-xs font-mono mb-1">LOBBY CODE</p>
        <h1 className="font-display text-4xl font-bold tracking-widest text-nite-accent">{code}</h1>
        <p className="text-zinc-500 text-sm mt-1">Teile diesen Code mit deinen Freunden</p>
      </div>

      {/* Spieler */}
      <div className="mx-5 bg-nite-surface border border-nite-border rounded-2xl p-4 mb-4">
        <p className="text-xs font-mono text-zinc-500 mb-3">SPIELER ({Object.keys(players).length})</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(players).map(([pid, p]) => (
            <div key={pid} className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${pid === hostId ? "bg-nite-accent text-black" : "bg-nite-border text-white"}`}>
              {pid === hostId && <span>👑</span>}
              {p.nickname}
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="mx-5 bg-nite-surface border border-nite-border rounded-2xl p-4 mb-4">
        <p className="text-xs font-mono text-zinc-500 mb-1">EINSTELLUNGEN</p>
        {!isHost && <p className="text-zinc-600 text-xs mb-3">Nur der Host kann Einstellungen ändern</p>}

        {/* Gamemode */}
        <div className="flex gap-2 mt-3 mb-1">
          {["elimination", "infection"].map(m => (
            <button
              key={m}
              disabled={!isHost}
              onClick={() => setSettings(s => ({ ...s, game_mode: m }))}
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-medium transition-all ${settings.game_mode === m ? (m === "elimination" ? "bg-nite-seeker text-white" : "bg-nite-warn text-black") : "bg-nite-border text-zinc-400"} disabled:cursor-not-allowed`}
            >
              {m === "elimination" ? "💀 Elimination" : "🦠 Infektion"}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <Row label="Startradius (km)">
            <Stepper value={settings.start_radius_km} min={0.5} max={20} step={0.5} onChange={(v: number) => isHost && setSettings(s => ({ ...s, start_radius_km: v }))} />
          </Row>
          <Row label="Endradius (km)">
            <Stepper value={settings.end_radius_km} min={0.1} max={2} step={0.1} onChange={(v: number) => isHost && setSettings(s => ({ ...s, end_radius_km: v }))} />
          </Row>
          <Row label="Rundenzeit (min)">
            <Stepper value={settings.round_duration_minutes} min={5} max={120} step={5} onChange={(v: number) => isHost && setSettings(s => ({ ...s, round_duration_minutes: v }))} />
          </Row>
          <Row label="Anzahl Seeker">
            <Stepper value={settings.seeker_count} min={1} max={Math.max(1, Object.keys(players).length - 1)} step={1} onChange={(v: number) => isHost && setSettings(s => ({ ...s, seeker_count: v }))} />
          </Row>
          <Row label="Ping alle (Sek)">
            <Stepper value={settings.ping_interval_seconds} min={30} max={300} step={30} onChange={(v: number) => isHost && setSettings(s => ({ ...s, ping_interval_seconds: v }))} />
          </Row>
          <Row label="Ping sichtbar (Sek)">
            <Stepper value={settings.ping_duration_seconds} min={3} max={30} step={1} onChange={(v: number) => isHost && setSettings(s => ({ ...s, ping_duration_seconds: v }))} />
          </Row>
          <Row label="Out-of-Zone (Sek)">
            <Stepper value={settings.out_of_zone_seconds} min={15} max={180} step={15} onChange={(v: number) => isHost && setSettings(s => ({ ...s, out_of_zone_seconds: v }))} />
          </Row>
          <Row label="Endpunkt halten (Sek)">
            <Stepper value={settings.endpoint_hold_seconds} min={10} max={120} step={10} onChange={(v: number) => isHost && setSettings(s => ({ ...s, endpoint_hold_seconds: v }))} />
          </Row>
        </div>
      </div>

      {/* Start button */}
      <div className="px-5 pb-8">
        {isHost ? (
          <button
            onClick={startGame}
            disabled={Object.keys(players).length < 2}
            className="w-full bg-nite-accent text-black font-display font-bold py-4 rounded-2xl text-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
          >
            Spiel starten →
          </button>
        ) : (
          <div className="text-center text-zinc-500 text-sm py-4 font-mono">Warten auf Host…</div>
        )}
      </div>
    </div>
  );
}
