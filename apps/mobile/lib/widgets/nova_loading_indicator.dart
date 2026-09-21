import 'package:flutter/material.dart';

export 'nova_refresh_indicator.dart';

class NovaLoadingIndicator extends StatefulWidget {
  const NovaLoadingIndicator({
    this.size = 56,
    this.repeat = true,
    this.play = true,
    super.key,
  });

  final double size;
  final bool repeat;
  final bool play;

  static const Duration _spinDuration = Duration(milliseconds: 680);

  @override
  State<NovaLoadingIndicator> createState() => _NovaLoadingIndicatorState();
}

class _NovaLoadingIndicatorState extends State<NovaLoadingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: NovaLoadingIndicator._spinDuration,
  );
  late final Animation<double> _turns = Tween<double>(begin: 0, end: 1).animate(
    CurvedAnimation(
      parent: _controller,
      curve: Curves.easeInOutCubicEmphasized,
    ),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!widget.play || MediaQuery.disableAnimationsOf(context)) {
      _controller
        ..stop()
        ..value = 0;
    } else if (!_controller.isAnimating) {
      if (widget.repeat) {
        _controller.repeat();
      } else {
        _controller.forward();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SizedBox.square(
        dimension: widget.size,
        child: RotationTransition(
          turns: _turns,
          child: RepaintBoundary(
            child: Image.asset(
              'assets/logos/nova-transparent.png',
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
            ),
          ),
        ),
      ),
    );
  }
}
