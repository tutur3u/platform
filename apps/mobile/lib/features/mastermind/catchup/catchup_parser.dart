import 'package:mobile/features/mastermind/catchup/catchup_link_policy.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';

const catchupMaxItemsPerSection = 20;
const catchupMaxItems = 100;
const _maxTitle = 80;
const _maxDetail = 200;

/// Parses the `catchup` object of a snapshot without ever throwing.
///
/// Unknown means absent: a missing or malformed field is dropped, an unknown
/// enum value maps to its `unknown` case, and a row that cannot be shown
/// (no title and not neutral) is skipped. The hub's caps (20 per section,
/// 100 in all) are enforced again here.
CatchupDigest? parseCatchup(Object? raw) {
  if (raw is! Map) return null;
  try {
    return _digest(Map<String, dynamic>.from(raw));
  } on Object {
    return null;
  }
}

CatchupDigest _digest(Map<String, dynamic> json) {
  var budget = catchupMaxItems;
  final sections = <CatchupSection>[];
  for (final rawSection in _maps(json['sections'])) {
    final key = CatchupSectionKey.fromWire(rawSection['key']);
    final items = <CatchupItem>[];
    for (final rawItem in _maps(rawSection['items'])) {
      if (items.length >= catchupMaxItemsPerSection || budget <= 0) break;
      final item = _item(rawItem, '${key.wireName}-${items.length}');
      if (item == null) continue;
      items.add(item);
      budget--;
    }
    sections.add(CatchupSection(key: key, items: items));
  }
  return CatchupDigest(
    generatedAt: _time(json['generated_at']),
    windowStart: _time(json['window_start']),
    coverage: CatchupCoverage.fromWire(json['coverage']),
    products: [
      for (final row in _maps(json['products']))
        if (_text(row['slug'], 80) case final slug?)
          CatchupProduct(slug: slug, name: _text(row['name'], 80) ?? slug),
    ],
    counts: _counts(json['counts']),
    sections: sections,
  );
}

CatchupItem? _item(Map<String, dynamic> json, String fallbackId) {
  final id = _text(json['id'], _maxDetail) ?? fallbackId;
  final kind = CatchupItemKind.fromWire(json['kind']);
  final importance = CatchupImportance.fromWire(json['importance']);
  final at = _time(json['at']);
  if (json['neutral'] == true) {
    // Nothing but the kind, time and importance survives.
    return CatchupItem(
      id: id,
      kind: kind,
      title: '',
      importance: importance,
      at: at,
      neutral: true,
    );
  }
  final title = _text(json['title'], _maxTitle);
  if (title == null) return null;
  final link = json['link'];
  final safe = link is Map ? safeCatchupUri(link['url']) : null;
  return CatchupItem(
    id: id,
    kind: kind,
    title: title,
    importance: importance,
    productSlug: _text(json['product'], 80),
    at: at,
    link: safe == null
        ? null
        : CatchupLink(
            label: _text((link! as Map)['label'], _maxTitle) ?? '',
            uri: safe,
          ),
    entity: _entity(json['entity']),
    reason: _text(json['reason'], _maxDetail),
    ownerName: _text(json['owner_name'], _maxTitle),
  );
}

CatchupEntity? _entity(Object? raw) {
  if (raw is! Map) return null;
  final id = _text(raw['id'], _maxDetail);
  for (final kind in CatchupEntityKind.values) {
    if (kind.wireName == raw['kind'] && id != null) {
      return CatchupEntity(kind: kind, id: id);
    }
  }
  return null;
}

CatchupCounts? _counts(Object? raw) {
  const keys = ['needs_you', 'shipped', 'blocked', 'changed'];
  if (raw is! Map || !keys.any(raw.containsKey)) return null;
  int count(String key) {
    final value = raw[key];
    return value is int && value > 0 ? value : 0;
  }

  return CatchupCounts(
    needsYou: count('needs_you'),
    shipped: count('shipped'),
    blocked: count('blocked'),
    changed: count('changed'),
  );
}

Iterable<Map<String, dynamic>> _maps(Object? raw) => raw is List
    ? raw.whereType<Map<dynamic, dynamic>>().map(Map<String, dynamic>.from)
    : const [];

DateTime? _time(Object? raw) =>
    raw is String ? DateTime.tryParse(raw)?.toUtc() : null;

/// Trimmed text cut to [max] characters, or null when blank or not a string.
String? _text(Object? raw, int max) {
  if (raw is! String) return null;
  final text = raw.trim();
  if (text.isEmpty) return null;
  final runes = text.runes;
  return runes.length <= max
      ? text
      : '${String.fromCharCodes(runes.take(max - 1))}…';
}
