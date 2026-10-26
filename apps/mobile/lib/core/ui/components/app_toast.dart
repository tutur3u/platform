import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_alert.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Handle to a visible toast.
class AppToastHandle {
  AppToastHandle._(this._entry);

  final OverlayEntry _entry;
  Timer? _timer;
  bool _closed = false;

  bool get isOpen => !_closed;

  void _onDisposed() {
    _timer?.cancel();
    _closed = true;
    if (identical(_current, this)) _current = null;
  }

  void close() {
    if (_closed) return;
    _closed = true;
    _timer?.cancel();
    _entry.remove();
    if (identical(_current, this)) _current = null;
  }
}

AppToastHandle? _current;

/// Shows a transient message above the floating dock. Replaces
/// `shad.showToast` and ad-hoc `ScaffoldMessenger` snack bars.
///
/// Only one toast is visible at a time; a new toast replaces the previous one.
/// The bottom offset reads the caller's `MediaQuery.padding.bottom`, which the
/// shell publishes as dock clearance. Taller page content may supply an
/// additional clearance without reducing the shell minimum.
AppToastHandle showAppToast(
  BuildContext context, {
  required String message,
  String? title,
  AppAlertVariant variant = AppAlertVariant.neutral,
  String? actionLabel,
  VoidCallback? onAction,
  Duration duration = const Duration(seconds: 4),
  double? bottomClearance,
}) {
  _current?.close();
  final overlay = Overlay.of(context, rootOverlay: true);
  final clearance = MediaQuery.paddingOf(context).bottom;
  final bottom =
      math.max(clearance, bottomClearance ?? clearance) + AppSpacing.md;
  late final AppToastHandle handle;
  final entry = OverlayEntry(
    builder: (overlayContext) => Positioned(
      left: AppSpacing.lg,
      right: AppSpacing.lg,
      bottom: bottom,
      child: SafeArea(
        top: false,
        child: _AppToast(
          message: message,
          title: title,
          variant: variant,
          actionLabel: actionLabel,
          onAction: onAction == null
              ? null
              : () {
                  handle.close();
                  onAction();
                },
          onDismiss: () => handle.close(),
          onDispose: handle._onDisposed,
        ),
      ),
    ),
  );
  handle = AppToastHandle._(entry);
  overlay.insert(entry);
  handle._timer = Timer(duration, handle.close);
  _current = handle;
  return handle;
}

class _AppToast extends StatefulWidget {
  const _AppToast({
    required this.message,
    required this.variant,
    required this.onDismiss,
    required this.onDispose,
    this.title,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final String? title;
  final AppAlertVariant variant;
  final String? actionLabel;
  final VoidCallback? onAction;
  final VoidCallback onDismiss;
  final VoidCallback onDispose;

  @override
  State<_AppToast> createState() => _AppToastState();
}

class _AppToastState extends State<_AppToast> {
  @override
  void dispose() {
    widget.onDispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 480),
        child: Dismissible(
          key: const ValueKey('app-toast'),
          onDismissed: (_) => widget.onDismiss(),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.sm),
              boxShadow: AppElevation.overlay(tokens.colorScheme),
            ),
            child: Material(
              type: MaterialType.transparency,
              child: AppAlert(
                variant: widget.variant,
                title: widget.title == null ? null : Text(widget.title!),
                content: Text(widget.message),
                trailing: widget.actionLabel == null
                    ? null
                    : AppButton.ghost(
                        onPressed: widget.onAction,
                        child: Text(widget.actionLabel!),
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
