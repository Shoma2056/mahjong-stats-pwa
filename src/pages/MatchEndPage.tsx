import React, { useMemo } from "react";
import type { Match, Player, Session, WindSeat, Rules, UmaRule, GameMode } from "../types";
import { buildEndSummary, getRanksWithKichya } from "../logic/mahjong";

import "../MatchEndPage.css";

const windNames = ["東", "南", "西", "北"] as const;

// ---- fallback ----
function fallbackUma(gm: GameMode): UmaRule {
  // 3麻は fourth を使わないが、型都合で埋める
  return gm === "sanma"
    ? { presetId: "p1", second: 10, third: -10, fourth: 0 }
    : { presetId: "p1", second: 10, third: -10, fourth: -30 };
}

function fallbackRules(gm: GameMode = "yonma"): Rules {
  return {
    gameMode: gm,
    startPoints: 25000,
    returnPoints: gm === "sanma" ? 40000 : 30000,
    topOkaPoints: 20000,
    tobiRule: "leq0",
    uma: fallbackUma(gm),
  };
}

/**
 * ★重要：古いデータや rules の欠損があっても絶対に落ちない Rules を返す
 * - match.rules / session.rules のどちらかから拾う
 * - gameMode を確定させてから、他の値を merge
 * - uma が欠けていれば必ず補完
 */
function safeRules(match: Match, session?: Session): Rules {
  const fromMatch = (match.rules ?? {}) as Partial<Rules> & any;
  const fromSession = (session?.rules ?? {}) as Partial<Rules> & any;

  const gm = (fromMatch.gameMode ?? fromSession.gameMode ?? "yonma") as GameMode;

  const base = fallbackRules(gm);

  const merged: Rules = {
    ...base,
    ...fromSession,
    ...fromMatch,
    gameMode: gm,
  };

  // uma 欠損の救済（ここが今回のクラッシュ原因）
  const u = (merged.uma ?? {}) as Partial<UmaRule>;
  merged.uma = {
    ...fallbackUma(gm),
    ...u,
    presetId: (u.presetId ?? fallbackUma(gm).presetId) as any,
    second: Number.isFinite(u.second as any) ? (u.second as number) : fallbackUma(gm).second,
    third: Number.isFinite(u.third as any) ? (u.third as number) : fallbackUma(gm).third,
    fourth: Number.isFinite(u.fourth as any) ? (u.fourth as number) : fallbackUma(gm).fourth,
  };

  // 数値系の欠損も保険で補完
  merged.startPoints = Number.isFinite(merged.startPoints as any) ? merged.startPoints : base.startPoints;
  merged.returnPoints = Number.isFinite(merged.returnPoints as any) ? merged.returnPoints : base.returnPoints;
  merged.topOkaPoints = Number.isFinite(merged.topOkaPoints as any) ? merged.topOkaPoints : base.topOkaPoints;

  return merged;
}

function seatsForRanking(rules: Rules): WindSeat[] {
  const gm = rules.gameMode;
  return gm === "sanma" ? ([0, 1, 2] as WindSeat[]) : ([0, 1, 2, 3] as WindSeat[]);
}

function umaForRank(rules: Rules, rank: number): number {
  const gm = rules.gameMode;
  const u = rules.uma; // safeRules が必ず埋めるので undefined にならない

  if (gm === "sanma") {
    // 3麻は 2着=u.second, 3着=u.third, 1着=-(2+3)
    if (rank === 1) return -(u.second + u.third);
    if (rank === 2) return u.second;
    return u.third;
  }

  // 4麻
  const first = -(u.second + u.third + u.fourth);
  if (rank === 1) return first;
  if (rank === 2) return u.second;
  if (rank === 3) return u.third;
  return u.fourth;
}

/**
 * pt計算：
 * - base=(最終点(調整込)-返し点)/1000
 * - 1位にオカ(topOkaPoints/1000)
 * - raw=base+uma
 * - 切り上げ：2位以下をceil、1位は残差で合計0
 */
function calcMatchPts(match: Match, rules: Rules): { ptBySeat: number[]; rankBySeat: number[]; finalAdj: number[] } {
  const { finalScoresWithAdjust } = buildEndSummary(match);
  const seats = seatsForRanking(rules);

  const { rankBySeat } = getRanksWithKichya(finalScoresWithAdjust, match.kichyaSeat, seats);

  const ret = rules.returnPoints ?? (rules.gameMode === "sanma" ? 40000 : 30000);
  const okaPt = (rules.topOkaPoints ?? 0) / 1000;

  const baseBySeat = [0, 0, 0, 0];
  for (const s of seats) baseBySeat[s] = (finalScoresWithAdjust[s] - ret) / 1000;

  const topSeat = rankBySeat.indexOf(1) as WindSeat;
  baseBySeat[topSeat] += okaPt;

  const rawBySeat = [0, 0, 0, 0];
  for (const s of seats) rawBySeat[s] = baseBySeat[s] + umaForRank(rules, rankBySeat[s]);

  const ptBySeat = [0, 0, 0, 0];
  const others = seats.filter((s) => rankBySeat[s] !== 1);

  let sumOthers = 0;
  for (const s of others) {
    const v = Math.ceil(rawBySeat[s]);
    ptBySeat[s] = v;
    sumOthers += v;
  }
  ptBySeat[topSeat] = -sumOthers;

  return { ptBySeat, rankBySeat, finalAdj: finalScoresWithAdjust };
}

function sumSessionTotalPt(session: Session, players: Player[]) {
  const totals = new Map<string, number>();
  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? pid;

  for (const match of session.games ?? []) {
    const rules = safeRules(match, session);
    const seats = seatsForRanking(rules);
    const { ptBySeat } = calcMatchPts(match, rules);

    for (const seat of seats) {
      const pid = match.seats?.[seat];
      if (!pid) continue;
      totals.set(pid, (totals.get(pid) ?? 0) + ptBySeat[seat]);
    }
  }

  const pids = Array.from(new Set([...(session.participantIds ?? []), ...Array.from(totals.keys())]));
  const rows = pids.map((pid) => ({
    playerId: pid,
    name: nameOf(pid),
    totalPt: totals.get(pid) ?? 0,
  }));

  rows.sort((a, b) => (b.totalPt !== a.totalPt ? b.totalPt - a.totalPt : a.name.localeCompare(b.name)));
  return rows;
}

export default function MatchEndPage(props: {
  players: Player[];
  session: Session;
  match: Match;
  onBackHome: () => void;
  onEdit: () => void;
  onNextGame: () => void;
  onEndSession: () => void;
  onDeleteSession: () => void;
  onStats: () => void;
}) {
  const m = props.match;
  const s = props.session;

  const rules = useMemo(() => safeRules(m, s), [m, s]);
  const seats = useMemo(() => seatsForRanking(rules), [rules]);

  const end = useMemo(() => {
    const { finalScoresWithAdjust, rankBySeat, tieBreakApplied } = buildEndSummary(m);
    const { ptBySeat } = calcMatchPts(m, rules);
    return { finalScoresWithAdjust, rankBySeat, tieBreakApplied, ptBySeat };
  }, [m, rules]);

  const seatName = (seat: WindSeat) => {
    const pid = m.seats?.[seat];
    return props.players.find((p) => p.id === pid)?.name ?? m.seatNames?.[seat] ?? (pid ? pid : "欠け");
  };

  const sessionTotals = useMemo(() => sumSessionTotalPt(s, props.players), [s, props.players]);

  return (
  <div className="endPage">
    <div className="endPageInner">
      {/* header */}
      <header className="endHeader">
        <h2 className="endTitle">終局</h2>

        <div className="endReason">
          理由：{m.endReason ?? "（不明）"}
          {end.tieBreakApplied ? " / 同点は起家順で決定" : ""}
        </div>

        <div className="endTopActions">
          <button className="btn endNavBtn" onClick={props.onBackHome}>Home</button>
          <button className="btn endNavBtn" onClick={props.onStats}>スタッツ</button>
        </div>
      </header>

      <div className="endDivider" />

      {/* results */}
      <h3 className="endSectionTitle">このゲームの結果</h3>

      <div className={`endResultGrid ${seats.length === 3 ? "is3" : "is4"}`}>
        {seats.map((seat) => {
          const isTop = end.rankBySeat[seat] === 1;
          return (
            <div key={seat} className={`endResultCard ${isTop ? "isTop" : ""}`}>
              <div className="endResultHead">
                <div className="endSeat">
                  {windNames[seat]}：<span className="endPlayer">{seatName(seat)}</span>
                </div>
                <div className="endRank">順位：{end.rankBySeat[seat]}位</div>
              </div>

              <div className="endScoreBlock">
                <div className="endScoreLabel">最終点</div>
                <div className="endScoreValue">{end.finalScoresWithAdjust[seat]}点</div>
              </div>

              <div className="endPt">{end.ptBySeat[seat]}pt</div>
            </div>
          );
        })}
      </div>

      <div className="endDivider" />

      {/* totals */}
      <h3 className="endSectionTitle">対局トータルpt</h3>

      <div className="endTableWrap">
        <table className="endTable">
          <thead>
            <tr>
              <th>順位</th><th>プレイヤー</th><th>トータルpt</th>
            </tr>
          </thead>
          <tbody>
            {sessionTotals.map((r, idx) => (
              <tr key={r.playerId}>
                <td>{idx + 1}</td>
                <td className="endTdName">{r.name}</td>
                <td className="endTdPt">{r.totalPt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="endDivider" />

      {/* bottom actions */}
      <div className="endBottomActions">
        <button className="btn endMiniBtn" onClick={props.onEdit}>このゲームを修正</button>
        <button className="btn primary endMiniBtn" onClick={props.onNextGame}>次のゲーム</button>
        <button className="btn danger endMiniBtn" onClick={props.onEndSession}>Session終了</button>
        <button className="btn endMiniBtn" onClick={props.onDeleteSession}>Session削除</button>
      </div>
    </div>
  </div>
);

}
