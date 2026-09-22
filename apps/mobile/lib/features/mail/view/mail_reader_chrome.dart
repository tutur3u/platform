part of 'mail_reader.dart';

extension _MailReaderChrome on _MailReaderState {
  Widget _readerChrome(String subject, Map<String, String> actions) {
    final l10n = context.l10n;
    return Stack(
      children: [
        ShellTitleOverride(
          ownerId: 'mail-reader',
          locations: const {Routes.mail},
          title: subject,
          showLeadingBrand: false,
        ),
        ShellMiniNav(
          ownerId: 'mail-reader',
          locations: const {Routes.mail},
          items: [
            ShellMiniNavItemSpec(
              id: 'back',
              icon: Icons.chevron_left,
              label: l10n.navBack,
              onPressed: () => Navigator.of(context).pop(),
            ),
            ShellMiniNavItemSpec(
              id: 'inbox',
              icon: Icons.inbox_outlined,
              label: l10n.mailInbox,
              selected: true,
              onPressed: () => Navigator.of(context).pop(),
            ),
            ShellMiniNavItemSpec(
              id: 'appearance',
              icon: Icons.contrast_rounded,
              label: l10n.mailMessageAppearance,
              dropdown: true,
              onPressed: _chooseAppearance,
            ),
            ShellMiniNavItemSpec(
              id: 'images',
              icon: _showImages
                  ? Icons.image_outlined
                  : Icons.image_not_supported_outlined,
              label: l10n.mailLoadImages,
              callbackToken: _showImages,
              onPressed: () => _updateState(() => _showImages = !_showImages),
            ),
          ],
        ),
        ShellChromeActions(
          ownerId: 'mail-reader',
          locations: const {Routes.mail},
          actions: [
            ShellActionSpec(
              id: 'mail-star',
              icon: _starred ? Icons.star : Icons.star_border,
              tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
              highlighted: _starred,
              enabled: !_busy,
              callbackToken: _starred,
              onPressed: () => _action(_starred ? 'unstar' : 'star'),
            ),
            ShellActionSpec(
              id: 'mail-message-actions',
              icon: Icons.more_horiz,
              tooltip: MaterialLocalizations.of(context).showMenuTooltip,
              enabled: !_busy,
              onPressed: () => _chooseAction(actions),
            ),
            if (widget.canSend && _messages.isNotEmpty)
              ShellActionSpec(
                id: 'mail-reply',
                icon: Icons.reply,
                tooltip: l10n.mailReply,
                inDock: true,
                enabled: !_busy,
                onPressed: () => _reply(_messages.last),
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _chooseAppearance() async {
    final l10n = context.l10n;
    final modes = {
      MailMessageAppearance.original: l10n.mailAppearanceOriginal,
      MailMessageAppearance.light: l10n.settingsThemeLight,
      MailMessageAppearance.dark: l10n.settingsThemeDark,
    };
    final value = await showAdaptiveSheet<MailMessageAppearance>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => AppDialogScaffold(
        title: l10n.mailMessageAppearance,
        child: Material(
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final mode in modes.entries)
                ListTile(
                  dense: true,
                  title: Text(mode.value),
                  selected: MailAppearancePreference.instance.value == mode.key,
                  onTap: () => Navigator.of(sheetContext).pop(mode.key),
                ),
            ],
          ),
        ),
      ),
    );
    if (value != null) await MailAppearancePreference.instance.select(value);
  }

  Future<void> _chooseAction(Map<String, String> actions) async {
    final value = await showAdaptiveSheet<String>(
      context: context,
      useRootNavigator: true,
      builder: (sheetContext) => AppDialogScaffold(
        title: MaterialLocalizations.of(context).showMenuTooltip,
        child: Material(
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.canSend && _messages.isNotEmpty) ...[
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.reply_all),
                  title: Text(context.l10n.mailReplyAll),
                  onTap: () => Navigator.of(sheetContext).pop('reply_all'),
                ),
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.forward),
                  title: Text(context.l10n.mailForward),
                  onTap: () => Navigator.of(sheetContext).pop('forward'),
                ),
              ],
              for (final action in actions.entries)
                ListTile(
                  dense: true,
                  title: Text(action.value),
                  onTap: () => Navigator.of(sheetContext).pop(action.key),
                ),
            ],
          ),
        ),
      ),
    );
    if (!mounted || value == null) return;
    if (value == 'reply_all' || value == 'forward') {
      if (_messages.isNotEmpty) {
        await _reply(
          _messages.last,
          all: value == 'reply_all',
          forward: value == 'forward',
        );
      }
      return;
    }
    await _action(value, close: true);
  }
}
