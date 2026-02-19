// # ======================================================================
// # pages/PlayersPage.tsx（プレイヤー管理画面）
// # 役割：
// # - プレイヤーの追加 / 削除を行う
// # - 重複名を防ぐ（同名チェック）
// # - 保存処理自体は親（App.tsx）に任せ、このページはUI入力のみ担当
// # ======================================================================

import React, { useMemo, useState } from "react";
import type { Player } from "../types";
import { uid } from "../logic/mahjong";

import "../PlayersPage.css";

export default function PlayersPage(props: {
  players: Player[];
  onSave: (players: Player[]) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const players = props.players;

  const exists = useMemo(
    () => players.some((p) => p.name.trim() === name.trim()),
    [players, name]
  );

  function add() {
    const n = name.trim();
    if (!n || exists) return;

    props.onSave([{ id: uid("p"), name: n, createdAt: Date.now() }, ...players]);
    setName("");
  }

  function remove(id: string) {
    props.onSave(players.filter((p) => p.id !== id));
  }

  function confirmRemove(p: Player) {
    const ok = window.confirm(
      `プレイヤー「${p.name}」を削除しますか？\n\n※元に戻せません`
    );
    if (!ok) return;
    remove(p.id);
  }

  return (
    <div className="playersPage">
      <div className="playersBgLayer" />
      <div className="playersHeader">
        <button className="playersBackBtn" onClick={props.onBack}>
          {"<"}  戻る
        </button>
        <h2 className="playersTitle">プレイヤー管理</h2>
        <div className="playersTitleDivider" />
      </div>

      {/* ✅ 2ブロックを専用レイアウトで管理（.rowは使わない） */}
      <div className="playersLayout">
        {/* 追加ブロック */}
        <section className="playersAdd">

           <div className="playersAddRow">
          
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：Aさん"
          />

            <button
              className="playersAddBtn"
              disabled={!name.trim() || exists}
              onClick={add}
            >
              追加
            </button>
            {exists && <span className="pill">同名が既にあります</span>}
          </div>
        </section>

        {/* 一覧ブロック */}
        <section className="playersList">
          
          {players.length === 0 && (
            <div className="small">まだ登録がありません。</div>
          )}

          {players.map((p) => (
            <div key={p.id} className="playerCard">
              <div className="playerName">{p.name}</div>

              <button className="playerDeleteBtn" onClick={() => confirmRemove(p)}>
                削除
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
