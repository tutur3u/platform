import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/ui/overlays/app_modal_scope.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

part 'app_sheet_surface.dart';

/// Height policy of a compact sheet.
enum AppSheetSize {
  /// Content height, capped at [AppSheetSize.large].
  fit,

  /// Opens at about 60% and can be dragged up to large (two detents).
  medium,

  /// 94% of the space below the shell header.
  large,

  /// All of the space below the shell header.
  full,
}

const _barrier = Color(0x7A000000);
const _largeFraction = 0.94;

/// Opens a bottom sheet on compact screens and a centred dialog elsewhere.
///
/// The sheet opens on the nearest navigator, so inside the shell it sits
/// below the shell's top navbar and floating dock, which stay usable for
/// dynamic search and Back. Back (system, dock or shell) closes this sheet
/// first; see [AppModalBinding]. Use `useRootNavigator` only for flows that
/// must cover the shell chrome.
Future<T?> showAppSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  AppSheetSize size = AppSheetSize.fit,
  bool isDismissible = true,
  bool enableDrag = true,
  bool useRootNavigator = false,
  double maxDialogWidth = 560,
}) {
  if (!context.isCompact) {
    return showAppDialog<T>(
      context: context,
      builder: builder,
      barrierDismissible: isDismissible,
      useRootNavigator: useRootNavigator,
      maxWidth: maxDialogWidth,
    );
  }
  return showModalBottomSheet<T>(
    context: context,
    useRootNavigator: useRootNavigator,
    isScrollControlled: true,
    useSafeArea: true,
    isDismissible: isDismissible,
    enableDrag: enableDrag,
    backgroundColor: Colors.transparent,
    barrierColor: _barrier,
    elevation: 0,
    builder: (sheetContext) {
      Widget frame(ScrollController? controller, {required bool expands}) =>
          AppModalBinding(
            dismissible: isDismissible,
            scrollController: controller,
            expands: expands,
            child: AppSheetSurface(
              showHandle: enableDrag,
              expands: expands,
              // Build below the host so the body sees the consumed keyboard
              // inset and the modal scope, never the raw view insets.
              child: Builder(builder: builder),
            ),
          );
      return switch (size) {
        AppSheetSize.fit => AppSheetKeyboardInset(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight:
                  MediaQuery.sizeOf(sheetContext).height * _largeFraction,
            ),
            child: frame(null, expands: false),
          ),
        ),
        AppSheetSize.medium => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.6,
          maxChildSize: _largeFraction,
          snap: true,
          snapSizes: const [0.6],
          builder: (_, controller) => frame(controller, expands: true),
        ),
        AppSheetSize.large => FractionallySizedBox(
          heightFactor: _largeFraction,
          child: frame(null, expands: true),
        ),
        AppSheetSize.full => frame(null, expands: true),
      };
    },
  );
}

/// Opens a centred dialog with the same Back semantics as [showAppSheet].
/// Use `AppDialog` or `AppSheetScaffold` as the body.
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
  bool useRootNavigator = false,
  double maxWidth = 440,
  bool? requestFocus,
}) => showDialog<T>(
  requestFocus: requestFocus,
  context: context,
  useRootNavigator: useRootNavigator,
  barrierDismissible: barrierDismissible,
  barrierColor: _barrier,
  builder: (dialogContext) => AppModalBinding(
    dismissible: barrierDismissible,
    child: AppSheetKeyboardInset(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: maxWidth,
                maxHeight: MediaQuery.sizeOf(dialogContext).height * 0.85,
              ),
              child: AppSheetSurface(
                dialog: true,
                child: Builder(builder: builder),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
);
