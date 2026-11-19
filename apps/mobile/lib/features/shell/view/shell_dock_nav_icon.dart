import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';

/// A shell destination's glyph and accessible name.
///
/// A [dropdown] destination opens a menu: its glyph carries a chevron and the
/// dock shows it without a visible label, keeping [label] as its name.
class ShellDockNavIcon extends StatelessWidget {
  const ShellDockNavIcon({
    required this.icon,
    required this.label,
    this.image,
    this.dropdown = false,
    super.key,
  });

  final IconData icon;
  final String label;

  /// Replaces the icon (an animated or badged glyph) at the same size.
  final Widget? image;
  final bool dropdown;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    button: true,
    child: ExcludeSemantics(
      child: SizedBox(
        width: dropdown
            ? ShellDockMetrics.dropdownGlyphWidth
            : ShellDockMetrics.glyphSize,
        height: ShellDockMetrics.glyphSize,
        child: dropdown
            ? Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: ShellDockMetrics.dropdownGlyphSize),
                  const Icon(
                    Icons.expand_more,
                    size: ShellDockMetrics.dropdownChevronSize,
                  ),
                ],
              )
            : image ?? Icon(icon, size: ShellDockMetrics.glyphSize),
      ),
    ),
  );
}
