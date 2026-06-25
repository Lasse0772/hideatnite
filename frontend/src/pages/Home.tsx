import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(localStorage.getItem("han_nickname") || "");
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"home" | "join">("home");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const saveNickname = (n: string) => {
    setNickname(n);
    if (n) localStorage.setItem("han_nickname", n);
  };

  const createLobby = async () => {
    if (!nickname.trim()) { setError("Gib einen Nickname ein"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/lobby/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      localStorage.setItem("han_player_id", data.player_id);
      localStorage.setItem("han_lobby", data.lobby_code);
      navigate(`/lobby/${data.lobby_code}`);
    } catch {
      setError("Fehler beim Erstellen");
    } finally { setLoading(false); }
  };

  const joinLobby = async () => {
    if (!nickname.trim()) { setError("Gib einen Nickname ein"); return; }
    if (!code.trim()) { setError("Gib einen Lobby-Code ein"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, lobby_code: code.toUpperCase() }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail); }
      const data = await res.json();
      localStorage.setItem("han_player_id", data.player_id);
      localStorage.setItem("han_lobby", data.lobby_code);
      navigate(`/lobby/${data.lobby_code}`);
    } catch (e: any) {
      setError(e.message || "Lobby nicht gefunden");
    } finally { setLoading(false); }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 gap-8 bg-nite-bg">
      {/* Logo */}
      <div className="text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight">
          Hide<span className="text-nite-accent"> @ </span>Nite
        </h1>
        <p className="text-zinc-500 mt-2 text-sm font-mono">GPS · Fahrrad · Fangen</p>
      </div>

      {/* Nickname */}
      <div className="w-full max-w-sm flex flex-col gap-3">
        <input
          className="w-full bg-nite-surface border border-nite-border rounded-xl px-4 py-3 text-white placeholder-zinc-600 font-display focus:outline-none focus:border-nite-accent transition-colors"
          placeholder="Dein Nickname"
          value={nickname}
          onChange={e => saveNickname(e.target.value)}
          maxLength={20}
        />

        {mode === "join" && (
          <input
            className="w-full bg-nite-surface border border-nite-border rounded-xl px-4 py-3 text-white placeholder-zinc-600 font-mono text-lg tracking-widest uppercase focus:outline-none focus:border-nite-accent transition-colors"
            placeholder="LOBBY-CODE"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {mode === "home" ? (
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={createLobby}
              disabled={loading}
              className="w-full bg-nite-accent text-black font-display font-bold py-4 rounded-xl text-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? "..." : "Lobby erstellen"}
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full bg-nite-surface border border-nite-border text-white font-display font-medium py-4 rounded-xl text-lg hover:border-zinc-400 active:scale-95 transition-all"
            >
              Lobby beitreten
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={joinLobby}
              disabled={loading}
              className="w-full bg-nite-accent text-black font-display font-bold py-4 rounded-xl text-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? "..." : "Beitreten"}
            </button>
            <button
              onClick={() => { setMode("home"); setError(""); }}
              className="w-full text-zinc-500 font-display py-2 text-sm"
            >
              ← Zurück
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
