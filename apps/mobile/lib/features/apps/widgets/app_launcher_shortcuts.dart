import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/features/apps/widgets/app_launcher_tile.dart';
import 'package:mobile/l10n/l10n.dart';

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
