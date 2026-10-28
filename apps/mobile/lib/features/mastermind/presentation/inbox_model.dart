import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/open_asks.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// One run of asks: open items of the same kind in publisher order, or the
/// resolved history newest first.
final class InboxGroup {
  const InboxGroup({required this.kind, required this.items})
    : resolved = false;

  const InboxGroup.resolved({required this.items})
    : kind = null,
      resolved = true;

  /// Null for the resolved group, and for the rare open item the publisher
  /// left without a kind.
  final ItemKind? kind;
  final bool resolved;
  final List<NeedsYou> items;

  /// Stable across rebuilds, for remembering which groups were expanded.
  String get key => resolved ? 'resolved' : 'open-${kind?.wireName}';
}

/// What the Inbox ask segments render, derived from one accepted snapshot.
///
/// Needs you lists open items grouped by kind; Resolved lists the hub's
/// `decisions_resolved` history. Whether an ask is resolved is
/// the hub's word only: a reply this device sent never moves an item.
///
/// Security rows never mix with normal items: they have no id, count, order or
/// severity, so they stay in their own list and are never tallied, filtered or
/// searched.
final class MastermindInboxModel {
  const MastermindInboxModel._({
    required this.segment,
    required this.groups,
    required this.security,
    required this.total,
    required this.products,
  });

  factory MastermindInboxModel.from(
    MastermindSnapshot snapshot, {
    InboxSegment segment = InboxSegment.needsYou,
    String query = '',
    Product? product,
  }) {
    final open = segment == InboxSegment.resolved
        ? const <NeedsYou>[]
        : openAsks(snapshot);
    final resolved = segment == InboxSegment.needsYou
        ? const <NeedsYou>[]
        : _newestFirst(snapshot.resolvedItems);
    final needle = query.trim().toLowerCase();
    bool shown(NeedsYou item) =>
        (product == null || item.product == product) &&
        (needle.isEmpty || _matches(item, needle));
    final openShown = open.where(shown).toList();
    final resolvedShown = resolved.where(shown).toList();
    return MastermindInboxModel._(
      segment: segment,
      groups: [
        for (final kind in [...ItemKind.values, null])
          if ([
                for (final item in openShown)
                  if (item.kind == kind) item,
              ]
              case final items when items.isNotEmpty)
            InboxGroup(kind: kind, items: items),
        if (resolvedShown.isNotEmpty) InboxGroup.resolved(items: resolvedShown),
      ],
      security: segment == InboxSegment.resolved
          ? const []
          : _onePerProduct(snapshot.now.needsYou),
      total: open.length + resolved.length,
      products: {
        for (final item in [...open, ...resolved])
          if (item.product != null) item.product!,
      }.toList(growable: false),
    );
  }

  /// Rows a group shows before "Show all N".
  static const groupCap = 5;

  final InboxSegment segment;
  final List<InboxGroup> groups;

  /// At most one per product, never counted, filtered or searched.
  final List<SecurityItem> security;

  /// Asks in this segment before any filter.
  final int total;

  /// Products present among this segment's asks, for the filter chips.
  final List<Product> products;

  int get shownCount =>
      groups.fold(0, (sum, group) => sum + group.items.length);
  bool get isEmpty => total == 0;
  bool get hasNoMatches => total > 0 && shownCount == 0;
}

/// The hub appends history oldest first; the list reads newest first. Rows
/// without a time keep their publisher order after the dated ones.
List<NeedsYou> _newestFirst(List<NeedsYou> items) {
  final indexed = items.reversed.indexed.toList()
    ..sort((a, b) {
      final at = a.$2.resolvedAt;
      final bt = b.$2.resolvedAt;
      if (at != null && bt != null && at != bt) return bt.compareTo(at);
      if ((at == null) != (bt == null)) return at == null ? 1 : -1;
      return a.$1.compareTo(b.$1);
    });
  return [for (final (_, item) in indexed) item];
}

bool _matches(NeedsYou item, String needle) =>
    item.title.toLowerCase().contains(needle) ||
    item.body.toLowerCase().contains(needle) ||
    (item.product?.wireName.toLowerCase().contains(needle) ?? false) ||
    (item.resolution?.toLowerCase().contains(needle) ?? false) ||
    selectableOptions(
      item,
    ).any((option) => option.$2.toLowerCase().contains(needle));

List<SecurityItem> _onePerProduct(List<NeedsYouItem> items) {
  final seen = <Product?>{};
  return [
    for (final item in items)
      if (item is SecurityItem && seen.add(item.product)) item,
  ];
}

/// The options a person can actually pick, with their index in the item's
/// `options[]` (the wire `option_index`). The "Reply on Mac" placeholder is
/// guidance, not a choice.
List<(int, String)> selectableOptions(NeedsYou item) => [
  for (final (index, option) in item.options.indexed)
    if (option != mastermindReplyPlaceholderOption) (index, option),
];

/// The item with [id] if it is still an open normal Needs-you row.
NeedsYou? openNeedsYouById(MastermindSnapshot snapshot, String id) {
  for (final item in openAsks(snapshot)) {
    if (item.id == id) {
      return item;
    }
  }
  return null;
}

/// The item with [id] if the hub lists it as resolved.
NeedsYou? resolvedNeedsYouById(MastermindSnapshot snapshot, String id) {
  for (final item in snapshot.resolvedItems) {
    if (item.id == id) return item;
  }
  return null;
}

/// The publisher's stand-in for an ask it did not publish in full. It is a
/// pointer to the Mac, not the question, so it is never shown as body text.
bool isOpenOnMacStandIn(String body) {
  final text = body.trim();
  return text.isEmpty || text.toLowerCase().startsWith('open on mac');
}
