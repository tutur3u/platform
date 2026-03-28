import 'package:flutter/material.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WorkspaceTierBadge extends StatelessWidget {
  const WorkspaceTierBadge({
    required this.tier,
    super.key,
  });

  final String tier;

  @override
  Widget build(BuildContext context) {
    final normalizedTier = normalizeWorkspaceTier(tier);
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final accentColor = _accentColor(normalizedTier, colorScheme);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: _backgroundColor(normalizedTier, colorScheme, accentColor),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: _borderColor(normalizedTier, colorScheme, accentColor),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(
          normalizedTier,
          style: theme.typography.xSmall.copyWith(
            color: _textColor(normalizedTier, colorScheme, accentColor),
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  Color _accentColor(String tier, ColorScheme colorScheme) {
    switch (tier) {
      case workspaceTierPlus:
        return Colors.blue.shade700;
      case workspaceTierPro:
        return Colors.deepPurple.shade500;
      case workspaceTierEnterprise:
        return Colors.amber.shade800;
      case workspaceTierFree:
      default:
        return colorScheme.onSurfaceVariant;
    }
  }

  Color _backgroundColor(
    String tier,
    ColorScheme colorScheme,
    Color accentColor,
  ) {
    if (tier == workspaceTierFree) {
      return colorScheme.surfaceContainerHighest;
    }

    return accentColor.withValues(alpha: 0.10);
  }

  Color _borderColor(String tier, ColorScheme colorScheme, Color accentColor) {
    if (tier == workspaceTierFree) {
      return colorScheme.outlineVariant.withValues(alpha: 0.30);
    }

    return accentColor.withValues(alpha: 0.35);
  }

  Color _textColor(String tier, ColorScheme colorScheme, Color accentColor) {
    if (tier == workspaceTierFree) {
      return colorScheme.onSurfaceVariant;
    }

    return accentColor;
  }
}
