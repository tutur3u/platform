import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_image_preference.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('external images default on and persist user choice', () async {
    SharedPreferences.setMockInitialValues({});
    final initial = MailImagePreference();
    expect(initial.value, isTrue);
    await initial.load();
    expect(initial.value, isTrue);

    await initial.select(enabled: false);
    final restored = MailImagePreference();
    await restored.load();
    expect(restored.value, isFalse);
  });
}
