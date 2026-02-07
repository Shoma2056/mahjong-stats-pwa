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
  // # 現在登録されているプレイヤー一覧
  players: Player[];

  // # 保存依頼（親で state 更新 + localStorage 保存）
  onSave: (players: Player[]) => void;

  // # ホームへ戻る
  onBack: () => void;
}) {
  // # ================================================================
  // # 1) UI状態：新規プレイヤー名の入力
  // # ================================================================
  const [name, setName] = useState("");

  // # 表示・処理で使うプレイヤー一覧（propsから）
  const players = props.players;

  // # ================================================================
  // # 2) 同名チェック
  // # - 前後空白を除いた名前で比較
  // # - 同名が存在する場合は true
  // # ================================================================
  const exists = useMemo(
    () => players.some(p => p.name.trim() === name.trim()),
    [players, name]
  );

  // # ================================================================
  // # 3) プレイヤー追加
  // # - 空文字 or 同名なら何もしない
  // # - uid でIDを振り、createdAt を記録
  // # - 追加後は入力欄をクリア
  // # ================================================================
  function add() {
    const n = name.trim();
    if (!n || exists) return;

    props.onSave([
      { id: uid("p"), name: n, createdAt: Date.now() },
      ...players
    ]);
    setName("");
  }

  // # ================================================================
  // # 4) プレイヤー削除
  // # - 指定した id を一覧から除外して保存
  // # ================================================================
  function remove(id: string) {
    props.onSave(players.filter(p => p.id !== id));
  }

  // # ================================================================
  // # 5) 画面表示
  // # - 左：新規プレイヤー追加
  // # - 右：登録済みプレイヤー一覧
  // # ================================================================
  return (
    <div className="card">
      {/* # ヘッダー：タイトル + 戻る */}
      <div className="kv">
        <h2>プレイヤー管理</h2>
        <button className="btn" onClick={props.onBack}>戻る</button>
      </div>

      <hr />

      <div className="row">
        {/* # 左カラム：新規プレイヤー追加 */}
        <div style={{ flex: "1 1 280px" }}>
          <label>新規プレイヤー名</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：Aさん"
          />

          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              disabled={!name.trim() || exists}
              onClick={add}
            >
              追加
            </button>
            {exists && <span className="pill">同名が既にあります</span>}
          </div>
        </div>

        {/* # 右カラム：登録済みプレイヤー一覧 */}
        <div style={{ flex: "2 1 420px" }}>
          <label>登録済み</label>
          {players.length === 0 && <div className="small">まだ登録がありません。</div>}

          {players.map(p => (
            <div key={p.id} className="kv card" style={{ marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="small">
                  {new Date(p.createdAt).toLocaleDateString()}
                </div>
              </div>
              <button className="btn danger" onClick={() => remove(p.id)}>
                削除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
