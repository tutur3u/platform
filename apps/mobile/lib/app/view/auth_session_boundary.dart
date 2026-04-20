import 'package:flutter/widgets.dart';

class AuthSessionBoundary extends StatelessWidget {
  const AuthSessionBoundary({
    required this.identity,
    required this.child,
    super.key,
  });

  final String? identity;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return KeyedSubtree(
      key: ValueKey<String>(identity ?? 'anonymous'),
      child: child,
    );
  }
}
