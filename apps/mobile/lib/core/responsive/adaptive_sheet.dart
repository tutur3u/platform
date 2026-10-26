import 'package:flutter/material.dart' hide AlertDialog;
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/glass_effects.dart';
import 'package:mobile/core/ui/overlays/app_modal_scope.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/widgets/app_dialog_scaffold.dart';

/// Shows a bottom sheet on compact screens and a centered dialog on
/// medium / expanded screens.
///
/// The dialog variant is constrained to [maxDialogWidth] (default 560).
///
/// Compact sheets use the shared `AppSheetSurface` (drag handle, popover
/// fill, keyboard inset), the same surface as `showAppSheet`. Callers with
/// their own shaped surface can explicitly opt into a transparent background.
///
/// Wraps overlay content with an [AppModalBinding] so system Back and the
/// shell's floating-dock Back close the overlay instead of popping the page
/// underneath. New code should use `showAppSheet` from `core/ui`.
Future<T?> showAdaptiveSheet<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  double maxDialogWidth = 560,
  bool isScrollControlled = true,
  bool useSafeArea = true,
  bool isDismissible = true,
  bool enableDrag = true,
  bool barrierDismissible = true,
  Color barrierColor = const Color(0x7A000000),
  bool useRootNavigator = false,
  Color? backgroundColor,
}) {
  final surface =
      backgroundColor ?? shad.Theme.of(context).colorScheme.background;
  if (context.isCompact) {
    return showModalBottomSheet<T>(
      context: context,
      useRootNavigator: useRootNavigator,
      backgroundColor: Colors.transparent,
      barrierColor: barrierColor,
      isScrollControlled: isScrollControlled,
      useSafeArea: useSafeArea,
      isDismissible: isDismissible,
      enableDrag: enableDrag,
      // The caller's builder runs below the consumed keyboard inset, so a
      // body that still pads for the keyboard does not reserve it twice.
      builder: (sheetContext) => AppSheetKeyboardInset(
        child: Builder(
          builder: (bodyContext) {
            final child = builder(bodyContext);
            // Bodies that bring their own card keep it; everything else
            // gets the shared sheet surface and handle.
            if (child is AppDialogScaffold || surface.a == 0) {
              return AppModalBinding(
                dismissible: isDismissible || enableDrag,
                child: AppearanceScope.opaqueScaffolds(child),
              );
            }
            return ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.94,
              ),
              child: AppModalBinding(
                dismissible: isDismissible || enableDrag,
                child: AppSheetSurface(showHandle: enableDrag, child: child),
              ),
            );
          },
        ),
      ),
    );
  }

  return showDialog<T>(
    context: context,
    useRootNavigator: useRootNavigator,
    barrierColor: barrierColor,
    barrierDismissible: barrierDismissible,
    builder: (dialogContext) => AppModalBinding(
      dismissible: barrierDismissible,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxDialogWidth),
            child: _sheetSurface(
              dialogContext,
              builder(dialogContext),
              surface,
            ),
          ),
        ),
      ),
    ),
  );
}

Widget _sheetSurface(BuildContext context, Widget child, Color surface) {
  // Modal content keeps opaque scaffolds when pages use an ambient theme.
  if (child is AppDialogScaffold || surface.a == 0) {
    return AppearanceScope.opaqueScaffolds(child);
  }
  return ClipRRect(
    key: const ValueKey('adaptive-sheet-glass'),
    borderRadius: BorderRadius.circular(24),
    child: GlassBlur(
      sigma: 20,
      child: Material(
        color: surface.withValues(alpha: GlassEffects.fillAlpha(context, 0.88)),
        child: AppearanceScope.opaqueScaffolds(child),
      ),
    ),
  );
}

/// Opens a bottom sheet on compact screens and a centered dialog on
/// medium / expanded screens, above the shell chrome (root navigator).
///
/// Uses the shared `showAppSheet` / `showAppDialog` host, so drawers share
/// the sheet surface, drag handle, keyboard inset and modal Back binding.
/// Close it with [dismissAdaptiveDrawerOverlay] or a Navigator pop.
Future<void> showAdaptiveDrawer({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  double maxDialogWidth = 560,
}) => showAppSheet<void>(
  context: context,
  useRootNavigator: true,
  maxDialogWidth: maxDialogWidth,
  builder: builder,
);

/// Closes the drawer that [context] belongs to.
Future<void> dismissAdaptiveDrawerOverlay(BuildContext context) =>
    Navigator.maybePop(context);
