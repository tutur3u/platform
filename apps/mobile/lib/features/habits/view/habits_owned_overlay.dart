import 'package:flutter/material.dart';

/// Remove only the route owned by the departed Habits session, even when
/// another modal covers it. Never pop an unrelated account's navigation.
class HabitsOwnedOverlay extends StatefulWidget {
  const HabitsOwnedOverlay({
    required this.alive,
    required this.child,
    super.key,
  });
  final ValueNotifier<bool> alive;
  final Widget child;
  @override
  State<HabitsOwnedOverlay> createState() => HabitsOwnedOverlayState();
}

class HabitsOwnedOverlayState extends State<HabitsOwnedOverlay> {
  var _listening = false;
  @override
  void initState() {
    super.initState();
    _listening = widget.alive.value;
    if (_listening) widget.alive.addListener(_ownerChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!widget.alive.value) _ownerChanged();
  }

  void _ownerChanged() {
    if (widget.alive.value || !mounted) return;
    final route = ModalRoute.of(context);
    final navigator = Navigator.of(context);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (route != null && route.isActive && navigator.mounted) {
        navigator.removeRoute(route);
      }
    });
    // A covered, settled route may have no frame scheduled for cleanup.
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    if (_listening) widget.alive.removeListener(_ownerChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      widget.alive.value ? widget.child : const SizedBox.shrink();
}
