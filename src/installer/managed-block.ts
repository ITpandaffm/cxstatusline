function markerCount(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

function renderBlock(start: string, end: string, body: string): string {
  return start + "\n" + body.replace(/^\n+|\n+$/g, "") + "\n" + end;
}

export function upsertManagedBlock(
  text: string,
  start: string,
  end: string,
  body: string
): string {
  const starts = markerCount(text, start);
  const ends = markerCount(text, end);
  if (starts !== ends) throw new Error("incomplete managed block");
  if (starts > 1) throw new Error("multiple managed blocks");

  const block = renderBlock(start, end, body);
  if (starts === 0) {
    if (text.length === 0) return block + "\n";
    const prefix = text.endsWith("\n\n")
      ? text
      : text.endsWith("\n")
        ? text + "\n"
        : text + "\n\n";
    return prefix + block + "\n";
  }

  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(0, startIndex) + block + text.slice(endIndex + end.length);
}

export function removeManagedBlock(text: string, start: string, end: string): string {
  const starts = markerCount(text, start);
  const ends = markerCount(text, end);
  if (starts !== ends) throw new Error("incomplete managed block");
  if (starts > 1) throw new Error("multiple managed blocks");
  if (starts === 0) return text;

  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  const before = text.slice(0, startIndex);
  const after = text.slice(endIndex + end.length);

  if (after.trimStart().length === 0) {
    return before.replace(/\n+$/g, "\n");
  }
  if (before.length === 0) {
    return after.replace(/^\n+/g, "");
  }
  return before.replace(/\n+$/g, "\n\n") + after.replace(/^\n+/g, "");
}
