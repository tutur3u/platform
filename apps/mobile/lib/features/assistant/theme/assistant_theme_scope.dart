import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_colors.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';

/// Wrap only Assistant content; it does not alter the app or settings theme.
class AssistantThemeScope extends StatefulWidget {
  const AssistantThemeScope({
    required this.value,
    required this.child,
    super.key,
  });

  final AssistantThemePreferences value;
  final Widget child;

  static AssistantThemePreferences valueOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_AssistantThemeData>()
          ?.value ??
      const AssistantThemePreferences();

  static AssistantThemeColors? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_AssistantThemeData>()?.colors;

  static AssistantThemeColors of(BuildContext context) =>
      maybeOf(context) ?? _defaults[Theme.of(context).brightness]!;

  static final Map<Brightness, AssistantThemeColors> _defaults = {
    for (final brightness in Brightness.values)
      brightness: AssistantThemeColors.resolve(
        const AssistantThemePreferences(),
        brightness,
      ),
  };

  @override
  State<AssistantThemeScope> createState() => _AssistantThemeScopeState();
}

class _AssistantThemeScopeState extends State<AssistantThemeScope> {
  AssistantThemePreferences? _resolvedValue;
  Brightness? _resolvedBrightness;
  late AssistantThemeColors _colors;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_resolvedValue != widget.value ||
        _resolvedBrightness != theme.brightness) {
      _resolvedValue = widget.value;
      _resolvedBrightness = theme.brightness;
      _colors = AssistantThemeColors.resolve(widget.value, theme.brightness);
    }
    return _AssistantThemeData(
      value: widget.value,
      colors: _colors,
      child: Theme(data: _colors.pageTheme(theme), child: widget.child),
    );
  }
}

class _AssistantThemeData extends InheritedWidget {
  const _AssistantThemeData({
    required this.value,
    required this.colors,
    required super.child,
  });

  final AssistantThemePreferences value;
  final AssistantThemeColors colors;

  @override
  bool updateShouldNotify(_AssistantThemeData oldWidget) =>
      colors != oldWidget.colors;
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
