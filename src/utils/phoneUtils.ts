/**
 * Utility function to sanitize phone numbers parsed from Excel files or input fields.
 * Removes trailing '.0', scientific notation, country codes (+91), and non-digit characters.
 */
export function sanitizePhoneNumber(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  // Strip trailing '.0' or '.00' if parsed from Excel floats (e.g. "9876543210.0" -> "9876543210")
  str = str.replace(/\.0+$/, '');
  if (str.includes('e') || str.includes('E')) {
    const num = Number(str);
    if (!isNaN(num)) {
      try {
        str = BigInt(Math.round(num)).toString();
      } catch {
        str = String(Math.round(num));
      }
    }
  }
  const clean = str.replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('91')) {
    return clean.substring(2);
  }
  return clean;
}
