import React, { useMemo, useState } from "react";
import { loadPlayers, savePlayers, loadSessions, upsertSession, deleteSession } from "./storage";
import type { Match, Player, Session, Rules, WindSeat } from "./types";
import { uid, recomputeMatchFromScratch } from "./logic/mahjong";

import Home from "./pages/Home";
import PlayersPage from "./pages/PlayersPage";
import NewMatchPage from "./pages/NewMatchPage";
import MatchPage from "./pages/MatchPage";
import MatchEndPage from "./pages/MatchEndPage";
import StatsPage from "./pages/StatsPage";

type Route =
  | { name: "home" }
  | { name: "players" }
  | { name: "newSession" }
  | { name: "seatSelect"; sessionId: string }
  | { name: "match"; sessionId: string; matchId: string }
  | { name: "end"; sessionId: string; matchId: string }
  | { name: "stats" };

type PlayerIdBySeat = { ids: string[]; names: string[] };

function todayDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [players, setPlayers] = useState<Player[]>(() => loadPlayers());
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());

  function nav(r: Route) {
    setRoute(r);
  }

  function persistPlayers(next: Player[]) {
    setPlayers(next);
    savePlayers(next);
  }

  function persistSession(next: Session) {
    const exists = sessions.some((s) => s.id === next.id);
    const list = exists ? sessions.map((s) => (s.id === next.id ? next : s)) : [next, ...sessions];
    setSessions(list);
    upsertSession(next);
  }

  function removeSession(sessionId: string) {
    setSessions(sessions.filter((s) => s.id !== sessionId));
    deleteSession(sessionId);
    if ("sessionId" in route && (route as any).sessionId === sessionId) {
      setRoute({ name: "home" });
    }
  }

  const activeSession = useMemo(() => {
    if ("sessionId" in route) {
      return sessions.find((s) => s.id === (route as any).sessionId) ?? null;
    }
    return null;
  }, [route, sessions]);

  const activeMatch = useMemo(() => {
    if ((route.name === "match" || route.name === "end") && activeSession) {
      return activeSession.games.find((g) => g.id === route.matchId) ?? null;
    }
    return null;
  }, [route, activeSession]);

  // -------------------- create session --------------------
  function createSession(payload: { participantIds: string[]; participantNames: string[]; rules: Rules }) {
    const s: Session = {
      id: uid("session"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dateKey: todayDateKey(),
      rules: payload.rules,
      participantIds: payload.participantIds,
      participantNames: payload.participantNames,
      games: [],
      ended: false,
    };
    persistSession(s);
    setRoute({ name: "seatSelect", sessionId: s.id });
  }

  // -------------------- create match in session --------------------
  function createMatchInSession(sessionId: string, seats: PlayerIdBySeat) {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;

    const gm = s.rules.gameMode;

    const sp = Number(s.rules.startPoints ?? 25000);
    // 3麻は北を0点（欠け）にして、順位判定などで混ざらないようにする
    const initScores =
      gm === "sanma" ? ([sp, sp, sp, 0] as number[]) : ([sp, sp, sp, sp] as number[]);

    const match: Match = {
      id: uid("match"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      seats: seats.ids, // 3麻は [E,S,W,""]
      seatNames: seats.names, // 3麻は [..,"欠け"]
      kichyaSeat: 0,
      initialScores: [...initScores],
      logs: [],
      adjustments: [],
      currentRound: { stage: "E", num: 1, honba: 0 },
      currentDealer: 0 as WindSeat,
      currentRiichiPot: 0,
      currentScores: [...initScores],
      ended: false,
      tobiRule: s.rules?.tobiRule,
      // ★ match.rules にセッションルールをコピー（mahjong.ts が参照）
      rules: {
        gameMode: s.rules.gameMode,
        startPoints: s.rules.startPoints,
        returnPoints: s.rules.returnPoints,
        tobiRule: s.rules.tobiRule,
        // 3麻/4人3麻 共通パラメータ（概要書に合わせる）
        notenTotal: 2000,
        honbaUnit: 1000,
      },
    };

    const nextSession: Session = {
      ...s,
      updatedAt: Date.now(),
      games: [...s.games, match],
      ended: false,
      endReason: undefined,
    };

    persistSession(nextSession);
    setRoute({ name: "match", sessionId: s.id, matchId: match.id });
  }

  // -------------------- update match inside session --------------------
  function persistMatchInSession(sessionId: string, nextMatch: Match) {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;

    const games = s.games.map((g) => (g.id === nextMatch.id ? nextMatch : g));
    const nextSession: Session = { ...s, updatedAt: Date.now(), games };
    persistSession(nextSession);
  }

  function updateMatchRecomputed(sessionId: string, m: Match) {
    const recomputed = recomputeMatchFromScratch(m);
    persistMatchInSession(sessionId, recomputed);
    return recomputed;
  }

  function endSession(sessionId: string) {
    const s = sessions.find((x) => x.id === sessionId);
    if (!s) return;
    const next: Session = { ...s, updatedAt: Date.now(), ended: true, endReason: "対局終了" };
    persistSession(next);
    setRoute({ name: "home" });
  }

  // ★④対策：ホームから「開く」で直前のゲームに復帰する
  function getResumeRoute(s: Session): Route {
    const games = s.games ?? [];
    if (games.length === 0) return { name: "seatSelect", sessionId: s.id };

    // 最後に更新されたゲームを優先して再開
    const last = games
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))[0];

    if (!last) return { name: "seatSelect", sessionId: s.id };

    return last.ended
      ? { name: "end", sessionId: s.id, matchId: last.id }
      : { name: "match", sessionId: s.id, matchId: last.id };
  }

  const matchesForStats = useMemo(() => sessions.flatMap((s) => s.games ?? []), [sessions]);

  return (
    <div className="container">
      {route.name === "home" && (
        <Home
          players={players}
          sessions={sessions}
          onPlayers={() => nav({ name: "players" })}
          onNewSession={() => nav({ name: "newSession" })}
          onOpenSession={(id) => {
            const s = sessions.find((x) => x.id === id);
            if (!s) return;
            nav(getResumeRoute(s));
          }}
          onDeleteSession={(id) => removeSession(id)}
          onStats={() => nav({ name: "stats" })}
        />
      )}

      {route.name === "players" && (
        <PlayersPage players={players} onBack={() => nav({ name: "home" })} onSave={persistPlayers} />
      )}

      {route.name === "newSession" && (
        <NewMatchPage
          mode="newSession"
          players={players}
          onBack={() => nav({ name: "home" })}
          onCreateSession={createSession}
        />
      )}

      {route.name === "seatSelect" && activeSession && (
        <NewMatchPage
          mode="seatSelect"
          players={players}
          session={activeSession}
          onBack={() => nav({ name: "home" })}
          onCreateMatch={(seats) => createMatchInSession(activeSession.id, seats)}
        />
      )}

      {route.name === "match" && activeSession && activeMatch && (
        <MatchPage
          players={players}
          match={activeMatch}
          onBack={() => nav({ name: "home" })}
          onPersist={(m) => persistMatchInSession(activeSession.id, m)}
          onEnd={() => nav({ name: "end", sessionId: activeSession.id, matchId: activeMatch.id })}
          onRecompute={(m) => updateMatchRecomputed(activeSession.id, m)}
        />
      )}

      {route.name === "end" && activeSession && activeMatch && (
        <MatchEndPage
          players={players}
          session={activeSession}
          match={activeMatch}
          onBackHome={() => nav({ name: "home" })}
          onEdit={() => nav({ name: "match", sessionId: activeSession.id, matchId: activeMatch.id })}
          onNextGame={() => nav({ name: "seatSelect", sessionId: activeSession.id })}
          onEndSession={() => endSession(activeSession.id)}
          onDeleteSession={() => removeSession(activeSession.id)}
          onStats={() => nav({ name: "stats" })}
        />
      )}

      {route.name === "stats" && (
        <StatsPage matches={matchesForStats} players={players} onBack={() => nav({ name: "home" })} />
      )}
    </div>
  );
}
