import 'package:flutter/widgets.dart';

class AuthSessionBoundary extends StatefulWidget {
  const AuthSessionBoundary({
    required this.identity,
    required this.child,
    super.key,
  });

  final String? identity;
  final Widget child;

  @override
  State<AuthSessionBoundary> createState() => _AuthSessionBoundaryState();
}

class _AuthSessionBoundaryState extends State<AuthSessionBoundary> {
  bool _tearingDown = false;
  int _generation = 0;

  @override
  void didUpdateWidget(covariant AuthSessionBoundary oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.identity == widget.identity) return;

    // Give Flutter a frame to dispose the navigator's global keys and the
    // routes, controllers and overlays owned by the departing account.
    _tearingDown = true;
    final generation = ++_generation;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || generation != _generation) return;
      setState(() => _tearingDown = false);
    });
  }

  @override
  Widget build(BuildContext context) =>
      _tearingDown ? const SizedBox.expand() : widget.child;
}
