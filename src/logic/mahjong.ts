// # ======================================================================
// # mahjong.ts（雀スタ：麻雀対局のコア計算）
// # - 4麻（yonma）
// # - 3麻（sanma：北固定欠け）※東3→南3（最終局=南3）
// # - 4人3麻（yonma_sanma4：欠けが回る）※局進行は現状維持（東4→南4）
// # 追加：4人3麻の特殊ルール
// #   - 供託は「立直していない和了者」は回収できず持ち越し
// #   - ただしその和了で終局なら「アガリ取り」で和了者が供託総取り（案1）
// # ======================================================================

import type {
  AdjustmentLog,
  KyokuAction,
  KyokuLog,
  KyokuResult,
  Match,
  PointsInputTsumo,
  RoundPos,
  WindSeat,
} from "../types";

// ------------------------------------------------------------
// 追加：ルール（match.rules が無い古いデータは 4麻扱い）
// ------------------------------------------------------------
type GameMode = "yonma" | "sanma" | "yonma_sanma4";

type RulesLike = {
  gameMode?: GameMode;
  startPoints?: number;
  returnPoints?: number;
  notenTotal?: number;
  honbaUnit?: number;
  tobiRule?: "leq0" | "lt0" | "none";
};

function getRules(match: Match): RulesLike {
  const r = (match as any).rules as RulesLike | undefined;
  return r ?? { gameMode: "yonma", returnPoints: 30000, tobiRule: "leq0" };
}

function getGameMode(match: Match): GameMode {
  return (getRules(match).gameMode ?? "yonma") as GameMode;
}

// ------------------------------------------------------------
// 参加席 / 欠け席
// ------------------------------------------------------------
function activeSeatsSanma(): WindSeat[] {
  return [0, 1, 2] as WindSeat[];
}
function absentSeatSanma(): WindSeat {
  return 3;
}

function activeSeatsSanma4(dealer: WindSeat): WindSeat[] {
  return [dealer, ((dealer + 1) % 4) as WindSeat, ((dealer + 2) % 4) as WindSeat];
}
function absentSeatSanma4(dealer: WindSeat): WindSeat {
  return ((dealer + 3) % 4) as WindSeat;
}

function getActiveSeats(match: Match, dealer: WindSeat): WindSeat[] {
  const mode = getGameMode(match);
  if (mode === "yonma") return [0, 1, 2, 3] as WindSeat[];
  if (mode === "sanma") return activeSeatsSanma();
  return activeSeatsSanma4(dealer);
}

function getAbsentSeat(match: Match, dealer: WindSeat): WindSeat | null {
  const mode = getGameMode(match);
  if (mode === "yonma") return null;
  if (mode === "sanma") return absentSeatSanma();
  return absentSeatSanma4(dealer);
}

function isActive(match: Match, dealer: WindSeat, seat: WindSeat): boolean {
  return getActiveSeats(match, dealer).includes(seat);
}

// ------------------------------------------------------------
// ★ 3麻だけ「各場3局（東1〜3, 南1〜3）」
//   4麻/4人3麻は現状通り「各場4局」
// ------------------------------------------------------------
function maxKyokuInStage(match: Match): 3 | 4 {
  return getGameMode(match) === "sanma" ? 3 : 4;
}

// ------------------------------------------------------------
// [1] Utility
// ------------------------------------------------------------
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function roundLabel(r: RoundPos): string {
  const s = r.stage === "E" ? "東" : r.stage === "S" ? "南" : "西";
  return `${s}${r.num}局 ${r.honba}本場`;
}

// ------------------------------------------------------------
// [2] 入力整形
// ------------------------------------------------------------
function clampFuro(n: number) {
  return Math.max(0, Math.min(4, Math.floor(n)));
}

export function normalizeAction(action: KyokuAction): KyokuAction {
  const furo = (action.furoCount ?? [0, 0, 0, 0]).map(clampFuro);
  const order = (action.riichiOrder ?? [0, 0, 0, 0]).map((x) => (x | 0));

  const used = new Set<number>();
  const fixed = order.map((v) => (v >= 1 && v <= 4 && !used.has(v) ? (used.add(v), v) : 0));

  return { furoCount: furo, riichiOrder: fixed };
}

// ------------------------------------------------------------
// [3] 点数修正反映（表示/最終順位用）
// ------------------------------------------------------------
export function applyAdjustmentsToScores(
  baseScores: number[],
  adjustments: AdjustmentLog[],
  afterKyokuIndex: number
): number[] {
  const s = [...baseScores];
  for (const a of adjustments) {
    if (a.afterKyokuIndex <= afterKyokuIndex) {
      s[a.seat] += a.delta;
    }
  }
  return s;
}

// ------------------------------------------------------------
// [4] 順位（起家優先）
// ------------------------------------------------------------
export function getRanksWithKichya(
  scores: number[],
  kichyaSeat: WindSeat,
  activeSeats?: WindSeat[]
): { rankBySeat: number[]; tieBreakApplied: boolean } {
  const act = activeSeats ?? ([0, 1, 2, 3] as WindSeat[]);

  const seatOrderAll: WindSeat[] = [0, 1, 2, 3].map((i) => ((kichyaSeat + i) % 4) as WindSeat);
  const seatOrder = seatOrderAll.filter((s) => act.includes(s));

  const arr = act.map((seat) => ({
    seat,
    score: scores[seat],
    tiebreak: seatOrder.indexOf(seat),
  }));

  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.tiebreak - b.tiebreak;
  });

  const rankBySeat = [4, 4, 4, 4];
  let tieBreakApplied = false;

  for (let i = 0; i < arr.length; i++) {
    rankBySeat[arr[i].seat] = i + 1;
    if (i > 0 && arr[i].score === arr[i - 1].score && arr[i].tiebreak !== arr[i - 1].tiebreak) {
      tieBreakApplied = true;
    }
  }

  return { rankBySeat, tieBreakApplied };
}

// ------------------------------------------------------------
// [5] 飛び判定（参加者のみ）
// ------------------------------------------------------------
function anyTobi(scores: number[], match: Match, dealer: WindSeat): boolean {
  const tobi = getRules(match).tobiRule ?? "leq0";
  if (tobi === "none") return false;

  const act = getActiveSeats(match, dealer);
  if (tobi === "lt0") return act.some((s) => scores[s] < 0);
  return act.some((s) => scores[s] <= 0);
}

// ------------------------------------------------------------
// [6] 流局罰符
// ------------------------------------------------------------
function calcNoTenPenaltyYonma(tenpai: boolean[]): number[] {
  const nTenpai = tenpai.filter(Boolean).length;
  const delta = [0, 0, 0, 0];
  if (nTenpai === 0 || nTenpai === 4) return delta;

  if (nTenpai === 1) {
    const t = tenpai.findIndex((x) => x);
    delta[t] += 3000;
    for (let i = 0; i < 4; i++) if (i !== t) delta[i] -= 1000;
  } else if (nTenpai === 2) {
    const ts = tenpai.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    for (const t of ts) delta[t] += 1500;
    for (let i = 0; i < 4; i++) if (!tenpai[i]) delta[i] -= 1500;
  } else if (nTenpai === 3) {
    const nt = tenpai.findIndex((x) => !x);
    for (let i = 0; i < 4; i++) if (i !== nt) delta[i] += 1000;
    delta[nt] -= 3000;
  }
  return delta;
}

function calcNoTenPenaltySanmaLike(tenpai: boolean[], activeSeats: WindSeat[], total: number): number[] {
  const delta = [0, 0, 0, 0];

  const activeTenpai = activeSeats.filter((s) => !!tenpai[s]);
  const n = activeTenpai.length;

  if (n === 0 || n === activeSeats.length) return delta;

  if (n === 1) {
    const t = activeTenpai[0];
    delta[t] += total;
    const each = total / (activeSeats.length - 1);
    for (const s of activeSeats) if (s !== t) delta[s] -= each;
    return delta;
  }

  const noten = activeSeats.find((s) => !tenpai[s])!;
  delta[noten] -= total;
  const each = total / (activeSeats.length - 1);
  for (const s of activeTenpai) delta[s] += each;
  return delta;
}

// ------------------------------------------------------------
// [7] 立直供託（activeのみ）
// ------------------------------------------------------------
function applyRiichi(
  match: Match,
  dealer: WindSeat,
  action: KyokuAction,
  scores: number[],
  riichiPot: number
): { scores: number[]; riichiPot: number } {
  const s = [...scores];
  let pot = riichiPot;

  const act = getActiveSeats(match, dealer);

  for (let i = 0; i < 4; i++) {
    if (action.riichiOrder[i] > 0) {
      if (!act.includes(i as WindSeat)) continue;
      s[i] -= 1000;
      pot += 1000;
    }
  }
  return { scores: s, riichiPot: pot };
}

// ------------------------------------------------------------
// [8] 本場上乗せ
// ------------------------------------------------------------
function isSanmaLike(match: Match): boolean {
  const mode = getGameMode(match);
  return mode === "sanma" || mode === "yonma_sanma4";
}

function applyHonbaToTsumoPayment(match: Match, base: number, honba: number): number {
  if (isSanmaLike(match)) {
    const unit = getRules(match).honbaUnit ?? 1000;
    return base + unit * honba;
  }
  return base + 100 * honba;
}

function applyHonbaToRonPayment(match: Match, base: number, honba: number): number {
  if (isSanmaLike(match)) {
    const unit = getRules(match).honbaUnit ?? 1000;
    return base + unit * honba;
  }
  return base + 300 * honba;
}

// ------------------------------------------------------------
// [9] 精算（ツモ）
// ------------------------------------------------------------
function settleTsumo(
  match: Match,
  scores: number[],
  dealer: WindSeat,
  honba: number,
  winner: WindSeat,
  points: PointsInputTsumo
): number[] {
  const s = [...scores];
  const act = getActiveSeats(match, dealer);

  if (!act.includes(winner)) return s;

  if (points.kind === "oya_all") {
    const pay = applyHonbaToTsumoPayment(match, points.all, honba);
    for (const p of act) {
      if (p === winner) continue;
      s[p] -= pay;
      s[winner] += pay;
    }
    return s;
  }

  const payKo = applyHonbaToTsumoPayment(match, points.ko, honba);
  const payOya = applyHonbaToTsumoPayment(match, points.oya, honba);

  for (const p of act) {
    if (p === winner) continue;
    const pay = p === dealer ? payOya : payKo;
    s[p] -= pay;
    s[winner] += pay;
  }
  return s;
}

// ------------------------------------------------------------
// [10] 精算（ロン）
// ------------------------------------------------------------
function settleRon(
  match: Match,
  scores: number[],
  dealer: WindSeat,
  honba: number,
  winner: WindSeat,
  loser: WindSeat,
  ron: number
): number[] {
  const s = [...scores];
  const act = getActiveSeats(match, dealer);
  if (!act.includes(winner)) return s;
  if (!act.includes(loser)) return s;

  const pay = applyHonbaToRonPayment(match, ron, honba);
  s[loser] -= pay;
  s[winner] += pay;
  return s;
}

// ------------------------------------------------------------
// [11] 局進行（★3麻だけ各場3局）
// ------------------------------------------------------------
function nextRoundPos(match: Match, current: RoundPos): RoundPos {
  const { stage, num } = current;
  const max = maxKyokuInStage(match);

  if (num < max) return { stage, num: (num + 1) as any, honba: 0 };

  if (stage === "E") return { stage: "S", num: 1, honba: 0 };
  if (stage === "S") return { stage: "W", num: 1, honba: 0 };
  return { stage: "W", num: 1, honba: 0 };
}

function rotateDealer(match: Match, dealer: WindSeat): WindSeat {
  const mode = getGameMode(match);
  if (mode === "sanma") return ((dealer + 1) % 3) as WindSeat;
  return ((dealer + 1) % 4) as WindSeat;
}

// ------------------------------------------------------------
// [13] 終局判定
// - 3麻：南3終了時にトップ>=返し点で終了 / 未満なら西入
// - 4人3麻：南4終了時にトップ>=返し点で終了 / 未満なら西入（現状維持）
// - 西場：トップ>=返し点で即終了
// - 4麻：従来の簡易判定
// ------------------------------------------------------------
function shouldEndByOlasRule(
  match: Match,
  roundPlayed: RoundPos,
  scoresAfter: number[],
  dealer: WindSeat
): { ended: boolean; reason?: string; endedByDrawTopPot?: boolean } {
  const mode = getGameMode(match);
  const r = getRules(match);

  const ret = r.returnPoints ?? (mode === "yonma" ? 30000 : 40000);
  const label = roundLabel(roundPlayed);
  const act = getActiveSeats(match, dealer);

  const { rankBySeat } = getRanksWithKichya(scoresAfter, match.kichyaSeat, act);
  const topSeat = rankBySeat.indexOf(1) as WindSeat;
  const topScore = scoresAfter[topSeat];

  if (mode === "sanma") {
    const isSouthLast = roundPlayed.stage === "S" && roundPlayed.num === 3;
    const isWest = roundPlayed.stage === "W";

    if (isSouthLast) {
      if (topScore >= ret) return { ended: true, reason: `${label} トップ${ret}点以上で終局`, endedByDrawTopPot: true };
      return { ended: false };
    }
    if (isWest) {
      if (topScore >= ret) return { ended: true, reason: `${label}（西場）トップ${ret}点以上で即終局`, endedByDrawTopPot: true };
      return { ended: false };
    }
    return { ended: false };
  }

  if (mode === "yonma_sanma4") {
    const isSouth4 = roundPlayed.stage === "S" && roundPlayed.num === 4;
    const isWest = roundPlayed.stage === "W";

    if (isSouth4) {
      if (topScore >= ret) return { ended: true, reason: `${label} トップ${ret}点以上で終局`, endedByDrawTopPot: true };
      return { ended: false };
    }
    if (isWest) {
      if (topScore >= ret) return { ended: true, reason: `${label}（西場）トップ${ret}点以上で即終局`, endedByDrawTopPot: true };
      return { ended: false };
    }
    return { ended: false };
  }

  // 4麻（簡易）
  const isOlasOrLater = (roundPlayed.stage === "S" && roundPlayed.num === 4) || roundPlayed.stage === "W";
  if (!isOlasOrLater) return { ended: false };

  const anyoneRet = act.some((s) => scoresAfter[s] >= ret);
  if (anyoneRet) return { ended: true, reason: `${label} 返し点到達で終局`, endedByDrawTopPot: true };
  return { ended: false };
}

// ======================================================================
// [14] メイン：1局分入力 → 次状態
// ======================================================================
export function computeNextFromInput(params: {
  match: Match;
  action: KyokuAction;
  result: KyokuResult;
}): { updatedMatch: Match; log: KyokuLog } {
  const { match } = params;
  const action = normalizeAction(params.action);
  const result = params.result;

  const roundStart = match.currentRound;
  const dealer = match.currentDealer;
  const riichiPotStart = match.currentRiichiPot;
  const scoresStart = [...match.currentScores];

  const act = getActiveSeats(match, dealer);
  const mode = getGameMode(match);

  // 1) 立直供託（activeのみ）
  const afterRiichi = applyRiichi(match, dealer, action, scoresStart, riichiPotStart);
  let scores = afterRiichi.scores;
  let riichiPot = afterRiichi.riichiPot;

  // 2) 結果精算
  const honba = roundStart.honba;
  let dealerRenchan = false;

  const isWin = result.type === "tsumo" || result.type === "ron";
  const winSeat: WindSeat | null = isWin ? (result as any).winner : null;

  if (result.type === "tsumo") {
    scores = settleTsumo(match, scores, dealer, honba, result.winner, result.points);
    dealerRenchan = result.winner === dealer;
  } else if (result.type === "ron") {
    scores = settleRon(match, scores, dealer, honba, result.winner, result.loser, result.points.ron);
    dealerRenchan = result.winner === dealer;
  } else {
    if (isSanmaLike(match)) {
      const total = getRules(match).notenTotal ?? 2000;
      const delta = calcNoTenPenaltySanmaLike(result.tenpai, act, total);
      scores = scores.map((v, i) => v + delta[i]);
      dealerRenchan = !!result.tenpai[dealer] && act.includes(dealer);
    } else {
      const delta = calcNoTenPenaltyYonma(result.tenpai);
      scores = scores.map((v, i) => v + delta[i]);
      dealerRenchan = result.tenpai[dealer];
    }
  }

  // 3) 供託処理
  // - 通常：和了者が供託回収（従来）
  // - ただし4人3麻：立直していない和了者は回収できず持ち越し
  // - ただしその和了で終局ならアガリ取りで回収（案1）
  let potBlockedForNonRiichiWin = false;

  if (isWin && winSeat !== null && act.includes(winSeat) && riichiPot > 0) {
    const winnerDidRiichi = (action.riichiOrder?.[winSeat] ?? 0) > 0;

    if (mode === "yonma_sanma4" && !winnerDidRiichi) {
      // 回収禁止（持ち越し）。終局なら後でアガリ取り。
      potBlockedForNonRiichiWin = true;
    } else {
      // 通常回収
      scores[winSeat] += riichiPot;
      riichiPot = 0;
    }
  }

  // 4) 次局/本場/親
  const nextHonba =
    result.type === "draw"
      ? roundStart.honba + 1
      : dealerRenchan
      ? roundStart.honba + 1
      : 0;

  let roundAfter: RoundPos;
  let dealerAfter: WindSeat;

  if (dealerRenchan) {
    roundAfter = { ...roundStart, honba: nextHonba };
    dealerAfter = dealer;
  } else {
    const advanced = nextRoundPos(match, { ...roundStart, honba: 0 });
    roundAfter = { ...advanced, honba: nextHonba };
    dealerAfter = rotateDealer(match, dealer);
  }

  // 5) 終局判定（※4人3麻の「アガリ取り」込みで判定したいので候補点数で判定）
  const canAgariToriCandidate =
    potBlockedForNonRiichiWin && isWin && winSeat !== null && riichiPot > 0;

  const scoresCandidate = canAgariToriCandidate
    ? (() => {
        const tmp = [...scores];
        tmp[winSeat!] += riichiPot; // 終局ならアガリ取りされる想定
        return tmp;
      })()
    : scores;

  let ended = anyTobi(scoresCandidate, match, dealer);
  let endReason: string | undefined = ended ? "飛び終了" : undefined;
  let endMeta: KyokuLog["endMeta"] = { riichiPotSettledToSeat: null };

  if (!ended) {
    const endJudge = shouldEndByOlasRule(match, roundStart, scoresCandidate, dealer);
    if (endJudge.ended) {
      ended = true;
      endReason = endJudge.reason;

      // 流局終局：供託トップ取り（従来仕様）
      if (result.type === "draw" && endJudge.endedByDrawTopPot && riichiPot > 0) {
        const act2 = getActiveSeats(match, dealer);
        const { rankBySeat } = getRanksWithKichya(scores, match.kichyaSeat, act2);
        const topSeat = rankBySeat.indexOf(1) as WindSeat;
        scores[topSeat] += riichiPot;
        endMeta.riichiPotSettledToSeat = topSeat;
        riichiPot = 0;
      }
    }
  }

  // 6) ★終局した場合のみ「アガリ取り」を確定反映（案1）
  if (ended && canAgariToriCandidate) {
    scores[winSeat!] += riichiPot;
    riichiPot = 0;
  }

  // 7) ログ
  const deltaScores = scores.map((v, i) => v - scoresStart[i]);

  const log: KyokuLog = {
    id: uid("kyoku"),
    roundStart,
    dealer,
    riichiPotStart,
    scoresStart,
    action,
    result,
    deltaScores,
    scoresAfter: [...scores],
    riichiPotAfter: riichiPot,
    roundAfter,
    dealerAfter,
    ended,
    endReason,
    endMeta,
  };

  // 8) 更新
  const updated: Match = {
    ...match,
    updatedAt: Date.now(),
    logs: [...match.logs, log],
    currentRound: roundAfter,
    currentDealer: dealerAfter,
    currentRiichiPot: riichiPot,
    currentScores: [...scores],
    ended,
    endReason,
  };

  return { updatedMatch: updated, log };
}

// ======================================================================
// [15] 再計算
// ======================================================================
export function recomputeMatchFromScratch(match: Match): Match {
  const base: Match = {
    ...match,
    logs: [],
    currentRound: { stage: "E", num: 1, honba: 0 },
    currentDealer: 0,
    currentRiichiPot: 0,
    currentScores: [...match.initialScores],
    ended: false,
    endReason: undefined,
    updatedAt: Date.now(),
  };

  let cur = base;

  for (let i = 0; i < match.logs.length; i++) {
    const src = match.logs[i];
    const { updatedMatch, log } = computeNextFromInput({
      match: cur,
      action: src.action,
      result: src.result,
    });

    // id維持
    log.id = src.id;
    cur = { ...updatedMatch, logs: [...updatedMatch.logs.slice(0, -1), log] };

    if (cur.ended) break;
  }

  const maxIndex = cur.logs.length;
  const adj = cur.adjustments.map((a) => ({
    ...a,
    afterKyokuIndex: Math.min(a.afterKyokuIndex, maxIndex),
  }));

  return { ...cur, adjustments: adj };
}

// ======================================================================
// [16] 最終サマリー
// ======================================================================
export function buildEndSummary(match: Match): {
  finalScoresWithAdjust: number[];
  rankBySeat: number[];
  tieBreakApplied: boolean;
} {
  const finalBase = match.currentScores;
  const finalWithAdj = applyAdjustmentsToScores(finalBase, match.adjustments, match.logs.length);

  const act = getActiveSeats(match, match.currentDealer);
  const { rankBySeat, tieBreakApplied } = getRanksWithKichya(finalWithAdj, match.kichyaSeat, act);

  return { finalScoresWithAdjust: finalWithAdj, rankBySeat, tieBreakApplied };
}

// ------------------------------------------------------------
// UI用：欠け席の算出
// ------------------------------------------------------------
export function getAbsentSeatForSanmaLike(match: Match): WindSeat | null {
  const mode = getGameMode(match);
  if (mode === "yonma") return null;
  if (mode === "sanma") return 3;
  return absentSeatSanma4(match.currentDealer);
}
