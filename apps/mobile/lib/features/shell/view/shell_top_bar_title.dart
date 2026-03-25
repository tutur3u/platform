import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellTopBarTitle extends StatelessWidget {
  const ShellTopBarTitle({required this.matchedLocation, super.key});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    if (matchedLocation == Routes.home) {
      return const _HomeBreadcrumbTitle();
    }

    final module = AppRegistry.moduleFromLocation(matchedLocation);
    if (module != null) {
      return _buildTitleRow(theme, module.label(context.l10n));
    }

    final title = switch (matchedLocation) {
      Routes.home => context.l10n.navHome,
      Routes.assistant => context.l10n.navAssistant,
      Routes.profileRoot => context.l10n.profileTitle,
      Routes.settings => context.l10n.settingsTitle,
      Routes.apps => context.l10n.navApps,
      _ => null,
    };

    return _buildTitleRow(theme, title ?? context.l10n.navApps);
  }

  Widget _buildTitleRow(shad.ThemeData theme, String title) {
    return SizedBox(
      height: mobileSectionAppBarHeight,
      child: Row(
        children: [
          Image.asset(
            'assets/logos/transparent.png',
            width: mobileSectionAppBarLogoSize,
            height: mobileSectionAppBarLogoSize,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeBreadcrumbTitle extends StatelessWidget {
  const _HomeBreadcrumbTitle();

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return SizedBox(
      height: mobileSectionAppBarHeight,
      child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        buildWhen: (previous, current) =>
            previous.currentWorkspace != current.currentWorkspace,
        builder: (context, state) {
          final workspaceLabel = displayWorkspaceNameOrFallback(
            context,
            state.currentWorkspace,
          );

          return Row(
            children: [
              Image.asset(
                'assets/logos/transparent.png',
                width: mobileSectionAppBarLogoSize,
                height: mobileSectionAppBarLogoSize,
                fit: BoxFit.contain,
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => showWorkspacePickerSheet(context),
                    child: Ink(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.muted.withValues(alpha: 0.72),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              workspaceLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.typography.p.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(
                            Icons.keyboard_arrow_down_rounded,
                            size: 18,
                            color: theme.colorScheme.mutedForeground,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
