import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/catchup/catchup_visit.dart';

/// Section order on screen; an unknown section sorts last as "Other".
const List<CatchupSectionKey> catchupSectionOrder = [
  CatchupSectionKey.needsYou,
  CatchupSectionKey.shipped,
  CatchupSectionKey.blocked,
  CatchupSectionKey.changed,
  CatchupSectionKey.usageHealth,
  CatchupSectionKey.unknown,
];

/// One product's rows inside a section, newest first.
final class CatchupGroupView {
  CatchupGroupView({
    required this.sectionKey,
    required this.slug,
    required this.items,
    required this.newCount,
  });

  final CatchupSectionKey sectionKey;

  /// Null for the rows that belong to no product (neutral lines included).
  final String? slug;
  final List<CatchupItem> items;

  /// How many leading rows are new; the divider goes after them when older
  /// rows follow.
  final int newCount;

  /// Collapse state is remembered per section and product.
  String get collapseKey => '${sectionKey.wireName}:${slug ?? ''}';

  bool get hasDivider => newCount > 0 && newCount < items.length;
}

final class CatchupSectionView {
  const CatchupSectionView({required this.key, required this.groups});
  final CatchupSectionKey key;
  final List<CatchupGroupView> groups;

  int get count => groups.fold(0, (sum, group) => sum + group.items.length);
}

/// The digest filtered to a window on the client, grouped and counted.
final class CatchupViewModel {
  const CatchupViewModel._({
    required this.sections,
    required this.counts,
    required this.partial,
    required this.earlierCount,
  });

  factory CatchupViewModel.build({
    required CatchupDigest digest,
    required CatchupWindow window,
    required DateTime now,
    bool showEarlier = false,
    Duration earlierSpan = const Duration(hours: 24),
  }) {
    final start = showEarlier && window.start.isAfter(now.subtract(earlierSpan))
        ? now.subtract(earlierSpan)
        : window.start;
    bool visible(CatchupItem item) =>
        item.at == null || !item.at!.isBefore(start);
    final sections = <CatchupSectionView>[];
    var earlier = 0;
    var revealable = 0;
    final reach = now.subtract(earlierSpan);
    for (final key in catchupSectionOrder) {
      final items = [
        for (final section in digest.sections)
          if (section.key == key) ...section.items,
      ];
      final hidden = items.where((item) => !visible(item)).toList();
      earlier += hidden.length;
      revealable += hidden
          .where((item) => item.at != null && !item.at!.isBefore(reach))
          .length;
      final shown = items.where(visible).toList()..sort(_newestFirst);
      if (shown.isEmpty) continue;
      sections.add(
        CatchupSectionView(
          key: key,
          groups: _groups(key, shown, digest, window.newSince),
        ),
      );
    }
    // The hub's counts cover the whole digest, so they only stand while this
    // view hides nothing; once rows are filtered out they would disagree.
    final hubStart = digest.windowStart;
    final countsFit = digest.counts != null && earlier == 0;
    final shownCounts = CatchupCounts(
      needsYou: _count(sections, CatchupSectionKey.needsYou),
      shipped: _count(sections, CatchupSectionKey.shipped),
      blocked: _count(sections, CatchupSectionKey.blocked),
      changed: _count(sections, CatchupSectionKey.changed),
    );
    return CatchupViewModel._(
      sections: sections,
      counts: countsFit ? digest.counts! : shownCounts,
      // The hub only covers from its own window start.
      partial:
          digest.coverage.isIncomplete ||
          (hubStart != null && hubStart.isAfter(start)),
      earlierCount: showEarlier || window.firstVisit ? 0 : revealable,
    );
  }

  final List<CatchupSectionView> sections;
  final CatchupCounts counts;

  /// Show "Some updates may be missing".
  final bool partial;

  /// Rows older than the window, within a day, that "Show earlier" reveals.
  final int earlierCount;

  bool get isEmpty => sections.isEmpty;
}

int _count(List<CatchupSectionView> sections, CatchupSectionKey key) =>
    sections.where((s) => s.key == key).fold(0, (sum, s) => sum + s.count);

int _newestFirst(CatchupItem a, CatchupItem b) {
  final ta = a.at;
  final tb = b.at;
  if (ta == null || tb == null) return ta == null ? (tb == null ? 0 : 1) : -1;
  return tb.compareTo(ta);
}

List<CatchupGroupView> _groups(
  CatchupSectionKey key,
  List<CatchupItem> items,
  CatchupDigest digest,
  DateTime? newSince,
) {
  final bySlug = <String?, List<CatchupItem>>{};
  for (final item in items) {
    // A neutral line never belongs to a product, whatever the hub sent.
    bySlug
        .putIfAbsent(item.neutral ? null : item.productSlug, () => [])
        .add(item);
  }
  // Product groups by their newest row; the product-less rows come last.
  final slugs = bySlug.keys.whereType<String>().toList()
    ..sort((a, b) => _newestFirst(bySlug[a]!.first, bySlug[b]!.first));
  bool isNew(CatchupItem item) =>
      newSince == null || item.at == null || !item.at!.isBefore(newSince);
  return [
    for (final slug in [...slugs, if (bySlug.containsKey(null)) null])
      CatchupGroupView(
        sectionKey: key,
        slug: slug,
        items: bySlug[slug]!,
        newCount: newSince == null ? 0 : bySlug[slug]!.takeWhile(isNew).length,
      ),
  ];
}
