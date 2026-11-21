import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/view/fleet_access_labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// A view that has nothing to show because its read failed. Fixed category
/// copy; a refused grant offers no retry, because only an access check can
/// bring the view back.
class FleetAccessFailureMessage extends StatelessWidget {
  const FleetAccessFailureMessage({
    required this.failure,
    required this.onRetry,
    super.key,
  });

  final FleetAccessFailure failure;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final retry = failure != FleetAccessFailure.forbidden;
    return AppStateMessage.inline(
      icon: failure.icon,
      title: failure.label(l10n),
      tone: AppTone.warning,
      actionLabel: retry ? l10n.commonRetry : null,
      onAction: retry ? onRetry : null,
    );
  }
}

/// A failure over content that is still shown, such as a failed refresh or
/// a refused submission.
class FleetAccessNotice extends StatelessWidget {
  const FleetAccessNotice({required this.failure, super.key});

  final FleetAccessFailure failure;

  @override
  Widget build(BuildContext context) => AppAlert(
    variant: AppAlertVariant.warning,
    leading: Icon(failure.icon, size: 16),
    title: Text(failure.label(context.l10n)),
  );
}
