part of 'transaction_detail_sheet.dart';

/// Top-level helpers for transaction amount parsing/formatting.
int currencyFractionDigitsForCode(String code) {
  final upper = code.toUpperCase();
  const fractionDigitsByCurrency = <String, int>{
    'BHD': 3,
    'IQD': 3,
    'JOD': 3,
    'KWD': 3,
    'LYD': 3,
    'OMR': 3,
    'TND': 3,
  };

  final configuredDigits = fractionDigitsByCurrency[upper];
  if (configuredDigits != null) return configuredDigits;

  try {
    return NumberFormat.currency(name: upper).maximumFractionDigits;
  } on Exception {
    return 2;
  }
}

String formatInitialAmount(double value) {
  final fixed = value.toStringAsFixed(6);
  final trimmed = fixed.replaceFirst(RegExp(r'\.?0+$'), '');
  if (trimmed == '-0') return '0';
  return trimmed;
}

String normalizeAmountInput(
  String rawValue,
  String decimalSeparator,
  String groupingSeparator,
) {
  var normalized = rawValue.trim();
  if (normalized.isEmpty) return normalized;

  normalized = normalized.replaceAll(RegExp(r'[\s\u00A0\u202F]'), '');

  if (groupingSeparator.isNotEmpty) {
    normalized = normalized.replaceAll(groupingSeparator, '');
  }

  if (decimalSeparator.isNotEmpty && decimalSeparator != '.') {
    normalized = normalized.replaceAll(decimalSeparator, '.');
  }

  return normalized;
}

double? parseAmount(
  String rawValue, {
  required String currencyCode,
  required String decimalSeparator,
  required String groupingSeparator,
  required int Function(String) fractionDigitsFn,
}) {
  final normalized = normalizeAmountInput(
    rawValue,
    decimalSeparator,
    groupingSeparator,
  );
  if (normalized.isEmpty) return null;

  final value = double.tryParse(normalized);
  if (value == null) return null;

  final allowedFractionDigits = fractionDigitsFn(currencyCode);
  var factor = 1.0;
  for (var i = 0; i < allowedFractionDigits; i++) {
    factor *= 10;
  }

  final scaled = value * factor;
  final roundedScaled = scaled.roundToDouble();
  if ((scaled - roundedScaled).abs() > 1e-9) {
    return null;
  }

  return value;
}

List<TextInputFormatter> buildAmountInputFormatters(
  int digits,
  String decimalSeparator,
) {
  final escapedDecimal = RegExp.escape(decimalSeparator);
  return [
    FilteringTextInputFormatter.allow(
      RegExp(digits == 0 ? '[0-9]' : '[0-9$escapedDecimal]'),
    ),
    TextInputFormatter.withFunction((oldValue, newValue) {
      if (newValue.text.isEmpty) return newValue;

      final separatorMatches = RegExp(escapedDecimal).allMatches(newValue.text);
      if (separatorMatches.length > 1) {
        return oldValue;
      }

      if (digits == 0 && separatorMatches.isNotEmpty) {
        return oldValue;
      }

      if (digits > 0 && separatorMatches.isNotEmpty) {
        final separatorIndex = separatorMatches.first.start;
        final decimalLength = newValue.text.length - separatorIndex - 1;
        if (decimalLength > digits) {
          return oldValue;
        }
      }
      return newValue;
    }),
  ];
}
