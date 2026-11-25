import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_avatar.dart';
import 'package:mobile/features/chat/widgets/chat_format.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

part 'chat_conversation_tile.dart';

class ChatConversationList extends StatefulWidget {
  const ChatConversationList({
    required this.conversations,
    required this.selectedConversationId,
    required this.onSelected,
    required this.onLoadMore,
    required this.hasMore,
    required this.isLoadingMore,
    this.header,
    this.currentUserId,
    this.isLoading = false,
    this.onCreate,
    this.onArchive,
    this.onDelete,
    super.key,
  });

  final Widget? header;

  /// Shows skeleton rows while the first page loads.
  final bool isLoading;

  /// Offered from the empty state.
  final VoidCallback? onCreate;
  final String? currentUserId;
  final Future<void> Function(ChatConversation conversation)? onArchive;
  final Future<void> Function(ChatConversation conversation)? onDelete;
  final List<ChatConversation> conversations;
  final String? selectedConversationId;
  final ValueChanged<String> onSelected;
  final VoidCallback onLoadMore;
  final bool hasMore;
  final bool isLoadingMore;

  @override
  State<ChatConversationList> createState() => _ChatConversationListState();
}

class _ChatConversationListState extends State<ChatConversationList> {
  final _scrollController = ScrollController();
  int? _requestedSnapshot;
  bool _checkScheduled = false;

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleLoad() {
    if (_checkScheduled) return;
    _checkScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkScheduled = false;
      if (!mounted ||
          !widget.hasMore ||
          widget.isLoadingMore ||
          !_scrollController.hasClients) {
        return;
      }
      final position = _scrollController.position;
      if (!position.hasContentDimensions ||
          position.extentAfter > position.viewportDimension * 0.75) {
        return;
      }
      // A failed/empty page must not spin indefinitely. Retain a manual retry;
      // resume automatic loading once the scoped list has actually advanced.
      final snapshot = Object.hashAll(
        widget.conversations.map((item) => Object.hash(item.wsId, item.id)),
      );
      if (_requestedSnapshot == snapshot) return;
      _requestedSnapshot = snapshot;
      widget.onLoadMore();
    });
  }

  @override
  Widget build(BuildContext context) {
    _scheduleLoad();
    return NotificationListener<ScrollMetricsNotification>(
      onNotification: (notification) {
        if (notification.depth == 0) _scheduleLoad();
        return false;
      },
      child: NotificationListener<ScrollNotification>(
        onNotification: (notification) {
          if (notification.depth == 0) _scheduleLoad();
          return false;
        },
        child: _buildList(context),
      ),
    );
  }

  Widget _buildList(BuildContext context) {
    final sections = chatConversationSections(context, widget.conversations);
    return CustomScrollView(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      slivers: [
        if (widget.header != null) SliverToBoxAdapter(child: widget.header),
        if (widget.isLoading && widget.conversations.isEmpty)
          const SliverPadding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            sliver: SliverToBoxAdapter(child: AppSkeletonRows(count: 7)),
          )
        else if (widget.conversations.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _ChatEmptyList(onCreate: widget.onCreate),
          )
        else
          for (final section in sections) ...[
            if (sections.length > 1 || section.pinned)
              SliverToBoxAdapter(
                child: _SectionLabel(
                  label: section.label,
                  icon: section.pinned ? LucideIcons.pin : null,
                ),
              ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              sliver: SliverList.builder(
                itemCount: section.conversations.length,
                itemBuilder: (context, index) {
                  final conversation = section.conversations[index];
                  return PendingSyncFrame(
                    workspaceId: conversation.wsId,
                    feature: 'chat',
                    entityId: conversation.id,
                    child: _ConversationTile(
                      conversation: conversation,
                      currentUserId: widget.currentUserId,
                      selected:
                          conversation.id == widget.selectedConversationId,
                      onTap: () => widget.onSelected(conversation.id),
                      onArchive: widget.onArchive,
                      onDelete: widget.onDelete,
                    ),
                  );
                },
              ),
            ),
          ],
        if (widget.hasMore)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md),
              child: Center(
                child: AppButton.secondary(
                  onPressed: widget.isLoadingMore ? null : widget.onLoadMore,
                  child: widget.isLoadingMore
                      ? const AppLoadingIndicator.inline()
                      : Text(context.l10n.chatLoadMore),
                ),
              ),
            ),
          ),
        SliverPadding(
          padding: EdgeInsets.only(
            bottom:
                MediaQuery.paddingOf(context).bottom + AppLayout.scrollEndGap,
          ),
        ),
      ],
    );
  }
}

/// A titled run of conversations in the list.
class ChatConversationSection {
  const ChatConversationSection({
    required this.label,
    required this.conversations,
    this.pinned = false,
  });

  final String label;
  final List<ChatConversation> conversations;
  final bool pinned;
}

/// Pinned conversations first, then one section per conversation type in
/// web's order (AI agents, channels, direct messages, groups). Each section
/// keeps the list's recency order.
List<ChatConversationSection> chatConversationSections(
  BuildContext context,
  List<ChatConversation> conversations,
) {
  final l10n = context.l10n;
  final pinned = conversations.where((item) => item.isPinned).toList();
  final rest = conversations.where((item) => !item.isPinned);
  return [
    if (pinned.isNotEmpty)
      ChatConversationSection(
        label: l10n.chatPinned,
        conversations: pinned,
        pinned: true,
      ),
    for (final (type, label) in [
      (ChatConversationType.ai, l10n.chatAiAgents),
      (ChatConversationType.channel, l10n.chatChannels),
      (ChatConversationType.direct, l10n.chatDirectMessages),
      (ChatConversationType.group, l10n.chatGroups),
    ])
      if (rest.where((item) => item.type == type).toList() case final items
          when items.isNotEmpty)
        ChatConversationSection(label: label, conversations: items),
  ];
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    return Semantics(
      header: true,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.lg,
          AppSpacing.xl,
          AppSpacing.xs,
        ),
        child: Row(
          children: [
            if (icon case final icon?) ...[
              Icon(icon, size: 12, color: colors.mutedForeground),
              const SizedBox(width: AppSpacing.xs),
            ],
            Text(
              label.toUpperCase(),
              style: tokens.typography.label.copyWith(
                color: colors.mutedForeground,
                letterSpacing: 0.6,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
