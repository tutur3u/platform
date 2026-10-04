import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/widgets/assistant_dock_surface.dart';

/// One clipped glass surface for all anchored popup rows, not separate pills.
class AssistantComposerMenuSurface<T> extends PopupMenuEntry<T> {
  const AssistantComposerMenuSurface({required this.entries, super.key});
  final List<PopupMenuEntry<T>> entries;
  @override
  double get height => entries.fold(0, (total, entry) => total + entry.height);
  @override
  bool represents(T? value) => entries.any((entry) => entry.represents(value));
  @override
  State<AssistantComposerMenuSurface<T>> createState() =>
      _AssistantComposerMenuSurfaceState<T>();
}

class _AssistantComposerMenuSurfaceState<T>
    extends State<AssistantComposerMenuSurface<T>> {
  @override
  Widget build(BuildContext context) => AssistantDockSurface(
    child: Column(mainAxisSize: MainAxisSize.min, children: widget.entries),
  );
}
