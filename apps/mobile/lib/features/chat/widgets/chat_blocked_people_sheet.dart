import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the people the viewer blocked in [wsId]'s chat, each with Unblock.
Future<void> showChatBlockedPeopleSheet(
  BuildContext context, {
  required String wsId,
  ChatRepository? repository,
}) {
  return showAppSheet<void>(
    context: context,
    useRootNavigator: true,
    size: AppSheetSize.large,
    builder: (_) => ChatBlockedPeopleSheet(wsId: wsId, repository: repository),
  );
}

class ChatBlockedPeopleSheet extends StatefulWidget {
  const ChatBlockedPeopleSheet({
    required this.wsId,
    this.repository,
    super.key,
  });

  final String wsId;

  /// Defaults to a repository this sheet owns and disposes.
  final ChatRepository? repository;

  @override
  State<ChatBlockedPeopleSheet> createState() => _ChatBlockedPeopleSheetState();
}

class _ChatBlockedPeopleSheetState extends State<ChatBlockedPeopleSheet> {
  late final ChatRepository _repository = widget.repository ?? ChatRepository();
  List<ChatBlockedUser>? _blocks;
  bool _failed = false;
  final Set<String> _unblocking = {};

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    try {
      final blocks = await _repository.listBlocks(widget.wsId);
      if (mounted) setState(() => _blocks = blocks);
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _unblock(ChatBlockedUser block, String name) async {
    final l10n = context.l10n;
    setState(() => _unblocking.add(block.userId));
    try {
      await _repository.unblockUser(widget.wsId, block.userId);
      if (!mounted) return;
      setState(() {
        _blocks = [...?_blocks?.where((item) => item.userId != block.userId)];
      });
      showAppToast(
        context,
        message: l10n.chatSafetyUnblocked(name),
        variant: AppAlertVariant.success,
      );
    } on Object {
      if (!mounted) return;
      showAppToast(
        context,
        message: l10n.chatSafetyUnblockFailed,
        variant: AppAlertVariant.destructive,
      );
    } finally {
      if (mounted) setState(() => _unblocking.remove(block.userId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final blocks = _blocks;
    return AppSheetScaffold(
      title: l10n.chatSafetyBlockedPeople,
      icon: LucideIcons.ban,
      onRefresh: _load,
      child: switch ((blocks, _failed)) {
        (_, true) => AppStateMessage(
          icon: AppIcons.error,
          tone: AppTone.destructive,
          title: l10n.commonSomethingWentWrong,
          actionLabel: l10n.chatRetry,
          onAction: () => unawaited(_load()),
        ),
        (null, _) => const AppLoadingIndicator.page(),
        (final rows?, _) when rows.isEmpty => AppStateMessage(
          key: const ValueKey('chat-blocked-empty'),
          icon: LucideIcons.shieldCheck,
          title: l10n.chatSafetyBlockedPeopleEmpty,
        ),
        (final rows?, _) => Column(
          children: [for (final block in rows) _row(context, block)],
        ),
      },
    );
  }

  Widget _row(BuildContext context, ChatBlockedUser block) {
    final l10n = context.l10n;
    final name = block.displayName ?? l10n.chatUnknownSender;
    return AppRichRow(
      key: ValueKey('chat-blocked-${block.userId}'),
      title: name,
      leading: NetworkAvatar(
        avatarUrl: block.avatarUrl,
        radius: AppLayout.rowLeadingSize / 2,
        child: Text(name.characters.first.toUpperCase()),
      ),
      trailing: AppButton.outline(
        key: ValueKey('chat-unblock-${block.userId}'),
        density: AppButtonDensity.compact,
        loading: _unblocking.contains(block.userId),
        onPressed: () => unawaited(_unblock(block, name)),
        child: Text(l10n.chatSafetyUnblock),
      ),
    );
  }
}
