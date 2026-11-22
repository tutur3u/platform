part of 'mail_reader.dart';

/// In a split layout the shell navbar and dock stay with the inbox, so the
/// detail pane carries a compact toolbar: the default action, Reply, More
/// and Close. The subject is the content's own heading.
extension _MailReaderPaneHeader on _MailReaderState {
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
