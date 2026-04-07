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

String formatEditableAmount(
  double value, {
  required String decimalSeparator,
}) {
  final formatted = formatInitialAmount(value);
  if (decimalSeparator == '.') return formatted;
  return formatted.replaceAll('.', decimalSeparator);
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
  if (!RegExp(r'^[0-9+\-*/.]+$').hasMatch(normalized)) return null;

  final value = _evaluateAmountExpression(normalized);
  if (value == null || !value.isFinite) return null;

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

double? evaluateAmountExpression(
  String rawValue, {
  required String decimalSeparator,
  required String groupingSeparator,
}) {
  final normalized = normalizeAmountInput(
    rawValue,
    decimalSeparator,
    groupingSeparator,
  );
  if (normalized.isEmpty) return null;
  if (!RegExp(r'^[0-9+\-*/.]+$').hasMatch(normalized)) return null;
  return _evaluateAmountExpression(normalized);
}

bool containsAmountOperator(
  String rawValue, {
  required String decimalSeparator,
  required String groupingSeparator,
}) {
  final normalized = normalizeAmountInput(
    rawValue,
    decimalSeparator,
    groupingSeparator,
  );
  return RegExp(r'[+\-*/]').hasMatch(normalized);
}

String formatAmountExpressionPreview(
  String rawValue, {
  required String currencyCode,
  required String decimalSeparator,
  required String groupingSeparator,
  required String locale,
}) {
  final normalized = normalizeAmountInput(
    rawValue,
    decimalSeparator,
    groupingSeparator,
  );
  if (normalized.isEmpty) return '';

  final symbol = currencySymbol(currencyCode);
  if (!RegExp(r'[+\-*/]').hasMatch(normalized)) {
    final formattedSegment = _formatAmountSegmentForPreview(
      normalized,
      locale,
      decimalSeparator,
    );
    return '$symbol$formattedSegment';
  }

  final buffer = StringBuffer(symbol);
  final current = StringBuffer();

  for (final rune in normalized.runes) {
    final char = String.fromCharCode(rune);
    if (RegExp(r'[+\-*/]').hasMatch(char)) {
      if (current.isNotEmpty) {
        buffer.write(
          _formatAmountSegmentForPreview(
            current.toString(),
            locale,
            decimalSeparator,
          ),
        );
        current.clear();
      }
      if (buffer.isNotEmpty && !buffer.toString().endsWith(' ')) {
        buffer.write(' ');
      }
      buffer
        ..write(
          switch (char) {
            '*' => '×',
            '/' => '÷',
            '+' => '+',
            '-' => '−',
            _ => char,
          },
        )
        ..write(' ');
      continue;
    }
    current.write(char);
  }

  if (current.isNotEmpty) {
    buffer.write(
      _formatAmountSegmentForPreview(
        current.toString(),
        locale,
        decimalSeparator,
      ),
    );
  }

  return buffer.toString().trimRight();
}

String _formatAmountSegmentForPreview(
  String rawSegment,
  String locale,
  String decimalSeparator,
) {
  if (rawSegment.isEmpty) return '';

  final isNegative = rawSegment.startsWith('-');
  final segment = isNegative ? rawSegment.substring(1) : rawSegment;
  final endsWithDecimal = segment.endsWith('.');
  final parts = segment.split('.');
  final integerPart = parts.first;
  final fractionPart = parts.length > 1 ? parts[1] : null;
  final normalizedInteger = integerPart.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  final integerValue = int.tryParse(
    normalizedInteger.isEmpty ? '0' : normalizedInteger,
  );
  if (integerValue == null) {
    return rawSegment;
  }

  final formattedInteger = NumberFormat.decimalPattern(
    locale,
  ).format(integerValue);
  final prefix = isNegative ? '-' : '';

  if (endsWithDecimal) {
    return '$prefix$formattedInteger$decimalSeparator';
  }

  if (fractionPart != null) {
    return '$prefix$formattedInteger$decimalSeparator$fractionPart';
  }

  return '$prefix$formattedInteger';
}

double? _evaluateAmountExpression(String input) {
  final parser = _AmountExpressionParser(input);
  return parser.parse();
}

class _AmountExpressionParser {
  _AmountExpressionParser(this.source);

  final String source;
  int index = 0;

  double? parse() {
    final value = _parseExpression();
    if (value == null) return null;
    _skipWhitespace();
    if (index != source.length) return null;
    return value;
  }

  double? _parseExpression() {
    var value = _parseTerm();
    if (value == null) return null;

    while (true) {
      _skipWhitespace();
      if (_match('+')) {
        final rhs = _parseTerm();
        if (rhs == null) return null;
        final lhs = value;
        if (lhs == null) return null;
        value = lhs + rhs;
        continue;
      }
      if (_match('-')) {
        final rhs = _parseTerm();
        if (rhs == null) return null;
        final lhs = value;
        if (lhs == null) return null;
        value = lhs - rhs;
        continue;
      }
      break;
    }

    return value;
  }

  double? _parseTerm() {
    var value = _parseFactor();
    if (value == null) return null;

    while (true) {
      _skipWhitespace();
      if (_match('*')) {
        final rhs = _parseFactor();
        if (rhs == null) return null;
        final lhs = value;
        if (lhs == null) return null;
        value = lhs * rhs;
        continue;
      }
      if (_match('/')) {
        final rhs = _parseFactor();
        if (rhs == null || rhs == 0) return null;
        final lhs = value;
        if (lhs == null) return null;
        value = lhs / rhs;
        continue;
      }
      break;
    }

    return value;
  }

  double? _parseFactor() {
    _skipWhitespace();
    if (_match('+')) return _parseFactor();
    if (_match('-')) {
      final value = _parseFactor();
      return value == null ? null : -value;
    }
    return _parseNumber();
  }

  double? _parseNumber() {
    _skipWhitespace();
    final start = index;
    var hasDecimal = false;

    while (index < source.length) {
      final char = source[index];
      if (_isDigit(char)) {
        index++;
        continue;
      }
      if (char == '.' && !hasDecimal) {
        hasDecimal = true;
        index++;
        continue;
      }
      break;
    }

    if (start == index) return null;
    final token = source.substring(start, index);
    if (token == '.' || token == '+.' || token == '-.') return null;
    return double.tryParse(token);
  }

  bool _match(String char) {
    if (index >= source.length || source[index] != char) return false;
    index++;
    return true;
  }

  void _skipWhitespace() {
    while (index < source.length && source[index].trim().isEmpty) {
      index++;
    }
  }

  bool _isDigit(String char) =>
      char.codeUnitAt(0) >= 48 && char.codeUnitAt(0) <= 57;
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
