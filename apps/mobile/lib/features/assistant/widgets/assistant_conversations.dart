import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_conversation_row.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantConversations extends StatefulWidget {
  const AssistantConversations({
    required this.history,
    required this.status,
    required this.activeChatId,
    required this.onRefresh,
    required this.onSelect,
    required this.canArchive,
    required this.onArchive,
    required this.onNewConversation,
    this.now,
    super.key,
  });

  final List<AssistantChatRecord> history;
  final AssistantHistoryStatus status;
  final String? activeChatId;
  final Future<void> Function() onRefresh;
  final ValueChanged<AssistantChatRecord> onSelect;
  final bool Function(AssistantChatRecord) canArchive;
  final Future<bool> Function(AssistantChatRecord) onArchive;
  final Future<void> Function(BuildContext) onNewConversation;
  final DateTime? now;

  @override
  State<AssistantConversations> createState() => _AssistantConversationsState();
}

class _AssistantConversationsState extends State<AssistantConversations> {
  final _archived = <String>{};
  final _confirming = <String>{};
  String _query = '';

  Future<bool> _confirmArchive(AssistantChatRecord chat) async {
    if (!_confirming.add(chat.id)) return false;
    try {
      final l10n = context.l10n;
      final confirmed = await showAppConfirmDialog(
        context: context,
        title: l10n.assistantArchiveConversationTitle,
        message: l10n.assistantArchiveConversationDescription,
        confirmLabel: l10n.assistantArchiveConversation,
        cancelLabel: l10n.commonCancel,
        destructive: true,
      );
      if (!mounted || !confirmed) return false;
      return await widget.onArchive(chat);
    } finally {
      _confirming.remove(chat.id);
    }
  }

  void _hideArchived(String id) {
    if (!mounted) return;
    setState(() => _archived.add(id));
  }

  void _newConversation() {
    if (mounted) unawaited(widget.onNewConversation(context));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final today = DateUtils.dateOnly((widget.now ?? DateTime.now()).toLocal());
    final firstDay = MaterialLocalizations.of(context).firstDayOfWeekIndex;
    final daysSinceStart = (today.weekday % 7 - firstDay) % 7;
    final week = DateTime(today.year, today.month, today.day - daysSinceStart);
    final groups = {
      for (final period in AssistantConversationPeriod.values)
        period: <AssistantChatRecord>[],
    };
    for (final chat in widget.history) {
      final date = chat.activityDate?.toLocal();
      if (_archived.contains(chat.id) || !_matches(chat)) continue;
      final group = DateUtils.isSameDay(date, today)
          ? AssistantConversationPeriod.today
          : date != null && !date.isBefore(week) && date.isBefore(today)
          ? AssistantConversationPeriod.thisWeek
          : AssistantConversationPeriod.earlier;
      groups[group]!.add(chat);
    }
    final labels = {
      AssistantConversationPeriod.today: l10n.calendarToday,
      AssistantConversationPeriod.thisWeek: l10n.assistantConversationsThisWeek,
      AssistantConversationPeriod.earlier: l10n.assistantConversationsEarlier,
    };
    final page = AppScaffold(
      backgroundColor: tokens.colorScheme.background,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final insets = AppPageInsets.of(
            context,
            width: constraints.maxWidth,
            endGap: 12,
          );
          return RefreshIndicator(
            onRefresh: widget.onRefresh,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                SliverPadding(
                  padding: insets.copyWith(bottom: 12),
                  sliver: SliverToBoxAdapter(
                    child: AppTextField(
                      key: const ValueKey('assistant-conversations-search'),
                      placeholder: l10n.chatSearch,
                      leading: const Icon(LucideIcons.search, size: 20),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      style: tokens.typography.body,
                      textInputAction: TextInputAction.search,
                      onChanged: (value) =>
                          setState(() => _query = value.trim().toLowerCase()),
                    ),
                  ),
                ),
                if (widget.status != AssistantHistoryStatus.ready)
                  SliverPadding(
                    padding: insets.copyWith(top: 0, bottom: 12),
                    sliver: SliverToBoxAdapter(child: _historyStatus()),
                  ),
                for (final MapEntry(key: period, value: chats)
                    in groups.entries)
                  if (chats.isNotEmpty)
                    SliverPadding(
                      padding: EdgeInsets.only(
                        left: insets.left,
                        right: insets.right,
                        bottom: 16,
                      ),
                      sliver: SliverMainAxisGroup(
                        slivers: [
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Semantics(
                                header: true,
                                child: Text(
                                  labels[period]!,
                                  style: tokens.typography.heading,
                                ),
                              ),
                            ),
                          ),
                          SliverList.builder(
                            itemCount: chats.length,
                            itemBuilder: (context, i) => _buildRow(
                              chats[i],
                              AppSlicePosition.of(i, chats.length),
                              period,
                            ),
                          ),
                        ],
                      ),
                    ),
                if (widget.status == AssistantHistoryStatus.ready &&
                    groups.values.every((group) => group.isEmpty))
                  SliverToBoxAdapter(
                    child: AppStateMessage.inline(
                      icon: _query.isEmpty
                          ? LucideIcons.messagesSquare
                          : LucideIcons.searchX,
                      title: _query.isEmpty
                          ? l10n.assistantHistoryEmpty
                          : l10n.chatNoSearchResults,
                    ),
                  ),
                SliverToBoxAdapter(child: SizedBox(height: insets.bottom)),
              ],
            ),
          );
        },
      ),
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        page,
        ShellChromeActions(
          ownerId: 'assistant-conversations',
          locations: const {Routes.assistantConversations},
          actions: [
            ShellActionSpec(
              id: 'assistant-history-new',
              icon: LucideIcons.messageSquarePlus,
              tooltip: l10n.assistantNewConversation,
              filled: true,
              onPressed: widget.status == AssistantHistoryStatus.loading
                  ? null
                  : _newConversation,
            ),
          ],
        ),
      ],
    );
  }

  Widget _historyStatus() {
    final l10n = context.l10n;
    return switch (widget.status) {
      AssistantHistoryStatus.ready => const SizedBox.shrink(),
      AssistantHistoryStatus.loading when widget.history.isNotEmpty =>
        const SizedBox.shrink(),
      AssistantHistoryStatus.loading => Semantics(
        label: l10n.commonLoading,
        child: const AppSkeletonRows(count: 3),
      ),
      AssistantHistoryStatus.failed ||
      AssistantHistoryStatus.offline => AppStateMessage.inline(
        icon: widget.status == AssistantHistoryStatus.offline
            ? LucideIcons.wifiOff
            : LucideIcons.circleAlert,
        title: widget.status == AssistantHistoryStatus.offline
            ? l10n.assistantNotAvailableOffline
            : l10n.assistantConversationsLoadFailed,
        actionLabel: l10n.commonRetry,
        onAction: widget.onRefresh,
      ),
    };
  }

  bool _matches(AssistantChatRecord chat) =>
      _query.isEmpty ||
      (chat.title ?? '').toLowerCase().contains(_query) ||
      (chat.preview ?? '').toLowerCase().contains(_query);

  Widget _buildRow(
    AssistantChatRecord chat,
    AppSlicePosition position,
    AssistantConversationPeriod period,
  ) {
    final selected = chat.id == widget.activeChatId;
    final canArchive =
        widget.status != AssistantHistoryStatus.offline &&
        !selected &&
        widget.canArchive(chat);
    final label = context.l10n.assistantArchiveConversation;
    final colors = AppTokens.of(context).colorScheme;
    final row = AssistantConversationRow(
      chat: chat,
      selected: selected,
      period: period,
      onTap: () => widget.onSelect(chat),
    );
    return AppGroupedSlice(
      key: ValueKey(chat.id),
      position: position,
      child: canArchive
          ? Semantics(
              customSemanticsActions: {
                CustomSemanticsAction(label: label): () async {
                  if (await _confirmArchive(chat)) _hideArchived(chat.id);
                },
              },
              child: Dismissible(
                key: ValueKey('assistant-archive-${chat.id}'),
                direction: DismissDirection.endToStart,
                background: ColoredBox(
                  color: colors.destructive,
                  child: Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Icon(
                        LucideIcons.archive,
                        color: colors.destructiveForeground,
                      ),
                    ),
                  ),
                ),
                confirmDismiss: (_) => _confirmArchive(chat),
                onDismissed: (_) => _hideArchived(chat.id),
                child: row,
              ),
            )
          : row,
    );
  }
}
