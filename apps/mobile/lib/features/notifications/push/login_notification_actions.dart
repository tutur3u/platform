import 'dart:ui';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

const loginApprovalCategory = 'tuturuuu_login_approval';

String get loginReviewLabel => lookupAppLocalizations(
  Locale(PlatformDispatcher.instance.locale.languageCode == 'vi' ? 'vi' : 'en'),
).mfaReviewSignIn;

List<DarwinNotificationCategory> loginNotificationCategories() => [
  DarwinNotificationCategory(
    loginApprovalCategory,
    actions: [
      DarwinNotificationAction.plain(
        'review_login',
        loginReviewLabel,
        options: {DarwinNotificationActionOption.foreground},
      ),
    ],
  ),
];

List<AndroidNotificationAction> loginNotificationActions() => [
  AndroidNotificationAction(
    'review_login',
    loginReviewLabel,
    showsUserInterface: true,
  ),
];
