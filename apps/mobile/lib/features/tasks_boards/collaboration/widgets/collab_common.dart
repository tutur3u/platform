import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/features/tasks_boards/collaboration/cubit/collab_failure.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_collaboration_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// What to tell the viewer about [failure]; [fallback] names the action.
String collabFailureMessage(
  BuildContext context,
  CollabFailure failure, {
  required String fallback,
}) {
  final l10n = context.l10n;
  return switch (failure) {
    CollabFailure.offline => l10n.taskCollabOffline,
    CollabFailure.forbidden => l10n.taskCollabForbidden,
    CollabFailure.notFound => l10n.taskCollabNotFound,
    CollabFailure.invalid || CollabFailure.other => fallback,
  };
}

/// Toasts the outcome of a change: [success] when it saved (if given), or
/// why it did not.
void showCollabResult(
  BuildContext context,
  CollabFailure? failure, {
  required String fallback,
  String? success,
}) {
  if (!context.mounted) return;
  if (failure == null) {
    if (success != null) showAppToast(context, message: success);
    return;
  }
  showAppToast(
    context,
    message: collabFailureMessage(context, failure, fallback: fallback),
    variant: AppAlertVariant.destructive,
  );
}

/// A captioned block in the task detail.
class CollabSection extends StatelessWidget {
  const CollabSection({
    required this.title,
    required this.child,
    this.trailing,
    super.key,
  });

  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionCaption(title, trailing: trailing),
        child,
      ],
    );
  }
}

/// A section's loading, failed or empty state, inline.
class CollabStatus extends StatelessWidget {
  const CollabStatus.loading({super.key})
    : failure = null,
      message = null,
      onRetry = null;

  const CollabStatus.failed({
    required CollabFailure this.failure,
    required String this.message,
    required this.onRetry,
    super.key,
  });

  const CollabStatus.empty(String this.message, {super.key})
    : failure = null,
      onRetry = null;

  final CollabFailure? failure;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final message = this.message;
    if (message == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
        child: Center(child: AppLoadingIndicator.inline()),
      );
    }
    final failure = this.failure;
    if (failure == null) {
      return AppCard(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: AppTokens.of(context).typography.small.copyWith(
            color: AppTokens.of(context).colorScheme.mutedForeground,
          ),
        ),
      );
    }
    final tokens = AppTokens.of(context);
    final canRetry = failure != CollabFailure.forbidden && onRetry != null;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        spacing: AppSpacing.sm,
        children: [
          Icon(
            failure == CollabFailure.offline
                ? LucideIcons.wifiOff
                : LucideIcons.circleAlert,
            size: 18,
            color: tokens.colorScheme.destructive,
          ),
          Expanded(
            child: Text(
              collabFailureMessage(context, failure, fallback: message),
              style: tokens.typography.small,
            ),
          ),
          if (canRetry)
            AppIconButton(
              tooltip: context.l10n.commonRetry,
              icon: const Icon(LucideIcons.rotateCcw, size: 16),
              onPressed: onRetry,
            ),
        ],
      ),
    );
  }
}

/// Date and time in the viewer's locale.
String collabTimestamp(BuildContext context, DateTime at) {
  final locale = Localizations.localeOf(context).toLanguageTag();
  return DateFormat.yMMMd(locale).add_jm().format(at.toLocal());
}

/// The name for [person], or for an imported author.
String collabPersonName(
  BuildContext context,
  TaskPerson? person, {
  String? external,
}) => person?.displayName ?? external ?? context.l10n.taskCollabUnknownUser;

/// A person's avatar, else their initial.
class CollabAvatar extends StatelessWidget {
  const CollabAvatar({required this.name, this.avatarUrl, super.key});

  final String name;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final initial = name.trim().isEmpty
        ? '?'
        : name.trim().characters.first.toUpperCase();
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: 28,
        child: NetworkAvatar(
          avatarUrl: avatarUrl,
          radius: 14,
          backgroundColor: tokens.colorScheme.muted,
          child: Text(
            initial,
            style: tokens.typography.xSmall.copyWith(
              color: tokens.colorScheme.mutedForeground,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
    );
  }
}
