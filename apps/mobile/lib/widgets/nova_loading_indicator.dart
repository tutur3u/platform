import 'package:flutter/material.dart';

class NovaLoadingIndicator extends StatefulWidget {
  const NovaLoadingIndicator({
    this.size = 56,
    super.key,
  });

  final double size;

  static const Duration _spinDuration = Duration(milliseconds: 680);

  @override
  State<NovaLoadingIndicator> createState() => _NovaLoadingIndicatorState();
}

class _NovaLoadingIndicatorState extends State<NovaLoadingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: NovaLoadingIndicator._spinDuration,
  )..repeat();
  late final Animation<double> _turns =
      Tween<double>(
        begin: 0,
        end: 1,
      ).animate(
        CurvedAnimation(
          parent: _controller,
          curve: Curves.easeInOutCubicEmphasized,
        ),
      );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RotationTransition(
      turns: _turns,
      child: Image.asset(
        'assets/logos/nova-transparent.png',
        width: widget.size,
        height: widget.size,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
      ),
    );
  }
}
