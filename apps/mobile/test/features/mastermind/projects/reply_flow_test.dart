import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_thread_reply_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_repository.dart';
import 'package:mobile/features/mastermind/projects/view/projects_labels.dart';

final _now = DateTime.utc(2026, 11, 22, 7);

void main() {
  late FixtureProjectsRepository repository;
  var keys = 0;

  setUp(() => repository = FixtureProjectsRepository(now: _now));

  FleetThreadReplyCubit cubitFor(String threadId) {
    final cubit = FleetThreadReplyCubit(
      source: repository.replySource,
      machineId: FixtureProjectsRepository.bridgeId,
      threadId: threadId,
      newKey: () => '00000000-0000-4000-8000-00000000000${++keys % 10}',
    );
    addTearDown(cubit.close);
    return cubit;
  }

  test('Sending, Sent, then Steered once the receipt is re-read', () async {
    final cubit = cubitFor('p_tuturuuu_0');
    final sending = cubit.submit('Keep going');
    expect(replyPhaseOf(cubit.state), ReplyPhase.sending);
    await sending;
    expect(replyPhaseOf(cubit.state), ReplyPhase.sent);
    // A receipt frame or threads notice while held calls retry().
    await cubit.retry();
    expect(replyPhaseOf(cubit.state), ReplyPhase.steered);
  });

  test('idle starts, waiting queues, failed is Not delivered', () async {
    for (final (id, phase) in [
      ('p_tuturuuu_2', ReplyPhase.started),
      ('p_tuturuuu_1', ReplyPhase.queued),
      ('p_tuturuuu_5', ReplyPhase.failed),
    ]) {
      final cubit = cubitFor(id);
      await cubit.submit('Next');
      await cubit.retry();
      expect(replyPhaseOf(cubit.state), phase, reason: id);
    }
  });

  test('needs MFA keeps the text; Send again reuses the key', () async {
    final cubit = cubitFor('p_tuturuuu_0');
    repository.failNext = ProjectsFailureKind.mfaRequired;
    await cubit.submit('Ship it');
    expect(cubit.state.phase, FleetReplyPhase.needsMfa);
    final key = cubit.state.key;
    await cubit.submit('Ship it');
    expect(cubit.state.phase, FleetReplyPhase.sent);
    expect(cubit.state.reply!.id, key);
  });

  test('a held reply ignores new text until Write another', () async {
    final cubit = cubitFor('p_tuturuuu_0');
    await cubit.submit('First');
    await cubit.submit('Second');
    expect(cubit.state.text, 'First');
    cubit.reset();
    await cubit.submit('Second');
    expect(cubit.state.text, 'Second');
    expect(cubit.state.reply!.state, FleetReplyState.sent);
  });
}
