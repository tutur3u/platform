import 'package:flutter/material.dart' hide AlertDialog;
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shows a bottom sheet on compact screens and a centered dialog on
/// medium / expanded screens.
///
/// The dialog variant is constrained to [maxDialogWidth] (default 560).
///
/// Wraps overlay content with a [BackButtonListener] so the Android hardware
/// back button dismisses the overlay instead of triggering shell navigation.
/// Child back-button dispatchers have higher priority than the shell's
/// [BackButtonListener], so this intercept is transparent to callers.
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
}) {
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
      builder: (sheetContext) => BackButtonListener(
        onBackButtonPressed: () async {
          if (!isDismissible && !enableDrag) {
            return true;
          }

          if (sheetContext.mounted) {
            await Navigator.maybePop(sheetContext);
          }
          return true;
        },
        child: builder(sheetContext),
      ),
    );
  }

  return showDialog<T>(
    context: context,
    useRootNavigator: useRootNavigator,
    barrierColor: barrierColor,
    barrierDismissible: barrierDismissible,
    builder: (dialogContext) => BackButtonListener(
      onBackButtonPressed: () async {
        if (!barrierDismissible) {
          return true;
        }

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
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              clipBehavior: Clip.antiAlias,
              child: builder(dialogContext),
            ),
          ),
        ),
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
        child: builder(drawerContext),
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
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              clipBehavior: Clip.antiAlias,
              child: builder(dialogContext),
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
