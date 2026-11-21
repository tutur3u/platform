import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/projects/cubit/thread_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';

final _now = DateTime.utc(2026, 11, 22, 7);

void main() {
  late FixtureProjectsRepository repository;
  late ProjectsMachine bridge;

  setUp(() async {
    repository = FixtureProjectsRepository(now: _now);
    bridge = (await repository.machines()).first;
  });

  ThreadCubit cubitFor(String threadId) {
    final cubit = ThreadCubit(
      repository: repository,
      machine: bridge,
      threadId: threadId,
    );
    addTearDown(cubit.close);
    return cubit;
  }

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('opens on the newest page and loads earlier until the start', () async {
    // p_tuturuuu_0 has 40 items: a page of 30, then the first 10.
    final cubit = cubitFor('p_tuturuuu_0');
    await cubit.load();
    expect(cubit.state.messages.map((m) => m.position).first, 10);
    expect(cubit.state.messages.last.position, 39);
    expect(cubit.state.earlierPosition, 10);

    await cubit.loadEarlier();
    expect(cubit.state.messages, hasLength(40));
    expect(cubit.state.messages.first.position, 0);
    expect(cubit.state.hasEarlier, isFalse);
  });

  test('opening a thread marks it read to its item count', () async {
    final marks = <ThreadSeenMark>[];
    final sub = repository.seenMarks.listen(marks.add);
    addTearDown(sub.cancel);
    final cubit = cubitFor('p_tuturuuu_0');
    await cubit.load();
    await settle();
    expect(marks.single.threadId, 'p_tuturuuu_0');
    expect(marks.single.itemCount, cubit.state.thread!.itemCount);
  });

  test('an unknown thread is a not-found state', () async {
    final cubit = cubitFor('nope');
    await cubit.load();
    expect(cubit.state.status, ThreadStatus.failed);
    expect(cubit.state.failure, ProjectsFailureKind.notFound);
  });

  test('a stale load and a stale earlier page never apply', () async {
    final gated = _Gated(repository);
    final cubit = ThreadCubit(
      repository: gated,
      machine: bridge,
      threadId: 'p_tuturuuu_0',
    );
    addTearDown(cubit.close);
    await cubit.load();
    expect(cubit.state.earlierPosition, 10);

    gated.hold = true;
    final earlier = cubit.loadEarlier();
    final first = cubit.load();
    final second = cubit.load();
    // The second load answers first; then the first load and the earlier
    // page, both stale against the window it set.
    gated.release(2, shift: 5);
    await second;
    expect(cubit.state.loadingEarlier, isFalse);
    expect(cubit.state.earlierPosition, 15);
    gated
      ..release(0)
      ..release(0);
    await Future.wait([first, earlier]);
    expect(cubit.state.earlierPosition, 15);
    expect(cubit.state.messages.first.position, 15);
  });

  test('an unsaved read marker leaves the row and tries again', () async {
    final gated = _Gated(repository)..saved = false;
    final marks = <ThreadSeenMark>[];
    final sub = gated.seenMarks.listen(marks.add);
    addTearDown(sub.cancel);
    final cubit = ThreadCubit(
      repository: gated,
      machine: bridge,
      threadId: 'p_tuturuuu_0',
    );
    addTearDown(cubit.close);
    await cubit.load();
    await settle();
    await cubit.load();
    await settle();
    expect(gated.markReads, 2);
    expect(marks, isEmpty);
  });
}

/// Holds `messages` reads until released, and can refuse read markers.
class _Gated implements ProjectsRepository {
  _Gated(this._inner);

  final FixtureProjectsRepository _inner;
  bool hold = false;
  bool saved = true;
  int markReads = 0;
  final _pending = <Completer<void>>[];
  int _shift = 0;

  void release(int index, {int shift = 0}) {
    _shift = shift;
    _pending.removeAt(index).complete();
  }

  @override
  Future<ThreadTranscript> messages(
    ProjectsMachine machine,
    String threadId, {
    int? before,
  }) async {
    if (hold) {
      final gate = Completer<void>();
      _pending.add(gate);
      await gate.future;
    }
    final shift = _shift;
    final page = await _inner.messages(machine, threadId, before: before);
    if (before != null || shift == 0) return page;
    return ThreadTranscript(
      thread: page.thread,
      messages: page.messages.skip(shift).toList(),
      earlierPosition: (page.earlierPosition ?? 0) + shift,
    );
  }

  @override
  Future<bool> markRead(
    ProjectsMachine machine, {
    required String threadId,
    required int itemCount,
  }) async {
    markReads++;
    return saved;
  }

  @override
  Stream<ThreadSeenMark> get seenMarks => _inner.seenMarks;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}
