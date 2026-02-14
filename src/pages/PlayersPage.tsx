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
    <div className="card">
      <div className="kv">
        <h2>プレイヤー管理</h2>
        <button className="btn" onClick={props.onBack}>
          戻る
        </button>
      </div>

      <hr />

      {/* ✅ 2ブロックを専用レイアウトで管理（.rowは使わない） */}
      <div className="playersLayout">
        {/* 追加ブロック */}
        <section className="playersAdd">
          <label>新規プレイヤー名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：Aさん"
          />

          <div className="playersActions">
            <button
              className="btn primary"
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
          <label>登録済み</label>
          {players.length === 0 && (
            <div className="small">まだ登録がありません。</div>
          )}

          {players.map((p) => (
            <div key={p.id} className="kv card" style={{ marginTop: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="small">
                  {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>

              <button className="btn danger" onClick={() => confirmRemove(p)}>
                削除
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
