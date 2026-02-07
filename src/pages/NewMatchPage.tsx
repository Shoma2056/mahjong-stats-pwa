import React, { useMemo, useState } from "react";
import type { Player, Rules, Session, UmaPresetId, GameMode } from "../types";

const winds4 = ["東", "南", "西", "北"] as const;
const winds3 = ["東", "南", "西"] as const;

type NewSessionProps = {
  mode: "newSession";
  players: Player[];
  onBack: () => void;
  onCreateSession: (payload: {
    participantIds: string[];
    participantNames: string[];
    rules: Rules;
  }) => void;
};

type SeatSelectProps = {
  mode: "seatSelect";
  players: Player[];
  session: Session;
  onBack: () => void;
  onCreateMatch: (seats: { ids: string[]; names: string[] }) => void;
};

type Props = NewSessionProps | SeatSelectProps;

function buildDefaultRules(): Rules {
  return {
    gameMode: "yonma",
    startPoints: 25000,
    returnPoints: 30000,
    topOkaPoints: 20000,
    tobiRule: "leq0",
    uma: { presetId: "p1", second: 10, third: -10, fourth: -30 },
  };
}

function applyUmaPreset(presetId: UmaPresetId) {
  if (presetId === "p1") return { second: 10, third: -10, fourth: -30 };
  if (presetId === "p2") return { second: 10, third: -10, fourth: -20 };
  return { second: 10, third: -10, fourth: -30 };
}

export default function NewMatchPage(props: Props) {
  // ==========================
  // モード①：新規セッション作成
  // ==========================
  if (props.mode === "newSession") {
    const p = props as NewSessionProps;

    const [rules, setRules] = useState<Rules>(buildDefaultRules());
    const needPlayers = rules.gameMode === "sanma" ? 3 : 4;

    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const ok = selectedIds.length === needPlayers;

    function togglePlayer(id: string) {
      setSelectedIds((prev) =>
        prev.includes(id)
          ? prev.filter((x) => x !== id)
          : prev.length < needPlayers
          ? [...prev, id]
          : prev
      );
    }

    function createSession() {
      if (!ok) return;

      const names = selectedIds.map((id) => p.players.find((pl) => pl.id === id)?.name ?? "");
      p.onCreateSession({
        participantIds: selectedIds,
        participantNames: names,
        rules,
      });
    }

    return (
      <div className="card">
        <div className="kv">
          <h2>新しい対局（ルール設定）</h2>
          <button className="btn" onClick={p.onBack}>
            戻る
          </button>
        </div>

        <hr />

        <h3>麻雀種類</h3>
        <select
          value={rules.gameMode}
          onChange={(e) => {
            const gm = e.target.value as GameMode;
            setRules({ ...rules, gameMode: gm });
            setSelectedIds([]); // 人数が変わるので一旦リセット
          }}
        >
          <option value="yonma">4麻</option>
          <option value="sanma">3麻（北固定欠け）</option>
          <option value="yonma_sanma4">4人3麻（欠けが親から見た北）</option>
        </select>

        <hr />

        <h3>参加者（{needPlayers}人）</h3>
        <div className="small">{needPlayers}人選択してください（上限{needPlayers}人）。</div>
        <div style={{ marginTop: 8 }}>
          {p.players.map((pl) => (
            <button
              key={pl.id}
              className={`btn ${selectedIds.includes(pl.id) ? "primary" : ""}`}
              onClick={() => togglePlayer(pl.id)}
              style={{ marginRight: 6, marginBottom: 6 }}
            >
              {pl.name}
            </button>
          ))}
        </div>

        <hr />

        <h3>ルール</h3>

        <label>開始点</label>
        <input value={rules.startPoints} onChange={(e) => setRules({ ...rules, startPoints: Number(e.target.value) })} inputMode="numeric" />

        <label>返し点</label>
        <input value={rules.returnPoints} onChange={(e) => setRules({ ...rules, returnPoints: Number(e.target.value) })} inputMode="numeric" />

        <label>トップ取り（オカ）</label>
        <input value={rules.topOkaPoints} onChange={(e) => setRules({ ...rules, topOkaPoints: Number(e.target.value) })} inputMode="numeric" />

        <label>飛び</label>
        <select value={rules.tobiRule} onChange={(e) => setRules({ ...rules, tobiRule: e.target.value as any })}>
          <option value="leq0">あり（0点以下で飛び）</option>
          <option value="lt0">あり（0点未満で飛び）</option>
          <option value="none">なし</option>
        </select>

        <label>ウマ（プリセット）</label>
        <select
          value={rules.uma.presetId}
          onChange={(e) => {
            const presetId = e.target.value as UmaPresetId;
            setRules({
              ...rules,
              uma: { presetId, ...applyUmaPreset(presetId) },
            });
          }}
        >
          <option value="p1">+10 / -10 / -30</option>
          <option value="p2">+10 / -10 / -20</option>
          <option value="custom">カスタム</option>
        </select>

        {rules.uma.presetId === "custom" && (
          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: "1 1 120px" }}>
              <label>2着</label>
              <input value={rules.uma.second} onChange={(e) => setRules({ ...rules, uma: { ...rules.uma, second: Number(e.target.value) } })} inputMode="numeric" />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>3着</label>
              <input value={rules.uma.third} onChange={(e) => setRules({ ...rules, uma: { ...rules.uma, third: Number(e.target.value) } })} inputMode="numeric" />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <label>4着（3麻では未使用）</label>
              <input value={rules.uma.fourth} onChange={(e) => setRules({ ...rules, uma: { ...rules.uma, fourth: Number(e.target.value) } })} inputMode="numeric" />
            </div>
          </div>
        )}

        <hr />

        <button className="btn primary" disabled={!ok} onClick={createSession}>
          次へ（席決め）
        </button>
        {!ok && <div className="small" style={{ marginTop: 8 }}>※ {needPlayers}人選択すると進めます</div>}
      </div>
    );
  }

  // ==========================
  // モード②：席決め
  // ==========================
  const p = props as SeatSelectProps;
  const gm = p.session.rules.gameMode;
  const needSeats = gm === "sanma" ? 3 : 4;
  const winds = gm === "sanma" ? winds3 : winds4;

  const [seatIds, setSeatIds] = useState<(string | "")[]>(Array.from({ length: needSeats }, () => ""));

  const ok = useMemo(() => {
    if (seatIds.some((x) => !x)) return false;
    return new Set(seatIds).size === needSeats;
  }, [seatIds, needSeats]);

  function setSeat(i: number, id: string) {
    const next = [...seatIds];
    next[i] = id;
    setSeatIds(next);
  }

  function createMatch() {
    if (!ok) return;
    const idsCore = seatIds as string[];
    const namesCore = idsCore.map((id) => p.players.find((pl) => pl.id === id)?.name ?? "");

    // Matchは4要素固定にする（3麻は北を "" にして欠け）
    const ids = gm === "sanma" ? [...idsCore, ""] : idsCore;
    const names = gm === "sanma" ? [...namesCore, "欠け"] : namesCore;

    p.onCreateMatch({ ids, names });
  }

  return (
    <div className="card">
      <div className="kv">
        <h2>席決め</h2>
        <button className="btn" onClick={p.onBack}>
          戻る
        </button>
      </div>

      <div className="small">
        {gm === "sanma" ? "参加者を東南西に割り当てます（北は常に欠け）。" : "参加者を東南西北に割り当てます。"}
      </div>
      <hr />

      <div className={needSeats === 3 ? "grid3" : "grid4"}>
        {winds.map((w, i) => (
          <div key={w} className="card">
            <div style={{ fontWeight: 800 }}>{w}</div>
            <select value={seatIds[i]} onChange={(e) => setSeat(i, e.target.value)}>
              <option value="">選択…</option>
              {p.session.participantIds.map((pid) => (
                <option key={pid} value={pid}>
                  {p.players.find((pl) => pl.id === pid)?.name ?? pid}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <hr />

      <button className="btn primary" disabled={!ok} onClick={createMatch}>
        対局開始
      </button>
      {!ok && <div className="small" style={{ marginTop: 8 }}>※ 席をすべて埋めて（重複なし）</div>}
    </div>
  );
}
