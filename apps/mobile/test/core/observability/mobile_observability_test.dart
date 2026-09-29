import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/mobile_observability.dart';

void main() {
  test('native errors retain a safe code without message or details', () {
    final error = PlatformException(
      code: 'webview_create_failed',
      message: 'Private email content',
      details: {'token': 'private'},
    );
    expect(
      mobileCrashSignature(error),
      'PlatformException:webview_create_failed',
    );
  });

  test('unsafe native codes are redacted', () {
    expect(
      mobileCrashSignature(
        PlatformException(code: 'email:private@example.com'),
      ),
      'PlatformException:unknown',
    );
  });
}
