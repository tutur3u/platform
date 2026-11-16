import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// A settings row's description that opens its full explanation.
///
/// The text keeps up to two lines with a small info glyph right after it, so
/// the affordance reads as part of the description rather than a separate
/// control at the row's edge. The whole description is one button for
/// assistive technology, labelled with [label].
class SettingsTileDetailsLink extends StatelessWidget {
  const SettingsTileDetailsLink({
    required this.label,
    required this.text,
    required this.style,
    required this.onTap,
    super.key,
  });

  final String label;
  final String text;
  final TextStyle style;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final glyphSize = (style.fontSize ?? 13) + 1;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        key: const ValueKey('settings-tile-details-link'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          // Extends the target vertically without moving the text.
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(text: text),
                const TextSpan(text: ' '),
                WidgetSpan(
                  alignment: PlaceholderAlignment.middle,
                  child: Icon(
                    LucideIcons.info,
                    size: glyphSize,
                    color: style.color,
                  ),
                ),
              ],
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: style,
          ),
        ),
      ),
    );
  }
}
