import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/widgets/app_launcher_tile.dart';
import 'package:mobile/l10n/l10n.dart';

class AppLauncherPins extends StatelessWidget {
  const AppLauncherPins({
    required this.apps,
    required this.onSelected,
    required this.onManage,
    super.key,
  });

  final List<AppModule> apps;
  final ValueChanged<AppModule> onSelected;
  final VoidCallback? onManage;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      const gap = AppSpacing.xs + AppSpacing.xxs;
      const minWidth = 56.0;
      final columns = ((constraints.maxWidth + gap) / (minWidth + gap))
          .floor()
          .clamp(1, 5);
      final width = math.min<double>(
        104,
        (constraints.maxWidth - (columns - 1) * gap) / columns,
      );
      final colors = AppTokens.of(context).colorScheme;
      return Wrap(
        spacing: gap,
        runSpacing: AppSpacing.md,
        children: [
          for (final app in apps)
            _PinShortcut(
              key: ValueKey('pinned-${app.id}'),
              width: width,
              label: app.label(context.l10n),
              onPressed: () => onSelected(app),
              icon: AppProductIcon(module: app, size: 56),
            ),
          if (onManage case final manage?)
            _PinShortcut(
              width: width,
              label: context.l10n.appsAddPin,
              onPressed: manage,
              icon: Container(
                width: 56,
                height: 56,
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
  Widget build(BuildContext context) => Semantics(
    button: true,
    child: Material(
      type: MaterialType.transparency,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onPressed,
        child: SizedBox(
          width: width,
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
  );
}

class AppLauncherRecents extends StatelessWidget {
  const AppLauncherRecents({
    required this.apps,
    required this.onSelected,
    super.key,
  });

  final List<AppModule> apps;
  final ValueChanged<AppModule> onSelected;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        spacing: AppSpacing.sm,
        children: [
          for (final app in apps)
            AppLauncherButton(
              key: ValueKey('recent-${app.id}'),
              radius: AppRadius.pill,
              onPressed: () => onSelected(app),
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(8, 8, 16, 8),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: AppSpacing.sm,
                  children: [
                    AppProductIcon(module: app, size: 36, round: true),
                    Text(
                      app.label(context.l10n),
                      style: tokens.typography.uiCompact.copyWith(
                        fontWeight: FontWeight.w700,
                        color: tokens.colorScheme.cardForeground,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
