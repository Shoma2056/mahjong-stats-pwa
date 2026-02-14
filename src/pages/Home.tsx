import React, { useMemo, useState } from "react";
import type { Player, Session } from "../types";

type ListMode = "active" | "archive";

type ChangelogItem = {
  version: string;
  date: string; // "YYYY-MM-DD" など
  changes: string[];
};

const APP_VERSION = "1.0.0";

// 必要になったらここに追記していくだけでOK
const CHANGELOG: ChangelogItem[] = [
  {
    version: "1.0.0",
    date: "2026-02-14",
    changes: [
      "対局中UIの改善（結果入力を別画面化、プリセット最適化）",
      "ホーム/新規対局の配色を卓っぽく調整",
    ],
  },
];

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

  // 更新履歴モーダル
  const [showChangelog, setShowChangelog] = useState(false);

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
      ? "タップで再開"
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

              {/* ここに Ver + 更新履歴（最小UI） */}
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div className="small" style={{ opacity: 0.9 }}>
                  Ver {APP_VERSION}
                </div>
                <button className="btn chip" onClick={() => setShowChangelog(true)}>
                  更新履歴
                </button>
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

      {/* 更新履歴モーダル（最小実装） */}
      {showChangelog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
          onClick={() => setShowChangelog(false)}
        >
          <div
            className="card"
            style={{
              width: "min(820px, 100%)",
              maxHeight: "min(80vh, 720px)",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="kv">
              <h2 style={{ margin: 0 }}>更新履歴</h2>
              <button className="btn chip" onClick={() => setShowChangelog(false)}>
                閉じる
              </button>
            </div>

            <div className="small" style={{ marginTop: 6 }}>
              現在のバージョン：Ver {APP_VERSION}
            </div>

            <hr />

            {CHANGELOG.length === 0 ? (
              <div className="small">まだ履歴がありません。</div>
            ) : (
              CHANGELOG.map((item) => (
                <div key={item.version} className="card" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>Ver {item.version}</div>
                    <div className="small">{item.date}</div>
                  </div>
                  <hr />
                  <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    {item.changes.map((c, idx) => (
                      <li key={idx} className="small" style={{ color: "var(--text)" }}>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
