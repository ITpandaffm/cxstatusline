export type ColorName =
  | "default"
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white";

export interface SpanStyle {
  fg?: ColorName;
  bg?: ColorName;
  bold?: boolean;
  dim?: boolean;
}

export interface StyledSpan {
  text: string;
  style?: SpanStyle;
}

export interface StatusLine {
  spans: StyledSpan[];
}

export interface StatusOutputV1 {
  schema_version: 1;
  lines: StatusLine[];
}

export interface CodexStatusInputV1 {
  schema_version: 1;
  session?: {
    id?: string | null;
    name?: string | null;
  };
  model?: {
    id?: string | null;
    display_name?: string | null;
    reasoning_effort?: string | null;
  };
  workspace?: {
    cwd?: string | null;
    root?: string | null;
    git_branch?: string | null;
    git_dirty?: boolean | null;
  };
  runtime?: {
    state?: "idle" | "working" | "waiting" | "error" | string | null;
  };
  context?: {
    used_tokens?: number | null;
    window_tokens?: number | null;
    remaining_percent?: number | null;
  };
  rate_limits?: {
    five_hour_remaining_percent?: number | null;
    weekly_remaining_percent?: number | null;
  };
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    total_tokens?: number | null;
  };
  terminal?: {
    columns?: number | null;
    color?: boolean | null;
  };
}

export type WidgetType =
  | "model"
  | "reasoning"
  | "cwd"
  | "project"
  | "git_branch"
  | "git_state"
  | "run_state"
  | "context_remaining"
  | "context_tokens"
  | "five_hour_limit"
  | "weekly_limit"
  | "total_tokens"
  | "session"
  | "custom";

export interface WidgetConfig {
  type: WidgetType;
  label?: string;
  text?: string;
  style?: SpanStyle;
  hide_when_empty?: boolean;
}

export interface LineConfig {
  separator?: string;
  widgets: WidgetConfig[];
}

export interface CxStatusConfigV1 {
  schema_version: 1;
  max_lines?: number;
  lines: LineConfig[];
}
