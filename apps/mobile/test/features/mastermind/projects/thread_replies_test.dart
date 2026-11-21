import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/thread_replies.dart';

final _now = DateTime.utc(2026, 11, 22, 7);

void main() {
  late FixtureProjectsRepository repository;
  late ThreadReplies replies;
  late List<(FleetReplyPhase, bool)> phases;
  var keys = 0;

  setUp(() {
    repository = FixtureProjectsRepository(now: _now);
    phases = [];
    replies = ThreadReplies(
      create: () => FleetThreadReplyCubit(
        source: repository.replySource,
        machineId: FixtureProjectsRepository.bridgeId,
        threadId: 'p_tuturuuu_0',
        newKey: () => '00000000-0000-4000-8000-00000000000${++keys % 10}',
      ),
      onPhase: (status, {required current}) =>
          phases.add((status.phase, current)),
    );
    addTearDown(replies.dispose);
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('Write another keeps the held reply alive and checked', () async {
    replies.send('First');
    await settle();
    expect(replies.replies.single.state.phase, FleetReplyPhase.sent);
    expect(replies.composerEnabled, isFalse);

    replies.writeAnother();
    expect(replies.composerEnabled, isTrue);
    replies.send('Second');
    await settle();
    expect(replies.replies, hasLength(2));
    expect(replies.isCurrent(replies.replies.last), isTrue);

    // A receipt frame re-reads every held reply.
    replies.checkHeld();
    await settle();
    expect(
      replies.replies.map((r) => r.state.phase),
      everyElement(FleetReplyPhase.delivered),
    );
    expect(
      phases.where((p) => p.$1 == FleetReplyPhase.delivered),
      hasLength(2),
    );
  });

  test('the same text after needs MFA is the same reply and key', () async {
    repository.failNext = ProjectsFailureKind.mfaRequired;
    replies.send('Ship it');
    await settle();
    final first = replies.replies.single;
    expect(first.state.phase, FleetReplyPhase.needsMfa);
    final key = first.state.key;
    replies.send('Ship it');
    await settle();
    expect(replies.replies, hasLength(1));
    expect(first.state.phase, FleetReplyPhase.sent);
    expect(first.state.reply!.id, key);
  });

  test('new text after a finished reply is a new reply', () async {
    replies.send('One');
    await settle();
    replies.checkHeld();
    await settle();
    expect(replies.replies.single.state.phase, FleetReplyPhase.delivered);
    replies.send('Two');
    await settle();
    expect(replies.replies, hasLength(2));
    expect(replies.replies.first.state.text, 'One');
  });

  test(
    'the same text matches any waiting reply, not only the latest',
    () async {
      repository.failNext = ProjectsFailureKind.unavailable;
      replies.send('Ship it');
      await settle();
      final first = replies.replies.single;
      expect(first.state.phase, FleetReplyPhase.failed);
      expect(first.state.retryable, isTrue);
      final key = first.state.key;

      replies.send('Something else');
      await settle();
      replies.checkHeld();
      await settle();
      expect(replies.replies, hasLength(2));

      replies.send('Ship it');
      await settle();
      expect(replies.replies, hasLength(2));
      expect(first.state.phase, FleetReplyPhase.sent);
      expect(first.state.reply!.id, key);
    },
  );

  test('a double tap makes one reply', () {
    replies
      ..send('Once')
      ..send('Once')
      ..send('Twice');
    expect(replies.replies, hasLength(1));
    expect(replies.replies.single.state.text, 'Once');
  });
}
