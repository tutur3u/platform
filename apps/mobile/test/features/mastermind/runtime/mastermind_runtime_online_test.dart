import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

/// Connectivity is the runtime's to follow: it feeds the scheduler and, back
/// online, re-asks the hub whether replies are still on.
void main() {
  late StreamController<bool> online;
  late int capabilityChecks;
  late MastermindViewHarness harness;

  setUp(() {
    online = StreamController<bool>();
    capabilityChecks = 0;
    harness = MastermindViewHarness(
      replies: repliesCubit(
        fetchCapabilities: () {
          capabilityChecks++;
          return capabilities()();
        },
      ),
      onlineChanges: online.stream,
    );
    addTearDown(harness.dispose);
    addTearDown(online.close);
  });

  test('an online change reaches the scheduler', () async {
    expect(harness.scheduler.isOnline, isTrue);
    online.add(false);
    await pumpEventQueue();
    expect(harness.scheduler.isOnline, isFalse);
    online.add(true);
    await pumpEventQueue();
    expect(harness.scheduler.isOnline, isTrue);
  });

  test('close cancels the connectivity subscription', () async {
    expect(online.hasListener, isTrue);
    await harness.runtime.close();
    expect(online.hasListener, isFalse);
    // A late event has nowhere to go.
    online.add(false);
    await pumpEventQueue();
    expect(harness.scheduler.isOnline, isTrue);
  });

  test('a repeated value is one change, not another recheck', () async {
    online
      ..add(true)
      ..add(true);
    await pumpEventQueue();
    expect(capabilityChecks, 1);

    online
      ..add(false)
      ..add(false);
    await pumpEventQueue();
    expect(capabilityChecks, 1);

    online
      ..add(true)
      ..add(true);
    await pumpEventQueue();
    expect(capabilityChecks, 2);
  });

  test('a stream error leaves the device assumed online', () async {
    online.addError(StateError('plugin'));
    await pumpEventQueue();
    expect(harness.scheduler.isOnline, isTrue);
    online.add(false);
    await pumpEventQueue();
    expect(harness.scheduler.isOnline, isFalse);
  });
}
