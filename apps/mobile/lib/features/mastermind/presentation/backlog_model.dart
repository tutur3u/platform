import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/security_rows.dart';

/// One product's backlog items, open first.
final class BacklogGroup {
  const BacklogGroup({required this.product, required this.items});

  /// Null for items the publisher did not tie to a product.
  final Product? product;
  final List<BacklogItem> items;
}

/// What the Work Backlog segment renders, derived from one accepted snapshot.
///
/// Items group by product, open before answered before withdrawn. Security
/// rows never mix in: they have no id, count or order, so they stay in their
/// own list and are never tallied or searched.
final class MastermindBacklogModel {
  const MastermindBacklogModel._({
    required this.groups,
    required this.security,
    required this.total,
  });

  factory MastermindBacklogModel.from(
    MastermindSnapshot snapshot, {
    String query = '',
  }) {
    final normal = [
      for (final entry in snapshot.backlog)
        if (entry is BacklogItem) entry,
    ];
    final needle = query.trim().toLowerCase();
    final shown = [
      for (final item in normal)
        if (needle.isEmpty || _matches(item, needle)) item,
    ];
    return MastermindBacklogModel._(
      groups: [
        for (final product in [...Product.values, null])
          if (_openFirst([
                for (final item in shown)
                  if (item.product == product) item,
              ])
              case final items when items.isNotEmpty)
            BacklogGroup(product: product, items: items),
      ],
      security: singleSecurityRow(snapshot.backlog),
      total: normal.length,
    );
  }

  final List<BacklogGroup> groups;

  /// At most one row for the whole list, never counted or searched.
  final List<SecurityItem> security;

  /// Normal items before the search.
  final int total;

  int get shownCount =>
      groups.fold(0, (sum, group) => sum + group.items.length);
  bool get isEmpty => total == 0;
  bool get hasNoMatches => total > 0 && shownCount == 0;
}

const List<ItemState> _stateOrder = [
  ItemState.open,
  ItemState.answered,
  ItemState.withdrawn,
];

// List.sort is not stable, so the publisher index breaks ties explicitly.
List<BacklogItem> _openFirst(List<BacklogItem> items) {
  final indexed = [for (var i = 0; i < items.length; i++) (i, items[i])]
    ..sort((a, b) {
      final byState = _stateOrder
          .indexOf(a.$2.state)
          .compareTo(_stateOrder.indexOf(b.$2.state));
      return byState != 0 ? byState : a.$1.compareTo(b.$1);
    });
  return [for (final entry in indexed) entry.$2];
}

bool _matches(BacklogItem item, String needle) =>
    item.title.toLowerCase().contains(needle) ||
    (item.product?.wireName.toLowerCase().contains(needle) ?? false);
