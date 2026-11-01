import 'dart:ui' show AppLifecycleState;

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_trust.dart';
import 'package:mobile/features/mastermind/iris/device/iris_enrolment_store.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';

import '../../../helpers/mastermind_iris_device.dart';
import '../../../helpers/mastermind_view_harness.dart';

/// The runtime owns the device key's app-level edges: leaving the foreground
/// ends the read session, and logout or account switch drops the key.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeIrisKeyChannel native;
  late MemoryIrisEnrolmentStore store;
  late IrisDeviceTrust trust;
  late MastermindViewHarness harness;

  setUp(() {
    native = FakeIrisKeyChannel();
    store = MemoryIrisEnrolmentStore(
      IrisEnrolmentRecord(
        state: IrisEnrolmentState.enrolled,
        deviceId: irisDeviceIdFor(irisSyntheticFingerprint),
        fingerprint: irisSyntheticFingerprint,
      ),
    );
    trust = IrisDeviceTrust(
      key: native.key,
      store: store,
      prompts: () => (unlock: 'Unlock', confirm: 'Confirm', cancel: 'Cancel'),
    );
    harness = MastermindViewHarness(irisTrust: trust);
    addTearDown(harness.dispose);
    addTearDown(native.dispose);
  });

  test('hidden and paused end the read session; inactive does not', () async {
    harness.runtime.irisLifecycle(AppLifecycleState.inactive);
    await pumpEventQueue();
    expect(native.named('lock'), isEmpty, reason: 'a Face ID sheet');
    harness.runtime.irisLifecycle(AppLifecycleState.hidden);
    harness.runtime.irisLifecycle(AppLifecycleState.paused);
    await pumpEventQueue();
    expect(native.named('lock'), hasLength(2));
  });

  test('resume lets a paused read prompt again', () async {
    native.failNextSign = 'cancelled';
    await expectLater(
      trust.sign('GET', '/v1/iris/feed', const []),
      throwsA(isA<IrisSignerException>()),
    );
    await expectLater(
      trust.sign('GET', '/v1/iris/feed', const []),
      throwsA(
        isA<IrisSignerException>().having(
          (e) => e.kind,
          'kind',
          IrisFailureKind.deviceLocked,
        ),
      ),
    );
    expect(native.named('sign'), hasLength(1));
    harness.runtime.irisLifecycle(AppLifecycleState.resumed);
    await trust.sign('GET', '/v1/iris/feed', const []);
    expect(native.named('sign'), hasLength(2));
  });

  test('logout or account switch forgets the key and enrolment', () async {
    await harness.runtime.reset();
    expect(store.record, isNull);
    expect(native.named('deleteKey'), hasLength(1));
  });

  test('without a device key the lifecycle is a no-op', () async {
    final bare = MastermindViewHarness();
    addTearDown(bare.dispose);
    bare.runtime.irisLifecycle(AppLifecycleState.paused);
    await bare.runtime.reset();
    expect(native.calls, isEmpty);
  });
}
