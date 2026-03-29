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
            final visibleCount = math.min(
              _visibleCount == 0
                  ? _initialVisibleCount(state.history.length)
                  : _visibleCount,
              state.history.length,
            );
            final visibleHistory = state.history
                .take(visibleCount)
                .toList(growable: false);

            return SizedBox(
              height: context.isCompact ? 420 : 480,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          context.l10n.assistantHistoryTitle,
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      IconButton(
                        onPressed: widget.onClose,
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: widget.onNewConversation,
                      icon: const Icon(Icons.add_comment_rounded, size: 18),
                      label: Text(context.l10n.assistantNewConversation),
                    ),
                  ),
                  const SizedBox(height: 14),
                  if (state.history.isEmpty)
                    Text(
                      context.l10n.assistantHistoryEmpty,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        controller: _scrollController,
                        itemCount: visibleHistory.length,
                        separatorBuilder: (_, _) => const Divider(height: 18),
                        itemBuilder: (context, index) {
                          final chat = visibleHistory[index];
                          final formatter = DateFormat.MMMd().add_jm();
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(child: Text('${index + 1}')),
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
                                  : formatter.format(chat.createdAt!.toLocal()),
                            ),
                            trailing: chat.id == widget.activeChatId
                                ? const Icon(Icons.check_circle_rounded)
                                : null,
                            onTap: () => widget.onSelectChat(chat),
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

    final total = widget.chatCubit.state.history.length;
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
