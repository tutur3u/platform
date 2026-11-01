import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_key.dart';
import 'package:mobile/features/mastermind/iris/device/iris_enrolment_store.dart';

/// Synthetic device-key fixtures: a well-formed P-256 SPKI (not a real
/// curve point), and a fake `mobile/iris_device_key` channel.
const irisDeviceChannel = MethodChannel('test/iris_device_key');

final Uint8List irisSyntheticSpki = Uint8List.fromList([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, //
  0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03,
  0x42, 0x00, 0x04,
  ...List<int>.generate(64, (i) => i + 1),
]);

String get irisSyntheticFingerprint =>
    sha256.convert(irisSyntheticSpki).toString();

/// A strict DER ECDSA signature for [r] and [s] (each 32 bytes).
Uint8List irisDer(List<int> r, List<int> s) {
  List<int> integer(List<int> v) {
    var i = 0;
    while (i < v.length - 1 && v[i] == 0 && v[i + 1] & 0x80 == 0) {
      i++;
    }
    final trimmed = v.sublist(i);
    return [
      0x02,
      trimmed.length + (trimmed[0] & 0x80 != 0 ? 1 : 0),
      if (trimmed[0] & 0x80 != 0) 0,
      ...trimmed,
    ];
  }

  final body = [...integer(r), ...integer(s)];
  return Uint8List.fromList([0x30, body.length, ...body]);
}

final List<int> irisSigR = List<int>.generate(32, (i) => 0x80 + i);
final List<int> irisSigS = List<int>.generate(32, (i) => i + 1);

/// Answers the device-key channel like the native side, recording calls.
final class FakeIrisKeyChannel {
  FakeIrisKeyChannel() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(irisDeviceChannel, _handle);
  }

  final calls = <MethodCall>[];

  /// The next `sign` fails with this native code, once.
  String? failNextSign;

  /// Every `ensureKey` fails with this native code.
  String? failEnsure;

  bool hasKey = true;
  Map<String, Object?>? ensureReply;
  Uint8List signature = irisDer(irisSigR, irisSigS);

  IrisDeviceKey get key => const IrisDeviceKey(channel: irisDeviceChannel);

  List<MethodCall> named(String method) =>
      calls.where((c) => c.method == method).toList();

  void dispose() => TestDefaultBinaryMessengerBinding
      .instance
      .defaultBinaryMessenger
      .setMockMethodCallHandler(irisDeviceChannel, null);

  Future<Object?> _handle(MethodCall call) async {
    calls.add(call);
    switch (call.method) {
      case 'ensureKey':
        if (failEnsure case final code?) {
          throw PlatformException(code: code);
        }
        hasKey = true;
        return ensureReply ??
            {
              'publicKey': base64.encode(irisSyntheticSpki),
              'fingerprint': irisSyntheticFingerprint,
              'hardware': 'secure_enclave',
            };
      case 'sign':
        if (failNextSign case final code?) {
          failNextSign = null;
          throw PlatformException(code: code);
        }
        if (!hasKey) throw PlatformException(code: 'no_key');
        return signature;
      case 'deleteKey':
        hasKey = false;
        return null;
      case 'lock':
        return null;
    }
    throw MissingPluginException();
  }
}

final class MemoryIrisEnrolmentStore implements IrisEnrolmentStore {
  MemoryIrisEnrolmentStore([this.record]);

  IrisEnrolmentRecord? record;

  @override
  Future<IrisEnrolmentRecord?> read() async => record;

  @override
  Future<void> write(IrisEnrolmentRecord record) async => this.record = record;

  @override
  Future<void> clear() async => record = null;
}
