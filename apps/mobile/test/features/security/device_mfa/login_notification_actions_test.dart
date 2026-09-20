import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notifications/push/login_notification_actions.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'login notification actions always open verification in the foreground',
    () {
      final category = loginNotificationCategories().single;
      expect(category.identifier, loginApprovalCategory);
      expect(category.actions.single.identifier, 'review_login');
      expect(
        category.actions.single.options,
        contains(DarwinNotificationActionOption.foreground),
      );
      final android = loginNotificationActions().single;
      expect(android.id, 'review_login');
      expect(android.showsUserInterface, isTrue);
    },
  );
}
