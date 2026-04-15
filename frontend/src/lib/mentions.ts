// Helpers for @mention chips in prompt textareas.
//
// A "mention" is the substring `@<name>` in the raw prompt text where <name>
// matches one of the avatars currently loaded. The text is stored as-is inside
// a transparent <textarea>; an absolutely-positioned overlay renders the
// styled pills. To make the chip feel atomic (cursor can't land inside, one
// Backspace deletes the whole thing) we need to know the exact character
// ranges of every mention in the current text.

export interface MentionRange {
  start: number; // inclusive, points at the leading @
  end: number; // exclusive, one past the last character of the name
  name: string;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find every @<name> occurrence in `text` that matches a known avatar name.
 * Longer names are tried first so that `@kiloNada` isn't matched as `@kilo`
 * when both `kilo` and `kiloNada` exist.
 */
export function getMentionRanges(text: string, names: string[]): MentionRange[] {
  if (!text || !names.length) return [];
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `@(?:${sorted.map(escapeReg).join("|")})(?=\\s|$)`,
    "gi",
  );
  const ranges: MentionRange[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    ranges.push({
      start: m.index,
      end: m.index + m[0].length,
      name: m[0].slice(1),
    });
  }
  return ranges;
}

/**
 * Given a selection in the textarea, return a clamped selection that does not
 * cross into the middle of a mention. If the caret (collapsed selection) is
 * inside a mention, it's snapped to the end of the mention. If an extended
 * selection overlaps a mention, it's expanded to cover the whole mention.
 * Returns null when no change is needed.
 */
export function clampSelectionToMentions(
  text: string,
  names: string[],
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } | null {
  const ranges = getMentionRanges(text, names);
  let start = selectionStart;
  let end = selectionEnd;
  let changed = false;
  for (const r of ranges) {
    if (start > r.start && start < r.end) {
      // Caret landed strictly inside. Snap to the closer edge.
      start = start - r.start < r.end - start ? r.start : r.end;
      changed = true;
    }
    if (end > r.start && end < r.end) {
      end = end - r.start < r.end - end ? r.start : r.end;
      changed = true;
    }
  }
  // Keep collapsed selections collapsed: if both endpoints were inside the
  // same mention they may have snapped to different edges; normalize.
  if (selectionStart === selectionEnd && start !== end) {
    end = start;
  }
  return changed ? { start, end } : null;
}

/**
 * If the caret is positioned at the right edge of a mention, return the
 * range that should be deleted by a single Backspace press. The deleted
 * range covers @<name> plus up to two trailing spaces that `selectMention`
 * inserts automatically.
 */
export function mentionAtBackspace(
  text: string,
  names: string[],
  caret: number,
): MentionRange | null {
  const ranges = getMentionRanges(text, names);
  for (const r of ranges) {
    if (caret === r.end) return r;
  }
  return null;
}

/**
 * If the caret sits at the left edge of a mention, Delete should remove the
 * whole chip in one keystroke.
 */
export function mentionAtDelete(
  text: string,
  names: string[],
  caret: number,
): MentionRange | null {
  const ranges = getMentionRanges(text, names);
  for (const r of ranges) {
    if (caret === r.start) return r;
  }
  return null;
}
