/// PostgreSQL ILIKE substring matching over visible cached text.
///
/// Retains accents and whole query spacing; supports SQL %, _ and escapes.
/// Hidden server fields cannot be reconstructed from a redacted cache.
bool localIlike(String? value, String query) {
  if (query.isEmpty) return true;
  if (value == null) return false;
  final pattern = StringBuffer(r'[\s\S]*');
  var escaped = false;
  for (final rune in query.runes) {
    final character = String.fromCharCode(rune);
    if (escaped) {
      pattern.write(RegExp.escape(character));
      escaped = false;
    } else if (character == r'\') {
      escaped = true;
    } else if (character == '%') {
      pattern.write(r'[\s\S]*');
    } else if (character == '_') {
      pattern.write(r'[\s\S]');
    } else {
      pattern.write(RegExp.escape(character));
    }
  }
  // The server's wrapping '%' is escaped by a final query backslash.
  pattern.write(escaped ? '%' : r'[\s\S]*');
  return RegExp(
    '^$pattern\$',
    caseSensitive: false,
    unicode: true,
  ).hasMatch(value);
}
