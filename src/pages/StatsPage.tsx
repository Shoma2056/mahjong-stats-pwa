import React, { useMemo, useState } from "react";
import type { Match, Player, Rules, WindSeat, TobiRule, KyokuLog, GameMode } from "../types";
import { buildEndSummary, getRanksWithKichya } from "../logic/mahjong";

import "../StatsPage.css";

// -------------------- Rules safety --------------------
function fallbackRules(): Rules {
  return {
    gameMode: "yonma",
    startPoints: 25000,
    returnPoints: 30000,
    topOkaPoints: 20000,
    tobiRule: "leq0",
    uma: { presetId: "p1", second: 10, third: -10, fourth: -30 },
  };
}

/**
 * match.rules が部分的/古い場合でも落ちないように、
 * fallback をベースに shallow merge + uma も merge する
 */
function safeRules(match: Match): Rules {
  const fb = fallbackRules();
  const r = (match.rules ?? {}) as Partial<Rules> & { uma?: any };

  const mergedUma = { ...fb.uma, ...(r.uma ?? {}) };

  return {
    ...fb,
    ...r,
    gameMode: ((r.gameMode ?? fb.gameMode) as GameMode) || "yonma",
    tobiRule: (r.tobiRule ?? match.tobiRule ?? fb.tobiRule) as any,
    uma: mergedUma as any,
  } as Rules;
}

function seatsForRanking(rules: Rules): WindSeat[] {
  // 3麻だけ3人。4麻/4人3麻は4人順位。
  return rules.gameMode === "sanma" ? ([0, 1, 2] as WindSeat[]) : ([0, 1, 2, 3] as WindSeat[]);
}

function umaForRank(rules: Rules, rank: number): number {
  const u = rules.uma;
  if (rules.gameMode === "sanma") {
    if (rank === 1) return -(u.second + u.third);
    if (rank === 2) return u.second;
    return u.third;
  }
  const first = -(u.second + u.third + u.fourth);
  if (rank === 1) return first;
  if (rank === 2) return u.second;
  if (rank === 3) return u.third;
  return u.fourth;
}

function anyTobiByRule(scores: number[], rule: TobiRule): boolean {
  if (rule === "none") return false;
  if (rule === "lt0") return scores.some((s) => s < 0);
  return scores.some((s) => s <= 0);
}

function calcMatchPts(match: Match): { ptBySeat: number[]; rankBySeat: number[]; tobiSeats: boolean[] } {
  const rules = safeRules(match);
  const seats = seatsForRanking(rules);

  const { finalScoresWithAdjust } = buildEndSummary(match);
  const { rankBySeat } = getRanksWithKichya(finalScoresWithAdjust, match.kichyaSeat, seats);

  const ret = rules.returnPoints ?? (rules.gameMode === "sanma" ? 40000 : 30000);
  const okaPt = (rules.topOkaPoints ?? 0) / 1000;

  const baseBySeat = [0, 0, 0, 0];
  for (const s of seats) baseBySeat[s] = (finalScoresWithAdjust[s] - ret) / 1000;

  const topSeat = rankBySeat.indexOf(1) as WindSeat;
  baseBySeat[topSeat] += okaPt;

  const rawBySeat = [0, 0, 0, 0];
  for (const s of seats) rawBySeat[s] = baseBySeat[s] + umaForRank(rules, rankBySeat[s]);

  // 2位以下ceil、1位は残差で合計0
  const ptBySeat = [0, 0, 0, 0];
  const others = seats.filter((s) => rankBySeat[s] !== 1);
  let sumOthers = 0;
  for (const s of others) {
    const v = Math.ceil(rawBySeat[s]);
    ptBySeat[s] = v;
    sumOthers += v;
  }
  ptBySeat[topSeat] = -sumOthers;

  // 飛び判定（調整後点数）
  const tobiRule = rules.tobiRule ?? "leq0";
  const tobiSeats = [false, false, false, false];
  if (anyTobiByRule(finalScoresWithAdjust, tobiRule)) {
    for (const s of seats) {
      const v = finalScoresWithAdjust[s];
      if (tobiRule === "lt0" ? v < 0 : tobiRule === "leq0" ? v <= 0 : false) tobiSeats[s] = true;
    }
  }

  return { ptBySeat, rankBySeat, tobiSeats };
}

// -------- 局スタッツ --------
type KyokuAgg = {
  hands: number;
  wins: number;
  tsumoWins: number;
  dealins: number;
  riichiHands: number;
  furoHands: number;
  winIncomeSum: number;

  uraWinCount: number;
  uraSum: number;

  riichiChase: number;
  riichiFirst: number;
  riichiGotChased: number;
  riichiDealins: number;
};

function modeOf(match: Match): GameMode {
  const r = (match.rules ?? {}) as any;
  return (r.gameMode ?? "yonma") as GameMode;
}

function activeSeatsForDealer(match: Match, dealer: WindSeat): WindSeat[] {
  const gm = modeOf(match);
  if (gm === "yonma") return [0, 1, 2, 3];
  if (gm === "sanma") return [0, 1, 2];
  // yonma_sanma4：親から見た3人参加
  return [dealer, ((dealer + 1) % 4) as WindSeat, ((dealer + 2) % 4) as WindSeat];
}

function isActiveSeat(match: Match, dealer: WindSeat, seat: WindSeat): boolean {
  return activeSeatsForDealer(match, dealer).includes(seat);
}

function incomeWithoutHonbaAndPot(match: Match, log: KyokuLog): number | null {
  if (log.result.type === "ron") return log.result.points.ron;

  if (log.result.type === "tsumo") {
    const gm = modeOf(match);

    if (log.result.points.kind === "oya_all") {
      const payers = gm === "yonma" ? 3 : 2; // 3麻系は参加2人払い
      return log.result.points.all * payers;
    }

    if (gm === "yonma") return log.result.points.ko * 2 + log.result.points.oya;
    // 3麻/4人3麻：参加2人払いの合計
    return log.result.points.ko + log.result.points.oya;
  }

  return null;
}

type RowMatch = {
  playerId: string;
  name: string;
  matches: number;
  totalPt: number;
  avgRank: number;
  firstRate: number;
  tobiRate: number;
};

type RowKyoku = {
  playerId: string;
  name: string;
  hands: number;

  agariRate: number;
  tsumoRate: number;
  dealinRate: number;
  riichiRate: number;
  furoRate: number;

  avgWinIncome: number;
  avgUra: number | null;

  riichiChaseRate: number;
  riichiGotChasedRate: number;
  riichiDealinRate: number;
};

type ModeFilter = "all" | "yonma" | "sanma" | "yonma_sanma4";

function modeLabel(m: ModeFilter): string {
  if (m === "all") return "全部";
  if (m === "yonma") return "4麻";
  if (m === "sanma") return "3麻";
  return "4人3麻";
}

export default function StatsPage(props: { matches: Match[]; players: Player[]; onBack: () => void }) {
  const [mode, setMode] = useState<ModeFilter>("all");

  const nameOf = (pid: string) => props.players.find((p) => p.id === pid)?.name ?? pid;

  const filteredMatches = useMemo(() => {
    const ms = props.matches ?? [];
    if (mode === "all") return ms;
    return ms.filter((m) => modeOf(m) === mode);
  }, [props.matches, mode]);

  const { rowsMatch, rowsKyoku, meta } = useMemo(() => {
    const ms = filteredMatches ?? [];
    const endedMatches = ms.filter((m) => (m.logs?.length ?? 0) > 0);

    // ---- Match集計 ----
    const aggM = new Map<string, { matches: number; totalPt: number; sumRank: number; first: number; tobi: number }>();

    for (const match of endedMatches) {
      const rules = safeRules(match);
      const seats = seatsForRanking(rules);
      const { ptBySeat, rankBySeat, tobiSeats } = calcMatchPts(match);

      for (const seat of seats) {
        const pid = match.seats?.[seat];
        if (!pid) continue;

        const a = aggM.get(pid) ?? { matches: 0, totalPt: 0, sumRank: 0, first: 0, tobi: 0 };
        a.matches += 1;
        a.totalPt += ptBySeat[seat];
        a.sumRank += rankBySeat[seat];
        if (rankBySeat[seat] === 1) a.first += 1;
        if (tobiSeats[seat]) a.tobi += 1;
        aggM.set(pid, a);
      }
    }

    const rowsMatch: RowMatch[] = Array.from(aggM.entries()).map(([playerId, a]) => ({
      playerId,
      name: nameOf(playerId),
      matches: a.matches,
      totalPt: a.totalPt,
      avgRank: a.matches > 0 ? a.sumRank / a.matches : 0,
      firstRate: a.matches > 0 ? a.first / a.matches : 0,
      tobiRate: a.matches > 0 ? a.tobi / a.matches : 0,
    }));
    rowsMatch.sort((x, y) => (y.totalPt !== x.totalPt ? y.totalPt - x.totalPt : x.name.localeCompare(y.name)));

    // ---- 局集計 ----
    const aggK = new Map<string, KyokuAgg>();
    const ensure = (pid: string) => {
      const cur =
        aggK.get(pid) ??
        ({
          hands: 0,
          wins: 0,
          tsumoWins: 0,
          dealins: 0,
          riichiHands: 0,
          furoHands: 0,
          winIncomeSum: 0,
          uraWinCount: 0,
          uraSum: 0,
          riichiChase: 0,
          riichiFirst: 0,
          riichiGotChased: 0,
          riichiDealins: 0,
        } satisfies KyokuAgg);
      aggK.set(pid, cur);
      return cur;
    };

    for (const match of endedMatches) {
      const logs = match.logs ?? [];
      for (const log of logs) {
        for (let seat = 0 as WindSeat; seat <= 3; seat = ((seat + 1) % 4) as WindSeat) {
          if (!isActiveSeat(match, log.dealer, seat)) {
            if (seat === 3) break;
            continue;
          }

          const pid = match.seats?.[seat];
          if (!pid) {
            if (seat === 3) break;
            continue;
          }

          const a = ensure(pid);
          a.hands += 1;

          const riichiOrder = log.action?.riichiOrder?.[seat] ?? 0;
          const furoCnt = log.action?.furoCount?.[seat] ?? 0;
          const didRiichi = riichiOrder > 0;

          if (didRiichi) a.riichiHands += 1;
          if ((furoCnt | 0) > 0) a.furoHands += 1;

          if (didRiichi) {
            if (riichiOrder > 1) a.riichiChase += 1;
            if (riichiOrder === 1) {
              a.riichiFirst += 1;
              const someoneLater = (log.action?.riichiOrder ?? []).some((x) => x > 1);
              if (someoneLater) a.riichiGotChased += 1;
            }
          }

          if (log.result.type === "tsumo") {
            if (log.result.winner === seat) {
              a.wins += 1;
              a.tsumoWins += 1;
              const income = incomeWithoutHonbaAndPot(match, log);
              if (income !== null) a.winIncomeSum += income;

              if (didRiichi && typeof log.result.uraCount === "number") {
                a.uraWinCount += 1;
                a.uraSum += log.result.uraCount;
              }
            }
          } else if (log.result.type === "ron") {
            if (log.result.winner === seat) {
              a.wins += 1;
              const income = incomeWithoutHonbaAndPot(match, log);
              if (income !== null) a.winIncomeSum += income;

              if (didRiichi && typeof log.result.uraCount === "number") {
                a.uraWinCount += 1;
                a.uraSum += log.result.uraCount;
              }
            }
            if (log.result.loser === seat) {
              a.dealins += 1;
              if (didRiichi) a.riichiDealins += 1;
            }
          }

          if (seat === 3) break;
        }
      }
    }

    const rowsKyoku: RowKyoku[] = Array.from(aggK.entries()).map(([playerId, a]) => {
      const hands = a.hands;
      const wins = a.wins;
      const riichiHands = a.riichiHands;

      return {
        playerId,
        name: nameOf(playerId),
        hands,
        agariRate: hands > 0 ? wins / hands : 0,
        tsumoRate: hands > 0 ? a.tsumoWins / hands : 0,
        dealinRate: hands > 0 ? a.dealins / hands : 0,
        riichiRate: hands > 0 ? a.riichiHands / hands : 0,
        furoRate: hands > 0 ? a.furoHands / hands : 0,
        avgWinIncome: wins > 0 ? a.winIncomeSum / wins : 0,
        avgUra: a.uraWinCount > 0 ? a.uraSum / a.uraWinCount : null,
        riichiChaseRate: riichiHands > 0 ? a.riichiChase / riichiHands : 0,
        riichiGotChasedRate: a.riichiFirst > 0 ? a.riichiGotChased / a.riichiFirst : 0,
        riichiDealinRate: riichiHands > 0 ? a.riichiDealins / riichiHands : 0,
      };
    });

    rowsKyoku.sort((x, y) => (y.hands !== x.hands ? y.hands - x.hands : x.name.localeCompare(y.name)));

    return {
      rowsMatch,
      rowsKyoku,
      meta: {
        totalMatches: ms.length,
        countedMatches: endedMatches.length,
      },
    };
  }, [filteredMatches, props.players]);

    return (
    <div className="statsPage">
      {/* 背景 */}
      <div className="statsBgLayer" />

      <div className="statsInner">
        {/* ヘッダー */}
        <header className="statsHeader">
          <h1 className="statsTitle">スタッツ</h1>
          <div className="statsTitleDivider" />

          <div className="statsMetaRow">
            <div className="statsMeta">
              集計対象：{modeLabel(mode)}（{meta.countedMatches}/{meta.totalMatches} 半荘）
            </div>

            <button className="statsBackBtn" onClick={props.onBack}>
              {"<"}  戻る
            </button>
          </div>
        </header>

        {/* フィルター */}
        <div className="statsFilters">
          {(["all", "yonma", "sanma", "yonma_sanma4"] as ModeFilter[]).map((m) => (
            <button
              key={m}
              className={`statsFilterBtn ${mode === m ? "isActive" : ""}`}
              onClick={() => setMode(m)}
              type="button"
            >
              {modeLabel(m)}
            </button>
          ))}
        </div>

        <div className="statsSectionDivider" />

        {/* 半荘スタッツ */}
        <section className="statsSection">
          <h2 className="statsH2">半荘スタッツ</h2>

          {rowsMatch.length === 0 ? (
            <div className="statsSmall">まだ集計できる対局がありません。</div>
          ) : (
            <div className="statsTableWrap">
              <table className="statsTable">
                <thead>
                  <tr>
                    <th>順</th>
                    <th>プレイヤー</th>
                    <th>対戦</th>
                    <th className="num">トータルpt</th>
                    <th className="num">平均</th>
                    <th className="num">1位率</th>
                    <th className="num">飛び率</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsMatch.map((r, i) => (
                    <tr key={r.playerId}>
                      <td>{i + 1}</td>
                      <td className="name">{r.name}</td>
                      <td className="num">{r.matches}</td>
                      <td className="num strong">{r.totalPt}</td>
                      <td className="num">{r.avgRank.toFixed(2)}</td>
                      <td className="num">{(r.firstRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.tobiRate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="statsSectionDivider" />

        {/* 局スタッツ */}
        <section className="statsSection">
          <h2 className="statsH2">局スタッツ</h2>

          {rowsKyoku.length === 0 ? (
            <div className="statsSmall">まだ局ログがありません。</div>
          ) : (
            <div className="statsTableWrap wide">
              <table className="statsTable">
                <thead>
                  <tr>
                    <th>プレイヤー</th>
                    <th className="num">参加局数</th>
                    <th className="num">和了率</th>
                    <th className="num">ツモ</th>
                    <th className="num">放銃</th>
                    <th className="num">立直</th>
                    <th className="num">副露</th>
                    <th className="num">平均打点</th>
                    <th className="num">平均裏</th>
                    <th className="num">追っかけ</th>
                    <th className="num">追っかけられ</th>
                    <th className="num">立直放銃</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsKyoku.map((r) => (
                    <tr key={r.playerId}>
                      <td className="name">{r.name}</td>
                      <td className="num">{r.hands}</td>
                      <td className="num">{(r.agariRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.tsumoRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.dealinRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.riichiRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.furoRate * 100).toFixed(1)}%</td>
                      <td className="num">{r.avgWinIncome.toFixed(0)}</td>
                      <td className="num">{r.avgUra === null ? "-" : r.avgUra.toFixed(2)}</td>
                      <td className="num">{(r.riichiChaseRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.riichiGotChasedRate * 100).toFixed(1)}%</td>
                      <td className="num">{(r.riichiDealinRate * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
