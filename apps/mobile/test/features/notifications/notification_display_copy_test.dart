import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/notification_display_copy.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

void main() {
  AppNotification notification(
    String type, {
    Map<String, dynamic> data = const {},
  }) => AppNotification(
    id: 'notification',
    userId: 'user',
    type: type,
    title: 'Cloudflare Registrar',
    description: '7 Day Domain Expiration Notice',
    data: data,
    createdAt: DateTime(2026),
  );

  test('every module shows its name before the item title', () {
    final l10n = AppLocalizationsEn();
    for (final (type, app) in [
      ('mail_received', 'Mail'),
      ('task_mention', 'Task'),
      ('tasks', 'Task'),
      ('calendar_event', 'Calendar'),
      ('finance_transaction', 'Finance'),
      ('inventory_stock', 'Inventory'),
      ('note_shared', 'Notes'),
      ('notes', 'Notes'),
      ('documents', 'Documents'),
      ('chat_message', 'Chat'),
      ('meet_invite', 'Meet'),
      ('drive_file', 'Drive'),
      ('education_course', 'Education'),
      ('cms_content', 'CMS'),
      ('crm_contact', 'CRM'),
      ('habit_reminder', 'Habits'),
      ('habits', 'Habits'),
      ('timer_finished', 'Timer'),
      ('workspace_invite', 'Workspace'),
      ('security_alert', 'Security'),
      ('settings_app', 'Settings'),
    ]) {
      final copy = notificationDisplayCopy(notification(type), l10n);
      expect(copy.title, '$app: Cloudflare Registrar', reason: type);
      expect(copy.body, '7 Day Domain Expiration Notice', reason: type);
    }
  });

  test('task item name replaces the generic action in the title', () {
    final copy = notificationDisplayCopy(
      notification('task_mention', data: {'task_name': 'Cook dinner'}),
      AppLocalizationsEn(),
    );
    expect(copy.title, 'Task: Cook dinner');
    expect(copy.body, 'Cloudflare Registrar · 7 Day Domain Expiration Notice');
  });
}
