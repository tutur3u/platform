import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_option_tile.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_grouped_slice.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/shell/cubit/shell_root_tabs_cubit.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/l10n/l10n.dart';

/// Key of the Reset row in the tab editor.
const shellRootTabsResetKey = ValueKey<String>('shell-root-tabs-reset');

/// Key of a candidate row in the tab editor.
ValueKey<(String, String)> shellRootTabOptionKey(ShellRootTab tab) =>
    ValueKey(('shell-root-tab-option', tab.name));

/// Lets the user pick up to [shellRootTabLimit] phone dock tabs from
/// [candidates] (dock entries keyed by [ShellRootTab.key]). Tabs keep the
/// order they were picked in; each change is saved through [cubit].
Future<void> showShellRootTabsEditor({
  required BuildContext context,
  required ShellRootTabsCubit cubit,
  required List<ShellDockEntry> candidates,
  required List<ShellRootTab> Function(List<ShellRootTab>? chosen) resolve,
}) => showAppSheet<void>(
  context: context,
  builder: (_) => _ShellRootTabsEditor(
    cubit: cubit,
    candidates: candidates,
    resolve: resolve,
  ),
);

class _ShellRootTabsEditor extends StatelessWidget {
  const _ShellRootTabsEditor({
    required this.cubit,
    required this.candidates,
    required this.resolve,
  });

  final ShellRootTabsCubit cubit;
  final List<ShellDockEntry> candidates;
  final List<ShellRootTab> Function(List<ShellRootTab>? chosen) resolve;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return BlocBuilder<ShellRootTabsCubit, List<ShellRootTab>?>(
      bloc: cubit,
      builder: (context, chosen) {
        final tabs = resolve(chosen);
        return AppSheetScaffold(
          title: l10n.navEditTabs,
          description: l10n.navTabsLimitHint(shellRootTabLimit),
          slivers: [
            SliverList.builder(
              itemCount: candidates.length,
              itemBuilder: (context, index) {
                final entry = candidates[index];
                final tab = ShellRootTab.fromKey(entry.key);
                if (tab == null) return const SizedBox.shrink();
                final position = tabs.indexOf(tab);
                final pinned = position >= 0;
                final canToggle = pinned
                    ? tabs.length > 1
                    : tabs.length < shellRootTabLimit;
                return AppGroupedSlice(
                  position: AppSlicePosition.of(index, candidates.length),
                  dividerInset: AppSpacing.md,
                  child: AppOptionTile(
                    key: shellRootTabOptionKey(tab),
                    title: entry.label,
                    leading: _glyph(entry.glyph),
                    detail: pinned ? '${position + 1}' : null,
                    selected: pinned,
                    multiSelect: true,
                    onTap: canToggle
                        ? () => unawaited(
                            cubit.setTabs(
                              pinned
                                  ? ([...tabs]..remove(tab))
                                  : [...tabs, tab],
                            ),
                          )
                        : null,
                  ),
                );
              },
            ),
            const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md)),
            SliverToBoxAdapter(
              child: AppGroupedSlice(
                position: AppSlicePosition.only,
                child: AppOptionTile(
                  key: shellRootTabsResetKey,
                  title: l10n.navResetTabs,
                  leading: _glyph(const Icon(LucideIcons.rotateCcw)),
                  onTap: chosen == null ? null : () => unawaited(cubit.reset()),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _glyph(Widget glyph) => IconTheme.merge(
    data: const IconThemeData(size: 22),
    child: SizedBox.square(dimension: 22, child: glyph),
  );
}
