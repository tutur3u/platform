import 'package:flutter/material.dart' hide AlertDialog;
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/glass_effects.dart';
import 'package:mobile/core/ui/overlays/app_modal_scope.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/widgets/app_dialog_scaffold.dart';

/// Shows a bottom sheet on compact screens and a centered dialog on
/// medium / expanded screens.
///
/// The dialog variant is constrained to [maxDialogWidth] (default 560).
///
/// Uses the app surface by default. Callers with their own shaped surface can
/// explicitly opt into a transparent background.
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
      builder: (sheetContext) => AppModalBinding(
        dismissible: isDismissible || enableDrag,
        child: _sheetSurface(sheetContext, builder(sheetContext), surface),
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

/// Opens a shadcn bottom drawer on compact screens and a centered dialog on
/// medium / expanded screens.
///
/// Returns a [Future] that completes when the overlay is dismissed, so callers
/// can optionally `await` it to run logic after the overlay closes.
///
/// Wraps overlay content with a [BackButtonListener] so the Android hardware
/// back button dismisses the overlay instead of triggering shell navigation.
Future<void> showAdaptiveDrawer({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  double maxDialogWidth = 560,
}) async {
  final rootNavigatorContext = Navigator.of(
    context,
    rootNavigator: true,
  ).context;

  if (context.isCompact) {
    await shad.openDrawer<void>(
      context: rootNavigatorContext,
      position: shad.OverlayPosition.bottom,
      builder: (drawerContext) => BackButtonListener(
        onBackButtonPressed: () async {
          if (drawerContext.mounted) {
            await shad.closeOverlay<void>(drawerContext);
          }
          return true;
        },
        child: AppearanceScope.opaqueScaffolds(builder(drawerContext)),
      ),
    );
    return;
  }

  await showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.48),
    builder: (dialogContext) => BackButtonListener(
      onBackButtonPressed: () async {
        if (dialogContext.mounted) {
          await Navigator.maybePop(dialogContext);
        }
        return true;
      },
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Center(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxDialogWidth),
            child: Material(
              color: shad.Theme.of(dialogContext).colorScheme.background,
              borderRadius: BorderRadius.circular(12),
              clipBehavior: Clip.antiAlias,
              child: AppearanceScope.opaqueScaffolds(builder(dialogContext)),
            ),
          ),
        ),
      ),
    ),
  );
}

Future<void> dismissAdaptiveDrawerOverlay(BuildContext context) async {
  if (context.isCompact) {
    await shad.closeOverlay<void>(context);
    return;
  }

  await Navigator.maybePop(context);
}
