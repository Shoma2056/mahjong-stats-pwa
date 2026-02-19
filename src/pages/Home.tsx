// 基本触らない
import React, { useMemo, useState } from "react";
import type { Player, Session } from "../types";
import "../Home.css";

type ListMode = "active" | "archive";

// 更新履歴の定義
type ChangelogItem = {
  version: string;
  date: string; // "YYYY-MM-DD" など
  changes: string[];
};

// ver.の定義
const APP_VERSION = "1.0.0";

// 更新履歴の文言の追加
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

// 4麻や3麻等を言葉に変換
function gameModeLabel(gm: any): string {
  if (gm === "yonma") return "4麻";
  if (gm === "sanma") return "3麻";
  if (gm === "yonma_sanma4") return "4人3麻";
  return "";
}

// 日付の表し方
function fmtDateOnly(ms?: number): string {
  if (!ms) return "";
  try {
    // 2026-02-14 形式に寄せる
    const d = new Date(ms);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

// あまり触れない
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

  const handleDelete = (id: string, label: string) => {
    const ok = window.confirm(
      `このSessionを削除しますか？\n\n${label}\n\n※元に戻せません`
    );
    if (!ok) return;
    props.onDeleteSession(id);
  };

  const modeTitle = mode === "active" ? "進行中の対局" : "過去の対局";

  return (
    <>
  {/* ここからレイアウト */}
  {/* Homeの背景 */}
  <div className="homeBgLayer" />

  {/* タイトル */}
  <div className="homeTitleWrap" aria-label="雀スタ">
  <span className="homeTitleKanji">雀</span>
  <span className="homeTitleKana">スタ</span>
  </div>

  <div className="homeTopRightVersion">
  <div className="verText">Ver. {APP_VERSION}</div>
  <button className="history-link" onClick={() => setShowChangelog(true)}>
  更新履歴
  </button>
  </div>

  {/* 背景より前面へ */}
  <div className="homeFg">
  {/* Homeだけ明るい卓テーマ */}
  <div className="themeFelt">
  {/* タイトルの位置分だけ本文を下げる */}
  <div className="homeBody">
  <div className="row" style={{ alignItems: "flex-start" }}>
  {/* 左：入口 */}
  <div style={{ flex: "1 1 320px", minWidth: 300 }}>
  <div className="small" style={{ marginTop: 6 }}></div>
  <hr className="titleHr" />

  {/* 導線 */}
  <div style={{ display: "grid", gap: 10, padding: "0 16px" }}>
  <button className="btn main btn-top" onClick={props.onNewSession}>
  新規対局を作成
  </button>

  <button className="btn sub" onClick={props.onPlayers}>
  プレイヤー管理
  </button>

  <button className="btn sub" onClick={props.onStats}>
  スタッツ
  </button>
  </div>

  {/* タブ */}
  <div className="homeTabs" role="tablist" aria-label="対局リスト切替">
  <button
  type="button"
  role="tab"
  aria-selected={mode === "active"}
  className={mode === "active" ? "homeTab active" : "homeTab"}
  onClick={() => setMode("active")}
  >
  進行中 <span className="homeTabCount">{activeSessions.length}</span>
  </button>

  <button
  type="button"
  role="tab"
  aria-selected={mode === "archive"}
  className={mode === "archive" ? "homeTab active" : "homeTab"}
  onClick={() => setMode("archive")}
  >
  過去 <span className="homeTabCount">{archivedSessions.length}</span>
  </button>
  </div>

  <div className="small" style={{ lineHeight: 1.6 }}></div>
  </div>

  {/* 右：一覧（モードで切替） */}
  <div
  className="homeListArea"
  style={{ flex: "2 1 520px", minWidth: 320, padding: "0 16px" }}
  >
  <div className="kv sectionHeader">
  <div>
  <h2 className="sectionTitle">{modeTitle}</h2>
  </div>

  <div className="small sectionCount" style={{ textAlign: "right" }}>
  {viewSessions.length} 件
  </div>
  </div>

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
  const name = s.participantNames?.join(" / ") || "Session";
  const gm = gameModeLabel((s as any).rules?.gameMode);
  const date = s.dateKey || fmtDateOnly(s.createdAt);
  const labelForDelete = `${date || ""}：${name}`;
  const label = `${name}（${gm}） ${date}`;

  return (
  <div key={s.id} className="card sessionCard">
  <div className="kv sessionRow">
  {/* 左：情報 */}
  <div className="sessionMain">
  <div className="sessionTop">
  <div className="sessionTitleRow">
  <div className="sessionTitle">{name}</div>
  <span className="sessionMode">{gm}</span>
  </div>

  <div className="sessionMetaRow">
  <span className="sessionDate">{date}</span>
  <span className="sessionDot">・</span>
  <span className="sessionGames">{s.games.length}半荘</span>
  <span className="sessionDot">・</span>
  {s.ended ? <span className="badge ok">終了</span> : <span className="badge info">進行中</span>}
  </div>
  </div>

  </div>

  {/* 右：ボタン（縦） */}
  <div className="sessionActions">
  <button className="btn primary miniAction" onClick={() => props.onOpenSession(s.id)}>
  開く
  </button>
  <button className="btn danger miniAction" onClick={() => handleDelete(s.id, label)}>
  削除
  </button>
  </div>
  </div>


  {/* optional: 終了理由 */}
  {s.ended && s.endReason ? (
  <div className="small" style={{ marginTop: 10 }}>
  終了理由: {s.endReason}
  </div>
  ) : null}
  </div>
  );
  })
  )}
  </div>
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
