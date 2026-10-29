import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantHistorySheetBody extends StatefulWidget {
  const AssistantHistorySheetBody({
    required this.chatCubit,
    required this.activeChatId,
    required this.onClose,
    required this.onNewConversation,
    required this.onSelectChat,
    super.key,
  });

  final AssistantChatCubit chatCubit;
  final String? activeChatId;
  final Future<void> Function() onClose;
  final Future<void> Function() onNewConversation;
  final Future<void> Function(AssistantChatRecord chat) onSelectChat;

  @override
  State<AssistantHistorySheetBody> createState() =>
      _AssistantHistorySheetBodyState();
}

class _AssistantHistorySheetBodyState extends State<AssistantHistorySheetBody> {
  static const _pageSize = 20;
  final _searchController = TextEditingController();
  bool _revealScheduled = false;
  late int _visibleCount = _initialVisibleCount(
    widget.chatCubit.state.history.length,
  );

  @override
  void dispose() {
    // The shell search field may still hold the controller this frame.
    final controller = _searchController;
    WidgetsBinding.instance.addPostFrameCallback((_) => controller.dispose());
    super.dispose();
  }

  List<AssistantChatRecord> _matching(List<AssistantChatRecord> history) {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return history;
    return history
        .where((chat) => (chat.title ?? '').toLowerCase().contains(query))
        .toList(growable: false);
  }

  /// Reveals the next page when a row near the end of the loaded page builds.
  void _revealMore(int index, int total) {
    if (_revealScheduled || index < _visibleCount - 4) return;
    if (_visibleCount >= total) return;
    _revealScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _revealScheduled = false;
      if (!mounted) return;
      setState(
        () => _visibleCount = math.min(_visibleCount + _pageSize, total),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<AssistantChatCubit, AssistantChatState>(
      bloc: widget.chatCubit,
      builder: (context, state) {
        final matching = _matching(state.history);
        final visible = math.min(
          _visibleCount == 0
              ? _initialVisibleCount(matching.length)
              : _visibleCount,
          matching.length,
        );
        final searching = _searchController.text.trim().isNotEmpty;
        return AppSheetScaffold(
          onRefresh: widget.chatCubit.refreshHistory,
          title: l10n.assistantHistoryTitle,
          search: AppSheetSearch(
            controller: _searchController,
            hint: l10n.chatSearch,
            onChanged: (_) => setState(() => _visibleCount = _pageSize),
          ),
          actions: [
            AppButton.primary(
              key: const ValueKey('assistant-history-new'),
              leading: const Icon(LucideIcons.messageSquarePlus),
              onPressed: widget.onNewConversation,
              child: Text(l10n.assistantNewConversation),
            ),
          ],
          slivers: [
            if (matching.isEmpty)
              SliverToBoxAdapter(
                child: AppGroupedCard(
                  children: [
                    AppStateMessage.inline(
                      icon: searching
                          ? LucideIcons.searchX
                          : LucideIcons.messagesSquare,
                      title: searching
                          ? l10n.chatNoSearchResults
                          : l10n.assistantHistoryEmpty,
                    ),
                  ],
                ),
              )
            else
              SliverList.builder(
                itemCount: visible,
                itemBuilder: (context, index) {
                  _revealMore(index, matching.length);
                  final chat = matching[index];
                  return AppGroupedSlice(
                    position: AppSlicePosition.of(index, visible),
                    child: _HistoryRow(
                      chat: chat,
                      selected: chat.id == widget.activeChatId,
                      onTap: () => widget.onSelectChat(chat),
                    ),
                  );
                },
              ),
          ],
        );
      },
    );
  }

  static int _initialVisibleCount(int totalCount) {
    return math.min(_pageSize, totalCount);
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({
    required this.chat,
    required this.selected,
    required this.onTap,
  });

  final AssistantChatRecord chat;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final title = chat.title?.trim();
    final createdAt = chat.createdAt;
    final locale = Localizations.localeOf(context).toString();
    return Semantics(
      selected: selected,
      child: AppGroupedRow(
        leading: AppIconTile(
          icon: LucideIcons.messageCircle,
          tone: selected ? AppTone.primary : AppTone.neutral,
        ),
        title: Text(
          title?.isNotEmpty == true
              ? title!
              : context.l10n.assistantUntitledChat,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          createdAt == null
              ? (chat.model ?? '')
              : DateFormat.MMMd(locale).add_jm().format(createdAt.toLocal()),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: selected
            ? Icon(LucideIcons.check, size: 18, color: c.primary)
            : null,
        showChevron: !selected,
        onTap: onTap,
      ),
    );
  }
}
