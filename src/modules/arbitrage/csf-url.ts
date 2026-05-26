/**
 * DEF_INDEX table + buildCsfUrl helper — ported from builder.js.
 * Values verified manually against csfloat.com search URLs.
 */
export const DEF_INDEX: Record<string, number> = {
  'Desert Eagle': 1,
  'Dual Berettas': 2,
  'Five-SeveN': 3,
  'Glock-18': 4,
  'AK-47': 7,
  AUG: 8,
  AWP: 9,
  G3SG1: 11,
  'Galil AR': 13,
  M249: 14,
  M4A4: 16,
  'MAC-10': 17,
  P90: 19,
  'MP5-SD': 23,
  'UMP-45': 24,
  FAMAS: 25,
  'PP-Bizon': 26,
  'MAG-7': 27,
  Negev: 28,
  'Sawed-Off': 29,
  'Tec-9': 30,
  P2000: 32,
  MP7: 33,
  MP9: 34,
  Nova: 35,
  P250: 36,
  'SCAR-20': 38,
  'SG 553': 39,
  'SSG 08': 40,
  'M4A1-S': 60,
  'USP-S': 61,
  'CZ75-Auto': 63,
  'R8 Revolver': 64,
  // Knives
  Bayonet: 500,
  'Classic Knife': 503,
  'Flip Knife': 505,
  'Gut Knife': 506,
  Karambit: 507,
  'M9 Bayonet': 508,
  'Huntsman Knife': 509,
  'Falchion Knife': 512,
  'Shadow Daggers': 514,
  'Bowie Knife': 515,
  'Butterfly Knife': 516,
  'Navaja Knife': 517,
  'Nomad Knife': 518,
  'Ursus Knife': 519,
  'Talon Knife': 520,
  'Survival Knife': 521,
  'Stiletto Knife': 522,
  'Skeleton Knife': 525,
  'Kukri Knife': 526,
};

export function getDefIndex(marketName: string): number | null {
  let n = String(marketName || '').trim();
  n = n
    .replace(/^StatTrak\W*\s*/i, '')
    .replace(/^Souvenir\s+/i, '')
    .trim();
  const weapon = (n.split(' | ')[0] || '').trim();
  return DEF_INDEX[weapon] ?? null;
}

/** Build a CSFloat search URL pre-filtered by def/paint/seed when available. */
export function buildCsfUrl(
  paintSeed: number | null,
  marketName: string,
  defIndex?: number | null,
  paintIndex?: number | null,
): string {
  const seedParam = paintSeed != null ? '&paint_seed=' + paintSeed : '';
  if (defIndex && paintIndex) {
    return `https://csfloat.com/search?def_index=${defIndex}&paint_index=${paintIndex}${seedParam}&min_price=0&max_price=10000000`;
  }
  return `https://csfloat.com/search?market_hash_name=${encodeURIComponent(marketName)}${seedParam}`;
}
