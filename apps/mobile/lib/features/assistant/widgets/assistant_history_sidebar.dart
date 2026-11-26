import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversation_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// Body width from which Mira keeps its history beside the thread: an
/// 800dp or wider portrait tablet beside the 80dp navigation rail, such as
/// an 820dp or 834dp iPad, and wider windows. Narrower bodies, such as a
/// 768dp portrait tablet's 688dp, open the routed Conversations page
/// instead.
const double assistantHistorySidebarMinWidth = 720;

/// Width of the history sidebar for a body of [bodyWidth].
double assistantHistorySidebarWidth(double bodyWidth) =>
    bodyWidth >= 1100 ? 320 : 280;

/// Conversation history beside the Mira thread on wide screens, grouped like
/// the Conversations page. Search and archive stay on that page, which
/// [onOpenAll] opens.
class AssistantHistorySidebar extends StatelessWidget {
  const AssistantHistorySidebar({
    required this.history,
    required this.status,
    required this.onSelect,
    required this.onOpenAll,
    required this.onRetry,
    required this.topInset,
    this.activeChatId,
    this.now,
    super.key,
  });

  final List<AssistantChatRecord> history;
  final AssistantHistoryStatus status;
  final String? activeChatId;
  final ValueChanged<AssistantChatRecord> onSelect;
  final VoidCallback onOpenAll;
  final Future<void> Function() onRetry;

  /// Clearance for the floating shell header above the list.
  final double topInset;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final clock = now ?? DateTime.now();
    final firstDay = MaterialLocalizations.of(context).firstDayOfWeekIndex;
    final groups = {
      for (final period in AssistantConversationPeriod.values)
        period: <AssistantChatRecord>[],
    };
    for (final chat in history) {
      final period = assistantConversationPeriodOf(
        chat.activityDate,
        now: clock,
        firstDayOfWeekIndex: firstDay,
      );
      groups[period]!.add(chat);
    }
    final labels = {
      AssistantConversationPeriod.today: l10n.calendarToday,
      AssistantConversationPeriod.thisWeek: l10n.assistantConversationsThisWeek,
      AssistantConversationPeriod.earlier: l10n.assistantConversationsEarlier,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        border: BorderDirectional(
          end: BorderSide(color: colors.border.withValues(alpha: 0.6)),
        ),
      ),
      child: ListView(
        key: const ValueKey('assistant-history-sidebar'),
        primary: false,
        padding: EdgeInsets.fromLTRB(
          AppSpacing.sm,
          topInset + AppSpacing.xs,
          AppSpacing.sm,
          MediaQuery.paddingOf(context).bottom + AppSpacing.lg,
        ),
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.sm,
              bottom: AppSpacing.xs,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Text(
                      l10n.assistantHistoryTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.heading.copyWith(
                        color: colors.foreground,
                      ),
                    ),
                  ),
                ),
                AppIconButton(
                  key: const ValueKey('assistant-history-sidebar-all'),
                  tooltip: l10n.chatSearch,
                  icon: const Icon(LucideIcons.search),
                  onPressed: onOpenAll,
                ),
              ],
            ),
          ),
          if (history.isEmpty) _status(l10n),
          for (final MapEntry(key: period, value: chats) in groups.entries)
            if (chats.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.sm,
                  AppSpacing.md,
                  AppSpacing.sm,
                  AppSpacing.xs,
                ),
                child: Text(
                  labels[period]!,
                  style: tokens.typography.label.copyWith(
                    color: colors.mutedForeground,
                  ),
                ),
              ),
              for (final chat in chats)
                ClipRRect(
                  key: ValueKey('assistant-history-sidebar-${chat.id}'),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                  child: AssistantConversationRow(
                    chat: chat,
                    selected: chat.id == activeChatId,
                    period: period,
                    onTap: () => onSelect(chat),
                  ),
                ),
            ],
        ],
      ),
    );
  }

  Widget _status(AppLocalizations l10n) => switch (status) {
    AssistantHistoryStatus.loading => Semantics(
      label: l10n.commonLoading,
      child: const AppSkeletonRows(count: 4),
    ),
    AssistantHistoryStatus.ready => AppStateMessage.inline(
      icon: LucideIcons.messagesSquare,
      title: l10n.assistantHistoryEmpty,
    ),
    AssistantHistoryStatus.failed ||
    AssistantHistoryStatus.offline => AppStateMessage.inline(
      icon: status == AssistantHistoryStatus.offline
          ? LucideIcons.wifiOff
          : LucideIcons.circleAlert,
      title: status == AssistantHistoryStatus.offline
          ? l10n.assistantNotAvailableOffline
          : l10n.assistantConversationsLoadFailed,
      tone: status == AssistantHistoryStatus.offline
          ? AppTone.neutral
          : AppTone.destructive,
      actionLabel: l10n.commonRetry,
      onAction: onRetry,
    ),
  };
}
