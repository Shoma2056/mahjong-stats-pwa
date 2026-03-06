import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  savePlayers,
  upsertSession,
  deleteSession,
  subscribePlayers,
  subscribeSessions,
} from "./storage";
import type { Match, Player, Session, Rules, WindSeat } from "./types";
import { uid, recomputeMatchFromScratch } from "./logic/mahjong";

import Home from "./pages/Home";
import PlayersPage from "./pages/PlayersPage";
import NewMatchPage from "./pages/NewMatchPage";
import MatchPage from "./pages/MatchPage";
import MatchEndPage from "./pages/MatchEndPage";
import StatsPage from "./pages/StatsPage";
import SettingsPage from "./pages/SettingsPage";

import { getRoomId, getNick } from "./roomLocal";

type Route =
  | { name: "home" }
  | { name: "players" }
  | { name: "newSession" }
  | { name: "session"; sessionId: string }
  | { name: "stats" }
  | { name: "settings" };

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
  const [players, setPlayers] = useState<Player[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [roomId, setRoomIdState] = useState<string>(() => getRoomId());
  const [nick, setNickState] = useState<string>(() => getNick());

  const sessionsRef = useRef<Session[]>([]);
  const playersRef = useRef<Player[]>([]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    const unsubP = subscribePlayers(roomId, (p) => setPlayers(p));
    return () => unsubP();
  }, [roomId]);

  useEffect(() => {
    const unsubS = subscribeSessions(roomId, (s) => setSessions(s));
    return () => unsubS();
  }, [roomId]);

  function nav(r: Route) {
    setRoute(r);
  }

  async function persistPlayers(next: Player[]) {
    setPlayers(next);
    playersRef.current = next;
    await savePlayers(next);
  }

async function persistSession(next: Session) {
  setSessions((prev) => {
    const exists = prev.some((s) => s.id === next.id);
    const nextList = exists
      ? prev.map((s) => (s.id === next.id ? next : s))
      : [next, ...prev];

    sessionsRef.current = nextList;
    return nextList;
  });

  try {
    await upsertSession(next);
    console.log("[persistSession] saved", next.id);
  } catch (e) {
    console.error("[persistSession] save failed", e);
  }
}

  async function removeSession(sessionId: string) {
  setSessions((prev) => {
    const nextList = prev.filter((s) => s.id !== sessionId);
    sessionsRef.current = nextList;
    return nextList;
  });

  await deleteSession(sessionId);

  if (route.name === "session" && route.sessionId === sessionId) {
    setRoute({ name: "home" });
  }
}

  const activeSession = useMemo(() => {
    if (route.name !== "session") return null;
    return sessions.find((s) => s.id === route.sessionId) ?? null;
  }, [route, sessions]);

  const activeMatch = useMemo(() => {
    if (!activeSession) return null;
    const currentMatchId = activeSession.currentMatchId;
    if (!currentMatchId) return null;
    return (activeSession.games ?? []).find((g) => g.id === currentMatchId) ?? null;
  }, [activeSession]);

  // 共有された phase に応じて、session 画面を開いている端末は自動で同じ画面に揃う
  useEffect(() => {
    if (route.name !== "session") return;
    if (!activeSession) return;

    if (activeSession.phase === "closed" || activeSession.ended) {
      setRoute({ name: "home" });
    }
  }, [route, activeSession]);

  function createSession(payload: {
    participantIds: string[];
    participantNames: string[];
    rules: Rules;
  }) {
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
  phase: "seatSelect",
};

    void persistSession(s);
    setRoute({ name: "session", sessionId: s.id });
  }

  function createMatchInSession(sessionId: string, seats: PlayerIdBySeat) {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;

    const gm = s.rules.gameMode;
    const sp = Number(s.rules.startPoints ?? 25000);

    const initScores =
      gm === "sanma" ? ([sp, sp, sp, 0] as number[]) : ([sp, sp, sp, sp] as number[]);

    const match: Match = {
      id: uid("match"),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      seats: seats.ids,
      seatNames: seats.names,
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
      rules: {
        gameMode: s.rules.gameMode,
        startPoints: s.rules.startPoints,
        returnPoints: s.rules.returnPoints,
        tobiRule: s.rules.tobiRule,
        notenTotal: 2000,
        honbaUnit: 1000,
      },
    };

    const nextSession: Session = {
  ...s,
  updatedAt: Date.now(),
  games: [...(s.games ?? []), match],
  ended: false,
  phase: "match",
  currentMatchId: match.id,
};
delete (nextSession as any).endReason;

    void persistSession(nextSession);
  }

  async function persistMatchInSession(sessionId: string, nextMatch: Match) {
  const s = sessionsRef.current.find((x) => x.id === sessionId);
  if (!s) return;

  const games = (s.games ?? []).map((g) => (g.id === nextMatch.id ? nextMatch : g));

  const nextSession: Session = {
    ...s,
    updatedAt: Date.now(),
    games,
    currentMatchId: s.currentMatchId ?? nextMatch.id,
  };

  await persistSession(nextSession);
}

  function updateMatchRecomputed(sessionId: string, m: Match) {
    const recomputed = recomputeMatchFromScratch(m);
    void persistMatchInSession(sessionId, recomputed);
    return recomputed;
  }

  async function goToEnd(sessionId: string) {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;

    const currentMatchId = s.currentMatchId;
    if (!currentMatchId) return;

    const games = (s.games ?? []).map((g) =>
      g.id === currentMatchId ? { ...g, ended: true, updatedAt: Date.now() } : g
    );

    const nextSession: Session = {
      ...s,
      updatedAt: Date.now(),
      games,
      phase: "end",
      currentMatchId,
    };

    await persistSession(nextSession);
  }

  async function goToMatch(sessionId: string, matchId: string) {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;

    const nextSession: Session = {
      ...s,
      updatedAt: Date.now(),
      phase: "match",
      currentMatchId: matchId,
    };

    await persistSession(nextSession);
  }

  async function goToSeatSelect(sessionId: string) {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;

    const nextSession: Session = {
      ...s,
      updatedAt: Date.now(),
      phase: "seatSelect",
      currentMatchId: undefined,
    };

    await persistSession(nextSession);
  }

  async function endSession(sessionId: string) {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    if (!s) return;

   const next: Session = {
  ...s,
  updatedAt: Date.now(),
  ended: true,
  endReason: "対局終了",
  phase: "closed",
};

    await persistSession(next);
    setRoute({ name: "home" });
  }

  const matchesForStats = useMemo(
    () => sessions.flatMap((s) => s.games ?? []),
    [sessions]
  );

  return (
    <div className="container">
      {route.name === "home" && (
        <Home
          players={players}
          sessions={sessions}
          onPlayers={() => nav({ name: "players" })}
          onNewSession={() => nav({ name: "newSession" })}
          onOpenSession={(id) => {
            nav({ name: "session", sessionId: id });
          }}
          onDeleteSession={(id) => {
            void removeSession(id);
          }}
          onStats={() => nav({ name: "stats" })}
          onSettings={() => nav({ name: "settings" })}
        />
      )}

      {route.name === "players" && (
        <PlayersPage
          players={players}
          onBack={() => nav({ name: "home" })}
          onSave={persistPlayers}
        />
      )}

      {route.name === "newSession" && (
        <NewMatchPage
          mode="newSession"
          players={players}
          onBack={() => nav({ name: "home" })}
          onCreateSession={createSession}
        />
      )}

      {route.name === "session" &&
        activeSession &&
        activeSession.phase === "seatSelect" && (
          <NewMatchPage
            mode="seatSelect"
            players={players}
            session={activeSession}
            onBack={() => nav({ name: "home" })}
            onCreateMatch={(seats) => createMatchInSession(activeSession.id, seats)}
          />
        )}

      {route.name === "session" &&
        activeSession &&
        activeSession.phase === "match" &&
        activeMatch && (
          <MatchPage
            players={players}
            match={activeMatch}
            onBack={() => nav({ name: "home" })}
            onPersist={(m) => persistMatchInSession(activeSession.id, m)}
            onEnd={() => {
              void goToEnd(activeSession.id);
            }}
            onRecompute={(m) => updateMatchRecomputed(activeSession.id, m)}
          />
        )}

      {route.name === "session" &&
        activeSession &&
        activeSession.phase === "end" &&
        activeMatch && (
          <MatchEndPage
            players={players}
            session={activeSession}
            match={activeMatch}
            onBackHome={() => nav({ name: "home" })}
            onEdit={() => {
              void goToMatch(activeSession.id, activeMatch.id);
            }}
            onNextGame={() => {
              void goToSeatSelect(activeSession.id);
            }}
            onEndSession={() => {
              void endSession(activeSession.id);
            }}
            onDeleteSession={() => {
              void removeSession(activeSession.id);
            }}
            onStats={() => nav({ name: "stats" })}
          />
        )}

      {route.name === "stats" && (
        <StatsPage
          matches={matchesForStats}
          players={players}
          onBack={() => nav({ name: "home" })}
        />
      )}

      {route.name === "settings" && (
        <SettingsPage
          onBack={() => nav({ name: "home" })}
          onApply={(r, n) => {
            setRoomIdState(r);
            setNickState(n);
          }}
        />
      )}
    </div>
  );
}