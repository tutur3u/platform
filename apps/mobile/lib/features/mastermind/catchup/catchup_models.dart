/// The additive `catchup` object inside `GET /v1/snapshot`.
///
/// Every field is optional and an unknown enum value is tolerated, so a hub
/// that grows the contract never blocks the rest of the snapshot.
enum CatchupCoverage {
  ok('ok'),
  partial('partial'),
  stale('stale'),
  unknown('');

  const CatchupCoverage(this.wireName);
  final String wireName;

  static CatchupCoverage fromWire(Object? raw) => values.firstWhere(
    (value) => value.wireName.isNotEmpty && value.wireName == raw,
    orElse: () => unknown,
  );

  /// Some updates may be missing from the digest.
  bool get isIncomplete => this == partial || this == stale;
}

enum CatchupSectionKey {
  needsYou('needs_you'),
  shipped('shipped'),
  blocked('blocked'),
  changed('changed'),
  usageHealth('usage_health'),
  unknown('');

  const CatchupSectionKey(this.wireName);
  final String wireName;

  static CatchupSectionKey fromWire(Object? raw) => values.firstWhere(
    (value) => value.wireName.isNotEmpty && value.wireName == raw,
    orElse: () => unknown,
  );
}

enum CatchupItemKind {
  decision('decision'),
  merge('merge'),
  release('release'),
  deploy('deploy'),
  lane('lane'),
  risk('risk'),
  usage('usage'),
  incident('incident'),
  answered('answered'),
  unknown('');

  const CatchupItemKind(this.wireName);
  final String wireName;

  static CatchupItemKind fromWire(Object? raw) => values.firstWhere(
    (value) => value.wireName.isNotEmpty && value.wireName == raw,
    orElse: () => unknown,
  );
}

enum CatchupImportance {
  high('high'),
  normal('normal'),
  low('low');

  const CatchupImportance(this.wireName);
  final String wireName;

  /// An unknown or missing value reads as [normal].
  static CatchupImportance fromWire(Object? raw) =>
      values.firstWhere((value) => value.wireName == raw, orElse: () => normal);
}

enum CatchupEntityKind {
  ask('ask'),
  lane('lane'),
  env('env'),
  release('release'),
  usage('usage');

  const CatchupEntityKind(this.wireName);
  final String wireName;
}

final class CatchupProduct {
  const CatchupProduct({required this.slug, required this.name});
  final String slug;
  final String name;
}

/// A link already checked against the host allowlist; see
/// `safeCatchupUri`.
final class CatchupLink {
  const CatchupLink({required this.label, required this.uri});
  final String label;
  final Uri uri;
}

final class CatchupEntity {
  const CatchupEntity({required this.kind, required this.id});
  final CatchupEntityKind kind;
  final String id;
}

final class CatchupCounts {
  const CatchupCounts({
    this.needsYou = 0,
    this.shipped = 0,
    this.blocked = 0,
    this.changed = 0,
  });
  final int needsYou;
  final int shipped;
  final int blocked;
  final int changed;

  bool get isEmpty => needsYou + shipped + blocked + changed == 0;
}

final class CatchupItem {
  const CatchupItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.importance,
    this.productSlug,
    this.at,
    this.link,
    this.entity,
    this.neutral = false,
    this.reason,
    this.ownerName,
  });

  final String id;
  final CatchupItemKind kind;

  /// Empty for a [neutral] item, which carries no content at all.
  final String title;
  final String? productSlug;
  final DateTime? at;
  final CatchupImportance importance;
  final CatchupLink? link;
  final CatchupEntity? entity;

  /// An embargoed or security item: only its kind, time and importance are
  /// kept, and it renders as a fixed line with no product and no link.
  final bool neutral;
  final String? reason;
  final String? ownerName;
}

final class CatchupSection {
  CatchupSection({required this.key, required List<CatchupItem> items})
    : items = List.unmodifiable(items);
  final CatchupSectionKey key;
  final List<CatchupItem> items;
}

final class CatchupDigest {
  CatchupDigest({
    required this.coverage,
    required List<CatchupProduct> products,
    required List<CatchupSection> sections,
    this.generatedAt,
    this.windowStart,
    this.counts,
  }) : products = List.unmodifiable(products),
       sections = List.unmodifiable(sections);

  final DateTime? generatedAt;
  final DateTime? windowStart;
  final CatchupCoverage coverage;
  final List<CatchupProduct> products;
  final CatchupCounts? counts;
  final List<CatchupSection> sections;

  /// The hub's product name, falling back to the slug.
  String productName(String slug) {
    for (final product in products) {
      if (product.slug == slug && product.name.isNotEmpty) return product.name;
    }
    return slug;
  }

  Iterable<CatchupItem> get allItems => sections.expand((s) => s.items);
}
