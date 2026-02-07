import React, { useMemo } from "react";
import type { Match, Player, Session, WindSeat, Rules } from "../types";
import { buildEndSummary, getRanksWithKichya } from "../logic/mahjong";

const windNames = ["東", "南", "西", "北"] as const;

function safeRules(match: Match, session?: Session): Rules {
  return (match.rules ??
    session?.rules ?? {
      gameMode: "yonma",
      startPoints: 25000,
      returnPoints: 30000,
      topOkaPoints: 20000,
      tobiRule: "leq0",
      uma: { presetId: "p1", second: 10, third: -10, fourth: -30 },
    }) as Rules;
}

function seatsForRanking(match: Match, rules: Rules): WindSeat[] {
  const gm = (rules.gameMode ?? "yonma") as any;
  return gm === "sanma" ? ([0, 1, 2] as WindSeat[]) : ([0, 1, 2, 3] as WindSeat[]);
}

function umaForRank(rules: Rules, rank: number): number {
  const gm = rules.gameMode;
  const u = rules.uma;

  if (gm === "sanma") {
    // 推測ですが：3麻は 2着=u.second, 3着=u.third, 1着=-(2+3)
    if (rank === 1) return -(u.second + u.third);
    if (rank === 2) return u.second;
    return u.third;
  }

  // 4人用
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
  const seats = seatsForRanking(match, rules);

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
    const seats = seatsForRanking(match, rules);
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
  const seats = useMemo(() => seatsForRanking(m, rules), [m, rules]);

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
    <div className="card">
      <div className="kv">
        <div>
          <h2>終局</h2>
          <div className="small">
            理由：{m.endReason ?? "（不明）"}
            {end.tieBreakApplied ? " / 同点は起家順で決定" : ""}
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={props.onBackHome}>Home</button>
          <button className="btn" onClick={props.onStats}>スタッツ</button>
        </div>
      </div>

      <hr />

      <h3>このゲームの結果</h3>
      <div className={seats.length === 3 ? "grid3" : "grid4"}>
        {seats.map((seat) => (
          <div key={seat} className="card">
            <div style={{ fontWeight: 800 }}>
              {windNames[seat]}：{seatName(seat)}
            </div>
            <div className="small">順位：{end.rankBySeat[seat]}位</div>
            <div className="kv" style={{ marginTop: 8 }}>
              <span className="small">最終点（調整込）</span>
              <span style={{ fontWeight: 800 }}>{end.finalScoresWithAdjust[seat]}</span>
            </div>
            <div className="kv" style={{ marginTop: 6 }}>
              <span className="small">pt（2位以下は切上げ／1位は残差で合計0）</span>
              <span style={{ fontWeight: 900 }}>{end.ptBySeat[seat]}</span>
            </div>
          </div>
        ))}
      </div>

      <hr />

      <h3>Sessionトータルpt（このSession内のMatch合算）</h3>
      <div className="small">
        ※各Matchの「最終pt（ウマ・オカ反映後。2位以下は切り上げ、1位は合計0になる残差）」を単純合算します。
      </div>

      <div style={{ marginTop: 10 }}>
        <table className="table">
          <thead>
            <tr><th>順位</th><th>プレイヤー</th><th>トータルpt</th></tr>
          </thead>
          <tbody>
            {sessionTotals.map((r, idx) => (
              <tr key={r.playerId}>
                <td>{idx + 1}</td>
                <td>{r.name}</td>
                <td style={{ fontWeight: 800 }}>{r.totalPt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr />

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={props.onEdit}>このゲームを修正</button>
        <button className="btn primary" onClick={props.onNextGame}>次のゲーム</button>
        <button className="btn danger" onClick={props.onEndSession}>Session終了</button>
        <button className="btn" onClick={props.onDeleteSession}>Session削除</button>
      </div>
    </div>
  );
}
