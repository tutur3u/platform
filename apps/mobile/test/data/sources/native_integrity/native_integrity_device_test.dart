import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_platform.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  const channel = MethodChannel('mobile/native_integrity');
  const storageChannel = MethodChannel(
    'plugins.it_nomads.com/flutter_secure_storage',
  );
  var supported = false;
  var generated = 0;
  final storage = <String, String>{};
  final calls = <MethodCall>[];
  setUp(() {
    storage.clear();
    calls.clear();
    generated = 0;
    supported = false;
    messenger
      ..setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return switch (call.method) {
          'supported' => supported,
          'generateKey' => 'key-${++generated}',
          'attestKey' || 'generateAssertion' => 'proof',
          _ => null,
        };
      })
      ..setMockMethodCallHandler(storageChannel, (call) async {
        final args = call.arguments as Map;
        final key = args['key'] as String;
        switch (call.method) {
          case 'read':
            return storage[key];
          case 'write':
            storage[key] = args['value'] as String;
            return null;
          case 'delete':
            storage.remove(key);
            return null;
        }
        return null;
      });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    messenger
      ..setMockMethodCallHandler(channel, null)
      ..setMockMethodCallHandler(storageChannel, null);
  });
  for (final target in TargetPlatform.values) {
    test(
      '$target selects native only when runtime reports Apple support',
      () async {
        debugDefaultTargetPlatformOverride = target;
        final device = DeviceIntegrityPlatform();
        final apple =
            target == TargetPlatform.iOS || target == TargetPlatform.macOS;
        expect(
          await device.kind(),
          target == TargetPlatform.android
              ? IntegrityPlatformKind.android
              : IntegrityPlatformKind.other,
        );
        supported = true;
        expect(
          await device.kind(),
          apple
              ? IntegrityPlatformKind.apple
              : target == TargetPlatform.android
              ? IntegrityPlatformKind.android
              : IntegrityPlatformKind.other,
        );
      },
    );
  }
  test(
    'uncertain enrollment rotates instead of attesting a key twice',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final device = DeviceIntegrityPlatform();
      expect(await device.appleKey('actor-a'), 'key-1');
      expect(await device.appleKey('actor-a'), 'key-1');
      await device.attest('key-1', 'server-hash');
      expect(await device.appleKey('actor-a'), 'key-2');
      await device.attest('key-2', 'server-hash-2');
      await device.markEnrolled('actor-a', 'key-2');
      expect(await device.appleKey('actor-a'), 'key-2');
      expect(await device.appleKey('actor-b'), 'key-3');
      expect(
        calls
            .where((call) => call.method == 'attestKey')
            .map((call) => call.arguments),
        [
          {'keyId': 'key-1', 'requestHash': 'server-hash'},
          {'keyId': 'key-2', 'requestHash': 'server-hash-2'},
        ],
      );
    },
  );
  test(
    '30 day local key expiry rotates before server 90 day retention',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final device = DeviceIntegrityPlatform();
      await device.appleKey('actor-a');
      await device.markEnrolled('actor-a', 'key-1');
      final expired = DateTime.now().subtract(const Duration(days: 31));
      storage.updateAll(
        (key, value) => key.endsWith('.created')
            ? '${expired.millisecondsSinceEpoch}'
            : value,
      );
      expect(await device.appleKey('actor-a'), 'key-2');
    },
  );
}
