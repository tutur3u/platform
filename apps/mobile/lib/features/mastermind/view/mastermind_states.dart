import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_dialog.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';
import 'package:mobile/l10n/l10n.dart';

/// Whole-section states, shown before any snapshot is on hand. Copy is a fixed
/// category per state: never a payload, a path or a server message.
class MastermindNotConfigured extends StatelessWidget {
  const MastermindNotConfigured({super.key});

  // No retry: a build without a hub URL cannot become connected by retrying.
  @override
  Widget build(BuildContext context) => AppStateMessage(
    icon: LucideIcons.unplug,
    title: context.l10n.mastermindNotConnectedTitle,
    message: context.l10n.mastermindNotConfiguredMessage,
  );
}

class MastermindUnavailable extends StatelessWidget {
  const MastermindUnavailable({
    required this.kind,
    required this.onRetry,
    super.key,
  });

  final SnapshotUnavailableKind kind;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return switch (kind) {
      SnapshotUnavailableKind.unauthorized => AppStateMessage(
        icon: LucideIcons.logIn,
        title: l10n.mastermindSessionRejectedTitle,
        message: l10n.mastermindSessionRejectedMessage,
        tone: AppTone.warning,
        actionLabel: l10n.mastermindTryAgain,
        onAction: onRetry,
        secondaryActionLabel: l10n.mastermindSignOutAction,
        onSecondaryAction: () => _confirmSignOut(context),
      ),
      SnapshotUnavailableKind.forbidden => AppStateMessage(
        icon: LucideIcons.shieldOff,
        title: l10n.mastermindForbiddenTitle,
        message: l10n.mastermindForbiddenMessage,
      ),
      SnapshotUnavailableKind.noSnapshot => AppStateMessage(
        icon: LucideIcons.inbox,
        title: l10n.mastermindNoSnapshotTitle,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      ),
      SnapshotUnavailableKind.notConfigured => const MastermindNotConfigured(),
      _ => AppStateMessage(
        icon: LucideIcons.cloudOff,
        title: l10n.mastermindUnreachableTitle,
        message: l10n.mastermindUnreachableMessage,
        tone: AppTone.warning,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      ),
    };
  }
}

/// A 401 can be a Worker-side misconfiguration or clock skew rather than a bad
/// session, and signing out drops every saved account on the device, so it is
/// only ever the user's explicit second choice.
Future<void> _confirmSignOut(BuildContext context) async {
  final l10n = context.l10n;
  final auth = context.read<AuthCubit>();
  final confirmed = await showAppConfirmDialog(
    context: context,
    title: l10n.mastermindSignOutConfirmTitle,
    message: l10n.mastermindSignOutConfirmMessage,
    confirmLabel: l10n.mastermindSignOutConfirmAction,
    cancelLabel: l10n.commonCancel,
    destructive: true,
  );
  if (confirmed) await auth.signOut();
}

class MastermindRejected extends StatelessWidget {
  const MastermindRejected({
    required this.reason,
    required this.onRetry,
    super.key,
  });

  final RejectionReason reason;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppStateMessage(
      icon: AppIcons.warning,
      title: l10n.mastermindRejectedTitle,
      message: reason == RejectionReason.unsupportedVersion
          ? l10n.mastermindRejectedMessage
          : l10n.mastermindRejectedOtherMessage,
      tone: AppTone.warning,
      actionLabel: l10n.commonRetry,
      onAction: onRetry,
    );
  }
}

/// Skeleton cards while nothing is loaded yet. Never a spinner-only screen.
class MastermindSkeleton extends StatelessWidget {
  const MastermindSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const AppPageScrollView(
    physics: NeverScrollableScrollPhysics(),
    slivers: [
      SliverToBoxAdapter(
        child: Column(
          children: [
            AppGroupedSection.spaced(children: [AppSkeletonRows(count: 3)]),
            AppGroupedSection.spaced(children: [AppSkeletonRows()]),
            AppGroupedSection.spaced(children: [AppSkeletonRows()]),
          ],
        ),
      ),
    ],
  );
}
