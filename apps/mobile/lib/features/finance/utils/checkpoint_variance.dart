/// Parses a signed balance entered in a decimal keyboard. Grouping is omitted
/// so a comma can also act as the decimal separator.
double? parseCheckpointBalance(String text) {
  final input = text.trim();
  if (!RegExp(r'^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$').hasMatch(input)) {
    return null;
  }
  final value = double.tryParse(input.replaceFirst(',', '.'));
  return value != null && value.isFinite ? value : null;
}

double checkpointVariance(double actual, double ledger) {
  final difference = actual - ledger;
  // Account for binary floating-point noise in the client preview. The
  // server computes and applies the authoritative decimal adjustment.
  return double.parse(difference.toStringAsPrecision(15));
}
