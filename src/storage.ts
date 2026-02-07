import type { Match, Player, Session } from "./types";

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
export function loadPlayers(): Player[] {
  return safeParse<Player[]>(localStorage.getItem(KEY_PLAYERS), []);
}
export function savePlayers(players: Player[]) {
  localStorage.setItem(KEY_PLAYERS, JSON.stringify(players));
}

// -------------------- Sessions (new) --------------------
export function loadSessions(): Session[] {
  return safeParse<Session[]>(localStorage.getItem(KEY_SESSIONS), []);
}
export function saveSessions(sessions: Session[]) {
  localStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions));
}
export function upsertSession(session: Session) {
  const sessions = loadSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) sessions[idx] = session;
  else sessions.unshift(session);
  saveSessions(sessions);
}
export function deleteSession(sessionId: string) {
  const sessions = loadSessions().filter(s => s.id !== sessionId);
  saveSessions(sessions);
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
