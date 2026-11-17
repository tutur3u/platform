import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';

import 'shell_chrome_scene_bodies.dart';

/// Shell chrome compositions for goldens, built from the production widgets.
enum ShellChromeScene { topBar, dockRest, dockBack, notifications, switcher }

const sceneWorkspace = Workspace(id: 'ws-1', name: 'Tuturuuu');

/// The phone root dock: Home, Tasks, Calendar and Mail, then More.
List<ShellDockEntry> _destinations() => [
  const ShellDockEntry(
    key: ValueKey('home'),
    label: 'Home',
    glyph: Icon(LucideIcons.house),
  ),
  for (final (id, label) in const [
    ('tasks', 'Tasks'),
    ('calendar', 'Calendar'),
    ('mail', 'Mail'),
  ])
    ShellDockEntry(
      key: ValueKey(id),
      label: label,
      glyph: Icon(AppRegistry.moduleById(id)?.icon ?? LucideIcons.house),
    ),
  const ShellDockEntry(
    key: ValueKey('more'),
    label: 'More',
    glyph: Icon(Icons.more_horiz),
  ),
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
        scene == ShellChromeScene.switcher;
    final selected = switch (scene) {
      // Notifications lives behind More on the phone dock.
      ShellChromeScene.notifications => const ValueKey('more'),
      ShellChromeScene.topBar ||
      ShellChromeScene.dockRest => const ValueKey('home'),
      _ => null,
    };
    final title = switch (scene) {
      ShellChromeScene.notifications => 'Notifications',
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
              child: Center(
                child: SizedBox(
                  width: ShellDockMetrics.widthFor(media.size.width),
                  // The shell dock's fixed zones: Back and the pill, then the
                  // page-action slot.
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: ShellDockBar(
                          entries: _destinations(),
                          selectedKey: selected,
                          onSelected: (_) {},
                          back: back
                              ? const ShellDockEntry(
                                  key: ValueKey('back-to-root'),
                                  label: 'Back',
                                  glyph: Icon(LucideIcons.chevronLeft),
                                )
                              : null,
                        ),
                      ),
                      const SizedBox(width: ShellDockMetrics.zoneGap),
                      Padding(
                        padding: const EdgeInsets.only(
                          bottom: ShellDockMetrics.padding,
                        ),
                        child: ShellDockActionButton(
                          key: const ValueKey('scene-dock-action'),
                          action: ShellActionSpec(
                            id: 'scene-create',
                            icon: LucideIcons.plus,
                            inDock: true,
                            tooltip: 'Create',
                            onPressed: () {},
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
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
  const _TopBar({required this.title, required this.home});
  final String title;
  final bool home;

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
                if (home) ...[
                  ShellTopBarButton(
                    icon: const WorkspaceAvatar(
                      workspace: sceneWorkspace,
                      radius: 16,
                      circular: true,
                    ),
                    onPressed: () {},
                  ),
                ] else ...[
                  ShellTopBarButton(
                    icon: const Icon(LucideIcons.checkCheck),
                    onPressed: () {},
                  ),
                  ShellTopBarButton(
                    icon: const Icon(LucideIcons.settings),
                    onPressed: () {},
                  ),
                ],
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
