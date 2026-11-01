import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';

/// Whether [path] is the Mastermind mini-app root or any route under it.
///
/// Every one of these renders hub text (For you, Decided, Journal, item
/// detail, Work, Ship, Insights), so the app-switcher rule does not depend on
/// what a given screen happens to hold.
bool isMastermindPath(String path) =>
    path == Routes.mastermind || path.startsWith('${Routes.mastermind}/');

/// Obscures the app while it is not in the foreground, on `/mastermind/**`
/// only (SB-100 L2).
///
/// The OS captures the app-switcher snapshot as the app leaves the foreground,
/// so the cover is built on `inactive`, `hidden` and `paused` alike. A blur
/// alone can leave large type readable, so it sits under a mostly opaque
/// surface tint. Screenshots are deliberately untouched: Mastermind is
/// owner-only, and only the switcher thumbnail is covered.
class MastermindPrivacyShield extends StatefulWidget {
  const MastermindPrivacyShield({
    required this.child,
    required this.location,
    this.locationChanges,
    super.key,
  });

  final Widget child;

  /// The current router path, read on every build and lifecycle change.
  final String Function() location;

  /// Notifies when [location] may have changed (the router delegate).
  final Listenable? locationChanges;

  @override
  State<MastermindPrivacyShield> createState() =>
      _MastermindPrivacyShieldState();
}

class _MastermindPrivacyShieldState extends State<MastermindPrivacyShield>
    with WidgetsBindingObserver {
  // A null lifecycle (before the first frame, or in a bare test) is foreground.
  bool _foreground =
      (WidgetsBinding.instance.lifecycleState ?? AppLifecycleState.resumed) ==
      AppLifecycleState.resumed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final foreground = state == AppLifecycleState.resumed;
    if (foreground != _foreground) setState(() => _foreground = foreground);
  }

  Widget _stack(BuildContext context) {
    final covered = !_foreground && isMastermindPath(widget.location());
    return Stack(
      fit: StackFit.passthrough,
      children: [
        widget.child,
        if (covered)
          Positioned.fill(
            child: ExcludeSemantics(
              child: IgnorePointer(
                child: BackdropFilter(
                  key: const ValueKey('mastermind-privacy-shield'),
                  filter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
                  child: ColoredBox(
                    color: Theme.of(
                      context,
                    ).colorScheme.surface.withValues(alpha: 0.92),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final changes = widget.locationChanges;
    return changes == null
        ? _stack(context)
        : ListenableBuilder(
            listenable: changes,
            builder: (context, _) => _stack(context),
          );
  }
}
