import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversation_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// The latest conversations on the new-chat screen, with a link to the full
/// history. Hidden once history has loaded empty, so a first-time user sees
/// only the greeting and quick actions.
class AssistantRecentConversations extends StatelessWidget {
  const AssistantRecentConversations({
    required this.history,
    required this.status,
    required this.onSelect,
    required this.onSeeAll,
    required this.onRetry,
    this.activeChatId,
    this.now,
    this.limit = 3,
    super.key,
  });

  final List<AssistantChatRecord> history;
  final AssistantHistoryStatus status;
  final String? activeChatId;
  final ValueChanged<AssistantChatRecord> onSelect;
  final VoidCallback onSeeAll;
  final Future<void> Function() onRetry;
  final DateTime? now;
  final int limit;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (history.isEmpty && status == AssistantHistoryStatus.ready) {
      return const SizedBox.shrink();
    }
    final offline = status == AssistantHistoryStatus.offline;
    final body = history.isNotEmpty
        ? _rows(context)
        : status == AssistantHistoryStatus.loading
        ? Semantics(
            label: l10n.commonLoading,
            child: const AppSkeletonRows(count: 3),
          )
        : AppStateMessage.inline(
            icon: offline ? LucideIcons.wifiOff : LucideIcons.circleAlert,
            title: offline
                ? l10n.assistantNotAvailableOffline
                : l10n.assistantConversationsLoadFailed,
            tone: offline ? AppTone.neutral : AppTone.destructive,
            actionLabel: l10n.commonRetry,
            onAction: onRetry,
          );
    return Column(
      key: const ValueKey('assistant-recent-conversations'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AppSectionHeader(
          title: l10n.assistantHistoryTitle,
          actionLabel: history.isEmpty ? null : l10n.homeSeeAll,
          actionKey: const ValueKey('assistant-recent-see-all'),
          onAction: history.isEmpty ? null : onSeeAll,
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        ),
        body,
      ],
    );
  }

  Widget _rows(BuildContext context) {
    final clock = now ?? DateTime.now();
    final firstDay = MaterialLocalizations.of(context).firstDayOfWeekIndex;
    return AppGroupedCard(
      children: [
        for (final chat in history.take(limit))
          AssistantConversationRow(
            key: ValueKey('assistant-recent-${chat.id}'),
            chat: chat,
            selected: chat.id == activeChatId,
            period: assistantConversationPeriodOf(
              chat.activityDate,
              now: clock,
              firstDayOfWeekIndex: firstDay,
            ),
            onTap: () => onSelect(chat),
          ),
      ],
    );
  }
}
