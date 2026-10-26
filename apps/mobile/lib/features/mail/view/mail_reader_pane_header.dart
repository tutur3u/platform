part of 'mail_reader.dart';

/// In a split layout the shell navbar and dock stay with the inbox, so the
/// detail pane carries the message title and message actions itself.
extension _MailReaderPaneHeader on _MailReaderState {
  Widget _paneHeader(String title, Map<String, String> actions) {
    final l10n = context.l10n;
    final theme = Theme.of(context);
    final primary = _primaryAction;
    final idle = !_busy && _detail != null;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xxl,
        AppSpacing.sm,
        AppSpacing.sm,
        0,
      ),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(
                title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleLarge,
              ),
            ),
          ),
          IconButton(
            tooltip: primary.label(context),
            onPressed: idle ? _runPrimaryAction : null,
            icon: Icon(primary.icon),
          ),
          IconButton(
            tooltip: _starred ? l10n.mailUnstar : l10n.mailStar,
            onPressed: idle
                ? () => _action(_starred ? 'unstar' : 'star')
                : null,
            icon: Icon(_starred ? Icons.star : Icons.star_border),
          ),
          IconButton(
            tooltip: l10n.mailLoadImages,
            isSelected: _showImages,
            onPressed: _toggleReaderImages,
            icon: const Icon(Icons.image_not_supported_outlined),
            selectedIcon: const Icon(Icons.image_outlined),
          ),
          IconButton(
            tooltip: l10n.mailMessageAppearance,
            onPressed: _chooseAppearance,
            icon: const Icon(Icons.contrast_rounded),
          ),
          IconButton(
            tooltip: MaterialLocalizations.of(context).showMenuTooltip,
            onPressed: idle ? () => _chooseAction(actions) : null,
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
