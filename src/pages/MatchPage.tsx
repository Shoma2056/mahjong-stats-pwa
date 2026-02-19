// MatchPage.tsx
import React, { useMemo, useState, useEffect } from "react";
import "../MatchPage.css";
import type {
  AdjustmentLog,
  KyokuAction,
  KyokuResult,
  Match,
  Player,
  WindSeat,
} from "../types";
import {
  computeNextFromInput,
  uid,
  roundLabel,
  applyAdjustmentsToScores,
} from "../logic/mahjong";

const windNames = ["東", "南", "西", "北"] as const;

type Tab = "tsumo" | "ron" | "draw";

// ==============================
// プリセット（あなた指定）
// ==============================
const PRESET_OYA_TSUMO: number[] = [
  500, 700, 800, 1000, 1300, 1600, 2000, 2600, 3200, 4000, 6000, 8000, 12000, 16000,
];

const PRESET_KO_TSUMO: Array<{ ko: number; oya: number }> = [
  { ko: 300, oya: 500 },
  { ko: 400, oya: 700 },
  { ko: 400, oya: 800 },
  { ko: 500, oya: 1000 },
  { ko: 700, oya: 1300 },
  { ko: 800, oya: 1600 },
  { ko: 1000, oya: 2000 },
  { ko: 1300, oya: 2600 },
  { ko: 1600, oya: 3200 },
  { ko: 2000, oya: 4000 },
  { ko: 3000, oya: 6000 },
  { ko: 4000, oya: 8000 },
  { ko: 6000, oya: 12000 },
  { ko: 8000, oya: 16000 },
];

const PRESET_RON: number[] = [
  1000, 1300, 1500, 1600, 2000, 2400, 2600, 2900, 3200, 3900, 4800, 5200, 5800,
  6400, 7700, 8000, 9600, 12000, 16000, 18000, 24000, 32000, 36000, 48000,
];

// ==============================
// モード関連（既存）
// ==============================
function getGameMode(match: Match): "yonma" | "sanma" | "yonma_sanma4" {
  const r = (match as any).rules as any;
  return (r?.gameMode ?? "yonma") as any;
}

function activeSeats(match: Match, dealer: WindSeat): WindSeat[] {
  const gm = getGameMode(match);
  if (gm === "yonma") return [0, 1, 2, 3] as WindSeat[];
  if (gm === "sanma") return [0, 1, 2] as WindSeat[];
  return [dealer, ((dealer + 1) % 4) as WindSeat, ((dealer + 2) % 4) as WindSeat];
}

function absentSeat(match: Match, dealer: WindSeat): WindSeat | null {
  const gm = getGameMode(match);
  if (gm === "yonma") return null;
  if (gm === "sanma") return 3;
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
      if (!pid) {
        return seat === 3 && gm !== "yonma"
          ? "欠け"
          : (m.seatNames?.[seat] ?? `P${seat + 1}`);
      }
      return (
        props.players.find((p) => p.id === pid)?.name ??
        m.seatNames?.[seat] ??
        pid
      );
    });
  }, [m.seats, m.seatNames, props.players, gm]);

  // ==============================
  // UI State
  // ==============================
  const [furo, setFuro] = useState<number[]>([0, 0, 0, 0]);
  const [riichiOn, setRiichiOn] = useState<boolean[]>([false, false, false, false]);
  const [orderState, setOrderState] = useState<number[]>([0, 0, 0, 0]);

  const [tab, setTab] = useState<Tab>("tsumo");
  const [winner, setWinner] = useState<WindSeat>(act[0] ?? 0);
  const [loser, setLoser] = useState<WindSeat>(act[1] ?? act[0] ?? 0);

  const [oyaAll, setOyaAll] = useState<string>("");
  const [koPay, setKoPay] = useState<string>("");
  const [oyaPay, setOyaPay] = useState<string>("");
  const [ronPay, setRonPay] = useState<string>("");

  const [uraCount, setUraCount] = useState<string>("");
  const [tenpai, setTenpai] = useState<boolean[]>([false, false, false, false]);

  const [showHistory, setShowHistory] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);

  // ★結果入力（擬似ページ遷移：フルスクリーン）
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    const a = activeSeats(m, m.currentDealer);
    if (!a.includes(winner)) setWinner(a[0] ?? 0);
    if (!a.includes(loser) || loser === winner) {
      setLoser(a.find((s) => s !== winner) ?? a[0] ?? 0);
    }

    const nextTenpai = [...tenpai];
    for (let s = 0 as WindSeat; s <= 3; s = ((s + 1) % 4) as WindSeat) {
      if (!isActive(m, m.currentDealer, s)) nextTenpai[s] = false;
      if (s === 3) break;
    }
    setTenpai(nextTenpai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.currentDealer, gm]);

  const scoresWithAdj = useMemo(() => {
    return applyAdjustmentsToScores(
      m.currentScores,
      m.adjustments ?? [],
      (m.logs ?? []).length
    );
  }, [m.currentScores, m.adjustments, m.logs]);

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
    const f = furo.map((x, i) =>
      act.includes(i as WindSeat) ? Math.max(0, Math.min(4, x | 0)) : 0
    );
    const r = orderState.map((x, i) => (act.includes(i as WindSeat) ? (x | 0) : 0));
    return { furoCount: f, riichiOrder: r };
  }

  function winnerDidRiichi(action: KyokuAction, winSeat: WindSeat): boolean {
    return (action.riichiOrder?.[winSeat] ?? 0) > 0;
  }

  function canConfirm(): boolean {
    if (m.ended && editIndex === null) return false;

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
    const u = uraCount.trim() === "" ? undefined : Number(uraCount);
    const uSafe =
      Number.isFinite(u as any) && (u as number) >= 0 && Number.isInteger(u as number)
        ? (u as number)
        : undefined;

    if (tab === "draw") {
      const t = tenpai.map((v, i) => (act.includes(i as WindSeat) ? v : false));
      return { type: "draw", tenpai: t };
    }

    if (tab === "tsumo") {
      const isDealer = winner === m.currentDealer;
      const base: KyokuResult =
        isDealer
          ? { type: "tsumo", winner, points: { kind: "oya_all", all: Number(oyaAll) } }
          : {
              type: "tsumo",
              winner,
              points: { kind: "ko_split", ko: Number(koPay), oya: Number(oyaPay) },
            };

      if (winnerDidRiichi(action, winner) && typeof uSafe === "number") {
        (base as any).uraCount = uSafe;
      }
      return base;
    }

    const base: KyokuResult = {
      type: "ron",
      winner,
      loser,
      points: { kind: "ron", ron: Number(ronPay) },
    };
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

    setShowResult(false);
    resetInputs();

    if (updatedMatch.ended) props.onEnd();
  }

  function openEdit(i: number) {
    setEditIndex(i);
    setShowHistory(false);

    const log = (m.logs ?? [])[i];
    if (!log) return;

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

    setShowResult(true);
  }

  function applyEdit() {
    if (editIndex === null) return;
    if (!canConfirm()) return;

    const action = buildAction();
    const result = buildResult(action);

    const logs = [...(m.logs ?? [])];
    if (!logs[editIndex]) return;
    logs[editIndex] = { ...logs[editIndex], action, result };

    const updated = props.onRecompute({ ...m, logs, ended: false, endReason: undefined });
    props.onPersist(updated);

    setShowResult(false);
    setEditIndex(null);
    resetInputs();

    if (updated.ended) props.onEnd();
  }

  function cancelEdit() {
    setEditIndex(null);
    resetInputs();
  }

  const [adjSeat, setAdjSeat] = useState<WindSeat>(0);
  const [adjDelta, setAdjDelta] = useState<string>("");
  const [adjReason, setAdjReason] = useState<string>("");

  function addAdjustment() {
    const delta = Number(adjDelta);
    if (!Number.isFinite(delta) || delta === 0) return;

    const a: AdjustmentLog = {
      id: uid("adj"),
      createdAt: Date.now(),
      afterKyokuIndex: (m.logs ?? []).length,
      seat: adjSeat,
      delta,
      reason: adjReason.trim() || undefined,
    };

    const updated: Match = {
      ...m,
      adjustments: [...(m.adjustments ?? []), a],
      updatedAt: Date.now(),
    };

    const scoresAdj = applyAdjustmentsToScores(
      updated.currentScores,
      updated.adjustments ?? [],
      (updated.logs ?? []).length
    );
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

  const seatLayout: { key: string; seat: WindSeat }[] = [
    { key: "east", seat: 0 },
    { key: "north", seat: 3 },
    { key: "south", seat: 1 },
    { key: "west", seat: 2 },
  ];

  function SeatCard({ seat }: { seat: WindSeat }) {
    const isAbs = abs === seat;
    const isAct = act.includes(seat);
    const disabled = !isAct || isAbs;

    const badges: { text: string; cls: string }[] = [];
    if (seat === 0) badges.push({ text: "起家", cls: "info" });
    if (seat === m.currentDealer) badges.push({ text: "親", cls: "ok" });
    if (isAbs) badges.push({ text: "欠け", cls: "danger" });

    return (
      <div className="card seatCard" style={{ opacity: isAbs ? 0.65 : 1, minWidth: 0 }}>
        <div className="seatHead">
          <div className="seatTitle">
            <span className="seatWind">{windNames[seat]}：</span>
            <span className="seatName">{seatDisplayNames[seat]}</span>
          </div>
          <div className="seatBadges">
            {badges.map((b, idx) => (
              <span key={idx} className={`badge ${b.cls}`}>{b.text}</span>
            ))}
          </div>
        </div>

        <div className="seatScore">
          <span className="seatScoreNum">{scoresWithAdj[seat]}点</span>
        </div>

        <div className="seatSection">
          <div className="seatLabel">副露</div>
          <div className="furoGrid">
            {[0, 1, 2, 3, 4].map((n) => (
              <button
                key={n}
                className={`btn mini ${furo[seat] === n ? "primary" : ""}`}
                disabled={disabled}
                onClick={() => {
                  const next = [...furo];
                  next[seat] = n;
                  setFuro(next);
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="seatSection">
          <div className="seatLabel">立直</div>
          <button
            className={`btn miniWide ${riichiOn[seat] ? "primary" : ""}`}
            disabled={disabled}
            onClick={() => toggleRiichi(seat)}
          >
            {riichiOn[seat] ? `ON（${orderState[seat]}番）` : "OFF"}
          </button>
        </div>
      </div>
    );
  }

  const resultHint = useMemo(() => {
    if (tab === "draw") return "流局（テンパイ選択）";
    if (tab === "ron") return ronPay ? `ロン ${ronPay}` : "ロン";
    if (winner === m.currentDealer) return oyaAll ? `親ツモ ${oyaAll}` : "親ツモ";
    return (koPay || oyaPay) ? `子ツモ ${koPay || "?"}-${oyaPay || "?"}` : "子ツモ";
  }, [tab, ronPay, winner, m.currentDealer, oyaAll, koPay, oyaPay]);

  return (
    <div className="matchPage">
      <div className="matchWrap">
        {/* 上部ヘッダー */}
        <div className="card matchHeader">
          <div className="matchHeaderTop">
            <div className="matchTitle">{summary.header}</div>

            <div className="matchHeaderBtns">
              <button className="btn chip" onClick={() => setShowHistory(true)}>局履歴</button>
              <button className="btn chip" onClick={() => setShowAdjust(true)}>点数修正</button>
              <button className="btn chip" onClick={props.onBack}>ホーム</button>
            </div>
          </div>

          <div className="small">
            供託:{m.currentRiichiPot}
            {gm === "yonma" ? " / 4麻" : gm === "sanma" ? " / 3麻" : " / 4人3麻"}
          </div>
        </div>

        {/* 卓レイアウト */}
        <div className="tableGrid2x2">
          <div className="tableCell"><SeatCard seat={seatLayout[0].seat} /></div>
          <div className="tableCell"><SeatCard seat={seatLayout[1].seat} /></div>
          <div className="tableCell"><SeatCard seat={seatLayout[2].seat} /></div>
          <div className="tableCell"><SeatCard seat={seatLayout[3].seat} /></div>

          <div className="tableResult">
            <div
              className="card resultCard resultOpenCard"
              role="button"
              tabIndex={0}
              onClick={() => setShowResult(true)}
              onKeyDown={(e) => { if (e.key === "Enter") setShowResult(true); }}
              style={{ minWidth: 0 }}
            >
              <div className="resultOpenTop">
                <div className="resultTitle">結果</div>
                <span className="pill">タップで入力</span>
              </div>

              <div className="small" style={{ marginTop: 6 }}>
                立直 {summary.riichiCnt}人（供託 +{summary.riichiCnt * 1000}）／供託残 {summary.pot}
              </div>

              <div className="resultOpenHint">
                <span className="pill">{resultHint}</span>
                <span className="pill">入力は保持されます</span>
              </div>
            </div>
          </div>
        </div>

        {/* 結果入力：フルスクリーン */}
        {showResult && (
          <div className="card resultModal">
            <div className="kv">
              <h2>結果入力</h2>
              <button className="btn" onClick={() => setShowResult(false)}>戻る</button>
            </div>

            <div className="small">※「戻る」を押しても入力は消えません。</div>
            <hr />

            <div className="tabs compact">
              <div className={`tab ${tab === "tsumo" ? "active" : ""}`} onClick={() => setTab("tsumo")}>ツモ</div>
              <div className={`tab ${tab === "ron" ? "active" : ""}`} onClick={() => setTab("ron")}>ロン</div>
              <div className={`tab ${tab === "draw" ? "active" : ""}`} onClick={() => setTab("draw")}>流局</div>
            </div>

            {tab !== "draw" && (
              <div className="resultFormGrid" style={{ marginTop: 10 }}>
                <div className="field">
                  <label>和了者</label>
                  <select value={winner} onChange={(e) => setWinner(Number(e.target.value) as WindSeat)}>
                    {act.map((seat) => (
                      <option key={seat} value={seat}>
                        {windNames[seat]} {seatDisplayNames[seat]}
                      </option>
                    ))}
                  </select>
                </div>

                {tab === "tsumo" && (
                  <>
                    {winner === m.currentDealer ? (
                      <div className="field">
                        <label>親ツモ：オール</label>
                        <input value={oyaAll} onChange={(e) => setOyaAll(e.target.value)} placeholder="例：1300" inputMode="numeric" />
                      </div>
                    ) : (
                      <>
                        <div className="field">
                          <label>子支払い</label>
                          <input value={koPay} onChange={(e) => setKoPay(e.target.value)} placeholder="例：1000" inputMode="numeric" />
                        </div>
                        <div className="field">
                          <label>親支払い</label>
                          <input value={oyaPay} onChange={(e) => setOyaPay(e.target.value)} placeholder="例：2000" inputMode="numeric" />
                        </div>
                      </>
                    )}
                  </>
                )}

                {tab === "ron" && (
                  <>
                    <div className="field">
                      <label>放銃者</label>
                      <select value={loser} onChange={(e) => setLoser(Number(e.target.value) as WindSeat)}>
                        {act.filter((s) => s !== winner).map((seat) => (
                          <option key={seat} value={seat}>
                            {windNames[seat]} {seatDisplayNames[seat]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label>放銃支払い点</label>
                      <input value={ronPay} onChange={(e) => setRonPay(e.target.value)} placeholder="例：3900" inputMode="numeric" />
                    </div>
                  </>
                )}
              </div>
            )}

            {tab !== "draw" && (
              <div style={{ marginTop: 10 }}>
                <label>裏ドラ枚数（立直和了時のみ）</label>
                <input
                  value={uraCount}
                  onChange={(e) => setUraCount(e.target.value)}
                  placeholder="例：0 / 1 / 2"
                  inputMode="numeric"
                />
                <div className="small">※立直していない和了者の場合、この値は保存されません。</div>
              </div>
            )}

            {tab === "tsumo" && (
              <div style={{ marginTop: 12 }}>
                <div className="small" style={{ marginBottom: 6, fontWeight: 700 }}>プリセット</div>

                {winner === m.currentDealer ? (
                  <>
                    <div className="small" style={{ marginBottom: 6 }}>親ツモ（オール）</div>
                    <div className="presetGrid">
                      {PRESET_OYA_TSUMO.map((v) => (
                        <button
                          key={v}
                          className="btn preset"
                          onClick={() => {
                            setOyaAll(String(v));
                            setKoPay("");
                            setOyaPay("");
                          }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="small" style={{ marginBottom: 6 }}>子ツモ（子-親）</div>
                    <div className="presetGrid">
                      {PRESET_KO_TSUMO.map((p) => {
                        const key = `${p.ko}-${p.oya}`;
                        return (
                          <button
                            key={key}
                            className="btn preset"
                            onClick={() => {
                              setKoPay(String(p.ko));
                              setOyaPay(String(p.oya));
                              setOyaAll("");
                            }}
                          >
                            {key}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "ron" && (
              <div style={{ marginTop: 12 }}>
                <div className="small" style={{ marginBottom: 6, fontWeight: 700 }}>プリセット（ロン）</div>
                <div className="presetGrid">
                  {PRESET_RON.map((v) => (
                    <button key={v} className="btn preset" onClick={() => setRonPay(String(v))}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === "draw" && (
              <div className="card" style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>テンパイ者（参加者のみ）</div>
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
              </div>
            )}

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
        )}

        {/* 局履歴モーダル */}
        {showHistory && (
          <div className="card historyModal">
            <div className="kv">
              <h2>局履歴</h2>
              <button className="btn" onClick={() => setShowHistory(false)}>閉じる</button>
            </div>
            <div className="small">編集すると、その局以降がすべて再計算されます。</div>
            <hr />
            {(m.logs ?? []).length === 0 && <div className="small">まだ局がありません。</div>}
            {(m.logs ?? []).map((log, i) => (
              <div key={log.id} className="card historyItem">
                <div className="kv">
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      {roundLabel(log.roundStart)}（親:{windNames[log.dealer]}）
                    </div>
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

        {/* 点数修正モーダル */}
        {showAdjust && (
          <div className="card adjustModal">
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
              <span className="pill">反映先: 現在局の直前（afterKyokuIndex={(m.logs ?? []).length}）</span>
            </div>

            <hr />
            <h3>修正履歴</h3>
            {(m.adjustments ?? []).length === 0 && <div className="small">まだありません。</div>}
            {(m.adjustments ?? []).slice().reverse().map((a) => (
              <div key={a.id} className="card historyItem">
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
    </div>
  );
}
