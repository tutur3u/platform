part of 'show_app_sheet.dart';

class _AppSheetSurface extends StatelessWidget {
  const _AppSheetSurface({
    required this.child,
    this.showHandle = false,
    this.expands = false,
    this.dialog = false,
  });

  final Widget child;
  final bool showHandle;
  final bool expands;
  final bool dialog;

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
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Center(
                    child: Container(
                      width: 40,
                      height: 5,
                      decoration: BoxDecoration(
                        color: c.mutedForeground.withValues(alpha: 0.35),
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                    ),
                  ),
                )
              else
                const SizedBox(height: AppSpacing.sm),
              Flexible(
                fit: expands ? FlexFit.tight : FlexFit.loose,
                child: AppearanceScope.opaqueScaffolds(child),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Consume IME clearance once, including fit sheets without a scaffold.
class _AboveKeyboard extends StatelessWidget {
  const _AboveKeyboard({required this.child});
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
