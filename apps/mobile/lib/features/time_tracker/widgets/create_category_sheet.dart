import 'dart:async';

import 'package:flutter/material.dart' hide TextField;
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// The color tokens used for category color selection.
const _kColorTokens = [
  _ColorToken('RED'),
  _ColorToken('ORANGE'),
  _ColorToken('YELLOW'),
  _ColorToken('LIME'),
  _ColorToken('GREEN'),
  _ColorToken('TEAL'),
  _ColorToken('CYAN'),
  _ColorToken('SKY'),
  _ColorToken('BLUE'),
  _ColorToken('INDIGO'),
  _ColorToken('PURPLE'),
  _ColorToken('PINK'),
  _ColorToken('ROSE'),
  _ColorToken('GRAY'),
];

class _ColorToken {
  const _ColorToken(this.value);
  final String value;
}

Color _tokenColor(BuildContext context, _ColorToken token) {
  final c = DynamicColors.of(context);
  return switch (token.value) {
    'RED' => c.red,
    'ORANGE' => c.orange,
    'YELLOW' => c.yellow,
    'LIME' => c.lime,
    'GREEN' => c.green,
    'TEAL' => c.teal,
    'CYAN' => c.cyan,
    'SKY' => c.sky,
    'BLUE' => c.blue,
    'INDIGO' => c.indigo,
    'PURPLE' => c.purple,
    'PINK' => c.pink,
    'ROSE' => c.rose,
    'GRAY' => c.gray,
    _ => c.gray,
  };
}

/// A bottom-sheet form for creating a new time-tracking category.
///
/// Calls [onSave] with (name, color?, description?) when the user confirms.
class CreateCategorySheet extends StatefulWidget {
  const CreateCategorySheet({required this.onSave, super.key});

  final Future<void> Function({
    required String name,
    String? color,
    String? description,
  })
  onSave;

  @override
  State<CreateCategorySheet> createState() => _CreateCategorySheetState();
}

class _CreateCategorySheetState extends State<CreateCategorySheet> {
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  String? _selectedColor;
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty || _saving) {
      return;
    }

    final l10n = context.l10n;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    if (!toastContext.mounted) {
      return;
    }

    setState(() => _saving = true);

    try {
      await widget.onSave(
        name: name,
        color: _selectedColor,
        description: _descriptionController.text.trim().isEmpty
            ? null
            : _descriptionController.text.trim(),
      );

      if (!mounted || !toastContext.mounted) {
        return;
      }

      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert(
          title: Text(l10n.timerCreateCategory),
          content: Text(l10n.timerCategoryCreateSuccess),
        ),
      );

      Navigator.of(context).pop();
    } on ApiException catch (error) {
      if (!mounted || !toastContext.mounted) {
        return;
      }

      final safeMessage = error.message.trim().isEmpty
          ? l10n.commonSomethingWentWrong
          : error.message;

      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(l10n.commonSomethingWentWrong),
          content: Text(safeMessage),
        ),
      );

      setState(() => _saving = false);
    } on Exception catch (error) {
      if (!mounted || !toastContext.mounted) {
        return;
      }

      shad.showToast(
        context: toastContext,
        builder: (context, overlay) => shad.Alert.destructive(
          title: Text(l10n.commonSomethingWentWrong),
          content: Text(error.toString()),
        ),
      );

      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final keyboardBottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return PopScope(
      canPop: !_saving,
      child: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.background,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 16 + keyboardBottomInset),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Drag handle
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: colorScheme.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const shad.Gap(16),
                // Title row
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        l10n.timerCreateCategory,
                        style: theme.typography.h4,
                      ),
                    ),
                    shad.IconButton.ghost(
                      icon: const Icon(shad.LucideIcons.x, size: 18),
                      onPressed: _saving
                          ? null
                          : () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
                const shad.Gap(20),

                // Name field
                Text(
                  l10n.timerCategoryName,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const shad.Gap(6),
                shad.TextField(
                  controller: _nameController,
                  hintText: l10n.timerCategoryName,
                  autofocus: true,
                  onSubmitted: (_) => unawaited(_save()),
                ),
                const shad.Gap(16),

                // Color picker
                Text(
                  l10n.timerCategoryColor,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const shad.Gap(10),
                _ColorGrid(
                  tokens: _kColorTokens,
                  selected: _selectedColor,
                  onSelect: (token) => setState(
                    () =>
                        _selectedColor = _selectedColor == token ? null : token,
                  ),
                ),
                const shad.Gap(16),

                // Description field
                Text(
                  l10n.timerCategoryDescription,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const shad.Gap(6),
                shad.TextField(
                  controller: _descriptionController,
                  hintText: l10n.timerCategoryDescription,
                  maxLines: 3,
                  minLines: 2,
                ),
                const shad.Gap(20),

                // Save button
                shad.PrimaryButton(
                  onPressed: _saving ? null : () => unawaited(_save()),
                  child: _saving
                      ? Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: shad.CircularProgressIndicator(),
                            ),
                            const shad.Gap(8),
                            Text(l10n.timerCategoryCreateInProgress),
                          ],
                        )
                      : Text(l10n.timerSave),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ColorGrid extends StatelessWidget {
  const _ColorGrid({
    required this.tokens,
    required this.selected,
    required this.onSelect,
  });

  final List<_ColorToken> tokens;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    const dotSize = 32.0;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: tokens.map((token) {
        final color = _tokenColor(context, token);
        final isSelected = selected == token.value;
        return Tooltip(
          message: _colorLabel(l10n, token),
          child: GestureDetector(
            onTap: () => onSelect(token.value),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: dotSize,
              height: dotSize,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: color,
                border: isSelected
                    ? Border.all(
                        color: shad.Theme.of(
                          context,
                        ).colorScheme.foreground.withValues(alpha: 0.9),
                        width: 2.5,
                      )
                    : Border.all(color: color.withValues(alpha: 0.3)),
                boxShadow: isSelected
                    ? [
                        BoxShadow(
                          color: color.withValues(alpha: 0.45),
                          blurRadius: 6,
                          spreadRadius: 1,
                        ),
                      ]
                    : null,
              ),
              child: isSelected
                  ? const Icon(
                      shad.LucideIcons.check,
                      size: 16,
                      color: Colors.white,
                    )
                  : null,
            ),
          ),
        );
      }).toList(),
    );
  }

  String _colorLabel(AppLocalizations l10n, _ColorToken token) {
    return switch (token.value) {
      'RED' => l10n.taskBoardDetailColorRed,
      'ORANGE' => l10n.taskBoardDetailColorOrange,
      'YELLOW' => l10n.taskBoardDetailColorYellow,
      'LIME' => l10n.timerCategoryColorLime,
      'GREEN' => l10n.taskBoardDetailColorGreen,
      'TEAL' => l10n.timerCategoryColorTeal,
      'CYAN' => l10n.taskBoardDetailColorCyan,
      'SKY' => l10n.timerCategoryColorSky,
      'BLUE' => l10n.taskBoardDetailColorBlue,
      'INDIGO' => l10n.taskBoardDetailColorIndigo,
      'PURPLE' => l10n.taskBoardDetailColorPurple,
      'PINK' => l10n.taskBoardDetailColorPink,
      'ROSE' => l10n.timerCategoryColorRose,
      'GRAY' => l10n.taskBoardDetailColorGray,
      _ => token.value,
    };
  }
}
