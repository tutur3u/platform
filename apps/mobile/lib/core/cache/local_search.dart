/// PostgreSQL ILIKE substring matching over visible cached text.
///
/// Retains accents and whole query spacing; supports SQL %, _ and escapes.
/// Hidden server fields cannot be reconstructed from a redacted cache.
final _patterns = <String, RegExp>{};
const _maxPatterns = 64;

bool localIlike(String? value, String query) {
  if (query.isEmpty) return true;
  if (value == null) return false;
  return compileLocalIlike(query).hasMatch(value);
}

/// Reuses query compilation across fields/rows; stores no cached record values.
RegExp compileLocalIlike(String query) {
  final cached = _patterns.remove(query);
  if (cached != null) {
    _patterns[query] = cached;
    return cached;
  }
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
  final compiled = RegExp('^$pattern\$', caseSensitive: false, unicode: true);
  _patterns[query] = compiled;
  if (_patterns.length > _maxPatterns) _patterns.remove(_patterns.keys.first);
  return compiled;
}
