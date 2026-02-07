import React from "react";
import type { Player, Session } from "../types";

export default function Home(props: {
  players: Player[];
  sessions: Session[];
  onPlayers: () => void;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onStats: () => void;
}) {
  const { sessions } = props;

  return (
    <div className="row">
      <div className="card" style={{ flex: "1 1 320px" }}>
        <h1>雀スタ</h1>
        <div className="small">1日まとめ（Session）/ ローカル保存 / 局編集・点数修正対応</div>
        <hr />
        <div className="row">
          <button className="btn primary" onClick={props.onNewSession}>新しい対局（Session）</button>
          <button className="btn" onClick={props.onPlayers}>プレイヤー管理</button>
          <button className="btn" onClick={props.onStats}>スタッツ</button>
        </div>
        <hr />
        <div className="small">
          ※「新しい対局(Session)」で、ルール・参加者を決めて、その日の半荘を複数記録できます。
        </div>
      </div>

      <div className="card" style={{ flex: "2 1 520px" }}>
        <h2>Session一覧</h2>
        <div className="small">タップで再開（席決めへ） / 終了済みも確認できます</div>
        <hr />

        {sessions.length === 0 && <div className="small">まだSessionがありません。</div>}

        {sessions.map(s => (
          <div key={s.id} className="card" style={{ marginBottom: 10 }}>
            <div className="kv">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {s.dateKey}：{s.participantNames?.join(" / ") || "Session"}
                </div>
                <div className="small">
                  {new Date(s.createdAt).toLocaleString()} ・ {s.games.length}半荘{" "}
                  {s.ended ? <span className="badge ok">終了</span> : <span className="badge info">進行中</span>}
                </div>
                <div className="small">
                  返し:{s.rules.returnPoints} / トップ取り:{s.rules.topOkaPoints} / 飛び:{s.rules.tobiRule}
                </div>
              </div>

              <div className="row">
                <button className="btn primary" onClick={() => props.onOpenSession(s.id)}>
                  開く
                </button>
                <button className="btn danger" onClick={() => props.onDeleteSession(s.id)}>
                  削除
                </button>
              </div>
            </div>

            {s.ended && s.endReason && <div className="small">終了理由: {s.endReason}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
