import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';

import 'shell_chrome_scene_bodies.dart';

/// Shell chrome compositions for goldens, built from the production widgets.
enum ShellChromeScene {
  topBar,
  dockRest,
  dockBack,
  overflow,
  overflowSheet,
  dockFocused,
  dockPressed,
  notifications,
  switcher;

  bool get coversNarrowDock => switch (this) {
    dockRest ||
    dockBack ||
    overflow ||
    overflowSheet ||
    dockFocused ||
    dockPressed => true,
    _ => false,
  };
}

const sceneWorkspace = Workspace(id: 'ws-1', name: 'Tuturuuu');

/// Fixed root destination order.
List<ShellDockEntry> _destinations() => [
  for (final (id, label, icon) in const [
    ('home', 'Home', LucideIcons.house),
    ('apps', 'Apps', LucideIcons.layoutGrid),
    ('assistant', 'Mira', LucideIcons.sparkles),
    ('notifications', 'Notifications', LucideIcons.bell),
    ('profile', 'Profile', LucideIcons.circleUserRound),
  ])
    ShellDockEntry(key: ValueKey(id), label: label, glyph: Icon(icon)),
];

List<ShellDockEntry> _sections() => [
  for (final (label, icon) in const [
    ('Overview', LucideIcons.layoutGrid),
    ('Transactions', LucideIcons.receipt),
    ('Wallets', LucideIcons.wallet),
    ('Budgets', LucideIcons.chartPie),
    ('Categories', LucideIcons.tags),
    ('Reports', LucideIcons.chartNoAxesColumn),
  ])
    ShellDockEntry(key: ValueKey(label), label: label, glyph: Icon(icon)),
];

class ShellChromeSceneView extends StatelessWidget {
  const ShellChromeSceneView(this.scene, {super.key});
  final ShellChromeScene scene;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    final media = MediaQuery.of(context);
    final back =
        scene == ShellChromeScene.dockBack ||
        scene == ShellChromeScene.overflow ||
        scene == ShellChromeScene.overflowSheet ||
        scene == ShellChromeScene.switcher;
    final selected = switch (scene) {
      ShellChromeScene.notifications => const ValueKey('notifications'),
      ShellChromeScene.topBar ||
      ShellChromeScene.dockRest ||
      ShellChromeScene.dockFocused ||
      ShellChromeScene.dockPressed => const ValueKey('home'),
      _ => null,
    };
    final title = switch (scene) {
      ShellChromeScene.notifications => 'Notifications',
      ShellChromeScene.dockBack ||
      ShellChromeScene.overflow ||
      ShellChromeScene.overflowSheet => 'Finance',
      _ => 'Home',
    };
    return ColoredBox(
      color: style.page,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Padding(
            padding: EdgeInsets.only(top: media.padding.top + 56),
            child: scene == ShellChromeScene.notifications
                ? const ShellSceneNotificationsBody()
                : const _FillerBody(),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _TopBar(
              title: title,
              home:
                  scene == ShellChromeScene.topBar ||
                  scene == ShellChromeScene.dockRest,
              showsPicker:
                  scene != ShellChromeScene.dockBack &&
                  scene != ShellChromeScene.overflow &&
                  scene != ShellChromeScene.overflowSheet,
            ),
          ),
          if (scene != ShellChromeScene.topBar)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height:
                  ShellDockMetrics.bottomOffset(media.padding.bottom) +
                  ShellDockMetrics.height / 2,
              child: ShellDockFade(color: style.page),
            ),
          // The top-bar scene has scrolled the dock away.
          if (scene != ShellChromeScene.topBar)
            Positioned(
              left: ShellDockMetrics.inset,
              right: ShellDockMetrics.inset,
              bottom: ShellDockMetrics.bottomOffset(media.padding.bottom),
              child: PersistentShellDock(
                fixedZones: true,
                navigationWidth: ShellDockMetrics.widthFor(media.size.width),
                leading: back
                    ? ShellDockBackZone(
                        back: const ShellDockEntry(
                          key: ValueKey('back-to-root'),
                          label: 'Back',
                          glyph: Icon(LucideIcons.chevronLeft),
                        ),
                        onTap: () {},
                      )
                    : null,
                content: ShellDockBar(
                  ownsZones: false,
                  entries: switch (scene) {
                    ShellChromeScene.dockBack => _sections().take(5).toList(),
                    ShellChromeScene.overflow ||
                    ShellChromeScene.overflowSheet => _sections(),
                    _ => _destinations(),
                  },
                  selectedKey: switch (scene) {
                    ShellChromeScene.dockBack => const ValueKey('Wallets'),
                    ShellChromeScene.overflow ||
                    ShellChromeScene.overflowSheet => const ValueKey('Reports'),
                    _ => selected,
                  },
                  onSelected: (_) {},
                ),
                primary: scene == ShellChromeScene.notifications
                    ? ShellDockActionButton(
                        key: const ValueKey('scene-dock-action'),
                        action: ShellActionSpec(
                          id: 'scene-create',
                          icon: LucideIcons.plus,
                          inDock: true,
                          tooltip: 'Create',
                          onPressed: () {},
                        ),
                      )
                    : null,
              ),
            ),
          if (scene == ShellChromeScene.switcher)
            const ShellSceneSwitcherSheet(),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.title,
    required this.home,
    required this.showsPicker,
  });
  final String title;
  final bool home;
  final bool showsPicker;

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    return ColoredBox(
      color: style.page,
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 56,
          child: Padding(
            padding: shellTopBarPaddingFor(
              MediaQuery.sizeOf(context).width,
            ).copyWith(top: 0, bottom: 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: style.foreground,
                    ),
                  ),
                ),
                if (home)
                  ShellTopBarButton(
                    icon: const Icon(Icons.tune_rounded),
                    onPressed: () {},
                  )
                else ...[
                  ShellTopBarButton(
                    icon: const Icon(LucideIcons.checkCheck),
                    onPressed: () {},
                  ),
                  ShellTopBarButton(
                    icon: const Icon(LucideIcons.settings),
                    onPressed: () {},
                  ),
                ],
                if (showsPicker)
                  ShellTopBarButton(
                    icon: const WorkspaceAvatar(
                      workspace: sceneWorkspace,
                      radius: 16,
                      circular: true,
                    ),
                    onPressed: () {},
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FillerBody extends StatelessWidget {
  const _FillerBody();

  @override
  Widget build(BuildContext context) {
    final style = ShellChromeStyle.of(context);
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        8,
        16,
        AppPageInsets.contentBottomClearance(
          context,
          safeBottom: MediaQuery.paddingOf(context).bottom,
        ),
      ),
      children: [
        for (var i = 0; i < 8; i++)
          Container(
            height: 96,
            margin: const EdgeInsets.only(bottom: 12),
            decoration: BoxDecoration(
              color: style.surface,
              borderRadius: BorderRadius.circular(style.cardRadius),
              boxShadow: style.raisedShadow,
              border: style.cardOutline,
            ),
          ),
      ],
    );
  }
}
