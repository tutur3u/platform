import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_top_bar_button.dart';
import 'package:mobile/features/workspace/widgets/workspace_avatar.dart';

import 'shell_chrome_scene_bodies.dart';

/// Shell chrome compositions for goldens, built from the production widgets.
enum ShellChromeScene { topBar, dockRest, dockBack, notifications, switcher }

const sceneWorkspace = Workspace(id: 'ws-1', name: 'Tuturuuu');

List<ShellDockEntry> _destinations() => const [
  ShellDockEntry(
    key: ValueKey('home'),
    label: 'Home',
    glyph: Icon(LucideIcons.house),
  ),
  ShellDockEntry(
    key: ValueKey('tasks'),
    label: 'Tasks',
    glyph: Icon(LucideIcons.squareCheckBig),
  ),
  ShellDockEntry(
    key: ValueKey('calendar'),
    label: 'Calendar',
    glyph: Icon(LucideIcons.calendar),
  ),
  ShellDockEntry(
    key: ValueKey('assistant'),
    label: 'Mira',
    glyph: Icon(LucideIcons.sparkles),
  ),
  ShellDockEntry(
    key: ValueKey('apps'),
    label: 'Apps',
    glyph: Icon(LucideIcons.layoutGrid),
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
        scene != ShellChromeScene.dockRest && scene != ShellChromeScene.topBar;
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
            child: _TopBar(title: title, home: !back),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height:
                ShellDockMetrics.clearance -
                ShellDockMetrics.inset +
                ShellDockMetrics.dockFadeHeight +
                media.padding.bottom,
            child: ShellDockFade(color: style.page),
          ),
          Positioned(
            left: ShellDockMetrics.inset,
            right: ShellDockMetrics.inset,
            bottom: ShellDockMetrics.inset + media.padding.bottom,
            child: Center(
              child: SizedBox(
                width: ShellDockMetrics.widthFor(media.size.width),
                child: ShellDockSurface(
                  child: ShellDockBar(
                    entries: _destinations(),
                    selectedKey: back ? null : const ValueKey('home'),
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
                    icon: const Icon(LucideIcons.circleUserRound),
                    onPressed: () {},
                  ),
                  ShellTopBarButton(
                    icon: const Icon(LucideIcons.bell),
                    badge: const ShellUnreadDot(),
                    onPressed: () {},
                  ),
                  ShellTopBarButton(
                    icon: const WorkspaceAvatar(
                      workspace: sceneWorkspace,
                      radius: 16,
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
