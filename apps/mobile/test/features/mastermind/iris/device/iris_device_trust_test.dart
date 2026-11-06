import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_trust.dart';
import 'package:mobile/features/mastermind/iris/device/iris_enrolment_store.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';

import '../../../../helpers/mastermind_iris_device.dart';
import '../../../../helpers/mastermind_iris_fixture.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeIrisKeyChannel native;
  late MemoryIrisEnrolmentStore store;
  late DateTime now;
  final deviceId = irisDeviceIdFor(irisSyntheticFingerprint);

  IrisDeviceTrust trust() => IrisDeviceTrust(
    key: native.key,
    store: store,
    clock: () => now,
    prompts: () => (unlock: 'Unlock', confirm: 'Confirm', cancel: 'Cancel'),
  );

  IrisEnrolmentRecord record(IrisEnrolmentState state) => IrisEnrolmentRecord(
    state: state,
    deviceId: deviceId,
    fingerprint: irisSyntheticFingerprint,
    expiresAt: state == IrisEnrolmentState.pending
        ? now.add(const Duration(minutes: 15))
        : null,
  );

  setUp(() {
    native = FakeIrisKeyChannel();
    now = DateTime.utc(2026, 10, 31, 12);
    store = MemoryIrisEnrolmentStore();
  });
  tearDown(() => native.dispose());

  group('sign', () {
    test('emits exactly the relay headers over its canonical string', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      final body = utf8.encode('{"target":"atlas","text":"hi"}');
      final headers = await trust().sign(
        'post',
        '/v1/iris/send',
        body,
        idempotencyKey: fixedId,
      );
      expect(headers.keys.toSet(), {
        'X-Device-Id',
        'X-Iris-Ts',
        'X-Iris-Nonce',
        'X-Iris-Sig',
      });
      expect(headers['X-Device-Id'], deviceId);
      expect(headers['X-Iris-Ts'], '1793448000');
      expect(headers['X-Iris-Nonce'], matches(RegExp(r'^[0-9a-f]{32}$')));
      expect(headers['X-Iris-Sig'], irisBase64Url([...irisSigR, ...irisSigS]));

      // The bytes handed to the key: the eight v3 lines, no trailing LF,
      // ending with the signed Idempotency-Key.
      final args = native.named('sign').single.arguments as Map;
      final signed = utf8.decode(args['data'] as Uint8List);
      expect(
        signed,
        [
          irisSignatureDomain,
          'POST',
          '/v1/iris/send',
          sha256.convert(body).toString(),
          '1793448000',
          headers['X-Iris-Nonce'],
          deviceId,
          fixedId,
        ].join('\n'),
      );
      expect(args['sensitive'], isTrue);
      expect(args['reason'], 'Confirm');
    });

    test('reads are not sensitive and keep the query in the path', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      await trust().sign('GET', '/v1/iris/feed?after=m-1&limit=5', const []);
      final args = native.named('sign').single.arguments as Map;
      expect(args['sensitive'], isFalse);
      expect(args['reason'], 'Unlock');
      final lines = utf8.decode(args['data'] as Uint8List).split('\n');
      expect(lines, hasLength(8));
      expect(lines.take(4), [
        irisSignatureDomain,
        'GET',
        '/v1/iris/feed?after=m-1&limit=5',
        sha256.convert(const <int>[]).toString(),
      ]);
      // A read signs an empty Idempotency-Key line.
      expect(lines.last, isEmpty);
    });

    test('a write without an Idempotency-Key is never signed', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      await expectLater(
        trust().sign('POST', '/v1/iris/send', utf8.encode('{}')),
        _fails(IrisFailureKind.badRequest),
      );
      await expectLater(
        trust().sign('GET', '/v1/iris/feed\n', const []),
        _fails(IrisFailureKind.badRequest),
      );
      expect(native.named('sign'), isEmpty);
    });

    test('a locked key never falls back to another key', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      native.failNextSign = 'failed';
      await expectLater(
        trust().sign('GET', '/v1/iris/feed', const []),
        _fails(IrisFailureKind.deviceLocked),
      );
      // No new key, no deleted key, and the enrolment stays for "Enrol
      // again" to replace.
      expect(native.named('ensureKey'), isEmpty);
      expect(native.named('deleteKey'), isEmpty);
      expect(store.record, isNotNull);
    });

    test('no enrolment: refused before the key is touched', () async {
      await expectLater(
        trust().sign('GET', '/v1/iris/summary', const []),
        _fails(IrisFailureKind.notEnrolled),
      );
      store.record = IrisEnrolmentRecord(
        state: IrisEnrolmentState.pending,
        deviceId: deviceId,
        fingerprint: irisSyntheticFingerprint,
        expiresAt: now.subtract(const Duration(seconds: 1)),
      );
      await expectLater(
        trust().sign('GET', '/v1/iris/summary', const []),
        _fails(IrisFailureKind.notEnrolled),
      );
      expect(native.calls, isEmpty);
    });

    test('a cancelled read prompt pauses reads, not writes', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      final device = trust();
      native.failNextSign = 'cancelled';
      await expectLater(
        device.sign('GET', '/v1/iris/feed', const []),
        _fails(IrisFailureKind.deviceLocked),
      );
      // The next poll fails fast without prompting again.
      await expectLater(
        device.sign('GET', '/v1/iris/feed', const []),
        _fails(IrisFailureKind.deviceLocked),
      );
      expect(native.named('sign'), hasLength(1));
      // A write still asks, and its success lifts the pause.
      await device.sign(
        'POST',
        '/v1/iris/send',
        utf8.encode('{}'),
        idempotencyKey: fixedId,
      );
      await device.sign('GET', '/v1/iris/feed', const []);
      expect(native.named('sign'), hasLength(3));
    });

    test('the read pause ends after five minutes', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      final device = trust();
      native.failNextSign = 'lockout';
      await expectLater(
        device.sign('GET', '/v1/iris/feed', const []),
        _fails(IrisFailureKind.deviceLocked),
      );
      now = now.add(IrisDeviceTrust.readPause);
      await device.sign('GET', '/v1/iris/feed', const []);
      expect(native.named('sign'), hasLength(2));
    });

    test('a cancelled write fails that write only', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      final device = trust();
      native.failNextSign = 'cancelled';
      await expectLater(
        device.sign('POST', '/v1/iris/send', const [], idempotencyKey: fixedId),
        _fails(IrisFailureKind.deviceLocked),
      );
      await device.sign('GET', '/v1/iris/feed', const []);
      expect(native.named('sign'), hasLength(2));
    });

    test('an invalidated key forgets the enrolment and the key', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      native.failNextSign = 'key_invalidated';
      await expectLater(
        trust().sign('GET', '/v1/iris/feed', const []),
        _fails(IrisFailureKind.notEnrolled),
      );
      expect(store.record, isNull);
      expect(native.named('deleteKey'), hasLength(1));
    });

    test('a malformed native signature is never sent', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      native.signature = Uint8List.fromList([0x30, 0x00]);
      await expectLater(
        trust().sign(
          'POST',
          '/v1/iris/send',
          const [],
          idempotencyKey: fixedId,
        ),
        _fails(IrisFailureKind.deviceLocked),
      );
    });
  });

  group('relay forgot the device', () {
    test('a confirmed enrolment is cleared with its key', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      await trust().relayForgot();
      expect(store.record, isNull);
      expect(native.named('deleteKey'), hasLength(1));
    });

    test('a pending enrolment is kept until it expires', () async {
      store.record = record(IrisEnrolmentState.pending);
      await trust().relayForgot();
      expect(store.record, isNotNull);
      expect(native.named('deleteKey'), isEmpty);
    });
  });

  group('lifecycle', () {
    test('lock ends the read session; resume lifts the read pause', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      final device = trust();
      await device.lock();
      expect(native.named('lock'), hasLength(1));

      native.failNextSign = 'cancelled';
      await expectLater(
        device.sign('GET', '/v1/iris/feed', const []),
        _fails(IrisFailureKind.deviceLocked),
      );
      device.resumeReads();
      await device.sign('GET', '/v1/iris/feed', const []);
      expect(native.named('sign'), hasLength(2));
    });
  });

  group('enrolment', () {
    test('load offers the key as base64url SPKI under its device id', () async {
      final key = (await trust().load())!;
      expect(key.deviceId, deviceId);
      expect(key.fingerprint, irisSyntheticFingerprint);
      expect(
        base64Url.decode(base64Url.normalize(key.publicKey)),
        irisSyntheticSpki,
      );
      expect(key.publicKey, isNot(contains('=')));
    });

    test('load is null when the device cannot hold a key', () async {
      native.failEnsure = 'unsupported';
      expect(await trust().load(), isNull);
    });

    test('an enrolled device re-enrols with a new key', () async {
      store.record = record(IrisEnrolmentState.enrolled);
      await trust().load();
      expect(native.named('deleteKey'), hasLength(1));
      expect(store.record, isNull);
    });

    test('pending, then confirmed once a signed read is served', () async {
      final device = trust();
      final enrolment = IrisEnrollment(
        deviceId: deviceId,
        code: '123456',
        fingerprintPrefix: irisSyntheticFingerprint.substring(0, 8),
        expiresAt: now.add(const Duration(minutes: 15)),
      );
      await device.pending(enrolment);
      expect(await device.canSign(), isTrue);
      expect(await device.isEnrolled(), isFalse);

      final relay = _SummaryRelay(
        const IrisErr(IrisFailure(IrisFailureKind.unauthorized)),
      );
      expect(await device.check(relay, enrolment), IrisDeviceStatus.pending);

      relay.next = const IrisOk(IrisSummary(urgent: 0, soon: 0, fyi: 0));
      expect(await device.check(relay, enrolment), IrisDeviceStatus.confirmed);
      expect(await device.isEnrolled(), isTrue);
    });

    test('a pending enrolment expires after 15 minutes', () async {
      final device = trust();
      final enrolment = IrisEnrollment(
        deviceId: deviceId,
        code: '123456',
        fingerprintPrefix: 'abcdef12',
        expiresAt: now.add(const Duration(minutes: 15)),
      );
      await device.pending(enrolment);
      now = now.add(const Duration(minutes: 15));
      expect(await device.canSign(), isFalse);
      expect(
        await device.check(_SummaryRelay(null), enrolment),
        IrisDeviceStatus.expired,
      );
      expect(store.record, isNull);
    });

    test('pending refuses an enrolment for another key', () async {
      await expectLater(
        trust().pending(
          IrisEnrollment(
            deviceId: irisDeviceIdFor('f' * 64),
            code: '123456',
            fingerprintPrefix: 'ffffffff',
            expiresAt: now,
          ),
        ),
        throwsStateError,
      );
    });
  });
}

Matcher _fails(IrisFailureKind kind) =>
    throwsA(isA<IrisSignerException>().having((e) => e.kind, 'kind', kind));

/// Answers only `summary`; anything else is a test bug.
final class _SummaryRelay implements IrisRelay {
  _SummaryRelay(this.next);

  IrisResult<IrisSummary>? next;

  @override
  Future<IrisResult<IrisSummary>> summary() async => next!;

  @override
  Object? noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}
