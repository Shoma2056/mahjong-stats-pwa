import { db, ensureAnonAuth } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getRoomId } from "./roomLocal";
import type { Match, Player, Session } from "./types";
import { onSnapshot } from "firebase/firestore";

const KEY_PLAYERS = "mj_players_v1";

// legacy（残す：過去互換）
const KEY_MATCHES = "mj_matches_v1";

// new
const KEY_SESSIONS = "mj_sessions_v1";

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
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
export function subscribePlayers(roomId: string, onChange: (players: Player[]) => void) {
  if (!roomId) {
    onChange([]);
    return () => {};
  }

  let unsub: (() => void) | null = null;
  let cancelled = false;

  (async () => {
    await ensureAnonAuth();
    if (cancelled) return;

    const ref = doc(db, "rooms", roomId);
    unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() as any) : {};
      onChange((data.players ?? []) as Player[]);
    });
  })();

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// -------------------- Sessions (new) --------------------
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

export async function saveSessions(sessions: Session[]) {
  const roomId = getRoomId();
  if (!roomId) throw new Error("roomId が未設定です");

  await ensureAnonAuth();
  const ref = doc(db, "rooms", roomId);
  await setDoc(ref, { sessions }, { merge: true });
}

export async function upsertSession(session: Session) {
  const sessions = await loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  await saveSessions(sessions);
}

export async function deleteSession(sessionId: string) {
  const sessions = (await loadSessions()).filter((s) => s.id !== sessionId);
  await saveSessions(sessions);
}

// -------------------- Sessions (realtime subscribe) --------------------
export function subscribeSessions(roomId: string, onChange: (sessions: Session[]) => void) {
  if (!roomId) {
    onChange([]);
    return () => {};
  }

  let unsub: (() => void) | null = null;
  let cancelled = false;

  (async () => {
    await ensureAnonAuth();
    if (cancelled) return;

    const ref = doc(db, "rooms", roomId);
    unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? (snap.data() as any) : {};
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
  const idx = matches.findIndex(m => m.id === match.id);
  if (idx >= 0) matches[idx] = match;
  else matches.unshift(match);
  saveMatches(matches);
}
export function deleteMatch(matchId: string) {
  const matches = loadMatches().filter(m => m.id !== matchId);
  saveMatches(matches);
}
