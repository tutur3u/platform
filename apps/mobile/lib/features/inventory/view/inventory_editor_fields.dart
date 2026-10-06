part of 'inventory_product_editor_page.dart';

class _InventoryTextInputCard extends StatelessWidget {
  const _InventoryTextInputCard({
    required this.label,
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.fieldKey,
    this.errorText,
    this.keyboardType,
  });

  final String label;
  final Key? fieldKey;
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final String? errorText;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return _InventorySurface(
      label,
      icon: Icons.edit_note_rounded,
      errorText: errorText,
      child: shad.TextField(
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: platformTextContextMenuBuilder(),
        key: fieldKey,
        controller: controller,
        keyboardType: keyboardType,
        placeholder: Text(placeholder),
        onChanged: onChanged,
      ),
    );
  }
}

class _InventoryTextAreaCard extends StatelessWidget {
  const _InventoryTextAreaCard({
    required this.label,
    required this.controller,
    required this.placeholder,
    required this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return _InventorySurface(
      label,
      icon: Icons.notes_rounded,
      child: shad.TextArea(
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: platformTextContextMenuBuilder(),
        controller: controller,
        placeholder: Text(placeholder),
        initialHeight: 96,
        minHeight: 96,
        maxHeight: 156,
        onChanged: onChanged,
      ),
    );
  }
}

class _InventorySurface extends StatelessWidget {
  const _InventorySurface(
    this.label, {
    required this.child,
    this.icon = Icons.tune_rounded,
    this.errorText,
    this.onTap,
  });

  final String label;
  final Widget child;
  final IconData icon;
  final String? errorText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final panelChild = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(
              icon,
              size: 16,
              color: errorText == null
                  ? palette.accent
                  : theme.colorScheme.destructive,
            ),
            const shad.Gap(8),
            Expanded(
              child: Text(
                label,
                style: theme.typography.xSmall.copyWith(
                  color: errorText == null
                      ? theme.colorScheme.mutedForeground
                      : theme.colorScheme.destructive,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.35,
                ),
              ),
            ),
          ],
        ),
        const shad.Gap(10),
        child,
      ],
    );

    final container = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: errorText == null
            ? theme.colorScheme.card
            : theme.colorScheme.destructive.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: errorText == null
              ? theme.colorScheme.border.withValues(alpha: 0.72)
              : theme.colorScheme.destructive.withValues(alpha: 0.42),
        ),
      ),
      child: panelChild,
    );

    final wrapped = onTap == null
        ? container
        : Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: onTap,
              child: container,
            ),
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        wrapped,
        if (errorText != null) ...[
          const shad.Gap(6),
          _InventoryFieldErrorText(message: errorText!),
        ],
      ],
    );
  }
}

class _InventoryFieldErrorText extends StatelessWidget {
  const _InventoryFieldErrorText({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.destructive,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}
