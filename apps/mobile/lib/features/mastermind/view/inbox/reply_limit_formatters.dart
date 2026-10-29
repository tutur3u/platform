import 'package:flutter/services.dart';

/// Caps input at [limit] code points, the unit the hub counts.
class CodePointLimitFormatter extends TextInputFormatter {
  const CodePointLimitFormatter(this.limit);

  final int limit;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (newValue.text.runes.length <= limit) return newValue;
    final kept = String.fromCharCodes(newValue.text.runes.take(limit));
    return TextEditingValue(
      text: kept,
      selection: TextSelection.collapsed(offset: kept.length),
    );
  }
}

/// Caps input at [limit] lines, as the hub does. Text typed or pasted at the
/// end loses its surplus lines; an edit that would push the last line out of
/// the field from the middle is refused rather than silently eating words.
class LineLimitFormatter extends TextInputFormatter {
  const LineLimitFormatter(this.limit);

  final int limit;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final lines = newValue.text.split(RegExp(r'\r\n|\n|\r'));
    if (lines.length <= limit) return newValue;
    if (newValue.selection.end != newValue.text.length) return oldValue;
    final kept = lines.take(limit).join('\n');
    return TextEditingValue(
      text: kept,
      selection: TextSelection.collapsed(offset: kept.length),
    );
  }
}
