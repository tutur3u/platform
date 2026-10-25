import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_action.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_coordinator.dart';

class _Host {
  String? actor = 'user-1';
  bool locked = false;
  AssistantLaunchWorkspace workspace = AssistantLaunchWorkspace.ready;
  int assistantOpens = 0;
  int pickerOpens = 0;

  late final host = AssistantLaunchHost(
    currentActor: () => actor,
    appLocked: () => locked,
    workspace: () => workspace,
    openAssistant: () => assistantOpens++,
    openWorkspacePicker: () => pickerOpens++,
  );
}

void main() {
  final t0 = DateTime(2026, 10, 25, 12);
  late DateTime now;
  late AssistantLaunchCoordinator coordinator;
  late _Host host;

  AssistantLaunchAction voice(String id, {bool trusted = true}) =>
      AssistantLaunchAction(
        id: id,
        kind: AssistantLaunchKind.voice,
        trusted: trusted,
        createdAt: now,
      );

  setUp(() {
    now = t0;
    coordinator = AssistantLaunchCoordinator(clock: () => now);
    host = _Host();
  });

  test('cold start: an action queued before binding opens on bind', () {
    coordinator.submit(voice('a'));
    expect(coordinator.request.value, isNull);
    expect(coordinator.pending, isNotNull);

    coordinator.bind(host.host);

    expect(host.assistantOpens, 1);
    expect(coordinator.request.value?.action.id, 'a');
    expect(coordinator.request.value?.actorId, 'user-1');
    expect(coordinator.pending, isNull);
  });

  test('warm start: a bound coordinator opens immediately', () {
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    expect(host.assistantOpens, 1);
    expect(coordinator.request.value?.action.id, 'a');
  });

  test('signed out: held until sign-in, then delivered to the new actor', () {
    host.actor = null;
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    expect(host.assistantOpens, 0);
    expect(coordinator.pending?.id, 'a');

    host.actor = 'user-2';
    coordinator.onActorChanged(previous: null, next: 'user-2');

    expect(host.assistantOpens, 1);
    expect(coordinator.request.value?.actorId, 'user-2');
  });

  test('account switch and sign-out drop held and delivered work', () {
    host.locked = true;
    coordinator
      ..bind(host.host)
      ..submit(voice('a'))
      ..onActorChanged(previous: 'user-1', next: 'user-2');
    host.locked = false;
    coordinator.tryDeliver();
    expect(host.assistantOpens, 0);

    coordinator.submit(voice('b'));
    expect(coordinator.request.value, isNotNull);
    coordinator.onActorChanged(previous: 'user-1', next: null);
    expect(coordinator.request.value, isNull);
  });

  test('app lock or background holds delivery until cleared', () {
    host.locked = true;
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    expect(host.assistantOpens, 0);
    host.locked = false;
    coordinator.tryDeliver();
    expect(host.assistantOpens, 1);
  });

  test('missing workspace opens the picker once and keeps the action', () {
    host.workspace = AssistantLaunchWorkspace.missing;
    coordinator
      ..bind(host.host)
      ..submit(voice('a'))
      ..tryDeliver();
    expect(host.pickerOpens, 1);
    expect(host.assistantOpens, 0);

    host.workspace = AssistantLaunchWorkspace.ready;
    coordinator.tryDeliver();
    expect(host.assistantOpens, 1);
  });

  test('loading workspaces wait without opening the picker', () {
    host.workspace = AssistantLaunchWorkspace.loading;
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    expect(host.pickerOpens, 0);
    expect(host.assistantOpens, 0);
  });

  test('duplicate trigger with the same id is delivered once', () {
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    final first = coordinator.request.value!;
    expect(coordinator.claim(first, actorId: 'user-1'), isTrue);
    coordinator.submit(voice('a'));
    expect(coordinator.request.value, isNull);
    expect(host.assistantOpens, 1);
  });

  test('a request is claimed once and only by its actor', () {
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    final request = coordinator.request.value!;
    expect(coordinator.claim(request, actorId: 'user-1'), isTrue);
    expect(coordinator.claim(request, actorId: 'user-1'), isFalse);

    coordinator.submit(voice('b'));
    final other = coordinator.request.value!;
    expect(coordinator.claim(other, actorId: 'someone-else'), isFalse);
    expect(coordinator.request.value, isNull);
  });

  test('a newer trigger supersedes an unclaimed request', () {
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    final stale = coordinator.request.value!;
    coordinator.submit(voice('b'));
    expect(coordinator.claim(stale, actorId: 'user-1'), isFalse);
    expect(coordinator.request.value?.action.id, 'b');
  });

  test('stale actions expire instead of opening the microphone later', () {
    host.actor = null;
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    now = t0.add(const Duration(minutes: 6));
    host.actor = 'user-1';
    coordinator.onActorChanged(previous: null, next: 'user-1');
    expect(host.assistantOpens, 0);
    expect(coordinator.pending, isNull);
  });

  test('a delivered request past its age cannot be claimed', () {
    coordinator
      ..bind(host.host)
      ..submit(voice('a'));
    final request = coordinator.request.value!;
    now = t0.add(const Duration(minutes: 6));
    expect(coordinator.claim(request, actorId: 'user-1'), isFalse);
  });

  test('unbinding a stale host keeps the current one', () {
    final other = _Host();
    coordinator
      ..bind(host.host)
      ..unbind(other.host)
      ..submit(voice('a'));
    expect(host.assistantOpens, 1);
    coordinator
      ..unbind(host.host)
      ..submit(voice('b'));
    expect(host.assistantOpens, 1);
    expect(coordinator.pending?.id, 'b');
  });
}
