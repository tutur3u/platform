part of 'chat_sheets.dart';

/// Report and Block (or Unblock) for the other person in a direct chat.
class _PeerSafetyActions extends StatefulWidget {
  const _PeerSafetyActions({required this.peer, required this.blocked});

  final ChatUserProfile peer;
  final bool blocked;

  @override
  State<_PeerSafetyActions> createState() => _PeerSafetyActionsState();
}

class _PeerSafetyActionsState extends State<_PeerSafetyActions> {
  bool _unblocking = false;

  Future<void> _unblock(ChatCubit cubit) async {
    final l10n = context.l10n;
    setState(() => _unblocking = true);
    try {
      await cubit.unblockUser(widget.peer.id);
      if (mounted) {
        showAppToast(
          context,
          message: l10n.chatSafetyUnblocked(widget.peer.displayName),
          variant: AppAlertVariant.success,
        );
      }
    } on Object {
      if (mounted) {
        showAppToast(
          context,
          message: l10n.chatSafetyUnblockFailed,
          variant: AppAlertVariant.destructive,
        );
      }
    } finally {
      if (mounted) setState(() => _unblocking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final cubit = context.read<ChatCubit>();
    final name = widget.peer.displayName;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ActionButton(
          key: const ValueKey('chat-details-report'),
          label: l10n.chatSafetyReportUser(name),
          destructive: false,
          onPressed: () => unawaited(
            showChatReportSheet(
              context,
              cubit: cubit,
              subject: widget.peer,
              offerBlock: !widget.blocked,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (widget.blocked)
          _ActionButton(
            key: const ValueKey('chat-details-unblock'),
            label: l10n.chatSafetyUnblock,
            destructive: false,
            onPressed: _unblocking ? null : () => unawaited(_unblock(cubit)),
          )
        else
          _ActionButton(
            key: const ValueKey('chat-details-block'),
            label: l10n.chatSafetyBlockUser(name),
            destructive: true,
            onPressed: () => unawaited(
              showChatBlockSheet(context, cubit: cubit, user: widget.peer),
            ),
          ),
      ],
    );
  }
}
