import 'dart:ui';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:mobile/l10n/gen/app_localizations.dart';

enum MastermindPushCategory {
  urgent,
  decision,
  fyi;

  static MastermindPushCategory? parse(Object? value) =>
      values.where((category) => category.name == value).firstOrNull;

  String get eventType => 'mastermind_inbox_$name';

  String label(AppLocalizations l10n) => switch (this) {
    urgent => l10n.settingsMastermindPushUrgent,
    decision => l10n.settingsMastermindPushDecision,
    fyi => l10n.settingsMastermindPushFyi,
  };

  AndroidNotificationChannel get channel {
    final locale = PlatformDispatcher.instance.locale;
    final l10n = lookupAppLocalizations(
      Locale(locale.languageCode == 'vi' ? 'vi' : 'en'),
    );
    return AndroidNotificationChannel(
      eventType,
      label(l10n),
      importance: this == fyi ? Importance.defaultImportance : Importance.high,
    );
  }

  InterruptionLevel get interruptionLevel =>
      this == fyi ? InterruptionLevel.active : InterruptionLevel.timeSensitive;
}
