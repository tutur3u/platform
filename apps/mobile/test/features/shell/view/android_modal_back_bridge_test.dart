import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/view/android_modal_back_bridge.dart';

Future<Object?> _askHasModal() async {
  const codec = StandardMethodCodec();
  ByteData? reply;
  await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .handlePlatformMessage(
        AndroidModalBackBridge.channel.name,
        codec.encodeMethodCall(const MethodCall('hasModal')),
        (data) => reply = data,
      );
  return reply == null ? null : codec.decodeEnvelope(reply!);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'MainActivity asks Flutter for an open overlay before exiting',
    () async {
      var open = true;
      bool probe() => open;
      AndroidModalBackBridge.install(probe);
      addTearDown(() => AndroidModalBackBridge.uninstall(probe));

      expect(await _askHasModal(), isTrue);
      open = false;
      expect(await _askHasModal(), isFalse);
    },
  );

  test('a stale uninstall does not remove the current probe', () async {
    bool first() => true;
    bool second() => true;
    AndroidModalBackBridge.install(first);
    AndroidModalBackBridge.install(second);
    AndroidModalBackBridge.uninstall(first);
    expect(await _askHasModal(), isTrue);
    AndroidModalBackBridge.uninstall(second);
    // No handler: the activity falls back to its exit confirmation.
    expect(await _askHasModal(), isNull);
  });
}
