// # ======================================================================
// # types.ts（雀スタ：型定義）
// # ======================================================================

export type PlayerId = string;
export type MatchId = string;
export type SessionId = string;

// 固定席順
export type WindSeat = 0 | 1 | 2 | 3; // East, South, West, North
export type RoundStage = "E" | "S" | "W";

export type RoundPos = {
  stage: RoundStage;
  num: 1 | 2 | 3 | 4;
  honba: number;
};

export type PointsInputTsumo =
  | { kind: "oya_all"; all: number }
  | { kind: "ko_split"; ko: number; oya: number };

export type PointsInputRon = { kind: "ron"; ron: number };

export type KyokuAction = {
  furoCount: number[]; // length 4
  riichiOrder: number[]; // length 4 : 0=なし, 1..4=順番
};

// ★ 裏ドラ枚数（立直和了時のみ・optionalで後方互換）
export type KyokuResult =
  | { type: "tsumo"; winner: WindSeat; points: PointsInputTsumo; uraCount?: number }
  | { type: "ron"; winner: WindSeat; loser: WindSeat; points: PointsInputRon; uraCount?: number }
  | { type: "draw"; tenpai: boolean[] }; // length 4

export type KyokuLog = {
  id: string;
  roundStart: RoundPos;
  dealer: WindSeat;
  riichiPotStart: number;
  scoresStart: number[]; // length 4（局計算の基準。調整ログは含めない）
  action: KyokuAction;
  result: KyokuResult;

  deltaScores: number[]; // length 4
  scoresAfter: number[]; // length 4（局終了時点の点数：局計算のみ）
  riichiPotAfter: number;
  roundAfter: RoundPos;
  dealerAfter: WindSeat;
  ended: boolean;
  endReason?: string;
  endMeta?: {
    tieBreakApplied?: boolean;
    riichiPotSettledToSeat?: WindSeat | null;
  };
};

export type AdjustmentLog = {
  id: string;
  createdAt: number;
  afterKyokuIndex: number;
  seat: WindSeat;
  delta: number;
  reason?: string;
};

export type Player = {
  id: PlayerId;
  name: string;
  createdAt: number;
};

// -------------------- Session rules --------------------
export type TobiRule = "none" | "leq0" | "lt0"; // 飛びなし / 0点以下 / 0点未満
export type UmaPresetId = "p1" | "p2" | "custom";

// ゲーム種別
export type GameMode = "yonma" | "sanma" | "yonma_sanma4";

// 4麻ベースのウマ（2/3/4着入力、1着は合計0になるよう自動）
export type UmaRule = {
  presetId: UmaPresetId;
  second: number;
  third: number;
  fourth: number;
};

export type Rules = {
  gameMode: GameMode; // ★追加
  startPoints: number;
  returnPoints: number;
  topOkaPoints: number;
  tobiRule: TobiRule;
  uma: UmaRule;
};

export type Session = {
  id: SessionId;
  createdAt: number;
  updatedAt: number;
  dateKey: string; // YYYY-MM-DD（ローカル）
  rules: Rules;

  participantIds: PlayerId[]; // 4麻/4人3麻:4人, 3麻:3人
  participantNames: string[];

  games: Match[];

  ended: boolean;
  endReason?: string;
};

// -------------------- Match（半荘） --------------------
export type Match = {
  id: MatchId;
  createdAt: number;
  updatedAt: number;

  // 4要素固定（3麻は seats[3] を "" にして「欠け」扱い）
  seats: PlayerId[]; // length 4
  seatNames: string[]; // length 4

  kichyaSeat: WindSeat;
  initialScores: number[]; // length 4

  logs: KyokuLog[];
  adjustments: AdjustmentLog[];

  currentRound: RoundPos;
  currentDealer: WindSeat;
  currentRiichiPot: number;
  currentScores: number[]; // length 4
  ended: boolean;
  endReason?: string;

  // 互換用
  tobiRule?: TobiRule;

  // 拡張：ルール（mahjong.tsで参照）
  rules?: any;
};
