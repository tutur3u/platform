import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' hide AlertDialog;
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

bool _hasDrawerOverlay(BuildContext context) {
  var hasOverlay = false;
  context.visitAncestorElements((element) {
    if (element.widget.runtimeType.toString() == 'DrawerOverlay') {
      hasOverlay = true;
      return false;
    }
    return true;
  });
  return hasOverlay;
}

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
}) {
  if (context.isCompact) {
    return showModalBottomSheet<T>(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.48),
      isScrollControlled: isScrollControlled,
      useSafeArea: useSafeArea,
      builder: (sheetContext) => BackButtonListener(
        onBackButtonPressed: () async {
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
  if (context.isCompact) {
    Widget drawerContent(BuildContext drawerContext) => BackButtonListener(
      onBackButtonPressed: () async {
        if (drawerContext.mounted) {
          await shad.closeOverlay<void>(drawerContext);
        }
        return true;
      },
      child: builder(drawerContext),
    );

    if (_hasDrawerOverlay(context)) {
      await shad.openDrawer<void>(
        context: context,
        position: shad.OverlayPosition.bottom,
        builder: drawerContent,
      );
      return;
    }

    if (kDebugMode) {
      debugPrint(
        'showAdaptiveDrawer fallback: DrawerOverlay missing; '
        'using modal bottom sheet.',
      );
    }
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.48),
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => BackButtonListener(
        onBackButtonPressed: () async {
          if (sheetContext.mounted) {
            await Navigator.maybePop(sheetContext);
          }
          return true;
        },
        child: builder(sheetContext),
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
