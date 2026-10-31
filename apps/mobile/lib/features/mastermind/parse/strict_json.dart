import 'dart:convert';

final class SchemaViolation implements Exception {
  const SchemaViolation(this.path);
  final String path;
}

/// Every failure carries a pointer only, never the rejected value.
final class JsonReader {
  const JsonReader(this.value, [this.path = '']);
  final Object? value;
  final String path;

  Never fail() => throw SchemaViolation(path);

  Map<String, dynamic> object() {
    final v = value;
    if (v is! Map<String, dynamic>) fail();
    return v;
  }

  void keys(List<String> allowed, List<String> required) {
    final v = object();
    if (v.keys.any((key) => !allowed.contains(key)) ||
        required.any((key) => !v.containsKey(key))) {
      fail();
    }
  }

  bool has(String key) => object().containsKey(key);

  JsonReader field(String key) => JsonReader(
    object()[key],
    '$path/${key.replaceAll('~', '~0').replaceAll('/', '~1')}',
  );

  String string({int? maxLength, RegExp? pattern, String? constant}) {
    final v = value;
    if (v is! String ||
        maxLength != null && v.runes.length > maxLength ||
        pattern != null && pattern.matchAsPrefix(v)?.end != v.length ||
        constant != null && v != constant) {
      fail();
    }
    return v;
  }

  double number({num? min, num? max}) {
    final v = value;
    if (v is! num ||
        !v.isFinite ||
        min != null && v < min ||
        max != null && v > max) {
      fail();
    }
    return v.toDouble();
  }

  int integer({num? min, num? max}) {
    final n = number(min: min, max: max);
    if (n != n.truncateToDouble()) fail();
    return (value! as num).toInt();
  }

  bool boolean() {
    final v = value;
    if (v is! bool) fail();
    return v;
  }

  String stringIn(Set<String> allowed) {
    final v = string();
    if (!allowed.contains(v)) fail();
    return v;
  }

  T enumOf<T>(List<T> values, String Function(T) wireName) {
    final name = string();
    for (final v in values) {
      if (wireName(v) == name) return v;
    }
    fail();
  }

  T? nullable<T>(T Function(JsonReader) read) =>
      value == null ? null : read(this);

  List<T> list<T>(
    T Function(JsonReader) read, {
    int? maxItems,
    bool unique = false,
  }) {
    final v = value;
    if (v is! List || maxItems != null && v.length > maxItems) fail();
    if (unique && v.map(jsonEncode).toSet().length != v.length) fail();
    return List<T>.unmodifiable([
      for (var i = 0; i < v.length; i++) read(JsonReader(v[i], '$path/$i')),
    ]);
  }

  DateTime utcTimestamp() {
    final text = string(
      pattern: RegExp(
        r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?\+00:00$',
      ),
    );
    final parsed = DateTime.tryParse(text);
    if (parsed == null) fail();
    // DateTime.parse normalizes impossible dates; the wire contract does not.
    final canonical = parsed.toUtc().toIso8601String();
    if (canonical.substring(0, 19) != text.substring(0, 19)) fail();
    return parsed.toUtc();
  }
}
