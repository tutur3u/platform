import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/mastermind/iris/data/fixture_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/http_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay_factory.dart';
import 'package:mobile/features/mastermind/iris/device/enrolled_iris_relay.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_trust.dart';
import 'package:mobile/features/mastermind/iris/device/iris_enrolment_store.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';

import '../../../../helpers/mastermind_hub_harness.dart';
import '../../../../helpers/mastermind_iris_device.dart';
import '../../../../helpers/mastermind_iris_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeIrisKeyChannel native;
  late MemoryIrisEnrolmentStore store;
  late List<http.Request> requests;
  final deviceId = irisDeviceIdFor(irisSyntheticFingerprint);

  setUp(() {
    native = FakeIrisKeyChannel();
    store = MemoryIrisEnrolmentStore();
    requests = [];
  });
  tearDown(() => native.dispose());

  http.Client client(http.Response Function(http.Request) respond) =>
      MockClient((request) async {
        requests.add(request);
        return respond(request);
      });

  IrisDeviceTrust trust() => IrisDeviceTrust(
    key: native.key,
    store: store,
    prompts: () => (unlock: 'Unlock', confirm: 'Confirm', cancel: 'Cancel'),
  );

  group('createIrisRelay', () {
    test('a non-fixture build without a hardware key fails closed', () async {
      final relay = createIrisRelay(
        fixtureBuild: false,
        hubUrl: hubBase,
        tokens: FakeTokens(),
        client: client((_) => http.Response('{}', 200)),
      );
      expect(relay, isA<UnconfiguredIrisRelay>());
      expect(relay.isConfigured, isFalse);
      final feed = await relay.feed();
      expect(feed.failureOrNull!.kind, IrisFailureKind.notEnrolled);
      final send = await relay.send('hi', idempotencyKey: fixedId);
      expect(send.failureOrNull!.kind, IrisFailureKind.notEnrolled);
      expect(requests, isEmpty);
    });

    test('the release default (no fixture define) has no signer', () {
      // Tests run without MASTERMIND_FIXTURE or a flavor, as release does.
      expect(FixtureIrisRelay.buildEnabled, isFalse);
      expect(createIrisRelay(hubUrl: hubBase), isA<UnconfiguredIrisRelay>());
    });

    test('a hardware key that is not enrolled sends nothing', () async {
      final relay = createIrisRelay(
        fixtureBuild: false,
        hubUrl: hubBase,
        tokens: FakeTokens(),
        trust: trust(),
        client: client((_) => http.Response('{}', 200)),
      );
      expect(relay, isA<EnrolledIrisRelay>());
      expect(
        (await relay.summary()).failureOrNull!.kind,
        IrisFailureKind.notEnrolled,
      );
      expect(requests, isEmpty);
      expect(native.named('sign'), isEmpty, reason: 'no biometric prompt');
    });

    test('an enrolled key signs every device request', () async {
      store.record = IrisEnrolmentRecord(
        state: IrisEnrolmentState.enrolled,
        deviceId: deviceId,
        fingerprint: irisSyntheticFingerprint,
      );
      final relay = createIrisRelay(
        fixtureBuild: false,
        hubUrl: hubBase,
        tokens: FakeTokens(),
        trust: trust(),
        client: client(
          (_) => http.Response(
            jsonEncode({'id': irisSendId, 'state': 'received'}),
            202,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );
      final result = await relay.send('hi', idempotencyKey: fixedId);
      expect(result.valueOrNull, isNotNull);
      final headers = requests.single.headers;
      expect(headers['X-Device-Id'], deviceId);
      expect(headers['X-Iris-Sig'], irisBase64Url([...irisSigR, ...irisSigS]));
      expect(headers['Idempotency-Key'], fixedId);
      expect(
        (native.named('sign').single.arguments as Map)['sensitive'],
        isTrue,
      );
    });

    group('a relay that forgot the device', () {
      IrisRelay live(String error) => createIrisRelay(
        fixtureBuild: false,
        hubUrl: hubBase,
        tokens: FakeTokens(refreshed: 'synthetic-token-2'),
        trust: trust(),
        client: client(
          (_) => http.Response(
            '{"error":"$error"}',
            401,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      IrisEnrolmentRecord record(IrisEnrolmentState state) =>
          IrisEnrolmentRecord(
            state: state,
            deviceId: deviceId,
            fingerprint: irisSyntheticFingerprint,
            expiresAt: state == IrisEnrolmentState.pending
                ? DateTime.now().toUtc().add(const Duration(minutes: 15))
                : null,
          );

      for (final error in ['device_revoked', 'unknown_device']) {
        test('$error clears a confirmed enrolment and its key', () async {
          store.record = record(IrisEnrolmentState.enrolled);
          final relay = live(error);
          expect(
            (await relay.summary()).failureOrNull!.kind,
            IrisFailureKind.deviceRevoked,
          );
          expect(store.record, isNull);
          expect(native.named('deleteKey'), hasLength(1));
          // Nothing more is sent until the owner enrols again.
          expect(
            (await relay.summary()).failureOrNull!.kind,
            IrisFailureKind.notEnrolled,
          );
          expect(requests, hasLength(1));
        });
      }

      test('unknown_device while pending keeps the enrolment', () async {
        store.record = record(IrisEnrolmentState.pending);
        await live('unknown_device').summary();
        expect(store.record, isNotNull);
        expect(native.named('deleteKey'), isEmpty);
      });

      test('a bad signature never clears the enrolment', () async {
        store.record = record(IrisEnrolmentState.enrolled);
        expect(
          (await live('unauthorized').summary()).failureOrNull!.kind,
          IrisFailureKind.unauthorized,
        );
        expect(store.record, isNotNull);
        expect(native.named('deleteKey'), isEmpty);
      });
    });

    test('fixture builds use the fixture relay and never sign', () {
      expect(createIrisRelay(fixtureBuild: true), isA<FixtureIrisRelay>());
      expect(native.calls, isEmpty);
    });

    test('the sha256 fake signer is unreachable from app code', () {
      final offenders = <String>[];
      for (final file in Directory('lib').listSync(recursive: true)) {
        if (file is! File || !file.path.endsWith('.dart')) continue;
        final text = file.readAsStringSync();
        if (text.contains('FakeIrisRequestSigner')) offenders.add(file.path);
        // The synthetic identity is only ever chosen behind the fixture gate.
        if (text.contains('const FakeIrisDeviceIdentity()') &&
            !text.contains('class FakeIrisDeviceIdentity') &&
            !text.contains(
              'FixtureIrisRelay.buildEnabled\n'
              '          ? const FakeIrisDeviceIdentity()',
            )) {
          offenders.add(file.path);
        }
      }
      expect(offenders, isEmpty);
    });
  });

  group('HttpIrisRelay enrolment', () {
    HttpIrisRelay relay(http.Response Function(http.Request) respond) =>
        HttpIrisRelay(
          baseUrl: hubBase,
          tokens: FakeTokens(),
          signer: trust(),
          client: client(respond),
        );

    test('POSTs the relay body unsigned, under the device id', () async {
      final result =
          await relay(
            (_) => http.Response(
              jsonEncode({
                'state': 'pending',
                'pending_id': deviceId,
                'fingerprint_prefix': irisSyntheticFingerprint.substring(0, 8),
                'device_name': 'Phone',
                'code': '042917',
                'command': 'iris enroll 042917 abcdef12',
              }),
              202,
              headers: {'content-type': 'application/json'},
            ),
          ).enroll(
            'pk_b64url',
            irisSyntheticFingerprint,
            deviceId: deviceId,
            code: '042917',
          );
      final enrolment = result.valueOrNull!;
      expect(enrolment.deviceId, deviceId);
      expect(enrolment.code, '042917');
      expect(
        enrolment.fingerprintPrefix,
        irisSyntheticFingerprint.substring(0, 8),
      );
      final request = requests.single;
      expect(request.method, 'POST');
      expect(request.url.path, '/v1/iris/enrol');
      expect(jsonDecode(request.body), {
        'public_key': 'pk_b64url',
        'fingerprint': irisSyntheticFingerprint,
        'code': '042917',
      });
      expect(request.headers['X-Device-Id'], deviceId);
      expect(
        request.headers['Idempotency-Key'],
        matches(irisIdempotencyKeyPatternForTest),
      );
      expect(request.headers.containsKey('X-Iris-Sig'), isFalse);
      expect(native.calls, isEmpty, reason: 'no key use, no prompt');
    });

    test('a reply for another device is malformed', () async {
      final result =
          await relay(
            (_) => http.Response(
              jsonEncode({
                'state': 'pending',
                'pending_id': '00000000-0000-4000-8000-000000000000',
                'fingerprint_prefix': 'abcdef12',
                'device_name': 'Phone',
                'code': '042917',
                'command': 'iris enroll 042917 abcdef12',
              }),
              202,
            ),
          ).enroll(
            'pk',
            irisSyntheticFingerprint,
            deviceId: deviceId,
            code: '042917',
          );
      expect(result.failureOrNull!.kind, IrisFailureKind.malformed);
    });

    test('revoke is an unsigned owner call', () async {
      await relay((_) => http.Response('', 200)).revoke(deviceId);
      expect(requests.single.method, 'DELETE');
      expect(requests.single.headers.containsKey('X-Iris-Sig'), isFalse);
      expect(native.calls, isEmpty);
    });

    test('a signer failure is reported, not sent', () async {
      store.record = IrisEnrolmentRecord(
        state: IrisEnrolmentState.enrolled,
        deviceId: deviceId,
        fingerprint: irisSyntheticFingerprint,
      );
      native.failNextSign = 'cancelled';
      final result = await relay(
        (_) => http.Response('{}', 200),
      ).send('hi', idempotencyKey: fixedId);
      expect(result.failureOrNull!.kind, IrisFailureKind.deviceLocked);
      expect(requests, isEmpty);
    });
  });
}

final irisIdempotencyKeyPatternForTest = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
