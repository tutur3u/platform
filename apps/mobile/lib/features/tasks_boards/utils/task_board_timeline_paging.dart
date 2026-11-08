/// Tasks the Timeline loads for a whole board on its own; beyond this it
/// offers Load more instead of paging a huge board unattended.
const int taskTimelineBoardTaskBudget = 2000;

/// Lists the Timeline loads at the same time.
const int taskTimelineMaxConcurrentLists = 2;

/// Page size the Timeline asks for, whichever view loaded a list first.
const int taskTimelinePageSize = 100;

/// The open lists whose next page the Timeline should request now, in
/// board order.
///
/// A list qualifies when it has more pages, no load error and no request in
/// flight. At most [maxConcurrent] lists load at once, counting those already
/// loading, and nothing more is requested once [boardBudget] tasks are
/// loaded across the open lists.
List<String> taskTimelineListsToLoad({
  required List<String> openListIds,
  required Set<String> loadingListIds,
  required Set<String> erroredListIds,
  required Map<String, bool> hasMoreById,
  required Map<String, int> loadedCountById,
  int maxConcurrent = taskTimelineMaxConcurrentLists,
  int boardBudget = taskTimelineBoardTaskBudget,
}) {
  var loaded = 0;
  var inFlight = 0;
  for (final id in openListIds) {
    loaded += loadedCountById[id] ?? 0;
    if (loadingListIds.contains(id)) inFlight += 1;
  }
  if (loaded >= boardBudget) return const [];
  final next = <String>[];
  for (final id in openListIds) {
    if (inFlight + next.length >= maxConcurrent) break;
    if (loadingListIds.contains(id) ||
        erroredListIds.contains(id) ||
        !(hasMoreById[id] ?? true)) {
      continue;
    }
    next.add(id);
  }
  return next;
}
