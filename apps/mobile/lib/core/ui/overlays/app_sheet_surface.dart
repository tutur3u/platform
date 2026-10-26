part of 'show_app_sheet.dart';

/// The one sheet surface: popover fill, top radius, overlay shadow and the
/// drag handle. `showAppSheet` and the compact `showAdaptiveSheet` path both
/// draw it, so every sheet in the app looks and drags the same way.
class AppSheetSurface extends StatelessWidget {
  const AppSheetSurface({
    required this.child,
    this.showHandle = false,
    this.expands = false,
    this.dialog = false,
    super.key,
  });

  final Widget child;
  final bool showHandle;
  final bool expands;
  final bool dialog;

  /// Whether [context] already sits on a sheet or dialog surface.
  static bool hosts(BuildContext context) =>
      context.getInheritedWidgetOfExactType<_HostHandle>() != null;

  /// Marks [child] as hosted by a caller-drawn surface without a handle, so
  /// bodies such as `AppDialog` do not draw a second surface.
  static Widget markHosted(Widget child) =>
      _HostHandle(drawn: false, child: child);

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final radius = dialog
        ? BorderRadius.circular(AppRadius.sheet)
        : const BorderRadius.vertical(top: Radius.circular(AppRadius.sheet));
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: AppElevation.overlay(c),
      ),
      child: Material(
        color: c.popover,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: DefaultTextStyle.merge(
          style: TextStyle(color: c.popoverForeground),
          child: Column(
            mainAxisSize: expands ? MainAxisSize.max : MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (showHandle)
                const Padding(
                  padding: EdgeInsets.only(top: AppSpacing.sm),
                  child: _HandleBar(),
                )
              else
                const SizedBox(height: AppSpacing.sm),
              Flexible(
                fit: expands ? FlexFit.tight : FlexFit.loose,
                child: _HostHandle(
                  drawn: showHandle,
                  child: AppearanceScope.opaqueScaffolds(child),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Consumes IME clearance once at the sheet host, including fit sheets
/// without a scaffold. Bodies below it see no view insets, so they must not
/// add their own keyboard padding.
class AppSheetKeyboardInset extends StatelessWidget {
  const AppSheetKeyboardInset({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context) => Padding(
    padding: MediaQuery.viewInsetsOf(context),
    child: MediaQuery.removeViewInsets(
      context: context,
      removeBottom: true,
      child: child,
    ),
  );
}

/// The sheet drag handle for bodies that may open outside the shared host
/// (a tablet dialog, a test harness or a legacy drawer). Inside a host that
/// already draws a handle it renders nothing, so a sheet never shows two.
class AppSheetHandle extends StatelessWidget {
  const AppSheetHandle({super.key});

  @override
  Widget build(BuildContext context) {
    if (context.dependOnInheritedWidgetOfExactType<_HostHandle>()?.drawn ??
        false) {
      return const SizedBox.shrink();
    }
    return const Padding(
      padding: EdgeInsets.only(bottom: AppSpacing.md),
      child: _HandleBar(),
    );
  }
}

class _HandleBar extends StatelessWidget {
  const _HandleBar();

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    return Center(
      child: Container(
        key: const ValueKey('app-sheet-handle'),
        width: 40,
        height: 5,
        decoration: BoxDecoration(
          color: c.mutedForeground.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
      ),
    );
  }
}

class _HostHandle extends InheritedWidget {
  const _HostHandle({required this.drawn, required super.child});

  final bool drawn;

  @override
  bool updateShouldNotify(_HostHandle oldWidget) => drawn != oldWidget.drawn;
}
