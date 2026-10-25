import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:record/record.dart';

class _ControlledRecorderPlatform extends RecordPlatform {
  final permission = Completer<bool>();
  final permissionEntered = Completer<void>();
  final startEntered = Completer<void>();
  final stopEntered = Completer<void>();
  final streams = <StreamController<Uint8List>>[];
  Completer<void>? startGate;
  Completer<void>? stopGate;
  bool recording = false;
  bool failStart = false;
  int starts = 0;
  int stops = 0;
  int recordingQueries = 0;

  @override
  Future<void> create(String recorderId) async {}

  @override
  Stream<RecordState> onStateChanged(String recorderId) => const Stream.empty();

  @override
  Future<bool> hasPermission(String recorderId, {bool request = true}) {
    if (!permissionEntered.isCompleted) permissionEntered.complete();
    return permission.future;
  }

  @override
  Future<Stream<Uint8List>> startStream(
    String recorderId,
    RecordConfig config,
  ) async {
    starts++;
    if (!startEntered.isCompleted) startEntered.complete();
    await startGate?.future;
    recording = true;
    if (failStart) {
      throw StateError('Native start failed after opening capture');
    }
    final stream = StreamController<Uint8List>.broadcast();
    streams.add(stream);
    return stream.stream;
  }

  @override
  Future<bool> isRecording(String recorderId) async {
    recordingQueries++;
    return recording;
  }

  @override
  Future<String?> stop(String recorderId) async {
    stops++;
    if (!stopEntered.isCompleted) stopEntered.complete();
    await stopGate?.future;
    recording = false;
    return null;
  }

  @override
  Future<void> dispose(String recorderId) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);

  void releaseGates() {
    if (!permission.isCompleted) permission.complete(false);
    if (startGate case final gate? when !gate.isCompleted) gate.complete();
    if (stopGate case final gate? when !gate.isCompleted) gate.complete();
  }
}

// Drain microtasks and stream events without waiting for a permission deadline.
Future<void> _drainEvents() => Future<void>.delayed(Duration.zero);

void main() {
  late RecordPlatform previous;
  late _ControlledRecorderPlatform platform;
  late AssistantLiveRecorder recorder;

  setUp(() {
    previous = RecordPlatform.instance;
    platform = _ControlledRecorderPlatform();
    RecordPlatform.instance = platform;
    recorder = AssistantLiveRecorder();
  });

  tearDown(() async {
    platform.releaseGates();
    try {
      await recorder.dispose();
      for (final stream in platform.streams) {
        await stream.close();
      }
    } finally {
      RecordPlatform.instance = previous;
    }
  });

  test('permission-only stop completes before the OS dialog settles', () async {
    final permission = recorder.ensurePermission();
    await platform.permissionEntered.future;
    var stopped = false;
    final stopping = recorder.stop().then((_) => stopped = true);

    await _drainEvents();
    expect(platform.permission.isCompleted, isFalse);
    expect(stopped, isTrue);
    expect(platform.recordingQueries, 0);
    expect(platform.stops, 0);
    expect(platform.starts, 0);

    platform.permission.complete(false);
    expect(await permission, isFalse);
    await stopping;
  });

  test('late permission grant cannot start the cancelled capture', () async {
    final starting = () async {
      if (await recorder.ensurePermission()) {
        await recorder.start(onData: (_) {});
      }
    }();
    await platform.permissionEntered.future;
    var stopped = false;
    final stopping = recorder.stop().then((_) => stopped = true);
    await _drainEvents();
    expect(stopped, isTrue);

    platform.permission.complete(true);
    await starting;
    await stopping;
    expect(platform.starts, 0);
    expect(platform.recording, isFalse);
    expect(platform.recordingQueries, 0);

    // A new explicit attempt can still obtain permission and capture.
    expect(await recorder.ensurePermission(), isTrue);
    await recorder.start(onData: (_) {});
    expect(platform.starts, 1);
    expect(platform.recording, isTrue);
  });

  test('active stop mutes callbacks and releases native capture', () async {
    final received = <int>[];
    await recorder.start(onData: received.addAll);
    platform.streams.single.add(Uint8List.fromList([1]));
    await _drainEvents();
    expect(received, [1]);

    platform.stopGate = Completer<void>();
    final stopping = recorder.stop();
    // Data queued at stop intent must not escape during asynchronous cleanup.
    platform.streams.single.add(Uint8List.fromList([2]));
    await platform.stopEntered.future;
    await _drainEvents();
    expect(received, [1]);

    platform.stopGate!.complete();
    await stopping;
    expect(platform.streams.single.hasListener, isFalse);
    expect(platform.recording, isFalse);
    expect(platform.stops, 1);
    expect(platform.recordingQueries, 0);
    await recorder.stop();
    expect(platform.stops, 1);
  });

  test('stop retires a pending native start before completing', () async {
    platform
      ..startGate = Completer<void>()
      ..stopGate = Completer<void>();
    final received = <int>[];
    final starting = recorder.start(onData: received.addAll);
    await platform.startEntered.future;
    var stopped = false;
    final stopping = recorder.stop().then((_) => stopped = true);
    await _drainEvents();
    expect(stopped, isFalse);
    expect(platform.stops, 0);

    platform.startGate!.complete();
    await starting;
    await platform.stopEntered.future;
    platform.streams.single.add(Uint8List.fromList([3]));
    await _drainEvents();
    expect(received, isEmpty);
    expect(stopped, isFalse);
    platform.stopGate!.complete();
    await stopping;
    expect(platform.streams.single.hasListener, isFalse);
    expect(platform.starts, 1);
    expect(platform.stops, 1);
    expect(platform.recording, isFalse);
  });

  test('stop invalidates a start queued before native admission', () async {
    final starting = recorder.start(onData: (_) {});
    final stopping = recorder.stop();
    await starting;
    await stopping;
    expect(platform.starts, 0);
    expect(platform.stops, 0);
    expect(platform.recording, isFalse);
  });

  test('replacement capture waits for the prior native stop', () async {
    await recorder.start(onData: (_) {});
    platform.stopGate = Completer<void>();
    final stopping = recorder.stop();
    await platform.stopEntered.future;
    final received = <int>[];
    final starting = recorder.start(onData: received.addAll);
    await _drainEvents();
    expect(platform.starts, 1);

    platform.stopGate!.complete();
    await stopping;
    await starting;
    expect(platform.starts, 2);
    expect(platform.stops, 1);
    expect(platform.recording, isTrue);
    expect(platform.streams.first.hasListener, isFalse);
    platform.streams.last.add(Uint8List.fromList([4]));
    await _drainEvents();
    expect(received, [4]);
    await recorder.stop();
    expect(platform.stops, 2);
    expect(platform.recording, isFalse);
  });

  test(
    'failed native start retains cleanup ownership and permits retry',
    () async {
      platform.failStart = true;
      await expectLater(recorder.start(onData: (_) {}), throwsStateError);
      expect(platform.recording, isTrue);
      await recorder.stop();
      expect(platform.stops, 1);
      expect(platform.recording, isFalse);

      platform.failStart = false;
      await recorder.start(onData: (_) {});
      expect(platform.starts, 2);
      expect(platform.recording, isTrue);
    },
  );
}
