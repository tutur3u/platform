import 'package:flutter/widgets.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_colors.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';

/// Wrap only Assistant content; it does not alter the app or settings theme.
class AssistantThemeScope extends InheritedWidget {
  const AssistantThemeScope({
    required this.value,
    required super.child,
    super.key,
  });

  final AssistantThemePreferences value;

  static AssistantThemePreferences valueOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<AssistantThemeScope>()
          ?.value ??
      const AssistantThemePreferences();

  static AssistantThemeColors of(BuildContext context) =>
      AssistantThemeColors.resolve(
        valueOf(context),
        AppTokens.of(context).brightness,
      );

  @override
  bool updateShouldNotify(AssistantThemeScope oldWidget) =>
      value != oldWidget.value;
}

class AssistantThemeBackdrop extends StatelessWidget {
  const AssistantThemeBackdrop({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: AssistantThemeScope.of(context).backgroundDecoration,
    child: child,
  );
}
