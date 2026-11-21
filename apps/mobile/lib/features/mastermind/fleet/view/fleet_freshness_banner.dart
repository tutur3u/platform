import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/l10n/l10n.dart';

/// The two stale states, told apart because they have different fixes:
/// the publisher stopped while this phone reads Web fine, or this phone
/// cannot reach Web and shows what it last received.
class FleetFreshnessBanner extends StatelessWidget {
  const FleetFreshnessBanner.paused({
    required DateTime this.publishedAt,
    required DateTime this.now,
    super.key,
  }) : shownAt = null;

  const FleetFreshnessBanner.offline({
    required DateTime this.shownAt,
    super.key,
  }) : publishedAt = null,
       now = null;

  final DateTime? publishedAt;
  final DateTime? now;

  /// When this device last read the data on screen.
  final DateTime? shownAt;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final published = publishedAt;
    final (title, body, icon, variant) = published != null
        ? (
            l10n.mastermindFleetPublisherPausedTitle,
            l10n.mastermindFleetPublisherPausedBody(
              Gmt7.time(published, locale),
              fleetAge(l10n, published, now!),
            ),
            LucideIcons.pause,
            AppAlertVariant.warning,
          )
        : (
            l10n.mastermindFleetPhoneOfflineTitle,
            l10n.mastermindFleetPhoneOfflineBody(Gmt7.time(shownAt!, locale)),
            LucideIcons.wifiOff,
            AppAlertVariant.neutral,
          );
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppAlert(
        variant: variant,
        leading: Icon(icon, size: 18),
        title: Text(title),
        content: Text(body),
      ),
    );
  }
}
