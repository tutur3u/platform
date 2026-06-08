const _dangerousSpreadsheetFormulaPrefixes = {'=', '+', '-', '@'};

bool _hasDangerousSpreadsheetFormulaPrefix(String value) {
  final trimmed = value.trimLeft();
  if (trimmed.isEmpty) return false;
  return _dangerousSpreadsheetFormulaPrefixes.contains(trimmed[0]);
}

String escapeCrmCsvCell(String? value) {
  final rawValue = value ?? '';
  final safeValue = _hasDangerousSpreadsheetFormulaPrefix(rawValue)
      ? "'$rawValue"
      : rawValue;
  final escapedValue = safeValue.replaceAll('"', '""');
  return '"$escapedValue"';
}
