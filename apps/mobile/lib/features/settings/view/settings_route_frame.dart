import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/l10n/l10n.dart';

/// Shell chrome for settings routes presented by a standalone navigator.
class SettingsRouteFrame extends StatelessWidget {
  const SettingsRouteFrame({
    required this.title,
    required this.child,
    required this.onBack,
    super.key,
  });

  final String title;
  final Widget child;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => Material(
    color: ShellChromeStyle.of(context).page,
    child: FloatingShellDock(
      location: '',
      bottomInset: ShellDockMetrics.clearanceFor(
        MediaQuery.paddingOf(context).bottom,
      ),
      fixedZones: true,
      allowDockSlot: false,
      header: MobileSectionAppBar(title: title),
      leading: ShellDockBackZone(
        back: ShellDockEntry(
          key: const ValueKey('settings-route-back'),
          label: context.l10n.navBack,
          glyph: const Icon(AppIcons.back),
        ),
        onTap: onBack,
      ),
      navigation: const SizedBox(height: ShellDockSurface.contentHeight),
      child: child,
    ),
  );
}
