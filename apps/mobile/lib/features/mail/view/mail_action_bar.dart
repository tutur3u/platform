import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/input/desktop_shortcut_platform.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';

bool usesMailActionBar(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  return shellNavigationModeFor(size) == ShellNavigationMode.rail ||
      size.shortestSide >= Breakpoints.mediumMin;
}

/// Desktop platforms bind every Mail command. Elsewhere, such as a tablet with
/// a hardware keyboard, only a bare Escape is bound, to close the reading pane.
bool mailKeyboardBinds(LogicalKeyboardKey key, {required bool modified}) =>
    supportsDesktopShortcuts() ||
    (key == LogicalKeyboardKey.escape && !modified);

/// Mail owns the surface and measures it against the viewport that contains it.
/// A horizontal scroll keeps translated labels intact on narrow reading panes.
class MailActionBar extends StatelessWidget {
  const MailActionBar({
    required this.label,
    required this.children,
    this.bottomClearance,
    this.liveRegion = false,
    super.key,
  });

  final String label;
  final List<Widget> children;
  final double? bottomClearance;
  final bool liveRegion;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final bottom = bottomClearance ?? MediaQuery.paddingOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 8, 12, bottom + 12),
      child: Align(
        alignment: Alignment.bottomCenter,
        heightFactor: 1,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 144, maxWidth: 640),
          child: Semantics(
            container: true,
            label: label,
            liveRegion: liveRegion,
            child: Material(
              color: colors.background,
              shape: RoundedRectangleBorder(
                side: BorderSide(color: colors.border),
                borderRadius: BorderRadius.circular(16),
              ),
              clipBehavior: Clip.antiAlias,
              child: LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minWidth: (constraints.minWidth - 16).clamp(0.0, 640.0),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      spacing: 4,
                      children: children,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class MailBarButton extends StatelessWidget {
  const MailBarButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => AppTooltip(
    message: label,
    excludeFromSemantics: true,
    child: AppButton.ghost(
      onPressed: onPressed,
      leading: Icon(icon, size: 18),
      child: Text(label, maxLines: 1, softWrap: false),
    ),
  );
}
