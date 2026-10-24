import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

/// Identity and controls of the sheet or dialog that encloses a context.
///
/// Provided by [AppModalBinding]; read it with [AppModalScope.maybeOf] to
/// close the overlay or register modal shell actions (such as a dynamic
/// search) under the overlay's owner id.
class AppModalScope extends InheritedWidget {
  const AppModalScope({
    required this.ownerId,
    required this.close,
    required this.chrome,
    required super.child,
    this.scrollController,
    this.expands = false,
    super.key,
  });

  /// Shell chrome owner id shared by every registration of this overlay.
  final String ownerId;

  /// Closes this overlay when it is the topmost route; otherwise no-op.
  final Future<void> Function() close;

  /// The shell chrome registry, or `null` outside the shell.
  final ShellChromeActionsCubit? chrome;

  /// Scroll controller of a detented sheet; bodies must attach it so dragging
  /// the content resizes the sheet.
  final ScrollController? scrollController;

  /// Whether the overlay has a fixed height that the body should fill.
  final bool expands;

  static AppModalScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppModalScope>();

  @override
  bool updateShouldNotify(AppModalScope oldWidget) =>
      ownerId != oldWidget.ownerId ||
      chrome != oldWidget.chrome ||
      scrollController != oldWidget.scrollController ||
      expands != oldWidget.expands;
}

/// Gives a sheet or dialog route correct Back semantics.
///
/// Every Back source closes the topmost overlay first and never pops the
/// route underneath:
/// - Android system Back, through a [BackButtonListener] that takes priority
///   over the shell's listener;
/// - the shell's `didPopRoute` and floating-dock Back, which resolve
///   `ShellChromeActionsState.backForLocation` to this binding's modal
///   registration before any page handler.
///
/// The registration is removed when the route is disposed.
class AppModalBinding extends StatefulWidget {
  const AppModalBinding({
    required this.child,
    this.dismissible = true,
    this.scrollController,
    this.expands = false,
    super.key,
  });

  final Widget child;
  final bool expands;

  /// When false, Back is consumed without closing (blocking flows).
  final bool dismissible;
  final ScrollController? scrollController;

  @override
  State<AppModalBinding> createState() => _AppModalBindingState();
}

class _AppModalBindingState extends State<AppModalBinding> {
  late final String _ownerId = 'app-modal#${identityHashCode(this)}';
  ShellChromeActionsCubit? _chrome;
  bool _closing = false;

  String get _registrationId => '$_ownerId/back';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    ShellChromeActionsCubit? next;
    try {
      next = context.read<ShellChromeActionsCubit?>();
    } on ProviderNotFoundException {
      next = null;
    }
    if (next != _chrome) {
      _chrome?.unregister(_registrationId);
      _chrome = next;
      _chrome?.register(
        registrationId: _registrationId,
        ownerId: _ownerId,
        locations: const {},
        actions: const [],
        modal: true,
        onBack: _close,
      );
    }
  }

  Future<void> _close() async {
    if (!mounted || _closing) return;
    final route = ModalRoute.of(context);
    // A dialog above this sheet owns Back until it closes.
    if (route == null || !route.isCurrent) return;
    if (!widget.dismissible) return;
    _closing = true;
    try {
      await Navigator.of(context).maybePop();
    } finally {
      if (mounted) _closing = false;
    }
  }

  @override
  void dispose() {
    final chrome = _chrome;
    // Unregister every registration of this overlay (back and search).
    if (chrome != null && !chrome.isClosed) chrome.dismissOwner(_ownerId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppModalScope(
      ownerId: _ownerId,
      close: _close,
      chrome: _chrome,
      scrollController: widget.scrollController,
      expands: widget.expands,
      child: widget.child,
    );
    // Without a Router, system Back already pops the topmost route.
    if (Router.maybeOf(context)?.backButtonDispatcher == null) return scope;
    return BackButtonListener(
      onBackButtonPressed: () async {
        unawaited(_close());
        return true;
      },
      child: scope,
    );
  }
}
