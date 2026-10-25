import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_control_target.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// A compact expandable section without a platform tile or ink animation.
class AppDisclosure extends StatefulWidget {
  const AppDisclosure({
    required this.title,
    required this.children,
    this.leading,
    this.initiallyExpanded = false,
    this.onExpansionChanged,
    this.childrenPadding = EdgeInsets.zero,
    this.expandedCrossAxisAlignment = CrossAxisAlignment.stretch,
    super.key,
  });

  final Widget title;
  final Widget? leading;
  final List<Widget> children;
  final bool initiallyExpanded;
  final ValueChanged<bool>? onExpansionChanged;
  final EdgeInsetsGeometry childrenPadding;
  final CrossAxisAlignment expandedCrossAxisAlignment;

  @override
  State<AppDisclosure> createState() => _AppDisclosureState();
}

class _AppDisclosureState extends State<AppDisclosure> {
  late bool _expanded = widget.initiallyExpanded;

  void _toggle() {
    setState(() => _expanded = !_expanded);
    widget.onExpansionChanged?.call(_expanded);
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          expanded: _expanded,
          child: AppControlTarget(
            onTap: _toggle,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    if (widget.leading != null) ...[
                      widget.leading!,
                      const SizedBox(width: AppSpacing.md),
                    ],
                    Expanded(
                      child: DefaultTextStyle.merge(
                        style: tokens.typography.base.copyWith(
                          color: tokens.colorScheme.foreground,
                        ),
                        child: widget.title,
                      ),
                    ),
                    Icon(
                      _expanded
                          ? LucideIcons.chevronUp
                          : LucideIcons.chevronDown,
                      size: 18,
                      color: tokens.colorScheme.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (_expanded)
          Padding(
            padding: widget.childrenPadding,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: widget.expandedCrossAxisAlignment,
              children: widget.children,
            ),
          ),
      ],
    );
  }
}
