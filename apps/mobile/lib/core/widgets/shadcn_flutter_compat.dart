import 'package:flutter/material.dart' hide showDialog;
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

export 'package:shadcn_flutter/shadcn_flutter.dart';

/// Compatibility wrapper for the Future-based dialog helper removed in
/// shadcn_flutter 0.0.53.
Future<T?> showDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool useRootNavigator = true,
  bool barrierDismissible = true,
  Color? barrierColor,
  String? barrierLabel,
  bool useSafeArea = true,
  RouteSettings? routeSettings,
  Offset? anchorPoint,
  TraversalEdgeBehavior? traversalEdgeBehavior,
  AlignmentGeometry? alignment,
  bool fullScreen = false,
}) {
  return shad.DialogConfiguration<T>(
    builder: builder,
    useRootNavigator: useRootNavigator,
    barrierDismissible: barrierDismissible,
    barrierColor: barrierColor,
    barrierLabel: barrierLabel,
    useSafeArea: useSafeArea,
    routeSettings: routeSettings,
    anchorPoint: anchorPoint,
    traversalEdgeBehavior: traversalEdgeBehavior,
    alignment: alignment,
    fullScreen: fullScreen,
  ).show(context).future;
}

/// Compatibility wrapper for the Future-based drawer helper removed in
/// shadcn_flutter 0.0.53.
Future<T?> openDrawer<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  required shad.OverlayPosition position,
  bool expands = false,
  bool draggable = true,
  bool barrierDismissible = true,
  WidgetBuilder? backdropBuilder,
  bool useSafeArea = true,
  bool? showDragHandle,
  BorderRadiusGeometry? borderRadius,
  Size? dragHandleSize,
  bool transformBackdrop = true,
  double? surfaceOpacity,
  double? surfaceBlur,
  Color? barrierColor,
  AnimationController? animationController,
  BoxConstraints? constraints,
  AlignmentGeometry? alignment,
}) {
  return shad
      .openDrawerOverlay<T>(
        context: context,
        builder: builder,
        position: position,
        expands: expands,
        draggable: draggable,
        barrierDismissible: barrierDismissible,
        backdropBuilder: backdropBuilder,
        useSafeArea: useSafeArea,
        showDragHandle: showDragHandle,
        borderRadius: borderRadius,
        dragHandleSize: dragHandleSize,
        transformBackdrop: transformBackdrop,
        surfaceOpacity: surfaceOpacity,
        surfaceBlur: surfaceBlur,
        barrierColor: barrierColor,
        animationController: animationController,
        constraints: constraints,
        alignment: alignment,
      )
      .future;
}
