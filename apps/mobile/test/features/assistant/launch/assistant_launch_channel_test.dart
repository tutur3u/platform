import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_channel.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_coordinator.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('test/assistant_shortcuts');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  final now = DateTime(2026, 10, 25, 12);
  late List<Map<String, Object?>> queue;
  late int takes;
  late AssistantLaunchCoordinator coordinator;

  setUp(() {
    queue = [];
    takes = 0;
    coordinator = AssistantLaunchCoordinator(clock: () => now);
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method != 'takePending') return null;
      takes++;
      final drained = List.of(queue);
      queue.clear();
      return drained;
    });
  });

  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  Map<String, Object?> voice(String id) => {
    'id': id,
    'kind': 'voice',
    'trusted': true,
    'createdAtMs': now.millisecondsSinceEpoch,
  };

  Future<void> signal() => messenger.handlePlatformMessage(
    channel.name,
    const StandardMethodCodec().encodeMethodCall(
      const MethodCall('pendingAvailable'),
    ),
    (_) {},
  );

  test('cold start drains the native queue on start', () async {
    queue.add(voice('a'));
    final bridge = AssistantLaunchChannel(
      channel: channel,
      coordinator: coordinator,
      clock: () => now,
    );
    await bridge.start();
    expect(takes, 1);
    expect(coordinator.pending?.id, 'a');
    bridge.stop();
  });

  test('warm signal drains; repeated ids are submitted once', () async {
    final bridge = AssistantLaunchChannel(
      channel: channel,
      coordinator: coordinator,
      clock: () => now,
    );
    await bridge.start();
    queue
      ..add(voice('a'))
      ..add({'id': 'bad', 'kind': 'unknown'});
    await signal();
    expect(coordinator.pending?.id, 'a');

    final host = AssistantLaunchHost(
      currentActor: () => 'user-1',
      appLocked: () => false,
      workspace: () => AssistantLaunchWorkspace.ready,
      openAssistant: () {},
      openWorkspacePicker: () {},
    );
    coordinator.bind(host);
    final delivered = coordinator.request.value!;
    expect(coordinator.claim(delivered, actorId: 'user-1'), isTrue);
    queue.add(voice('a'));
    await signal();
    expect(coordinator.request.value, isNull);
    expect(coordinator.pending, isNull);
    bridge.stop();
  });

  test('a missing native plugin is ignored', () async {
    messenger.setMockMethodCallHandler(channel, null);
    final bridge = AssistantLaunchChannel(
      channel: channel,
      coordinator: coordinator,
    );
    await bridge.start();
    expect(coordinator.pending, isNull);
    bridge.stop();
  });
}
