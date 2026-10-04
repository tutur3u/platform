import 'package:flutter/material.dart';

/// Local presentation portal, owned and disposed by the shell. Registrations
/// never enter application state and cannot outlive their page.
class ShellDockSlotController extends ChangeNotifier {
  bool _disposed = false;
  Object? _owner;
  ShellDockSlot? _slot;
  ShellDockSlot? get slot => _slot;

  @override
  void dispose() {
    _disposed = true;
    _slot = null;
    super.dispose();
  }

  void publish(Object owner, ShellDockSlot slot) {
    if (_disposed) return;
    _owner = owner;
    _slot = slot;
    notifyListeners();
  }

  void remove(Object owner) {
    if (_disposed || !identical(owner, _owner)) return;
    _owner = null;
    _slot = null;
    notifyListeners();
  }
}

class ShellDockSlot {
  const ShellDockSlot({
    required this.location,
    required this.composing,
    required this.content,
    required this.primary,
    this.workspaceId,
  });
  final String location;
  final String? workspaceId;
  final bool composing;
  final Widget content;
  final Widget primary;
}

class ShellDockScope extends InheritedWidget {
  const ShellDockScope({
    required this.controller,
    required super.child,
    super.key,
  });
  final ShellDockSlotController controller;
  static ShellDockSlotController? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ShellDockScope>()?.controller;
  @override
  bool updateShouldNotify(ShellDockScope oldWidget) =>
      !identical(controller, oldWidget.controller);
}

/// Publishes after layout, with a token fencing delayed updates and disposal.
/// The cached page retains its controllers; only presentation moves.
class ShellDockPublisher extends StatefulWidget {
  const ShellDockPublisher({required this.slot, super.key});
  final ShellDockSlot slot;
  @override
  State<ShellDockPublisher> createState() => _ShellDockPublisherState();
}

class _ShellDockPublisherState extends State<ShellDockPublisher> {
  final Object _owner = Object();
  ShellDockSlotController? _controller;
  int _generation = 0;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final controller = ShellDockScope.maybeOf(context);
    if (!identical(controller, _controller)) {
      _controller?.remove(_owner);
      _controller = controller;
    }
    _publish();
  }

  @override
  void didUpdateWidget(ShellDockPublisher oldWidget) {
    super.didUpdateWidget(oldWidget);
    _publish();
  }

  void _publish() {
    final generation = ++_generation;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && generation == _generation) {
        _controller?.publish(_owner, widget.slot);
      }
    });
  }

  @override
  void dispose() {
    _generation++;
    // Defer notifications while ancestors may themselves be unmounting.
    final controller = _controller;
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => controller?.remove(_owner),
    );
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
