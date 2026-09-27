import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
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
  static const _loadMoreThreshold = 240.0;

  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  late int _visibleCount = _initialVisibleCount(
    widget.chatCubit.state.history.length,
  );

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
        child: BlocBuilder<AssistantChatCubit, AssistantChatState>(
          bloc: widget.chatCubit,
          builder: (context, state) {
            final query = _searchController.text.trim().toLowerCase();
            final matchingHistory = query.isEmpty
                ? state.history
                : state.history
                      .where(
                        (chat) =>
                            (chat.title ?? '').toLowerCase().contains(query),
                      )
                      .toList(growable: false);
            final visibleCount = math.min(
              _visibleCount == 0
                  ? _initialVisibleCount(matchingHistory.length)
                  : _visibleCount,
              matchingHistory.length,
            );
            final visibleHistory = matchingHistory
                .take(visibleCount)
                .toList(growable: false);
            final colors = Theme.of(context).colorScheme;

            final availableHeight =
                MediaQuery.sizeOf(context).height -
                MediaQuery.viewInsetsOf(context).bottom -
                MediaQuery.paddingOf(context).top -
                32;

            return SizedBox(
              height: math
                  .min(context.isCompact ? 540.0 : 620.0, availableHeight)
                  .clamp(240.0, 620.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          context.l10n.assistantHistoryTitle,
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      IconButton(
                        tooltip: context.l10n.assistantNewConversation,
                        onPressed: widget.onNewConversation,
                        icon: const Icon(Icons.add_comment_outlined),
                      ),
                      IconButton(
                        onPressed: widget.onClose,
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _searchController,
                    onChanged: (_) => setState(() => _visibleCount = _pageSize),
                    decoration: InputDecoration(
                      hintText: context.l10n.chatSearch,
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: query.isEmpty
                          ? null
                          : IconButton(
                              tooltip: context.l10n.financeActivityClearSearch,
                              onPressed: () {
                                _searchController.clear();
                                setState(() => _visibleCount = _pageSize);
                              },
                              icon: const Icon(Icons.close_rounded),
                            ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (matchingHistory.isEmpty)
                    Expanded(
                      child: Center(
                        child: Text(
                          query.isEmpty
                              ? context.l10n.assistantHistoryEmpty
                              : context.l10n.chatNoSearchResults,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: colors.onSurfaceVariant),
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        controller: _scrollController,
                        itemCount: visibleHistory.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 4),
                        itemBuilder: (context, index) {
                          final chat = visibleHistory[index];
                          final selected = chat.id == widget.activeChatId;
                          return Material(
                            color: selected
                                ? colors.primaryContainer.withValues(alpha: .55)
                                : colors.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(14),
                            child: ListTile(
                              dense: true,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(14),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 3,
                              ),
                              leading: Icon(
                                Icons.chat_bubble_outline_rounded,
                                color: selected
                                    ? colors.primary
                                    : colors.onSurfaceVariant,
                              ),
                              title: Text(
                                chat.title?.trim().isNotEmpty == true
                                    ? chat.title!
                                    : context.l10n.assistantUntitledChat,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(
                                chat.createdAt == null
                                    ? (chat.model ?? '')
                                    : DateFormat.MMMd().add_jm().format(
                                        chat.createdAt!.toLocal(),
                                      ),
                                maxLines: 1,
                              ),
                              trailing: selected
                                  ? Icon(
                                      Icons.check_rounded,
                                      color: colors.primary,
                                    )
                                  : const Icon(Icons.chevron_right_rounded),
                              onTap: () => widget.onSelectChat(chat),
                            ),
                          );
                        },
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  void _handleScroll() {
    if (!_scrollController.hasClients) {
      return;
    }
    if (_scrollController.position.extentAfter > _loadMoreThreshold) {
      return;
    }

    final query = _searchController.text.trim().toLowerCase();
    final total = query.isEmpty
        ? widget.chatCubit.state.history.length
        : widget.chatCubit.state.history
              .where((chat) => (chat.title ?? '').toLowerCase().contains(query))
              .length;
    if (_visibleCount >= total) {
      return;
    }

    setState(() {
      _visibleCount = math.min(_visibleCount + _pageSize, total);
    });
  }

  static int _initialVisibleCount(int totalCount) {
    return math.min(_pageSize, totalCount);
  }
}
