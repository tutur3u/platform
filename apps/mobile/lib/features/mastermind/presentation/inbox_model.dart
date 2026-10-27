import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// One run of Needs-you items of the same kind, in publisher order.
final class InboxGroup {
  const InboxGroup({required this.kind, required this.items});

  /// Null for the rare item the publisher left without a kind.
  final ItemKind? kind;
  final List<NeedsYou> items;
}

/// What the Inbox "Needs you" list renders, derived from one accepted snapshot.
///
/// Security rows never mix with normal items: they have no id, count, order or
/// severity, so they stay in their own list and are never tallied, filtered or
/// searched.
final class MastermindInboxModel {
  const MastermindInboxModel._({
    required this.groups,
    required this.security,
    required this.total,
    required this.products,
  });

  factory MastermindInboxModel.from(
    MastermindSnapshot snapshot, {
    String query = '',
    Product? product,
  }) {
    final normal = [
      for (final item in snapshot.now.needsYou)
        if (item is NeedsYou && item.state == ItemState.open) item,
    ];
    final needle = query.trim().toLowerCase();
    final shown = [
      for (final item in normal)
        if ((product == null || item.product == product) &&
            (needle.isEmpty || _matches(item, needle)))
          item,
    ];
    return MastermindInboxModel._(
      groups: [
        for (final kind in [...ItemKind.values, null])
          if ([
                for (final item in shown)
                  if (item.kind == kind) item,
              ]
              case final items when items.isNotEmpty)
            InboxGroup(kind: kind, items: items),
      ],
      security: _onePerProduct(snapshot.now.needsYou),
      total: normal.length,
      products: {
        for (final item in normal)
          if (item.product != null) item.product!,
      }.toList(growable: false),
    );
  }

  final List<InboxGroup> groups;

  /// At most one per product, never counted, filtered or searched.
  final List<SecurityItem> security;

  /// Normal open items before any filter: what "See all (N)" on Home counts.
  final int total;

  /// Products present among the normal items, for the filter chips.
  final List<Product> products;

  int get shownCount =>
      groups.fold(0, (sum, group) => sum + group.items.length);
  bool get isEmpty => total == 0;
  bool get hasNoMatches => total > 0 && shownCount == 0;
}

bool _matches(NeedsYou item, String needle) =>
    item.title.toLowerCase().contains(needle) ||
    item.body.toLowerCase().contains(needle) ||
    (item.product?.wireName.toLowerCase().contains(needle) ?? false) ||
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
  for (final item in snapshot.now.needsYou) {
    if (item is NeedsYou && item.id == id && item.state == ItemState.open) {
      return item;
    }
  }
  return null;
}
