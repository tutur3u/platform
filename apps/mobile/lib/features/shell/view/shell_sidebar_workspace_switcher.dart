import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/router/draft_route_guard.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_sidebar_geometry.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the workspace switcher at the top of the sidebar.
const shellSidebarWorkspaceSwitcherKey = ValueKey<String>(
  'shell-sidebar-workspace-switcher',
);

/// The current workspace's avatar and name at the top of the sidebar. It
/// opens the searchable workspace list, which also creates workspaces. The
/// icon rail shows the avatar alone with the name as its tooltip.
class ShellSidebarWorkspaceSwitcher extends StatelessWidget {
  const ShellSidebarWorkspaceSwitcher({
    required this.extended,
    this.onOpened,
    super.key,
  });

  final bool extended;

  /// Runs before the list opens, such as closing an overlay sidebar.
  final VoidCallback? onOpened;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit?, Workspace?>(
      (cubit) => cubit?.state.currentWorkspace,
    );
    if (workspace == null) return const SizedBox.shrink();
    final style = ShellChromeStyle.of(context);
    final tokens = AppTokens.of(context);
    final action = context.l10n.settingsSwitchWorkspace;
    final name = displayWorkspaceNameOrFallback(context, workspace);
    final radius = BorderRadius.circular(
      extended ? style.rowRadius + AppSpacing.xxs : shellNavigationRailSlot / 2,
    );
    void open() {
      unawaited(AppHaptics.selection());
      onOpened?.call();
      unawaited(
        showWorkspacePicker(
          context,
          searchable: true,
          // Switching workspace over an open draft would discard it.
          canSelect: () => !DraftRouteGuard.instance.hasBlockingRoute,
        ),
      );
    }

    final avatar = WorkspaceAvatar(
      workspace: workspace,
      radius: 14,
      circular: true,
    );
    final content = extended
        ? Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: Row(
              spacing: AppSpacing.sm,
              children: [
                avatar,
                Expanded(
                  child: Text(
                    name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.ui.copyWith(
                      color: style.foreground,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Icon(
                  LucideIcons.chevronsUpDown,
                  size: 16,
                  color: style.mutedForeground,
                ),
              ],
            ),
          )
        : Center(child: avatar);
    final button = Semantics(
      button: true,
      label: name,
      hint: action,
      excludeSemantics: true,
      onTap: open,
      child: SizedBox(
        key: shellSidebarWorkspaceSwitcherKey,
        width: extended ? double.infinity : shellNavigationRailSlot,
        height: extended
            ? shellNavigationSidebarRowHeight
            : shellNavigationRailSlot,
        child: Material(
          type: MaterialType.transparency,
          shape: RoundedRectangleBorder(
            borderRadius: radius,
            side: extended ? BorderSide(color: style.border) : BorderSide.none,
          ),
          child: InkWell(onTap: open, borderRadius: radius, child: content),
        ),
      ),
    );
    return AppTooltip(
      message: extended ? action : '$action · $name',
      excludeFromSemantics: true,
      preferBelow: false,
      child: button,
    );
  }
}
