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
    this.heading = false,
    this.expanded = true,
    this.count,
    this.dotColor,
    super.key,
  });

  final IconData icon;
  final String label;

  /// Replaces the icon (an animated or badged glyph) at the same size.
  final Widget? image;
  final bool dropdown;

  /// A collapsible sidebar section heading rather than a destination.
  final bool heading;

  /// Whether a [heading]'s section is open.
  final bool expanded;

  /// A count the sidebar shows after the label.
  final int? count;

  /// A colour dot drawn in place of [icon].
  final Color? dotColor;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    button: true,
    expanded: heading ? expanded : null,
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
            : image ??
                  (dotColor == null
                      ? Icon(icon, size: ShellDockMetrics.glyphSize)
                      : Center(
                          child: SizedBox.square(
                            dimension: 10,
                            child: DecoratedBox(
                              decoration: BoxDecoration(
                                color: dotColor,
                                shape: BoxShape.circle,
                              ),
                            ),
                          ),
                        )),
      ),
    ),
  );
}
