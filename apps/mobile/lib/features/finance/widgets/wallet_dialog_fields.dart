part of 'wallet_dialog.dart';

class _WalletPreviewCard extends StatelessWidget {
  const _WalletPreviewCard({
    required this.name,
    required this.subtitle,
    required this.typeLabel,
    required this.fallbackIcon,
    this.icon,
    this.imageSrc,
  });

  final String name;
  final String subtitle;
  final String typeLabel;
  final String? icon;
  final String? imageSrc;
  final IconData fallbackIcon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      borderColor: accent.withValues(alpha: 0.18),
      child: Row(
        children: [
          WalletVisualAvatar(
            icon: icon,
            imageSrc: imageSrc,
            fallbackIcon: fallbackIcon,
            size: 42,
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          _WalletPill(label: typeLabel, color: accent),
        ],
      ),
    );
  }
}

class _WalletPickerSurface extends StatelessWidget {
  const _WalletPickerSurface({
    required this.label,
    required this.title,
    required this.icon,
    required this.onPressed,
  });

  final String label;
  final String title;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onPressed,
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: theme.colorScheme.mutedForeground),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: theme.typography.xSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.35,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(10),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WalletVisualSurface extends StatelessWidget {
  const _WalletVisualSurface({
    required this.label,
    required this.fallbackIcon,
    required this.onPickImage,
    this.icon,
    this.imageSrc,
    this.onClear,
  });

  final String label;
  final String? icon;
  final String? imageSrc;
  final IconData fallbackIcon;
  final VoidCallback onPickImage;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              WalletVisualAvatar(
                icon: icon,
                imageSrc: imageSrc,
                fallbackIcon: fallbackIcon,
                size: 34,
              ),
              const shad.Gap(12),
              Expanded(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const shad.Gap(10),
          Row(
            children: [
              Expanded(
                child: shad.OutlineButton(
                  onPressed: onPickImage,
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(context.l10n.financeWalletPickImage),
                    ),
                  ),
                ),
              ),
              if (onClear != null) ...[
                const shad.Gap(8),
                shad.GhostButton(
                  onPressed: onClear,
                  child: Icon(Icons.close_rounded, size: 18, color: accent),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _WalletFieldLabel extends StatelessWidget {
  const _WalletFieldLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.mutedForeground,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.35,
      ),
    );
  }
}

class _WalletTextField extends StatefulWidget {
  const _WalletTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.keyboardType,
    this.autofocus = false,
    this.errorText,
    this.privateAmount = false,
  });
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final TextInputType? keyboardType;
  final bool autofocus;
  final String? errorText;
  final bool privateAmount;

  @override
  State<_WalletTextField> createState() => _WalletTextFieldState();
}

class _WalletTextFieldState extends State<_WalletTextField> {
  bool _editing = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Focus(
          onFocusChange: (value) => setState(() => _editing = value),
          child: shad.TextField(
            selectionControls: platformTextSelectionControls(),
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: widget.controller,
            placeholder: Text(widget.placeholder),
            keyboardType: widget.keyboardType,
            autofocus: widget.autofocus,
            onChanged: widget.onChanged,
            obscureText:
                widget.privateAmount &&
                !_editing &&
                !financeAmountsVisible(context),
          ),
        ),
        if (widget.errorText != null) ...[
          const shad.Gap(4),
          _WalletFieldErrorText(message: widget.errorText!),
        ],
      ],
    );
  }
}

class _WalletTextArea extends StatelessWidget {
  const _WalletTextArea({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.errorText,
  });
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextArea(
          selectionControls: platformTextSelectionControls(),
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          placeholder: Text(placeholder),
          initialHeight: 96,
          minHeight: 96,
          maxHeight: 156,
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(4),
          _WalletFieldErrorText(message: errorText!),
        ],
      ],
    );
  }
}

class _WalletFieldErrorText extends StatelessWidget {
  const _WalletFieldErrorText({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.destructive,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}

class _WalletPill extends StatelessWidget {
  const _WalletPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: shad.Theme.of(
          context,
        ).typography.xSmall.copyWith(color: color, fontWeight: FontWeight.w700),
      ),
    );
  }
}
