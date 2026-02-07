import React, { useMemo } from "react";
import type { Match, Player, Rules, WindSeat, TobiRule, KyokuLog } from "../types";
import { buildEndSummary, getRanksWithKichya } from "../logic/mahjong";

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

function safeRules(match: Match): Rules {
  return (match.rules ??
    ({
      ...fallbackRules(),
      tobiRule: match.tobiRule ?? "leq0",
    } as Rules));
}

function seatsForRanking(rules: Rules): WindSeat[] {
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

// -------- 局スタッツ（既存の裏ドラ対応版を3麻座席に合わせる） --------
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

function getGameMode(match: Match): "yonma" | "sanma" | "yonma_sanma4" {
  const r = (match as any).rules as any;
  return (r?.gameMode ?? "yonma") as any;
}
function activeSeatsForDealer(match: Match, dealer: WindSeat): WindSeat[] {
  const gm = getGameMode(match);
  if (gm === "yonma") return [0, 1, 2, 3];
  if (gm === "sanma") return [0, 1, 2];
  return [dealer, ((dealer + 1) % 4) as WindSeat, ((dealer + 2) % 4) as WindSeat];
}
function isActiveSeat(match: Match, dealer: WindSeat, seat: WindSeat): boolean {
  return activeSeatsForDealer(match, dealer).includes(seat);
}

function incomeWithoutHonbaAndPot(match: Match, log: KyokuLog): number | null {
  if (log.result.type === "ron") return log.result.points.ron;

  if (log.result.type === "tsumo") {
    const dealer = log.dealer;
    const gm = getGameMode(match);

    if (log.result.points.kind === "oya_all") {
      const payers = gm === "yonma" ? 3 : 2; // 3麻系は参加2人
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

export default function StatsPage(props: { matches: Match[]; players: Player[]; onBack: () => void }) {
  const nameOf = (pid: string) => props.players.find((p) => p.id === pid)?.name ?? pid;

  const { rowsMatch, rowsKyoku } = useMemo(() => {
    const ms = props.matches ?? [];
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

    return { rowsMatch, rowsKyoku };
  }, [props.matches, props.players]);

  return (
    <div className="card">
      <div className="kv">
        <h2>スタッツ</h2>
        <button className="btn" onClick={props.onBack}>戻る</button>
      </div>

      <div className="small" style={{ marginTop: 6 }}>
        ※ptは「2位以下は切り上げ、1位は合計0になる残差」です（3麻は3人、4麻は4人で合計0）。
      </div>

      <hr />

      <h3>Matchスタッツ</h3>
      {rowsMatch.length === 0 ? (
        <div className="small">まだ集計できる対局がありません。</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>順位</th><th>プレイヤー</th><th>対戦数</th><th>トータルpt</th><th>平均順位</th><th>1位率</th><th>飛び率</th>
            </tr>
          </thead>
          <tbody>
            {rowsMatch.map((r, i) => (
              <tr key={r.playerId}>
                <td>{i + 1}</td>
                <td>{r.name}</td>
                <td>{r.matches}</td>
                <td style={{ fontWeight: 800 }}>{r.totalPt}</td>
                <td>{r.avgRank.toFixed(2)}</td>
                <td>{(r.firstRate * 100).toFixed(1)}%</td>
                <td>{(r.tobiRate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <hr />

      <h3>局スタッツ</h3>
      {rowsKyoku.length === 0 ? (
        <div className="small">まだ局ログがありません。</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>プレイヤー</th>
                <th>参加局数</th>
                <th>和了率</th>
                <th>ツモ和了率</th>
                <th>放銃率</th>
                <th>立直率</th>
                <th>副露率</th>
                <th>平均打点</th>
                <th>平均裏ドラ枚数</th>
                <th>立直追っかけ率</th>
                <th>立直後追っかけられ率</th>
                <th>立直後放銃率</th>
              </tr>
            </thead>
            <tbody>
              {rowsKyoku.map((r) => (
                <tr key={r.playerId}>
                  <td style={{ fontWeight: 700 }}>{r.name}</td>
                  <td>{r.hands}</td>
                  <td>{(r.agariRate * 100).toFixed(1)}%</td>
                  <td>{(r.tsumoRate * 100).toFixed(1)}%</td>
                  <td>{(r.dealinRate * 100).toFixed(1)}%</td>
                  <td>{(r.riichiRate * 100).toFixed(1)}%</td>
                  <td>{(r.furoRate * 100).toFixed(1)}%</td>
                  <td>{r.avgWinIncome.toFixed(0)}</td>
                  <td>{r.avgUra === null ? "-" : r.avgUra.toFixed(2)}</td>
                  <td>{(r.riichiChaseRate * 100).toFixed(1)}%</td>
                  <td>{(r.riichiGotChasedRate * 100).toFixed(1)}%</td>
                  <td>{(r.riichiDealinRate * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
