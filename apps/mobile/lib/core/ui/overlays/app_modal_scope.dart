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
    this.shellChromeVisible = false,
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

  /// Whether the shell's top navbar and floating dock stay visible above this
  /// overlay: it sits on the shell's nested navigator. Root-navigator overlays
  /// cover the chrome, so they must not place controls there.
  final bool shellChromeVisible;

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
      shellChromeVisible != oldWidget.shellChromeVisible ||
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
/// The registration is retired as soon as the route starts popping (its
/// animation reverses or `popped` completes, including external pops), so
/// Back during the exit transition reaches the overlay beneath. It is
/// removed entirely when the route is disposed.
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
  static int _nextId = 0;
  final String _ownerId = 'app-modal#${_nextId++}';
  ShellChromeActionsCubit? _chrome;
  ModalRoute<dynamic>? _route;
  bool _closing = false;
  bool _retired = false;
  bool _shellChromeVisible = false;

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
    final navigator = Navigator.maybeOf(context);
    _shellChromeVisible =
        next != null &&
        navigator != null &&
        navigator != Navigator.maybeOf(context, rootNavigator: true);
    final route = ModalRoute.of(context);
    if (route != _route) {
      _route?.animation?.removeStatusListener(_onRouteStatus);
      _route = route;
      route?.animation?.addStatusListener(_onRouteStatus);
      unawaited(route?.popped.then((_) => _retire()));
    }
    if (next != _chrome) {
      _chrome?.unregister(_registrationId);
      _chrome = next;
      if (_retired) return;
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

  void _onRouteStatus(AnimationStatus status) {
    if (status == AnimationStatus.reverse ||
        status == AnimationStatus.dismissed) {
      _retire();
    }
  }

  void _retire() {
    if (_retired) return;
    _retired = true;
    final chrome = _chrome;
    if (chrome != null && !chrome.isClosed) chrome.retireOwner(_ownerId);
  }

  /// Android Back via the router's dispatcher. Declines (returns false) when
  /// this overlay is departing or another route is above it, so the
  /// dispatcher offers Back to the next listener instead of swallowing it.
  Future<bool> _onSystemBack() async {
    if (!mounted || _retired) return false;
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) return false;
    if (!widget.dismissible) return true;
    unawaited(_close());
    return true;
  }

  Future<void> _close() async {
    if (!mounted || _closing || _retired) return;
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
    _route?.animation?.removeStatusListener(_onRouteStatus);
    final chrome = _chrome;
    // Unregister every registration of this overlay (back and search).
    if (chrome != null && !chrome.isClosed) {
      chrome
        ..dismissOwner(_ownerId)
        ..forgetOwner(_ownerId);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppModalScope(
      ownerId: _ownerId,
      close: _close,
      chrome: _chrome,
      shellChromeVisible: _shellChromeVisible,
      scrollController: widget.scrollController,
      expands: widget.expands,
      child: widget.child,
    );
    // Without a Router, system Back already pops the topmost route.
    if (Router.maybeOf(context)?.backButtonDispatcher == null) return scope;
    return BackButtonListener(
      // A stable tear-off: a fresh closure per build would make the
      // listener re-take dispatcher priority above overlays opened later.
      onBackButtonPressed: _onSystemBack,
      child: scope,
    );
  }
}
