// Formula-injection guard for text written into spreadsheet cells (OWASP CSV
// injection). Excel, LibreOffice and Google Sheets treat a value starting with
// = + - @ (or a full-width variant, or TAB / CR before one) as a formula when
// the file is re-saved as CSV or a cell is edited, so =HYPERLINK(...) could run.
// Callers must still write the result as an explicit STRING cell.

const FORMULA_TRIGGER = /^[=+\-@\t\r＝＋－＠]/u;
// C0 controls other than TAB, LF and CR are not valid XML 1.0 characters.
const INVALID_XML_CONTROLS =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/gu;

/** Text that can never be read as a spreadsheet formula. */
export function sanitizeSpreadsheetText(
  value: string | number | null | undefined
): string {
  const text = String(value ?? '').replace(INVALID_XML_CONTROLS, '');
  return FORMULA_TRIGGER.test(text) ? `'${text}` : text;
}
