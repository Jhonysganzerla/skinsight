/**
 * Result export (v0.10): CSV serialization + anchor-download helper.
 *
 * No `downloads` permission needed — a Blob URL on a temporary <a download>
 * works from content scripts (same pattern the CS.Money DB regenerator has
 * used since v0.3). Pure functions; the caller owns the rows.
 */

export type CsvCell = string | number | null | undefined;

function csvEscape(v: CsvCell): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Rows → CSV text. Headers come from the FIRST row's keys (insertion order);
 * later rows contribute only those columns. Empty input → empty string.
 */
export function toCsv(rows: Array<Record<string, CsvCell>>): string {
  const first = rows[0];
  if (!first) return '';
  const headers = Object.keys(first);
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Trigger a text-file download in the page. */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv'): void {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `skinsight-pirateswap-sticker-20260611-1432.csv` */
export function csvFilename(site: string, mode: string, now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `-${p(now.getHours())}${p(now.getMinutes())}`;
  return `skinsight-${site}-${mode}-${stamp}.csv`;
}
