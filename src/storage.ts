import { db, ensureAnonAuth } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
} from "firebase/firestore";
import { getRoomId } from "./roomLocal";
import type { Match, Player, Session } from "./types";

const KEY_MATCHES = "mj_matches_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        result[key] = stripUndefined(v);
      }
    }
    return result as T;
  }

  return value;
}

// -------------------- Players --------------------
export async function loadPlayers(): Promise<Player[]> {
  const roomId = getRoomId();
  if (!roomId) return [];

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];

  const data = snap.data() as any;
  return (data.players ?? []) as Player[];
}

export async function savePlayers(players: Player[]) {
  const roomId = getRoomId();
  if (!roomId) throw new Error("roomId が未設定です");

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);
  await setDoc(ref, { players }, { merge: true });
}

// -------------------- Players (realtime subscribe) --------------------
export function subscribePlayers(
  roomId: string,
  onChange: (players: Player[]) => void
) {
  if (!roomId) {
    onChange([]);
    return () => {};
  }

  let unsub: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    await ensureAnonAuth();
    if (cancelled) return;

    const ref = doc(db, "rooms", roomId);
    unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() as any;

      // players フィールドが無い場合は更新しない
      if (!("players" in data)) return;

      onChange((data.players ?? []) as Player[]);
    });
  })();

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// -------------------- Sessions --------------------
export async function loadSessions(): Promise<Session[]> {
  const roomId = getRoomId();
  if (!roomId) return [];

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];

  const data = snap.data() as any;
  return (data.sessions ?? []) as Session[];
}

/**
 * 旧: 配列丸ごと保存
 * 今後は原則使わない
 */
type SaveSessionsOptions = {
  allowEmpty?: boolean;
};

export async function saveSessions(
  sessions: Session[],
  options?: SaveSessionsOptions
) {
  const roomId = getRoomId();
  if (!roomId) throw new Error("roomId が未設定です");

  if (!Array.isArray(sessions)) {
    throw new Error("saveSessions: sessions が配列ではありません");
  }

  const allowEmpty = options?.allowEmpty ?? false;
  if (!allowEmpty && sessions.length === 0) {
    console.warn("[saveSessions] 空配列保存をブロックしました");
    return;
  }

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);

  const cleanedSessions = stripUndefined(sessions);
  await setDoc(ref, { sessions: cleanedSessions }, { merge: true });
}

/**
 * Firestore 上の最新 sessions を読んで、
 * session.id の1件だけ upsert する
 */
export async function upsertSession(session: Session) {
  const roomId = getRoomId();
  if (!roomId) throw new Error("roomId が未設定です");

  console.log("[upsertSession] start", {
    roomId,
    sessionId: session.id,
    phase: session.phase,
  });

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? (snap.data() as any) : {};
    const prev = (data.sessions ?? []) as Session[];

    console.log("[upsertSession] before", {
      roomId,
      prevCount: prev.length,
      prevIds: prev.map((s) => s.id),
    });

    const cleanedSession = stripUndefined(session);

    const exists = prev.some((s) => s.id === cleanedSession.id);
    const next = exists
      ? prev.map((s) => (s.id === cleanedSession.id ? cleanedSession : s))
      : [cleanedSession, ...prev];

    const cleanedNext = stripUndefined(next);

    console.log("[upsertSession] after", {
      roomId,
      nextCount: cleanedNext.length,
      nextIds: cleanedNext.map((s) => s.id),
    });

    tx.set(ref, { sessions: cleanedNext }, { merge: true });
  });

  console.log("[upsertSession] done", {
    roomId,
    sessionId: session.id,
  });
}

/**
 * Firestore 上の最新 sessions を読んで、
 * sessionId の1件だけ削除する
 */
export async function deleteSession(sessionId: string) {
  const roomId = getRoomId();
  if (!roomId) throw new Error("roomId が未設定です");

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? (snap.data() as any) : {};
    const prev = (data.sessions ?? []) as Session[];

    const next = prev.filter((s) => s.id !== sessionId);
    const cleanedNext = stripUndefined(next);

    tx.set(ref, { sessions: cleanedNext }, { merge: true });
  });
}

// -------------------- Sessions (realtime subscribe) --------------------
export function subscribeSessions(
  roomId: string,
  onChange: (sessions: Session[]) => void
) {
  if (!roomId) {
    console.log("[subscribeSessions] roomId empty");
    onChange([]);
    return () => {};
  }

  let unsub: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    await ensureAnonAuth();
    if (cancelled) return;

    const ref = doc(db, "rooms", roomId);
    unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        console.log("[subscribeSessions] doc not exists", { roomId });
        return;
      }

      const data = snap.data() as any;

      if (!("sessions" in data)) {
        console.log("[subscribeSessions] sessions field missing", {
          roomId,
          data,
        });
        return;
      }

      console.log("[subscribeSessions] receive", {
        roomId,
        count: (data.sessions ?? []).length,
        ids: ((data.sessions ?? []) as Session[]).map((s) => s.id),
      });

      onChange((data.sessions ?? []) as Session[]);
    });
  })();

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}
// -------------------- Legacy matches (keep) --------------------
export function loadMatches(): Match[] {
  return safeParse<Match[]>(localStorage.getItem(KEY_MATCHES), []);
}

export function saveMatches(matches: Match[]) {
  localStorage.setItem(KEY_MATCHES, JSON.stringify(matches));
}

export function upsertMatch(match: Match) {
  const matches = loadMatches();
  const idx = matches.findIndex((m) => m.id === match.id);
  if (idx >= 0) matches[idx] = match;
  else matches.unshift(match);
  saveMatches(matches);
}

export function deleteMatch(matchId: string) {
  const matches = loadMatches().filter((m) => m.id !== matchId);
  saveMatches(matches);
}