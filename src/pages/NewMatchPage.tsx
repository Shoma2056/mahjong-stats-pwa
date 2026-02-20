import React, { useMemo, useState } from "react";
import type { Player, Rules, Session, UmaPresetId, GameMode } from "../types";

import "../NewMatchPage.css";

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
  <div className="newMatchPage">
    <div className="newMatchBgLayer" />

    <header className="newMatchHeader">
      <button className="newMatchHomeBtn" onClick={p.onBack}>
      {"<"}  戻る
    </button>
      <h1 className="newMatchTitle">新規対局</h1>
      <div className="newMatchDivider" />
    </header>

    

    <section className="newMatchSection gameModeRow">
      <h3 className="newMatchH3">麻雀種類</h3>

      {/* 今のselectは残す（見た目はCSSで） */}
      <select
        className="ruleSelect"
        value={rules.gameMode}
        onChange={(e) => {
          const gm = e.target.value as GameMode;
          setRules({ ...rules, gameMode: gm });
          setSelectedIds([]);
        }}
      >
        <option value="yonma">4麻</option>
        <option value="sanma">3麻</option>
        <option value="yonma_sanma4">4人3麻</option>
      </select>
    </section>

    <div className="newMatchDivider subtle" />

    <section className="newMatchSection">
      <h3 className="newMatchH3">参加者（{needPlayers}人）</h3>
      <p className="newMatchHelp">{needPlayers}人選択してください。</p>

      <div className="gameTypeGrid">
        {p.players.map((pl) => {
          const on = selectedIds.includes(pl.id);
          return (
            <button
              key={pl.id}
              className={`gameTypeBtn ${on ? "isActive" : ""}`}
              onClick={() => togglePlayer(pl.id)}
            >
              {pl.name}
            </button>
          );
        })}
      </div>
    </section>

    <div className="newMatchDivider subtle" />

    <section className="newMatchSection">
      <h3 className="newMatchH3">ルール</h3>

      <div className="ruleList">
        <div className="ruleRow">
          <div className="ruleLabel">開始点</div>
          <input
            value={rules.startPoints}
            onChange={(e) => setRules({ ...rules, startPoints: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>

        <div className="ruleRow">
          <div className="ruleLabel">返し点</div>
          <input
            value={rules.returnPoints}
            onChange={(e) => setRules({ ...rules, returnPoints: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>

        <div className="ruleRow">
          <div className="ruleLabel">トップ取り</div>
          <input
            value={rules.topOkaPoints}
            onChange={(e) => setRules({ ...rules, topOkaPoints: Number(e.target.value) })}
            inputMode="numeric"
          />
        </div>

        <div className="ruleRow">
          <div className="ruleLabel">飛び</div>
          <select
            value={rules.tobiRule}
            onChange={(e) => setRules({ ...rules, tobiRule: e.target.value as any })}
          >
            <option value="leq0">あり（0点以下で飛び）</option>
            <option value="lt0">あり（0点未満で飛び）</option>
            <option value="none">なし</option>
          </select>
        </div>

        <div className="ruleRow">
          <div className="ruleLabel">順位点</div>
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
        </div>
      </div>

      {rules.uma.presetId === "custom" && (
        <div className="ruleList" style={{ marginTop: 10 }}>
          <div className="ruleRow">
            <div className="ruleLabel">2着</div>
            <input
              value={rules.uma.second}
              onChange={(e) =>
                setRules({ ...rules, uma: { ...rules.uma, second: Number(e.target.value) } })
              }
              inputMode="numeric"
            />
          </div>

          <div className="ruleRow">
            <div className="ruleLabel">3着</div>
            <input
              value={rules.uma.third}
              onChange={(e) =>
                setRules({ ...rules, uma: { ...rules.uma, third: Number(e.target.value) } })
              }
              inputMode="numeric"
            />
          </div>

          <div className="ruleRow">
            <div className="ruleLabel">4着（3麻では未使用）</div>
            <input
              value={rules.uma.fourth}
              onChange={(e) =>
                setRules({ ...rules, uma: { ...rules.uma, fourth: Number(e.target.value) } })
              }
              inputMode="numeric"
            />
          </div>
        </div>
      )}

      {!ok && <div className="newMatchNote">※ {needPlayers}人選択すると進めます</div>}

      <div className="newMatchNextWrap">
        <button className="newMatchNextBtn" disabled={!ok} onClick={createSession}>
          席決めへ
        </button>
      </div>
    </section>
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

  const [seatIds, setSeatIds] = useState<(string | "")[]>(
    Array.from({ length: needSeats }, () => "")
  );

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
  <div className="newMatchPage">
    <div className="newMatchBgLayer" />

    <header className="newMatchHeader">
      <h1 className="newMatchTitle">席決め</h1>
      <div className="newMatchDivider" />
    </header>

    <button className="newMatchHomeBtn" onClick={p.onBack}>
      戻る
    </button>

    <p className="newMatchHelp" style={{ marginTop: 14 }}>
      {gm === "sanma"
        ? "参加者を東南西に割り当てます（北は常に欠け）。"
        : "参加者を東南西北に割り当てます。"}
    </p>

    <section className="newMatchSection">
      <div className="seatGrid">
        {winds.map((w, i) => (
          <div key={w} className="newMatchCard seatCard">
            <div className="seatWind">{w}</div>
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

      {!ok && <div className="newMatchNote">※ 席をすべて埋めて（重複なし）</div>}

      <div className="newMatchNextWrap">
        <button className="newMatchNextBtn" disabled={!ok} onClick={createMatch}>
          対局開始
        </button>
      </div>
    </section>
  </div>
);

}
