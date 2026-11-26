import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/mira_offline_reads.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_reply_failure.dart';
import 'package:mobile/features/assistant/widgets/assistant_streaming_indicator.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/internal_diagnostics_copy.dart';

export 'package:mobile/features/assistant/local/assistant_remote_chat_actions.dart'
    show retryAssistantChat;

class AssistantChatFeedback extends StatelessWidget {
  const AssistantChatFeedback({
    required this.state,
    this.onRetry,
    this.onOpenBilling,
    this.onLearnMore,
    this.platform,
    super.key,
  });
  final AssistantChatState state;
  final VoidCallback? onRetry;
  final VoidCallback? onOpenBilling;
  final void Function(AssistantReplyFailure failure)? onLearnMore;
  final TargetPlatform? platform;

  @override
  Widget build(BuildContext context) {
    if (state.error == MiraLegacyOffline.code) {
      return Center(child: Text(context.l10n.assistantNotAvailableOffline));
    }
    if (state.status == AssistantChatStatus.error) {
      final failure = classifyAssistantReplyFailure(
        error: state.error,
        diagnostics: state.diagnostics,
      );
      final targetPlatform = platform ?? defaultTargetPlatform;
      final isDenial = assistantReplyFailureIsDenial(failure);
      final showUpgrade =
          assistantReplyFailureHasBillingAction(failure) &&
          !isAppleStorePlatform(targetPlatform) &&
          onOpenBilling != null;
      final showLearnMore = isDenial && onLearnMore != null;
      final onRetry = assistantReplyFailureRetryable(failure)
          ? this.onRetry
          : null;
      final tokens = AppTokens.of(context);
      final colors = tokens.colorScheme;
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs + 2),
        child: DecoratedBox(
          key: const ValueKey('assistant-reply-failure-card'),
          decoration: BoxDecoration(
            color: colors.destructive.withValues(alpha: 0.06),
            border: Border.all(
              color: colors.destructive.withValues(alpha: 0.3),
            ),
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.md,
              AppSpacing.xs + 2,
              AppSpacing.xs,
              AppSpacing.xs + 2,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Icon(
                      isDenial ? LucideIcons.lock : LucideIcons.circleAlert,
                      color: colors.destructive,
                      size: 18,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        assistantReplyFailureLabel(
                          context.l10n,
                          failure,
                          platform: targetPlatform,
                        ),
                        key: ValueKey(
                          'assistant-reply-failure-${failure.name}',
                        ),
                        style: tokens.typography.uiSm.copyWith(
                          color: colors.foreground,
                        ),
                      ),
                    ),
                    if (state.diagnostics case final diagnostics?)
                      InternalDiagnosticsCopy(diagnostics: diagnostics),
                    if (onRetry != null)
                      AppIconButton(
                        onPressed: onRetry,
                        tooltip: context.l10n.commonRetry,
                        icon: const Icon(LucideIcons.refreshCw),
                      ),
                  ],
                ),
                if (showUpgrade || showLearnMore) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      if (showUpgrade)
                        AppButton.primary(
                          key: const ValueKey(
                            'assistant-reply-failure-upgrade',
                          ),
                          size: AppButtonSize.small,
                          onPressed: onOpenBilling,
                          child: Text(
                            context.l10n.assistantReplyDeniedUpgradeAction,
                          ),
                        ),
                      if (showLearnMore)
                        AppButton.ghost(
                          key: const ValueKey(
                            'assistant-reply-failure-learn-more',
                          ),
                          size: AppButtonSize.small,
                          onPressed: () => onLearnMore!(failure),
                          child: Text(
                            context.l10n.assistantReplyDeniedLearnMoreAction,
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }
    final responding =
        state.messages.isNotEmpty &&
        state.messages.last.role == 'assistant' &&
        state.messages.last.parts.any(
          (part) =>
              part.type == 'dynamic-tool' ||
              (part.text?.trim().isNotEmpty ?? false),
        );
    if (state.isBusy && !responding) {
      return AssistantStreamingIndicator(
        label: context.l10n.assistantThinkingStatus,
      );
    }
    return const SizedBox.shrink();
  }
}
