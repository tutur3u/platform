import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// One control in an [AppFormatToolbar].
@immutable
class AppFormatAction {
  const AppFormatAction({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.selected = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool selected;
}

/// Horizontal formatting controls for a full-screen editor.
///
/// Sits above the keyboard. Each action is an [AppIconButton], so the target
/// stays at the shared control size and the tooltip is the accessible name.
class AppFormatToolbar extends StatelessWidget {
  const AppFormatToolbar({required this.actions, super.key});

  final List<AppFormatAction> actions;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.card.withValues(alpha: solid ? 1 : 0.96),
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xxs,
        ),
        child: Row(
          children: [
            for (final action in actions)
              AppIconButton(
                icon: Icon(action.icon),
                tooltip: action.tooltip,
                onPressed: action.onPressed,
                variant: action.selected
                    ? AppButtonVariant.secondary
                    : AppButtonVariant.ghost,
              ),
          ],
        ),
      ),
    );
  }
}
