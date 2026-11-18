import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

/// Keeps Back and its divider inside the navigation material, outside the
/// fading route content so its hit target stays fixed during transitions.
class ShellDockContent extends StatelessWidget {
  const ShellDockContent({required this.child, this.leading, super.key});

  final Widget child;
  final Widget? leading;

  /// Leading inset, Back slot and the divider beside it.
  static const double backExtent =
      ShellDockMetrics.padding + ShellDockMetrics.slot;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      if (leading case final back?)
        Padding(
          padding: const EdgeInsetsDirectional.only(
            start: ShellDockMetrics.padding - ShellDockSurface.edge,
          ),
          child: back,
        ),
      if (leading != null)
        SizedBox(
          height: ShellDockMetrics.slot - AppSpacing.md * 2,
          width: ShellDockSurface.edge,
          child: ColoredBox(color: ShellChromeStyle.of(context).border),
        ),
      Expanded(child: child),
    ],
  );
}
