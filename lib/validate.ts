export const ALLOWED_MODELS = new Set<string>([
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-7",
]);

export const ALLOWED_PROJECT_STATUS = new Set<string>([
  "active",
  "paused",
  "done",
]);

export const TEXT_LIMITS = {
  projectName: 120,
  projectSummary: 4000,
  projectNotes: 8000,
  taskTitle: 200,
  taskNotes: 2000,
  workloadNote: 500,
} as const;

export const HOURS_LIMITS = {
  min: 0,
  max: 200,
} as const;

const WEEK_ISO_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidWeekIso(s: unknown): s is string {
  if (typeof s !== "string" || !WEEK_ISO_RE.test(s)) return false;
  // 形式が合っても実在しない週 (2021-W53 など) を弾く: 月曜の round-trip で同一文字列に戻ることを確認
  try {
    const m = s.match(/^(\d{4})-W(\d{2})$/)!;
    const year = Number(m[1]);
    const week = Number(m[2]);
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const dow = simple.getUTCDay();
    const offset = dow <= 4 ? 1 - dow : 8 - dow;
    simple.setUTCDate(simple.getUTCDate() + offset);
    // monday を Iso week に再変換
    const d = new Date(
      Date.UTC(
        simple.getUTCFullYear(),
        simple.getUTCMonth(),
        simple.getUTCDate(),
      ),
    );
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      (((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7,
    );
    const roundtrip = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
    return roundtrip === s;
  } catch {
    return false;
  }
}

export function isValidColor(s: unknown): s is string {
  return typeof s === "string" && COLOR_RE.test(s);
}

export function isValidModel(s: unknown): s is string {
  return typeof s === "string" && ALLOWED_MODELS.has(s);
}

export function isValidProjectStatus(s: unknown): s is string {
  return typeof s === "string" && ALLOWED_PROJECT_STATUS.has(s);
}

export function clampHours(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  if (v < HOURS_LIMITS.min) return HOURS_LIMITS.min;
  if (v > HOURS_LIMITS.max) return HOURS_LIMITS.max;
  return v;
}

export function sanitizeText(
  s: unknown,
  maxLen: number,
  opts: { allowEmpty?: boolean } = {},
): string | null {
  if (typeof s !== "string") return null;
  // Remove control chars (except \n \r \t) and DEL.
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (!opts.allowEmpty && cleaned.length === 0) return null;
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export function isValidIntId(n: unknown): n is number {
  return typeof n === "number" ? Number.isInteger(n) && n > 0 : false;
}

export function toIntId(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function isPositiveIntArray(a: unknown): a is number[] {
  if (!Array.isArray(a)) return false;
  return a.every((x) => Number.isInteger(x) && (x as number) > 0);
}
