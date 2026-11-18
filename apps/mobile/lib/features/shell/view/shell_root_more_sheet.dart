import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_grouped_slice.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the current-workspace row at the top of the root More sheet.
const shellRootWorkspaceKey = ValueKey<String>('shell-root-workspace');

/// Key of the Edit tabs row in the root More sheet.
const shellRootEditTabsKey = ValueKey<String>('shell-root-edit-tabs');

/// Key of the Reset tabs row in the root More sheet.
const shellRootResetTabsKey = ValueKey<String>('shell-root-reset-tabs');

/// Key of the row for [key] in the root More sheet.
ValueKey<(String, Key)> shellRootMoreRowKey(Key key) =>
    ValueKey(('shell-root-more', key));

/// The phone dock's More sheet: the current [workspace] (opens the picker),
/// then [destinations] not pinned to the dock, then Edit tabs and Reset
/// tabs. Resolves with the chosen row's key, or null when dismissed.
///
/// Reset is disabled while the dock already shows the default tabs
/// ([canReset] false).
Future<Key?> showShellRootMoreSheet({
  required BuildContext context,
  required Workspace? workspace,
  required List<ShellDockEntry> destinations,
  required Key? selectedKey,
  required bool canReset,
}) => showAppSheet<Key>(
  context: context,
  builder: (sheetContext) {
    final l10n = sheetContext.l10n;
    void pick(Key key) => Navigator.of(sheetContext).pop(key);
    Widget glyph(Widget child) => IconTheme.merge(
      data: const IconThemeData(size: 22),
      child: SizedBox.square(dimension: 22, child: child),
    );
    Widget group(List<Widget> rows) => SliverList.builder(
      itemCount: rows.length,
      itemBuilder: (_, index) => AppGroupedSlice(
        position: AppSlicePosition.of(index, rows.length),
        dividerInset: AppSpacing.md,
        child: rows[index],
      ),
    );
    const gap = SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md));
    return AppSheetScaffold(
      title: l10n.navMore,
      slivers: [
        if (workspace != null) ...[
          group([
            _ShellRootWorkspaceRow(
              workspace: workspace,
              onTap: () => pick(shellRootWorkspaceKey),
            ),
          ]),
          gap,
        ],
        if (destinations.isNotEmpty) ...[
          group([
            for (final entry in destinations)
              AppOptionTile(
                key: shellRootMoreRowKey(entry.key),
                title: entry.label,
                leading: glyph(entry.glyph),
                selected: entry.key == selectedKey,
                onTap: entry.enabled ? () => pick(entry.key) : null,
              ),
          ]),
          gap,
        ],
        group([
          AppOptionTile(
            key: shellRootMoreRowKey(shellRootEditTabsKey),
            title: l10n.navEditTabs,
            leading: glyph(const Icon(LucideIcons.pencil)),
            onTap: () => pick(shellRootEditTabsKey),
          ),
          AppOptionTile(
            key: shellRootMoreRowKey(shellRootResetTabsKey),
            title: l10n.navResetTabs,
            leading: glyph(const Icon(LucideIcons.rotateCcw)),
            onTap: canReset ? () => pick(shellRootResetTabsKey) : null,
          ),
        ]),
      ],
    );
  },
);

/// The current workspace; opens the workspace picker.
class _ShellRootWorkspaceRow extends StatelessWidget {
  const _ShellRootWorkspaceRow({required this.workspace, required this.onTap});

  final Workspace workspace;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final name = displayWorkspaceNameOrFallback(context, workspace);
    return Semantics(
      button: true,
      label: name,
      hint: context.l10n.settingsSwitchWorkspace,
      excludeSemantics: true,
      onTap: onTap,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          key: shellRootMoreRowKey(shellRootWorkspaceKey),
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppLayout.rowCompactMinHeight,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  WorkspaceAvatar(workspace: workspace, radius: 14),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: tokens.typography.base.copyWith(
                        color: c.foreground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Icon(AppIcons.expand, size: 18, color: c.mutedForeground),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
