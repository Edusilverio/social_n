/**
 * Central date formatter.
 * Accepts:
 *  - ISO date "YYYY-MM-DD"
 *  - ISO timestamp "YYYY-MM-DDTHH:mm:ss(+00:00)"
 *  - epoch seconds as string/number
 *  - Date object
 * Returns "DD/MM/YYYY" (pt-BR), or "" for empty/invalid input.
 */
export function formatDatePtBR(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return toBR(value);
  const s = String(value);
  // Fast path: leading "YYYY-MM-DD" — avoids Date/TZ shifts.
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  // Epoch seconds (BigQuery legacy)
  const asNum = Number(s);
  if (!Number.isNaN(asNum) && s.trim() !== "" && s.length <= 12) {
    const d = new Date(asNum * 1000);
    if (!isNaN(d.getTime())) return toBR(d);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return toBR(d);
  return s;
}

function toBR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = d.getUTCFullYear();
  return `${dd}/${mm}/${yy}`;
}
