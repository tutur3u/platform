import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

const _pushNotificationChannelId = 'tuturuuu_notifications';
const _pushNotificationChannelName = 'Notifications';
const _pushNotificationChannelDescription =
    'Push notifications for the Tuturuuu inbox';

String? _payloadFromMessageData(Map<String, dynamic> data) {
  final notificationId = (data['notificationId'] as String?) ?? '';
  final wsId = data['wsId'] as String?;
  final entityId = data['entityId'] as String?;
  final boardId = data['boardId'] as String?;
  final hasNavigationMetadata =
      notificationId.isNotEmpty ||
      (wsId != null && wsId.isNotEmpty) ||
      (entityId != null && entityId.isNotEmpty) ||
      (boardId != null && boardId.isNotEmpty);

  if (!hasNavigationMetadata) {
    return null;
  }

  return jsonEncode({
    'notificationId': notificationId,
    'openTarget': (data['openTarget'] as String?) ?? 'inbox',
    'wsId': wsId,
    'entityId': entityId,
    'boardId': boardId,
  });
}

Future<void> _createNotificationChannelIfNeeded(
  FlutterLocalNotificationsPlugin plugin,
) async {
  if (!Platform.isAndroid) {
    return;
  }

  final androidImplementation = plugin
      .resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin
      >();
  if (androidImplementation == null) {
    return;
  }

  await androidImplementation.createNotificationChannel(
    const AndroidNotificationChannel(
      _pushNotificationChannelId,
      _pushNotificationChannelName,
      description: _pushNotificationChannelDescription,
      importance: Importance.high,
    ),
  );
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (message.notification != null) {
    return;
  }

  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
  } on Object {
    return;
  }

  final title =
      (message.data['title'] as String?) ??
      (message.data['notification_title'] as String?) ??
      'Tuturuuu';
  final body =
      (message.data['description'] as String?) ??
      (message.data['body'] as String?) ??
      (message.data['message'] as String?) ??
      '';

  if (title.isEmpty && body.isEmpty) {
    return;
  }

  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    ),
  );
  await _createNotificationChannelIfNeeded(plugin);

  await plugin.show(
    id: message.messageId.hashCode,
    title: title,
    body: body.isEmpty ? null : body,
    notificationDetails: const NotificationDetails(
      android: AndroidNotificationDetails(
        _pushNotificationChannelId,
        _pushNotificationChannelName,
        channelDescription: _pushNotificationChannelDescription,
        importance: Importance.high,
        priority: Priority.high,
      ),
      iOS: DarwinNotificationDetails(),
    ),
    payload: _payloadFromMessageData(message.data),
  );
}
