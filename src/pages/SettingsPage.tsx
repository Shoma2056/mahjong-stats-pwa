import React, { useState } from "react";
import { getRoomId, setRoomId, getNick, setNick } from "../roomLocal";
import "../Home.css"; // 既存の雰囲気を流用（嫌なら後で専用CSSでもOK）

export default function SettingsPage(props: {
  onBack: () => void;
  onApply: (roomId: string, nick: string) => void;
}) {
  const [roomId, setRoomIdState] = useState(getRoomId());
  const [nick, setNickState] = useState(getNick());

function save() {
  const r = roomId.trim();
  const n = nick.trim();
  setRoomId(r);
  setNick(n);
  props.onApply(r, n);   // ← Appに即反映
  props.onBack();        // ← そのままホームへ戻す（好みで）
}

  return (
    <>
      <div className="homeBgLayer" />
      <div className="homeFg">
        <div className="themeFelt">
          <div className="homeBody" style={{ maxWidth: 720, margin: "0 auto" }}>
            <div className="kv">
              <h2 style={{ margin: 0 }}>設定</h2>
              <button className="btn chip" onClick={props.onBack}>
                戻る
              </button>
            </div>

            <hr />

            <div className="card" style={{ padding: 16 }}>
              <div className="small" style={{ marginBottom: 6 }}>
                ルームID（仲間に共有する合言葉）
              </div>
              <input
                value={roomId}
                onChange={(e) => setRoomIdState(e.target.value)}
                placeholder="例: mahjong"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(0,0,0,.25)",
                  color: "var(--text)",
                  outline: "none",
                }}
              />

              <div className="small" style={{ margin: "14px 0 6px" }}>
                表示名（ログ用）
              </div>
              <input
                value={nick}
                onChange={(e) => setNickState(e.target.value)}
                placeholder="例: shoma"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(0,0,0,.25)",
                  color: "var(--text)",
                  outline: "none",
                }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn primary" onClick={save}>
                  保存
                </button>
                
              </div>

              <div className="small" style={{ marginTop: 10, opacity: 0.8, lineHeight: 1.6 }}>
                ※ ルームIDを変えると、別の共有データに切り替わります。
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}