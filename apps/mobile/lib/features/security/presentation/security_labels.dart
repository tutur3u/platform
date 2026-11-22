import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/security/presentation/session_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Localized label for a parsed session client: "Chrome on macOS",
/// "Tuturuuu app on iOS", "T3 Code on macOS" or "Unknown device".
///
/// [localPlatform] names this device's platform for its own Tuturuuu app
/// session, whose user agent carries no platform.
String sessionClientLabel(
  AppLocalizations l10n,
  SessionClientInfo client, {
  SessionPlatform? localPlatform,
}) {
  final name = switch (client.kind) {
    SessionClientKind.tuturuuuApp => l10n.securitySessionTuturuuuApp,
    SessionClientKind.desktopApp =>
      client.name ?? l10n.securitySessionDesktopApp,
    SessionClientKind.browser || SessionClientKind.tool => client.name,
    SessionClientKind.unknown => null,
  };
  final platform =
      (client.platform == SessionPlatform.unknown && localPlatform != null
              ? localPlatform
              : client.platform)
          .displayName;
  if (name == null) {
    return platform == null
        ? l10n.securityUnknownDevice
        : l10n.securitySessionClientOn(l10n.securityUnknownDevice, platform);
  }
  return platform == null ? name : l10n.securitySessionClientOn(name, platform);
}

/// This app's own platform, for labelling the current Tuturuuu app session.
SessionPlatform currentAppPlatform([TargetPlatform? platform]) =>
    switch (platform ?? defaultTargetPlatform) {
      TargetPlatform.iOS => SessionPlatform.iOS,
      TargetPlatform.android => SessionPlatform.android,
      TargetPlatform.macOS => SessionPlatform.macOS,
      TargetPlatform.windows => SessionPlatform.windows,
      TargetPlatform.linux => SessionPlatform.linux,
      TargetPlatform.fuchsia => SessionPlatform.unknown,
    };

IconData securityDeviceIcon(SecurityDeviceKind kind) => switch (kind) {
  SecurityDeviceKind.phone => LucideIcons.smartphone,
  SecurityDeviceKind.tablet => LucideIcons.tablet,
  SecurityDeviceKind.desktop => LucideIcons.laptop,
  SecurityDeviceKind.unknown => LucideIcons.keyRound,
};

/// Icon for a session row: desktop apps get the app window glyph, unknown
/// clients a neutral monitor.
IconData sessionClientIcon(SessionClientInfo client) => switch (client.kind) {
  SessionClientKind.desktopApp => LucideIcons.appWindow,
  SessionClientKind.tool => LucideIcons.terminal,
  _ when client.device == SecurityDeviceKind.unknown => LucideIcons.monitor,
  _ when client.device == SecurityDeviceKind.desktop => LucideIcons.monitor,
  _ => securityDeviceIcon(client.device),
};

String _localeTag(BuildContext context) =>
    Localizations.localeOf(context).toLanguageTag();

/// "2 hours ago", "Yesterday", "Active now", or a date after five weeks.
String sessionLastActiveLabel(
  BuildContext context,
  DateTime at, {
  required DateTime now,
}) {
  final l10n = context.l10n;
  final bucket = lastActiveBucket(at, now);
  return switch (bucket.unit) {
    LastActiveUnit.now => l10n.securitySessionActiveNow,
    LastActiveUnit.minutes => l10n.securitySessionMinutesAgo(bucket.count),
    LastActiveUnit.hours => l10n.securitySessionHoursAgo(bucket.count),
    LastActiveUnit.yesterday => l10n.securitySessionYesterday,
    LastActiveUnit.days => l10n.securitySessionDaysAgo(bucket.count),
    LastActiveUnit.weeks => l10n.securitySessionWeeksAgo(bucket.count),
    LastActiveUnit.date => securityDate(context, at),
  };
}

/// Locale date such as "20 Sep 2026" (en-GB style follows the locale).
String securityDate(BuildContext context, DateTime at) =>
    DateFormat.yMMMd(_localeTag(context)).format(at.toLocal());

/// Locale date and time such as "Sat, 22 Nov 2026, 09:14".
String securityDateTime(BuildContext context, DateTime at) {
  final tag = _localeTag(context);
  final local = at.toLocal();
  final use24h = MediaQuery.maybeAlwaysUse24HourFormatOf(context) ?? false;
  final time = use24h ? DateFormat.Hm(tag) : DateFormat.jm(tag);
  return '${DateFormat.yMMMEd(tag).format(local)}, ${time.format(local)}';
}

/// Display name for a Supabase identity provider id.
String identityProviderName(String provider) => switch (provider) {
  'google' => 'Google',
  'apple' => 'Apple',
  'github' => 'GitHub',
  'azure' => 'Microsoft',
  'gitlab' => 'GitLab',
  'discord' => 'Discord',
  'email' => 'Email',
  _ when provider.isEmpty => provider,
  _ => '${provider[0].toUpperCase()}${provider.substring(1)}',
};

/// Formats a session identifier for screen readers and confirmation dialogs,
/// appending visible context (and an ordinal when tied) for duplicate labels.
String formatSessionIdentifier(
  AppLocalizations l10n,
  String label,
  SessionDisambiguation? disambiguation,
) {
  if (disambiguation == null || !disambiguation.duplicated) return label;
  final context = disambiguation.context;
  final ordinal = disambiguation.ordinal;
  if (context != null && ordinal != null) {
    return l10n.securitySessionWithContextOrdinal(label, context, ordinal);
  }
  if (context != null) return l10n.securitySessionWithContext(label, context);
  if (ordinal != null) return l10n.securitySessionOrdinal(label, ordinal);
  return label;
}
