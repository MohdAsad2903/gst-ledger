/**
 * Computes the Indian Financial Year string (e.g. "2026-27") for an ISO date string (YYYY-MM-DD).
 *
 * In India, the financial year runs from 1 April to 31 March:
 * - 2026-04-01 -> "2026-27"
 * - 2026-07-01 -> "2026-27"
 * - 2027-03-31 -> "2026-27"
 * - 2027-04-01 -> "2027-28"
 * - 2026-03-31 -> "2025-26"
 *
 * Pure function with zero clock or system locale access.
 *
 * @param isoDate Date string in format YYYY-MM-DD
 * @returns Financial year string in format YYYY-YY
 */
export function financialYearOf(isoDate: string): string {
  const trimmed = isoDate.trim();
  const parts = trimmed.split('-');
  if (parts.length < 2) {
    throw new Error(`Invalid ISO date string format for financialYearOf: ${isoDate}`);
  }

  const year = parseInt(parts[0]!, 10);
  const month = parseInt(parts[1]!, 10);

  if (isNaN(year) || isNaN(month)) {
    throw new Error(`Invalid numeric year or month in date: ${isoDate}`);
  }

  let startYear: number;
  let endYearShort: number;

  if (month >= 4) {
    // April to December
    startYear = year;
    endYearShort = (year + 1) % 100;
  } else {
    // January to March
    startYear = year - 1;
    endYearShort = year % 100;
  }

  const endYearStr = endYearShort.toString().padStart(2, '0');
  return `${startYear}-${endYearStr}`;
}

/**
 * Normalises a bill number for duplicate detection by uppercasing and
 * stripping all non-alphanumeric characters.
 *
 * Examples:
 * - "GST-1291/26-27" -> "GST12912627"
 * - "KNC/26-27/2448" -> "KNC26272448"
 * - "4S/1116/26-27 DL" -> "4S11162627DL"
 * - "SE-0335/2026-2027" -> "SE033520262027"
 * - "  63  " -> "63"
 *
 * Note: The printed form is always preserved and displayed to the user;
 * this normalized form is used strictly for internal indexing and deduplication.
 *
 * @param raw Raw bill number string as entered
 * @returns Clean alphanumeric uppercase string
 */
export function normalizeBillNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
