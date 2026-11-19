import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/widgets/app_launcher_tile.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Pinned section of the Apps hub: a titled grid of pinned shortcuts.
///
/// Every row splits the width into equal slots and centers its tiles, so a
/// partial last row sits in the middle. The Add pin tile stays inline while
/// the first row has room; once the pins fill it, Add pin becomes a compact
/// header action so it never wraps onto a row of its own.
class AppLauncherPins extends StatelessWidget {
  const AppLauncherPins({
    required this.title,
    required this.apps,
    required this.onSelected,
    required this.onManage,
    super.key,
  });

  /// Narrowest slot that still fits the icon and a short label.
  static const double minSlotWidth = 64;
  static const int maxColumns = 8;
  static const double iconSize = 56;

  final String title;
  final List<AppModule> apps;
  final ValueChanged<AppModule> onSelected;
  final VoidCallback? onManage;

  /// Number of equal slots per row for [width], widened for larger text.
  static int columnsFor(double width, {TextScaler? textScaler}) {
    if (!width.isFinite || width <= 0) return 1;
    final scaler = textScaler ?? TextScaler.noScaling;
    final scale = math.max<double>(1, scaler.scale(12) / 12);
    final fit = (width / (minSlotWidth * scale)).floor();
    return fit.clamp(1, maxColumns);
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final l10n = context.l10n;
      final width = constraints.maxWidth;
      final columns = columnsFor(
        width,
        textScaler: MediaQuery.textScalerOf(context),
      );
      // Floored so float rounding never pushes the last slot onto a new row.
      final slot = (width / columns * 100).floorToDouble() / 100;
      final manage = onManage;
      final inHeader = manage != null && apps.length >= columns;
      final colors = AppTokens.of(context).colorScheme;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppSectionHeader(
            title: title,
            actionLabel: inHeader ? l10n.appsAddPin : null,
            actionIcon: LucideIcons.plus,
            actionKey: const ValueKey('pinned-add-header'),
            onAction: inHeader ? manage : null,
          ),
          Wrap(
            alignment: WrapAlignment.center,
            runSpacing: AppSpacing.md,
            children: [
              for (final app in apps)
                _PinShortcut(
                  key: ValueKey('pinned-${app.id}'),
                  width: slot,
                  label: app.label(l10n),
                  onPressed: () => onSelected(app),
                  icon: AppProductIcon(module: app, size: iconSize),
                ),
              if (manage != null && !inHeader)
                _PinShortcut(
                  key: const ValueKey('pinned-add-tile'),
                  width: slot,
                  label: l10n.appsAddPin,
                  onPressed: manage,
                  icon: Container(
                    width: iconSize,
                    height: iconSize,
                    decoration: BoxDecoration(
                      border: Border.all(color: colors.input),
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: Icon(
                      LucideIcons.plus,
                      color: colors.mutedForeground,
                      size: 22,
                    ),
                  ),
                ),
            ],
          ),
        ],
      );
    },
  );
}

class _PinShortcut extends StatelessWidget {
  const _PinShortcut({
    required this.width,
    required this.label,
    required this.onPressed,
    required this.icon,
    super.key,
  });

  final double width;
  final String label;
  final VoidCallback onPressed;
  final Widget icon;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width,
    child: Center(
      child: Semantics(
        button: true,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onPressed,
            child: SizedBox(
              width: math.min(width, 104),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ExcludeSemantics(child: icon),
                  const SizedBox(height: AppSpacing.xs + AppSpacing.xxs),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTokens.of(
                      context,
                    ).typography.caption.copyWith(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
