import 'dart:async';

import 'package:flutter/widgets.dart';

/// One timer for every relative time on screen.
///
/// The first listener starts a periodic tick and the last one stops it, so an
/// idle app runs no timer and a list of fifty rows runs one, not fifty. Each
/// `MastermindTimeLabel` listens while mounted and rebuilds on a tick.
class MastermindClock extends ChangeNotifier {
  MastermindClock._();

  static final MastermindClock instance = MastermindClock._();

  /// Well under a minute, so a label is never more than a minute stale.
  static const period = Duration(seconds: 30);

  Timer? _timer;

  /// Whether the shared timer is running: true while anything listens.
  bool get isTicking => _timer != null;

  @override
  void addListener(VoidCallback listener) {
    super.addListener(listener);
    _timer ??= Timer.periodic(period, (_) => notifyListeners());
  }

  @override
  void removeListener(VoidCallback listener) {
    super.removeListener(listener);
    if (!hasListeners) {
      _timer?.cancel();
      _timer = null;
    }
  }
}

/// Rebuilds [builder] with the scoped now on every [MastermindClock] tick.
///
/// A parent whose semantics label carries a spoken age wraps that label in
/// this, so the age is recomputed rather than cached with the rest of the
/// parent until something else rebuilds it.
class MastermindClockBuilder extends StatelessWidget {
  const MastermindClockBuilder({required this.builder, super.key});

  final Widget Function(BuildContext context, DateTime now) builder;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: MastermindClock.instance,
    builder: (context, _) =>
        builder(context, MastermindClockScope.nowOf(context)),
  );
}

/// The reference "now" for relative times, so tests and previews can pin it.
/// Without a scope the wall clock is used.
class MastermindClockScope extends InheritedWidget {
  const MastermindClockScope({
    required this.now,
    required super.child,
    super.key,
  });

  final DateTime Function() now;

  static DateTime nowOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<MastermindClockScope>()
          ?.now() ??
      DateTime.now();

  @override
  bool updateShouldNotify(MastermindClockScope oldWidget) =>
      now != oldWidget.now;
}
