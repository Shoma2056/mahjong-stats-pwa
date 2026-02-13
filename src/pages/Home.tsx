import React, { useMemo, useState } from "react";
import type { Player, Session } from "../types";

type ListMode = "active" | "archive";

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

  // デフォルトは「進行中」
  const [mode, setMode] = useState<ListMode>("active");

  const activeSessions = useMemo(
    () => sessions.filter((s) => !s.ended),
    [sessions]
  );
  const archivedSessions = useMemo(
    () => sessions.filter((s) => s.ended),
    [sessions]
  );

  const viewSessions = useMemo(() => {
    const list = mode === "active" ? activeSessions : archivedSessions;

    // 表示順：新しい順（createdAt）
    return [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [mode, activeSessions, archivedSessions]);

  const fmtDateTime = (ms: number) => {
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return "";
    }
  };

  const handleDelete = (id: string, label: string) => {
    const ok = window.confirm(`このSessionを削除しますか？\n\n${label}\n\n※元に戻せません`);
    if (!ok) return;
    props.onDeleteSession(id);
  };

  const modeTitle = mode === "active" ? "進行中の対局" : "過去の対局（アーカイブ）";
  const modeSub =
    mode === "active"
      ? "タップで再開（席決めへ）"
      : "終了済みの記録を確認できます";

  return (
    <>
      {/* Homeだけ卓っぽい背景 */}
      <div className="homeBgLayer" />

      {/* 背景より前面へ */}
      <div className="homeFg">
        {/* Homeだけ明るい卓テーマ */}
        <div className="themeFelt">
          <div className="row" style={{ alignItems: "flex-start" }}>
            {/* 左：入口 */}
            <div className="card" style={{ flex: "1 1 320px", minWidth: 300 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <h1 style={{ margin: 0 }}>雀スタ</h1>
                <span className="badge info">ローカル保存</span>
              </div>

              <div className="small" style={{ marginTop: 6 }}>
                1日まとめ（Session） / 局編集・点数修正に対応
              </div>

              <hr />

              {/* 5導線 */}
              <div style={{ display: "grid", gap: 10 }}>
                <button
                  className="btn primary"
                  onClick={props.onNewSession}
                  style={{ padding: "14px 12px", fontSize: 16 }}
                >
                  新規対局を作成
                </button>

                <button className="btn" onClick={props.onPlayers} style={{ padding: "12px" }}>
                  プレイヤー管理
                </button>

                <button className="btn" onClick={props.onStats} style={{ padding: "12px" }}>
                  スタッツ
                </button>

                <button
                  className={mode === "active" ? "btn primary" : "btn"}
                  onClick={() => setMode("active")}
                  style={{ padding: "12px" }}
                >
                  進行中の対局（{activeSessions.length}）
                </button>

                <button
                  className={mode === "archive" ? "btn primary" : "btn"}
                  onClick={() => setMode("archive")}
                  style={{ padding: "12px" }}
                >
                  過去の対局（{archivedSessions.length}）
                </button>
              </div>

              <hr />

              <div className="small" style={{ lineHeight: 1.6 }}>
                「新規対局」でルール・参加者を決めて、その日の半荘を複数記録できます。
              </div>
            </div>

            {/* 右：一覧（モードで切替） */}
            <div className="card" style={{ flex: "2 1 520px", minWidth: 320 }}>
              <div className="kv">
                <div>
                  <h2 style={{ margin: 0 }}>{modeTitle}</h2>
                  <div className="small" style={{ marginTop: 6 }}>
                    {modeSub}
                  </div>
                </div>

                <div className="small" style={{ textAlign: "right" }}>
                  {viewSessions.length} 件
                </div>
              </div>

              <hr />

              {viewSessions.length === 0 ? (
                <div
                  className="card"
                  style={{
                    marginTop: 14,
                    padding: 18,
                    opacity: 0.92,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    {mode === "active" ? "進行中の対局はありません" : "過去の対局はありません"}
                  </div>
                  <div className="small" style={{ lineHeight: 1.6 }}>
                    {mode === "active"
                      ? "「新規対局を作成」から開始できます。"
                      : "終了したSessionがここに表示されます。"}
                  </div>
                </div>
              ) : (
                viewSessions.map((s) => {
                  const title = `${s.dateKey}：${s.participantNames?.join(" / ") || "Session"}`;
                  return (
                    <div key={s.id} className="card" style={{ marginBottom: 12 }}>
                      <div className="kv">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, wordBreak: "break-word" }}>{title}</div>

                          <div
                            className="small"
                            style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}
                          >
                            <span>{fmtDateTime(s.createdAt)}</span>
                            <span>・</span>
                            <span>{s.games.length}半荘</span>
                            <span>・</span>
                            {s.ended ? (
                              <span className="badge ok">終了</span>
                            ) : (
                              <span className="badge info">進行中</span>
                            )}
                          </div>

                          <div className="small" style={{ marginTop: 6 }}>
                            返し:{s.rules.returnPoints} / トップ取り:{s.rules.topOkaPoints} / 飛び:
                            {s.rules.tobiRule}
                          </div>
                        </div>

                        <div className="row" style={{ alignItems: "center" }}>
                          <button className="btn primary" onClick={() => props.onOpenSession(s.id)}>
                            開く
                          </button>
                          <button className="btn danger" onClick={() => handleDelete(s.id, title)}>
                            削除
                          </button>
                        </div>
                      </div>

                      {s.ended && s.endReason && <div className="small">終了理由: {s.endReason}</div>}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
