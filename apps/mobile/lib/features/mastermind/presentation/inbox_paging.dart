import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';

/// Asks added to the Inbox per page. Matches the hub's `/v1/asks` page the
/// app will request (`limit` is at most 50; the app asks for 20).
const inboxPageSize = 20;

/// Items from the end at which the next page starts loading.
const inboxPrefetchDistance = 3;

/// Brings one more page of asks into reach.
///
/// [loaded] asks are already shown and [limit] more are wanted. The Inbox
/// shows every ask the accepted snapshot holds, so today the rows are all on
/// the device and [loadInboxPageFromSnapshot] has nothing to fetch.
///
/// This is the hook for the hub's `GET /v1/asks` (opaque cursor, non-sensitive
/// asks only): a server-backed loader keeps the cursor, merges the page into
/// what the Inbox reads, and throws when the request fails so the list shows
/// its Retry row.
typedef InboxPageLoader = Future<void> Function(int loaded, int limit);

/// The snapshot already holds every ask: nothing to fetch.
Future<void> loadInboxPageFromSnapshot(int loaded, int limit) =>
    Future<void>.value();

enum InboxPagingStatus { idle, loading, error }

/// How many asks the Inbox list reveals and whether the next page is on its
/// way. Reset by a filter change or a pull to refresh.
final class InboxPagingController extends ChangeNotifier {
  InboxPagingController({
    InboxPageLoader? loader,
    this.pageSize = inboxPageSize,
  }) : _loader = loader ?? loadInboxPageFromSnapshot,
       _visible = pageSize;

  final InboxPageLoader _loader;
  final int pageSize;

  int _visible;
  int _generation = 0;
  bool _scheduled = false;
  bool _disposed = false;
  InboxPagingStatus _status = InboxPagingStatus.idle;

  /// Asks revealed so far.
  int get visible => _visible;
  InboxPagingStatus get status => _status;

  bool hasMore(int total) => _visible < total;

  /// Start the next page once the frame that asked for it is done.
  void requestMore(int total) {
    if (_scheduled || _status != InboxPagingStatus.idle || !hasMore(total)) {
      return;
    }
    final generation = _generation;
    _scheduled = true;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (_disposed || generation != _generation) return;
      _scheduled = false;
      unawaited(loadMore(total));
    });
  }

  /// Load the next page; a failure leaves [InboxPagingStatus.error] until a
  /// retry. A [reset] while it runs drops its result.
  Future<void> loadMore(int total) async {
    if (_disposed || _status == InboxPagingStatus.loading || !hasMore(total)) {
      return;
    }
    final generation = _generation;
    _set(InboxPagingStatus.loading);
    try {
      await _loader(_visible, pageSize);
    } on Object {
      if (generation == _generation) _set(InboxPagingStatus.error);
      return;
    }
    if (_disposed || generation != _generation) return;
    _visible += pageSize;
    _set(InboxPagingStatus.idle);
  }

  /// Back to the first page.
  void reset() {
    _generation++;
    _scheduled = false;
    _visible = pageSize;
    _status = InboxPagingStatus.idle;
    if (!_disposed) notifyListeners();
  }

  void _set(InboxPagingStatus status) {
    _status = status;
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// One row of the flattened, lazily built Inbox list.
sealed class InboxRow {
  const InboxRow();
}

final class InboxHeaderRow extends InboxRow {
  const InboxHeaderRow({required this.group, required this.first});

  final InboxGroup group;

  /// The first heading carries no gap above it.
  final bool first;
}

final class InboxItemRow extends InboxRow {
  const InboxItemRow({
    required this.group,
    required this.item,
    required this.ordinal,
    required this.first,
    required this.last,
  });

  final InboxGroup group;
  final NeedsYou item;

  /// Position among all asks the list has revealed, from zero.
  final int ordinal;

  /// First and last of the whole group, not of the revealed part: a group cut
  /// by a page boundary stays open at the bottom.
  final bool first;
  final bool last;
}

/// The first [visible] asks of [model] in group order, each group opening with
/// its heading.
List<InboxRow> inboxRows(MastermindInboxModel model, int visible) {
  final rows = <InboxRow>[];
  var ordinal = 0;
  for (final group in model.displayGroups) {
    if (ordinal >= visible) break;
    rows.add(InboxHeaderRow(group: group, first: rows.isEmpty));
    for (final (index, item) in group.items.indexed) {
      if (ordinal >= visible) break;
      rows.add(
        InboxItemRow(
          group: group,
          item: item,
          ordinal: ordinal++,
          first: index == 0,
          last: index == group.items.length - 1,
        ),
      );
    }
  }
  return rows;
}
