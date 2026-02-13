// ======================================================================
// main.tsx（アプリのエントリーポイント）
// ======================================================================

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

// ✅ 追加：グローバルCSSを明示的に読み込む
import "./index.css";

// ✅ 既存：まとめCSS（これも残す）
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
