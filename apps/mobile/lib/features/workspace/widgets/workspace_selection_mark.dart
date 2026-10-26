import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Filled check in a workspace's brand colour that marks the selected
/// workspace. The fill reaches 3:1 against every surface and the check 4.5:1
/// against the fill (see `brand_accents_contrast_test.dart`).
class WorkspaceSelectionMark extends StatelessWidget {
  const WorkspaceSelectionMark({
    required this.accent,
    this.size = 24,
    super.key,
  });

  final BrandAccent accent;
  final double size;

  @override
  Widget build(BuildContext context) {
    final brightness = AppTokens.of(context).brightness;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: accent.fill(brightness),
          shape: BoxShape.circle,
        ),
        child: Icon(
          AppIcons.check,
          size: size * 0.6,
          color: accent.onFill(brightness),
        ),
      ),
    );
  }
}
