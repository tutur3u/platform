const SPREADSHEET_FORMULA_PREFIX_PATTERN = /^(?:[\t\r\n]|[\s]*[=+\-@])/u;

export function neutralizeSpreadsheetFormula(value: string) {
  if (!value) {
    return value;
  }

  return SPREADSHEET_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value;
}

export function neutralizeSpreadsheetFormulaCells(row: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      neutralizeSpreadsheetFormula(value),
    ])
  );
}
