import { basename } from "node:path";
import type {
  CodexStatusInputV1,
  ColorName,
  CxStatusConfigV1,
  SpanStyle,
  StatusLine,
  StatusOutputV1,
  StyledSpan,
  WidgetConfig
} from "./types.js";

const ANSI_FG: Record<ColorName, number> = {
  default: 39,
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37
};

const ANSI_BG: Record<ColorName, number> = {
  default: 49,
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47
};

function compactNumber(value: number): string {
  if (Math.abs(value) < 1_000) return String(value);
  if (Math.abs(value) < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

function withLabel(label: string | undefined, value: string): string {
  return label ? `${label}: ${value}` : value;
}

function percent(value: number | null | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function widgetValue(widget: WidgetConfig, input: CodexStatusInputV1): string | undefined {
  switch (widget.type) {
    case "model":
      return input.model?.display_name ?? input.model?.id ?? undefined;
    case "reasoning":
      return input.model?.reasoning_effort ?? undefined;
    case "cwd":
      return input.workspace?.cwd ?? undefined;
    case "project":
      return input.workspace?.root
        ? basename(input.workspace.root)
        : input.workspace?.cwd
          ? basename(input.workspace.cwd)
          : undefined;
    case "git_branch":
      return input.workspace?.git_branch ?? undefined;
    case "git_state":
      return input.workspace?.git_dirty == null
        ? undefined
        : input.workspace.git_dirty
          ? "dirty"
          : "clean";
    case "run_state":
      return input.runtime?.state ?? undefined;
    case "context_remaining":
      return percent(input.context?.remaining_percent);
    case "context_tokens": {
      const used = input.context?.used_tokens;
      const total = input.context?.window_tokens;
      if (used == null) return undefined;
      return total == null
        ? compactNumber(used)
        : `${compactNumber(used)}/${compactNumber(total)}`;
    }
    case "five_hour_limit":
      return percent(input.rate_limits?.five_hour_remaining_percent);
    case "weekly_limit":
      return percent(input.rate_limits?.weekly_remaining_percent);
    case "total_tokens":
      return input.usage?.total_tokens == null
        ? undefined
        : compactNumber(input.usage.total_tokens);
    case "session":
      return input.session?.name ?? input.session?.id ?? undefined;
    case "custom":
      return widget.text;
  }
}

function visibleWidth(text: string): number {
  return [...text].length;
}

function truncateLine(line: StatusLine, columns: number): StatusLine {
  if (columns <= 0) return { spans: [] };
  const total = line.spans.reduce((sum, span) => sum + visibleWidth(span.text), 0);
  if (total <= columns) return line;

  let remaining = Math.max(0, columns - 1);
  const spans: StyledSpan[] = [];
  for (const span of line.spans) {
    if (remaining === 0) break;
    const chars = [...span.text];
    const taken = chars.slice(0, remaining).join("");
    if (taken) spans.push({ ...span, text: taken });
    remaining -= visibleWidth(taken);
  }
  spans.push({ text: "…", style: { dim: true } });
  return { spans };
}

export function renderStatus(
  input: CodexStatusInputV1,
  config: CxStatusConfigV1
): StatusOutputV1 {
  if (input.schema_version !== 1) throw new Error("unsupported input schema");
  const maxLines = Math.max(1, Math.min(5, config.max_lines ?? 3));
  const columns = Math.max(10, input.terminal?.columns ?? 120);
  const lines = config.lines.slice(0, maxLines).map((lineConfig) => {
    const separator = lineConfig.separator ?? "  ";
    const spans: StyledSpan[] = [];
    for (const widget of lineConfig.widgets) {
      const value = widgetValue(widget, input);
      if ((!value || value.length === 0) && widget.hide_when_empty !== false) continue;
      if (spans.length > 0) spans.push({ text: separator, style: { dim: true } });
      spans.push({ text: withLabel(widget.label, value ?? ""), ...(widget.style ? { style: widget.style } : {}) });
    }
    return truncateLine({ spans }, columns);
  }).filter((line) => line.spans.length > 0);

  return { schema_version: 1, lines };
}

function ansiStart(style: SpanStyle | undefined): string {
  if (!style) return "";
  const codes: number[] = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.fg) codes.push(ANSI_FG[style.fg]);
  if (style.bg) codes.push(ANSI_BG[style.bg]);
  return codes.length === 0 ? "" : `\u001b[${codes.join(";")}m`;
}

export function outputAsAnsi(output: StatusOutputV1, color = true): string {
  return output.lines.map((line) => line.spans.map((span) => {
    if (!color || !span.style) return span.text;
    return `${ansiStart(span.style)}${span.text}\u001b[0m`;
  }).join("")).join("\n");
}
