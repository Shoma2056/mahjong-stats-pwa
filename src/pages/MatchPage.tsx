import React, { useMemo, useState, useEffect } from "react";
import type { AdjustmentLog, KyokuAction, KyokuResult, Match, Player, WindSeat } from "../types";
import {
  computeNextFromInput,
  uid,
  roundLabel,
  applyAdjustmentsToScores,
} from "../logic/mahjong";

const windNames = ["東", "南", "西", "北"] as const;

type Tab = "tsumo" | "ron" | "draw";

function presetPoints(): number[] {
  return [1000, 2000, 3000, 4000, 6000, 8000, 12000, 16000, 24000, 32000];
}

// ------------------------------------------------------------
// GameMode / 参加席 / 欠け席
// - yonma:        4人全員
// - sanma:        東南西のみ参加、北は常に欠け
// - yonma_sanma4: 親から見た北が欠け（親が回れば欠けも回る）
// ------------------------------------------------------------
function getGameMode(match: Match): "yonma" | "sanma" | "yonma_sanma4" {
  const r = (match as any).rules as any;
  return (r?.gameMode ?? "yonma") as any;
}

function activeSeats(match: Match, dealer: WindSeat): WindSeat[] {
  const gm = getGameMode(match);
  if (gm === "yonma") return [0, 1, 2, 3] as WindSeat[];
  if (gm === "sanma") return [0, 1, 2] as WindSeat[];
  // yonma_sanma4
  return [dealer, ((dealer + 1) % 4) as WindSeat, ((dealer + 2) % 4) as WindSeat];
}

function absentSeat(match: Match, dealer: WindSeat): WindSeat | null {
  const gm = getGameMode(match);
  if (gm === "yonma") return null;
  if (gm === "sanma") return 3;
  // yonma_sanma4
  return ((dealer + 3) % 4) as WindSeat;
}

function isActive(match: Match, dealer: WindSeat, seat: WindSeat): boolean {
  return activeSeats(match, dealer).includes(seat);
}

export default function MatchPage(props: {
  players: Player[];
  match: Match;
  onPersist: (m: Match) => void;
  onBack: () => void;
  onEnd: () => void;
  onRecompute: (m: Match) => Match;
}) {
  const m = props.match;

  const gm = useMemo(() => getGameMode(m), [m]);
  const act = useMemo(() => activeSeats(m, m.currentDealer), [m, m.currentDealer]);
  const abs = useMemo(() => absentSeat(m, m.currentDealer), [m, m.currentDealer]);

  const seatDisplayNames = useMemo(() => {
    return ([0, 1, 2, 3] as WindSeat[]).map((seat) => {
      const pid = m.seats?.[seat];
      // 3麻の北は pid="" のことがあるので「欠け」
      if (!pid) return seat === 3 && gm !== "yonma" ? "欠け" : (m.seatNames?.[seat] ?? `P${seat + 1}`);
      return props.players.find((p) => p.id === pid)?.name ?? m.seatNames?.[seat] ?? pid;
    });
  }, [m.seats, m.seatNames, props.players, gm]);

  // ------------------------------------------------------------
  // 入力状態
  // ------------------------------------------------------------
  const [furo, setFuro] = useState<number[]>([0, 0, 0, 0]);
  const [riichiOn, setRiichiOn] = useState<boolean[]>([false, false, false, false]);
  const [orderState, setOrderState] = useState<number[]>([0, 0, 0, 0]);

  const [tab, setTab] = useState<Tab>("tsumo");

  // winner/loser は参加席から選ぶ
  const [winner, setWinner] = useState<WindSeat>(act[0] ?? 0);
  const [loser, setLoser] = useState<WindSeat>(act[1] ?? act[0] ?? 0);

  const [oyaAll, setOyaAll] = useState<string>("");
  const [koPay, setKoPay] = useState<string>("");
  const [oyaPay, setOyaPay] = useState<string>("");
  const [ronPay, setRonPay] = useState<string>("");

  // ★裏ドラ枚数（立直和了時のみ）
  const [uraCount, setUraCount] = useState<string>("");

  const [tenpai, setTenpai] = useState<boolean[]>([false, false, false, false]);

  const [showHistory, setShowHistory] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  // dealer が変わると参加席が変わる（4人3麻）ので、winner/loser を追随
  useEffect(() => {
    const a = activeSeats(m, m.currentDealer);
    if (!a.includes(winner)) setWinner(a[0] ?? 0);
    if (!a.includes(loser) || loser === winner) setLoser(a.find((s) => s !== winner) ?? a[0] ?? 0);

    // 欠けはテンパイ不可
    const nextTenpai = [...tenpai];
    for (let s = 0 as WindSeat; s <= 3; s = ((s + 1) % 4) as WindSeat) {
      if (!isActive(m, m.currentDealer, s)) nextTenpai[s] = false;
      if (s === 3) break;
    }
    setTenpai(nextTenpai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.currentDealer, gm]);

  // ------------------------------------------------------------
  // 調整込みスコア
  // ------------------------------------------------------------
  const scoresWithAdj = useMemo(() => {
    return applyAdjustmentsToScores(m.currentScores, m.adjustments, m.logs.length);
  }, [m.currentScores, m.adjustments, m.logs.length]);

  function currentHeader() {
    return `${roundLabel(m.currentRound)} / 親:${windNames[m.currentDealer]}`;
  }

  function toggleRiichi(seat: WindSeat) {
    if (!act.includes(seat)) return;
    const on = !riichiOn[seat];

    const nextOn = [...riichiOn];
    nextOn[seat] = on;
    setRiichiOn(nextOn);

    const nextOrder = [...orderState];
    if (on) {
      const used = new Set(nextOrder.filter((x) => x > 0));
      let k = 1;
      while (used.has(k) && k <= 4) k++;
      nextOrder[seat] = k <= 4 ? k : 0;
    } else {
      const removed = nextOrder[seat];
      nextOrder[seat] = 0;
      for (let i = 0; i < 4; i++) {
        if (nextOrder[i] > removed) nextOrder[i] -= 1;
      }
    }
    setOrderState(nextOrder);
  }

  function buildAction(): KyokuAction {
    const f = furo.map((x, i) => (act.includes(i as WindSeat) ? Math.max(0, Math.min(4, x | 0)) : 0));
    const r = orderState.map((x, i) => (act.includes(i as WindSeat) ? (x | 0) : 0));
    return { furoCount: f, riichiOrder: r };
  }

  function winnerDidRiichi(action: KyokuAction, winSeat: WindSeat): boolean {
    return (action.riichiOrder?.[winSeat] ?? 0) > 0;
  }

  function canConfirm(): boolean {
    if (m.ended && editIndex === null) return false;

    // winner/loser が欠けなら不可
    if (!act.includes(winner)) return false;
    if (tab === "ron" && (!act.includes(loser) || winner === loser)) return false;

    if (tab === "draw") return true;

    if (tab === "tsumo") {
      const isDealer = winner === m.currentDealer;
      if (isDealer) return !!oyaAll && Number(oyaAll) > 0;
      return !!koPay && !!oyaPay && Number(koPay) > 0 && Number(oyaPay) > 0;
    }

    return !!ronPay && Number(ronPay) > 0;
  }

  function buildResult(action: KyokuAction): KyokuResult {
    // 裏ドラ：立直和了時のみ付与
    const u = uraCount.trim() === "" ? undefined : Number(uraCount);
    const uSafe = Number.isFinite(u as any) && (u as number) >= 0 && Number.isInteger(u as number) ? (u as number) : undefined;

    if (tab === "draw") {
      const t = tenpai.map((v, i) => (act.includes(i as WindSeat) ? v : false));
      return { type: "draw", tenpai: t };
    }

    if (tab === "tsumo") {
      const isDealer = winner === m.currentDealer;
      const base: KyokuResult =
        isDealer
          ? { type: "tsumo", winner, points: { kind: "oya_all", all: Number(oyaAll) } }
          : { type: "tsumo", winner, points: { kind: "ko_split", ko: Number(koPay), oya: Number(oyaPay) } };

      if (winnerDidRiichi(action, winner) && typeof uSafe === "number") {
        (base as any).uraCount = uSafe;
      }
      return base;
    }

    const base: KyokuResult = { type: "ron", winner, loser, points: { kind: "ron", ron: Number(ronPay) } };
    if (winnerDidRiichi(action, winner) && typeof uSafe === "number") {
      (base as any).uraCount = uSafe;
    }
    return base;
  }

  function resetInputs() {
    setFuro([0, 0, 0, 0]);
    setRiichiOn([false, false, false, false]);
    setOrderState([0, 0, 0, 0]);
    setTab("tsumo");

    const a = activeSeats(m, m.currentDealer);
    setWinner(a[0] ?? 0);
    setLoser(a.find((s) => s !== (a[0] ?? 0)) ?? a[0] ?? 0);

    setOyaAll("");
    setKoPay("");
    setOyaPay("");
    setRonPay("");
    setUraCount("");
    setTenpai([false, false, false, false]);
  }

  function confirm() {
    if (!canConfirm()) return;

    const action = buildAction();
    const result = buildResult(action);

    const { updatedMatch } = computeNextFromInput({ match: m, action, result });
    props.onPersist(updatedMatch);
    resetInputs();
    if (updatedMatch.ended) props.onEnd();
  }

  // ------------------------------------------------------------
  // 履歴編集
  // ------------------------------------------------------------
  function openEdit(i: number) {
    setEditIndex(i);
    setShowHistory(false);

    const log = m.logs[i];
    setFuro([...log.action.furoCount]);

    const nextOn = log.action.riichiOrder.map((x) => x > 0);
    setRiichiOn(nextOn);
    setOrderState([...log.action.riichiOrder]);

    setUraCount("");

    if (log.result.type === "draw") {
      setTab("draw");
      setTenpai([...log.result.tenpai]);
    } else if (log.result.type === "tsumo") {
      setTab("tsumo");
      setWinner(log.result.winner);
      if (log.result.points.kind === "oya_all") {
        setOyaAll(String(log.result.points.all));
        setKoPay("");
        setOyaPay("");
      } else {
        setKoPay(String(log.result.points.ko));
        setOyaPay(String(log.result.points.oya));
        setOyaAll("");
      }
      if (typeof (log.result as any).uraCount === "number") setUraCount(String((log.result as any).uraCount));
    } else {
      setTab("ron");
      setWinner(log.result.winner);
      setLoser(log.result.loser);
      setRonPay(String(log.result.points.ron));
      if (typeof (log.result as any).uraCount === "number") setUraCount(String((log.result as any).uraCount));
    }
  }

  function applyEdit() {
    if (editIndex === null) return;
    if (!canConfirm()) return;

    const action = buildAction();
    const result = buildResult(action);

    const logs = [...m.logs];
    logs[editIndex] = { ...logs[editIndex], action, result };

    const updated = props.onRecompute({ ...m, logs, ended: false, endReason: undefined });
    props.onPersist(updated);

    setEditIndex(null);
    resetInputs();
    if (updated.ended) props.onEnd();
  }

  function cancelEdit() {
    setEditIndex(null);
    resetInputs();
  }

  // ------------------------------------------------------------
  // 点数修正
  // ------------------------------------------------------------
  const [adjSeat, setAdjSeat] = useState<WindSeat>(0);
  const [adjDelta, setAdjDelta] = useState<string>("");
  const [adjReason, setAdjReason] = useState<string>("");

  function addAdjustment() {
    const delta = Number(adjDelta);
    if (!Number.isFinite(delta) || delta === 0) return;

    const a: AdjustmentLog = {
      id: uid("adj"),
      createdAt: Date.now(),
      afterKyokuIndex: m.logs.length,
      seat: adjSeat,
      delta,
      reason: adjReason.trim() || undefined,
    };

    const updated: Match = { ...m, adjustments: [...m.adjustments, a], updatedAt: Date.now() };

    // 飛び判定（調整後点数が大事）
    const scoresAdj = applyAdjustmentsToScores(updated.currentScores, updated.adjustments, updated.logs.length);
    if (scoresAdj.some((s) => s <= 0)) {
      updated.ended = true;
      updated.endReason = "飛び終了（点数修正）";
      props.onPersist(updated);
      setShowAdjust(false);
      props.onEnd();
      return;
    }

    props.onPersist(updated);
    setAdjDelta("");
    setAdjReason("");
    setShowAdjust(false);
  }

  const summary = useMemo(() => {
    const r = m.currentRound;
    const riichiCnt = orderState.filter((x, i) => x > 0 && act.includes(i as WindSeat)).length;
    return {
      header: currentHeader(),
      riichiCnt,
      honba: r.honba,
      pot: m.currentRiichiPot,
    };
  }, [m.currentRound, m.currentRiichiPot, orderState, act]);

  return (
    <div className="row">
      <div className="card" style={{ flex: "1 1 420px" }}>
        <div className="kv">
          <div>
            <h2>{summary.header}</h2>
            <div className="small">
              供託: {m.currentRiichiPot} / 本場: {m.currentRound.honba}
              {gm === "yonma" ? " ・4麻" : gm === "sanma" ? " ・3麻（北固定欠け）" : " ・4人3麻（欠けあり）"}
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setShowHistory(true)}>局履歴</button>
            <button className="btn" onClick={() => setShowAdjust(true)}>点数修正</button>
            <button className="btn" onClick={props.onBack}>終了</button>
          </div>
        </div>

        <hr />

        {/* 現在点 */}
        <div className="grid4">
          {([0, 1, 2, 3] as WindSeat[]).map((seat) => {
            const isAbs = abs === seat;
            const isAct = act.includes(seat);
            return (
              <div key={seat} className="card" style={{ opacity: isAbs ? 0.65 : 1 }}>
                <div className="kv">
                  <div style={{ fontWeight: 800 }}>
                    {windNames[seat]}：{seatDisplayNames[seat]}
                  </div>
                  {seat === 0 && <span className="badge info">起家</span>}
                  {seat === m.currentDealer && <span className="badge ok">親</span>}
                  {isAbs && <span className="badge danger">欠け</span>}
                  {!isAbs && isAct && gm !== "yonma" && <span className="badge info">参加</span>}
                </div>
                <div className="kv" style={{ marginTop: 8 }}>
                  <span className="small">点（調整込）</span>
                  <span style={{ fontWeight: 800 }}>{scoresWithAdj[seat]}</span>
                </div>
              </div>
            );
          })}
        </div>

        <hr />

        {/* 局中の状態 */}
        <h3>局中の状態</h3>
        <div className="grid4">
          {([0, 1, 2, 3] as WindSeat[]).map((seat) => {
            const disabled = !act.includes(seat);
            return (
              <div key={seat} className="card" style={{ opacity: disabled ? 0.6 : 1 }}>
                <div style={{ fontWeight: 700 }}>
                  {windNames[seat]} {seatDisplayNames[seat]} {disabled ? "（欠け）" : ""}
                </div>
                <hr />

                <label>副露回数</label>
                <div className="row">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      className={`btn ${furo[seat] === n ? "primary" : ""}`}
                      disabled={disabled}
                      onClick={() => {
                        const next = [...furo];
                        next[seat] = n;
                        setFuro(next);
                      }}
                      style={{ padding: "8px 10px" }}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 10 }}>
                  <label>立直</label>
                  <div className="row">
                    <button
                      className={`btn ${riichiOn[seat] ? "primary" : ""}`}
                      disabled={disabled}
                      onClick={() => toggleRiichi(seat)}
                    >
                      {riichiOn[seat] ? `ON（${orderState[seat]}番）` : "OFF"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <hr />

        {/* 結果入力 */}
        <h3>結果入力</h3>
        <div className="tabs">
          <div className={`tab ${tab === "tsumo" ? "active" : ""}`} onClick={() => setTab("tsumo")}>ツモ</div>
          <div className={`tab ${tab === "ron" ? "active" : ""}`} onClick={() => setTab("ron")}>ロン</div>
          <div className={`tab ${tab === "draw" ? "active" : ""}`} onClick={() => setTab("draw")}>流局</div>
        </div>

        <div style={{ marginTop: 10 }}>
          {tab !== "draw" && (
            <div className="row">
              <div style={{ flex: "1 1 180px" }}>
                <label>和了者</label>
                <select value={winner} onChange={(e) => setWinner(Number(e.target.value) as WindSeat)}>
                  {act.map((seat) => (
                    <option key={seat} value={seat}>
                      {windNames[seat]} {seatDisplayNames[seat]}
                    </option>
                  ))}
                </select>
              </div>
              {tab === "ron" && (
                <div style={{ flex: "1 1 180px" }}>
                  <label>放銃者</label>
                  <select value={loser} onChange={(e) => setLoser(Number(e.target.value) as WindSeat)}>
                    {act.filter((s) => s !== winner).map((seat) => (
                      <option key={seat} value={seat}>
                        {windNames[seat]} {seatDisplayNames[seat]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {tab === "tsumo" && (
            <div className="row">
              {winner === m.currentDealer ? (
                <div style={{ flex: "1 1 260px" }}>
                  <label>親ツモ：オール</label>
                  <input value={oyaAll} onChange={(e) => setOyaAll(e.target.value)} placeholder="例：1000" inputMode="numeric" />
                </div>
              ) : (
                <>
                  <div style={{ flex: "1 1 200px" }}>
                    <label>子支払い</label>
                    <input value={koPay} onChange={(e) => setKoPay(e.target.value)} placeholder="例：1000" inputMode="numeric" />
                  </div>
                  <div style={{ flex: "1 1 200px" }}>
                    <label>親支払い</label>
                    <input value={oyaPay} onChange={(e) => setOyaPay(e.target.value)} placeholder="例：2000" inputMode="numeric" />
                  </div>
                </>
              )}

              <div style={{ flex: "1 1 320px" }}>
                <label>プリセット</label>
                <div className="row">
                  {presetPoints().slice(0, 10).map((v) => (
                    <button
                      key={v}
                      className="btn"
                      onClick={() => {
                        if (winner === m.currentDealer) setOyaAll(String(v));
                        else setKoPay(String(v));
                      }}
                      style={{ padding: "8px 10px" }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="small">
                  ※3麻/4人3麻のツモは参加2人払い（欠けは払わない）。
                </div>
              </div>
            </div>
          )}

          {tab === "ron" && (
            <div className="row">
              <div style={{ flex: "1 1 260px" }}>
                <label>放銃支払い点</label>
                <input value={ronPay} onChange={(e) => setRonPay(e.target.value)} placeholder="例：1000" inputMode="numeric" />
              </div>
              <div style={{ flex: "1 1 420px" }}>
                <label>プリセット</label>
                <div className="row">
                  {presetPoints().map((v) => (
                    <button key={v} className="btn" onClick={() => setRonPay(String(v))} style={{ padding: "8px 10px" }}>
                      {v}
                    </button>
                  ))}
                </div>
                <div className="small">
                  ※3麻系の本場は支払いに +1000×本場 上乗せ。
                </div>
              </div>
            </div>
          )}

          {tab !== "draw" && (
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: "1 1 240px" }}>
                <label>裏ドラ枚数（立直和了時のみ）</label>
                <input value={uraCount} onChange={(e) => setUraCount(e.target.value)} placeholder="例：0 / 1 / 2" inputMode="numeric" />
                <div className="small">※立直していない和了者の場合、この値は保存されません。</div>
              </div>
            </div>
          )}

          {tab === "draw" && (
            <div className="card">
              <div style={{ fontWeight: 800, marginBottom: 8 }}>
                テンパイ者（参加者のみ）
              </div>
              <div className="grid4">
                {([0, 1, 2, 3] as WindSeat[]).map((seat) => {
                  const disabled = !act.includes(seat);
                  return (
                    <button
                      key={seat}
                      className={`btn ${tenpai[seat] ? "primary" : ""}`}
                      disabled={disabled}
                      onClick={() => {
                        const next = [...tenpai];
                        next[seat] = !next[seat];
                        setTenpai(next);
                      }}
                    >
                      {windNames[seat]} {seatDisplayNames[seat]}{" "}
                      {disabled ? "（欠け）" : tenpai[seat] ? "（テンパイ）" : "（ノーテン）"}
                    </button>
                  );
                })}
              </div>
              <div className="small" style={{ marginTop: 8 }}>
                ※3麻/4人3麻のノーテン罰符は参加者内で合計2000点移動。
              </div>
            </div>
          )}
        </div>

        <hr />

        {/* 確認 */}
        <div className="card">
          <div style={{ fontWeight: 800 }}>確認サマリー</div>
          <div className="small">
            立直 {summary.riichiCnt}人（供託 +{summary.riichiCnt * 1000}）／本場 {summary.honba}／供託残 {summary.pot}
          </div>
          {editIndex !== null && (
            <div className="badge info" style={{ marginTop: 8 }}>
              編集モード：{roundLabel(m.logs[editIndex].roundStart)} を修正中（この局以降は再計算）
            </div>
          )}
        </div>

        <hr />

        <div className="row">
          {editIndex === null ? (
            <button className="btn primary" disabled={!canConfirm()} onClick={confirm}>
              確定（次局へ）
            </button>
          ) : (
            <>
              <button className="btn primary" disabled={!canConfirm()} onClick={applyEdit}>
                編集を反映（再計算）
              </button>
              <button className="btn" onClick={cancelEdit}>編集をやめる</button>
            </>
          )}
        </div>
      </div>

      {/* 右：直近履歴 */}
      <div className="card" style={{ flex: "1 1 360px" }}>
        <h3>局履歴（直近）</h3>
        <div className="small">任意の過去局を編集できます。</div>
        <hr />
        {m.logs.length === 0 && <div className="small">まだ局がありません。</div>}
        {m.logs.slice().reverse().slice(0, 12).map((log, idxRev) => {
          const i = m.logs.length - 1 - idxRev;
          return (
            <div key={log.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 800 }}>{roundLabel(log.roundStart)}（親:{windNames[log.dealer]}）</div>
              <div className="small">
                {log.result.type === "draw" ? "流局" : log.result.type === "tsumo" ? "ツモ" : "ロン"}
                {typeof (log.result as any).uraCount === "number" ? ` / 裏${(log.result as any).uraCount}` : ""}
                {log.ended ? ` / 終局: ${log.endReason}` : ""}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => openEdit(i)}>編集</button>
              </div>
            </div>
          );
        })}
      </div>

      {/* モーダル：局履歴 */}
      {showHistory && (
        <div className="card" style={{ position: "fixed", inset: 16, overflow: "auto", zIndex: 10 }}>
          <div className="kv">
            <h2>局履歴</h2>
            <button className="btn" onClick={() => setShowHistory(false)}>閉じる</button>
          </div>
          <div className="small">編集すると、その局以降がすべて再計算されます。</div>
          <hr />
          {m.logs.map((log, i) => (
            <div key={log.id} className="card" style={{ marginBottom: 10 }}>
              <div className="kv">
                <div>
                  <div style={{ fontWeight: 800 }}>{roundLabel(log.roundStart)}（親:{windNames[log.dealer]}）</div>
                  <div className="small">
                    {log.result.type === "draw" ? "流局" : log.result.type === "tsumo" ? "ツモ" : "ロン"}
                    {typeof (log.result as any).uraCount === "number" ? ` / 裏${(log.result as any).uraCount}` : ""}
                    {log.ended ? ` / 終局: ${log.endReason}` : ""}
                  </div>
                </div>
                <button className="btn primary" onClick={() => openEdit(i)}>編集</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* モーダル：点数修正 */}
      {showAdjust && (
        <div className="card" style={{ position: "fixed", inset: 16, zIndex: 10, maxWidth: 720, margin: "0 auto" }}>
          <div className="kv">
            <h2>点数修正（罰符など）</h2>
            <button className="btn" onClick={() => setShowAdjust(false)}>閉じる</button>
          </div>
          <div className="small">局/本場/供託/親は更新しません。点数だけ動かします（反映後に飛び判定）。</div>
          <hr />
          <div className="row">
            <div style={{ flex: "1 1 200px" }}>
              <label>対象</label>
              <select value={adjSeat} onChange={(e) => setAdjSeat(Number(e.target.value) as WindSeat)}>
                {([0, 1, 2, 3] as WindSeat[]).map((seat) => (
                  <option key={seat} value={seat}>
                    {windNames[seat]} {seatDisplayNames[seat]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label>点数（±）</label>
              <input value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} placeholder="例：-2000 / +1000" />
            </div>
            <div style={{ flex: "2 1 300px" }}>
              <label>理由（任意）</label>
              <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="例：罰符 / 卓内裁定" />
            </div>
          </div>
          <hr />
          <div className="row">
            <button className="btn primary" onClick={addAdjustment} disabled={!adjDelta || Number(adjDelta) === 0}>
              反映
            </button>
            <span className="pill">反映先: 現在局の直前（afterKyokuIndex={m.logs.length}）</span>
          </div>

          <hr />
          <h3>修正履歴</h3>
          {m.adjustments.length === 0 && <div className="small">まだありません。</div>}
          {m.adjustments.slice().reverse().map((a) => (
            <div key={a.id} className="card" style={{ marginBottom: 8 }}>
              <div className="kv">
                <div style={{ fontWeight: 700 }}>
                  {windNames[a.seat]} {seatDisplayNames[a.seat]}：{a.delta > 0 ? "+" : ""}{a.delta}
                </div>
                <div className="small">{a.reason ?? ""}</div>
              </div>
              <div className="small">挿入位置: {a.afterKyokuIndex}局目の後</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
