import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/timezone.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('flutter_timezone');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test(
    'revalidates a changed native device zone while the process stays alive',
    () async {
      var zone = 'America/New_York';
      messenger.setMockMethodCallHandler(channel, (_) async => zone);
      expect(await getCurrentTimezoneIdentifier(), 'America/New_York');
      zone = 'Europe/Paris';
      expect(await getCurrentTimezoneIdentifier(), 'Europe/Paris');
    },
  );

  test(
    'deduplicates concurrent native reads without retaining a settled result',
    () async {
      final response = Completer<String>();
      var calls = 0;
      messenger.setMockMethodCallHandler(channel, (_) {
        calls++;
        return response.future;
      });
      final first = getCurrentTimezoneIdentifier();
      final second = getCurrentTimezoneIdentifier();
      expect(identical(first, second), isTrue);
      response.complete('America/New_York');
      expect(await first, 'America/New_York');
      expect(await second, 'America/New_York');
      expect(calls, 1);
      messenger.setMockMethodCallHandler(channel, (_) async {
        calls++;
        return 'Europe/Paris';
      });
      expect(await getCurrentTimezoneIdentifier(), 'Europe/Paris');
      expect(calls, 2);
    },
  );

  group('isLikelyIanaTimezoneIdentifier', () {
    test('accepts IANA timezone identifiers', () {
      expect(isLikelyIanaTimezoneIdentifier('Asia/Ho_Chi_Minh'), isTrue);
      expect(isLikelyIanaTimezoneIdentifier('America/New_York'), isTrue);
    });

    test('rejects offset and abbreviation timezone labels', () {
      expect(isLikelyIanaTimezoneIdentifier('+07'), isFalse);
      expect(isLikelyIanaTimezoneIdentifier('GMT+07:00'), isFalse);
      expect(isLikelyIanaTimezoneIdentifier('ICT'), isFalse);
    });
  });
}
