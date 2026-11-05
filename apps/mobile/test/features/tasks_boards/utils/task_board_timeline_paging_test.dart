import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/tasks_boards/utils/task_board_timeline_paging.dart';

void main() {
  List<String> next({
    List<String> lists = const ['a', 'b', 'c', 'd'],
    Set<String> loading = const {},
    Set<String> errored = const {},
    Map<String, bool> hasMore = const {},
    Map<String, int> loaded = const {},
  }) => taskTimelineListsToLoad(
    openListIds: lists,
    loadingListIds: loading,
    erroredListIds: errored,
    hasMoreById: hasMore,
    loadedCountById: loaded,
  );

  test('loads at most two lists at a time, in board order', () {
    expect(taskTimelineMaxConcurrentLists, 2);
    expect(next(), ['a', 'b']);
    expect(next(loading: {'a'}), ['b']);
    expect(next(loading: {'a', 'c'}), isEmpty);
  });

  test('skips finished and failed lists', () {
    expect(next(hasMore: {'a': false}, errored: {'b'}), ['c', 'd']);
  });

  test('stops at the board-wide budget across lists', () {
    expect(taskTimelineBoardTaskBudget, 2000);
    expect(next(loaded: {'a': 1200, 'b': 799}), ['a', 'b']);
    expect(next(loaded: {'a': 1200, 'b': 800}), isEmpty);
  });
}
