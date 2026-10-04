import 'dart:async';

import 'package:flutter/material.dart';

/// Shared dock policy for IME visibility and hardware search focus.
/// Visibility lives with the rendered shell and has no global hidden flag.
class ShellKeyboardChrome extends StatefulWidget {
  const ShellKeyboardChrome({
    this.child,
    this.builder,
    this.keyboardVisible = false,
    this.keepVisible = false,
    super.key,
  }) : assert(child != null || builder != null, 'Provide a child or builder');
  final Widget? child;
  final bool keyboardVisible;
  final bool keepVisible;
  final Widget Function(
    BuildContext context, {
    required bool hidden,
    required bool settled,
  })?
  builder;

  @override
  State<ShellKeyboardChrome> createState() => _ShellKeyboardChromeState();
}

class _ShellKeyboardChromeState extends State<ShellKeyboardChrome> {
  Timer? _hideTimer;
  bool _hidden = false;
  bool _settled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _updateVisibility();
  }

  @override
  void didUpdateWidget(covariant ShellKeyboardChrome oldWidget) {
    super.didUpdateWidget(oldWidget);
    _updateVisibility();
  }

  void _updateVisibility() {
    final textFocused =
        FocusManager.instance.primaryFocus?.debugLabel == 'shell-search';
    final hidden =
        !widget.keepVisible &&
        (widget.keyboardVisible ||
            MediaQuery.viewInsetsOf(context).bottom > 0 ||
            textFocused);
    if (hidden == _hidden) return;
    _hideTimer?.cancel();
    _hidden = hidden;
    _settled = false;
    if (hidden) {
      if (MediaQuery.disableAnimationsOf(context)) {
        _settled = true;
      } else {
        _hideTimer = Timer(const Duration(milliseconds: 240), () {
          if (mounted && _hidden) setState(() => _settled = true);
        });
      }
    }
  }

  @override
  void initState() {
    super.initState();
    FocusManager.instance.addListener(_focusChanged);
  }

  void _focusChanged() {
    if (mounted) setState(_updateVisibility);
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    FocusManager.instance.removeListener(_focusChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.builder != null) {
      return widget.builder!(context, hidden: _hidden, settled: _settled);
    }
    final duration = MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 200);
    return ExcludeSemantics(
      excluding: _hidden,
      child: IgnorePointer(
        ignoring: _hidden,
        child: AnimatedSlide(
          duration: duration,
          curve: Curves.easeOutCubic,
          offset: _hidden ? const Offset(0, 1.3) : Offset.zero,
          child: AnimatedOpacity(
            duration: duration,
            opacity: _hidden ? 0 : 1,
            child: Offstage(offstage: _hidden && _settled, child: widget.child),
          ),
        ),
      ),
    );
  }
}
