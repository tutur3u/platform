part of 'mail_reader.dart';

/// In a split layout the shell navbar and dock stay with the inbox, so the
/// detail pane carries a compact toolbar: the default action, Reply, More
/// and Close. The subject is the content's own heading.
extension _MailReaderPaneHeader on _MailReaderState {
  Widget _wideReaderActions({required double bottomClearance}) => LayoutBuilder(
    builder: (context, constraints) {
      final scale = MediaQuery.textScalerOf(context).scale(14) / 14;
      return _readerActionBar(
        bottomClearance: bottomClearance,
        labelled: constraints.maxWidth >= mailBarLabelMinWidth * scale,
      );
    },
  );

  /// Reply, Reply all and Forward lead as on web Mail, labelled from
  /// [mailBarLabelMinWidth] and icon-only below it; the default action,
  /// More and Close follow as icons.
  Widget _readerActionBar({
    required double bottomClearance,
    required bool labelled,
    bool repliesOnly = false,
  }) {
    final l10n = context.l10n;
    final ready = !_busy && _detail != null;
    final quick = repliesOnly ? null : _quick();
    final canReply = ready && _messages.isNotEmpty;
    final replies = _dockPlan().replies;
    return MailActionBar(
      label: l10n.mailMessageActions,
      bottomClearance: bottomClearance,
      children: [
        for (final kind in replies)
          MailBarButton(
            key: ValueKey('mail-bar-${kind.name}'),
            icon: switch (kind) {
              MailDockReply.reply => Icons.reply_outlined,
              MailDockReply.replyAll => Icons.reply_all_outlined,
              MailDockReply.forward => Icons.forward_outlined,
            },
            label: switch (kind) {
              MailDockReply.reply => l10n.mailReply,
              MailDockReply.replyAll => l10n.mailReplyAll,
              MailDockReply.forward => l10n.mailForward,
            },
            showLabel: labelled || (repliesOnly && kind == MailDockReply.reply),
            emphasized: kind == MailDockReply.reply,
            onPressed: canReply
                ? switch (kind) {
                    MailDockReply.reply => _replyLast,
                    MailDockReply.replyAll => _replyAllLast,
                    MailDockReply.forward => _forwardLast,
                  }
                : null,
          ),
        if (quick != null)
          MailBarButton(
            key: const ValueKey('mail-reader-quick'),
            icon: quick.icon,
            label: quick.label,
            showLabel: false,
            onPressed: ready && !_readPending ? quick.run : null,
          ),
        if (!repliesOnly)
          MailBarButton(
            icon: Icons.more_horiz,
            label: l10n.commonMoreOptions,
            showLabel: false,
            onPressed: ready
                ? () => _chooseAction(includeReplies: false)
                : null,
          ),
        if (!repliesOnly)
          IconButton(
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: _close,
            icon: const Icon(Icons.close),
          ),
      ],
    );
  }

  Widget _paneHeader() {
    final l10n = context.l10n;
    final idle = !_busy && _detail != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.xs,
        AppSpacing.sm,
        0,
      ),
      child: Row(
        children: [
          ?_quickButton(),
          if (widget.canSend)
            IconButton(
              tooltip: l10n.mailReply,
              onPressed: idle && _messages.isNotEmpty ? _replyLast : null,
              icon: const Icon(Icons.reply_outlined),
            ),
          const Spacer(),
          IconButton(
            tooltip: MaterialLocalizations.of(context).showMenuTooltip,
            onPressed: idle ? _chooseAction : null,
            icon: const Icon(Icons.more_horiz),
          ),
          IconButton(
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
            onPressed: _close,
            icon: const Icon(Icons.close),
          ),
        ],
      ),
    );
  }
}

bool handleMailReaderCommand(
  State<MailReader>? reader,
  MailKeyboardCommand command,
) {
  if (reader is! _MailReaderState ||
      reader._busy ||
      reader._childRouteOpen ||
      reader._accessRevoked ||
      reader._closing) {
    return false;
  }
  final canReply =
      reader.widget.canSend &&
      reader._messages.isNotEmpty &&
      !reader._quarantined;
  final run = switch (command) {
    MailKeyboardCommand.compose when reader.widget.canSend =>
      () => reader._reply(null),
    MailKeyboardCommand.reply when canReply => reader._replyLast,
    MailKeyboardCommand.replyAll when canReply => reader._replyAllLast,
    MailKeyboardCommand.forward when canReply => reader._forwardLast,
    MailKeyboardCommand.archive when !reader._quarantined =>
      () => reader._action('archive', close: true),
    MailKeyboardCommand.trash
        when !reader._quarantined && reader.widget.sourceFolder != 'trash' =>
      reader._trashMessage,
    MailKeyboardCommand.unread when !reader._readPending =>
      () => reader._action('mark_unread'),
    MailKeyboardCommand.star => reader._toggleStar,
    _ => null,
  };
  if (run == null ||
      (reader._detail == null && command != MailKeyboardCommand.compose)) {
    return false;
  }
  unawaited(run());
  return true;
}
