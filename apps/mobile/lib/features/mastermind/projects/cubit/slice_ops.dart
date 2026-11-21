import 'dart:math' as math;

import 'package:mobile/features/mastermind/projects/cubit/projects_state.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';

/// Pure list updates the Projects cubit applies to a loaded slice.
extension ThreadListSliceOps on ThreadListSlice {
  /// The slice with a newer page appended, skipping threads already listed.
  ThreadListSlice append(ThreadListPage page) {
    final seen = {for (final t in threads) t.threadId};
    return ThreadListSlice(
      threads: [...threads, ...page.threads.where((t) => seen.add(t.threadId))],
      total: page.total,
      nextCursor: page.nextCursor,
    );
  }

  /// The slice with [mark] applied; a seen count never goes down.
  ThreadListSlice withSeen(ThreadSeenMark mark) => copyWith(
    threads: [
      for (final t in threads)
        if (t.threadId == mark.threadId)
          t.withSeen(math.max(t.seenItemCount ?? 0, mark.itemCount))
        else
          t,
    ],
  );
}
