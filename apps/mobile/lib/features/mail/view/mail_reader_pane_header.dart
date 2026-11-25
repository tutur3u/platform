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
        showReply: constraints.maxWidth >= 340 * scale,
      );
    },
  );

  Widget _readerActionBar({
    required double bottomClearance,
    required bool showReply,
  }) {
    final l10n = context.l10n;
    final ready = !_busy && _detail != null;
    final quick = _quick();
    return MailActionBar(
      label: l10n.mailMessageActions,
      bottomClearance: bottomClearance,
      children: [
        if (quick != null)
          MailBarButton(
            key: const ValueKey('mail-reader-quick'),
            icon: quick.icon,
            label: quick.label,
            onPressed: ready && !_readPending ? quick.run : null,
          ),
        if (widget.canSend && showReply)
          MailBarButton(
            icon: Icons.reply_outlined,
            label: l10n.mailReply,
            onPressed: ready && _messages.isNotEmpty ? _replyLast : null,
          ),
        MailBarButton(
          icon: Icons.more_horiz,
          label: l10n.commonMoreOptions,
          onPressed: ready
              ? () => _chooseAction(includeReply: !showReply)
              : null,
        ),
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
  final Future<void> Function()? run = switch (command) {
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
