import 'package:flutter/material.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WorkspaceTierBadge extends StatelessWidget {
  const WorkspaceTierBadge({
    required this.tier,
    this.accentColorOverride,
    super.key,
  });

  final String tier;
  final Color? accentColorOverride;

  @override
  Widget build(BuildContext context) {
    final normalizedTier = normalizeWorkspaceTier(tier);
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);
    final hasAccentOverride = accentColorOverride != null;
    final accentColor =
        accentColorOverride ?? _accentColor(normalizedTier, colorScheme);
    final icon = _iconForTier(normalizedTier);
    final label =
        '${normalizedTier.substring(0, 1).toUpperCase()}'
        '${normalizedTier.substring(1).toLowerCase()}';

    return DecoratedBox(
      decoration: BoxDecoration(
        color: _backgroundColor(
          normalizedTier,
          colorScheme,
          accentColor,
          hasAccentOverride: hasAccentOverride,
        ),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: _borderColor(
            normalizedTier,
            colorScheme,
            accentColor,
            hasAccentOverride: hasAccentOverride,
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 12,
              color: _textColor(
                normalizedTier,
                colorScheme,
                accentColor,
                hasAccentOverride: hasAccentOverride,
              ),
            ),
            const SizedBox(width: 5),
            Text(
              label,
              style: theme.typography.xSmall.copyWith(
                color: _textColor(
                  normalizedTier,
                  colorScheme,
                  accentColor,
                  hasAccentOverride: hasAccentOverride,
                ),
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _iconForTier(String tier) {
    switch (tier) {
      case workspaceTierPlus:
        return Icons.add_circle_rounded;
      case workspaceTierPro:
        return Icons.auto_awesome_rounded;
      case workspaceTierEnterprise:
        return Icons.apartment_rounded;
      case workspaceTierFree:
      default:
        return Icons.circle_outlined;
    }
  }

  Color _accentColor(String tier, ColorScheme colorScheme) {
    switch (tier) {
      case workspaceTierPlus:
        return const Color(0xFF3D84F5);
      case workspaceTierPro:
        return const Color(0xFFE25CB4);
      case workspaceTierEnterprise:
        return const Color(0xFFF0A43A);
      case workspaceTierFree:
      default:
        return colorScheme.onSurface;
    }
  }

  Color _backgroundColor(
    String tier,
    ColorScheme colorScheme,
    Color accentColor, {
    required bool hasAccentOverride,
  }) {
    if (tier == workspaceTierFree && !hasAccentOverride) {
      return colorScheme.surfaceContainerHigh;
    }

    if (tier == workspaceTierPro) {
      return accentColor.withValues(alpha: 0.22);
    }

    return accentColor.withValues(alpha: 0.16);
  }

  Color _borderColor(
    String tier,
    ColorScheme colorScheme,
    Color accentColor, {
    required bool hasAccentOverride,
  }) {
    if (tier == workspaceTierFree && !hasAccentOverride) {
      return colorScheme.outline.withValues(alpha: 0.34);
    }

    if (tier == workspaceTierPro) {
      return accentColor.withValues(alpha: 0.72);
    }

    return accentColor.withValues(alpha: 0.56);
  }

  Color _textColor(
    String tier,
    ColorScheme colorScheme,
    Color accentColor, {
    required bool hasAccentOverride,
  }) {
    if (tier == workspaceTierFree && !hasAccentOverride) {
      return colorScheme.onSurfaceVariant;
    }

    return accentColor;
  }
}
