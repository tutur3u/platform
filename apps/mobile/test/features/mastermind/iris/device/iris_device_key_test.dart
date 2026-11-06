import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_key.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';

import '../../../../helpers/mastermind_iris_device.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('codec', () {
    test('accepts only an uncompressed P-256 SPKI', () {
      expect(isP256Spki(irisSyntheticSpki), isTrue);
      expect(isP256Spki(irisSyntheticSpki.sublist(1)), isFalse);
      final compressed = Uint8List.fromList(irisSyntheticSpki)..[26] = 0x02;
      expect(isP256Spki(compressed), isFalse);
      final otherCurve = Uint8List.fromList(irisSyntheticSpki)..[24] = 0x22;
      expect(isP256Spki(otherCurve), isFalse);
    });

    test('base64url is unpadded and URL-safe', () {
      expect(irisBase64Url([0xfb, 0xff]), '-_8');
      expect(irisBase64Url(irisSyntheticSpki), isNot(contains('=')));
    });

    test('the device id is a lowercase UUID tied to the fingerprint', () {
      final id = irisDeviceIdFor(irisSyntheticFingerprint);
      expect(
        id,
        matches(
          RegExp(
            '^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-'
            r'[0-9a-f]{12}$',
          ),
        ),
      );
      expect(irisDeviceIdFor(irisSyntheticFingerprint), id);
      expect(irisDeviceIdFor('f' * 64), isNot(id));
      expect(() => irisDeviceIdFor('XYZ'), throwsArgumentError);
    });

    test('enrolment codes are six digits, zero-padded', () {
      expect(newIrisEnrolCode(_FixedRandom(42)), '000042');
      expect(newIrisEnrolCode(), matches(RegExp(r'^\d{6}$')));
    });

    test('strict DER becomes 64-byte r||s', () {
      final raw = irisRawSignature(irisDer(irisSigR, irisSigS))!;
      expect(raw, [...irisSigR, ...irisSigS]);
      // Short integers are left-padded.
      final short = irisRawSignature(irisDer([0, 0, 5], [0, 7]))!;
      expect(short.sublist(29, 32), [0, 0, 5]);
      expect(short[63], 7);
    });

    test('malformed DER is refused', () {
      final good = irisDer(irisSigR, irisSigS);
      expect(irisRawSignature([...good, 0]), isNull, reason: 'trailing');
      expect(irisRawSignature(Uint8List.fromList(good)..[0] = 0x31), isNull);
      // Non-minimal: a leading zero before a byte without the high bit.
      expect(
        irisRawSignature([
          0x30,
          0x08,
          0x02,
          0x02,
          0x00,
          0x01,
          0x02,
          0x02,
          1,
          1,
        ]),
        isNull,
      );
      // Negative integer.
      expect(
        irisRawSignature([0x30, 0x06, 0x02, 0x01, 0x80, 0x02, 0x01, 1]),
        isNull,
      );
      expect(irisRawSignature([]), isNull);
    });
  });

  group('channel', () {
    late FakeIrisKeyChannel native;
    setUp(() => native = FakeIrisKeyChannel());
    tearDown(() => native.dispose());

    test('ensureKey checks the SPKI and its fingerprint', () async {
      final info = await native.key.ensureKey();
      expect(info.spki, irisSyntheticSpki);
      expect(info.fingerprint, irisSyntheticFingerprint);
      expect(info.hardware, 'secure_enclave');

      native.ensureReply = {
        'publicKey': base64.encode(irisSyntheticSpki),
        'fingerprint': 'a' * 64,
        'hardware': 'tee',
      };
      await expectLater(
        native.key.ensureKey(),
        _throws(IrisDeviceKeyError.failed),
      );

      native.ensureReply = {
        'publicKey': base64.encode(irisSyntheticSpki),
        'fingerprint': irisSyntheticFingerprint,
        'hardware': 'software',
      };
      await expectLater(
        native.key.ensureKey(),
        _throws(IrisDeviceKeyError.failed),
      );
    });

    test('sign passes the bytes and the sensitive flag through', () async {
      final der = await native.key.sign(
        Uint8List.fromList([1, 2, 3]),
        sensitive: true,
        reason: 'Confirm',
        cancel: 'Cancel',
      );
      expect(der, native.signature);
      final args = native.named('sign').single.arguments as Map;
      expect(args['data'], [1, 2, 3]);
      expect(args['sensitive'], isTrue);
      expect(args['reason'], 'Confirm');
      expect(args['cancel'], 'Cancel');
    });

    test('native error codes map to typed errors', () async {
      const codes = {
        'cancelled': IrisDeviceKeyError.cancelled,
        'lockout': IrisDeviceKeyError.lockout,
        'no_key': IrisDeviceKeyError.noKey,
        'key_invalidated': IrisDeviceKeyError.keyInvalidated,
        'unsupported': IrisDeviceKeyError.unsupported,
        'biometry_unavailable': IrisDeviceKeyError.biometryUnavailable,
        'interaction_not_allowed': IrisDeviceKeyError.interactionNotAllowed,
        'something_new': IrisDeviceKeyError.failed,
      };
      for (final MapEntry(:key, :value) in codes.entries) {
        native.failNextSign = key;
        await expectLater(
          native.key.sign(
            Uint8List.fromList([1]),
            sensitive: false,
            reason: 'Unlock',
            cancel: 'Cancel',
          ),
          _throws(value),
        );
      }
    });

    test('a missing plugin is unsupported', () async {
      const key = IrisDeviceKey(channel: MethodChannelStub.unhandled);
      await expectLater(
        key.ensureKey(),
        _throws(IrisDeviceKeyError.unsupported),
      );
    });
  });
}

Matcher _throws(IrisDeviceKeyError error) => throwsA(
  isA<IrisDeviceKeyException>().having((e) => e.error, 'error', error),
);

abstract final class MethodChannelStub {
  static const unhandled = MethodChannel('test/iris_device_key_unhandled');
}

final class _FixedRandom implements Random {
  _FixedRandom(this.value);
  final int value;
  @override
  int nextInt(int max) => value;
  @override
  bool nextBool() => false;
  @override
  double nextDouble() => 0;
}
