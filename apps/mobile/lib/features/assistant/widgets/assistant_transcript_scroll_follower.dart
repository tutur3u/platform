import 'package:flutter/material.dart';

/// Passive output follows the latest layout without racing animated user jumps.
class AssistantTranscriptScrollFollower {
  AssistantTranscriptScrollFollower({
    required this.controller,
    required this.onVisibilityChanged,
    this.threshold = 160,
  });

  final ScrollController controller;
  final ValueChanged<bool> onVisibilityChanged;
  final double threshold;
  bool _following = true;
  bool _userScrolling = false;
  bool _scheduled = false;
  bool _disposed = false;

  void resume() {
    _following = true;
    _userScrolling = false;
  }

  void observeScroll() {
    if (_disposed || !controller.hasClients) return;
    final position = controller.position;
    if (position.activity is DragScrollActivity) _userScrolling = true;
    if (_userScrolling) {
      _following = position.extentAfter < threshold;
      if (position.activity is! DragScrollActivity &&
          position.activity is! BallisticScrollActivity) {
        _userScrolling = false;
      }
    }
  }

  void followUpdate() {
    if (_disposed || _scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (_disposed || !controller.hasClients) return;
      final position = controller.position;
      // A drag wins even when it starts after output scheduled this frame.
      final userMotion =
          position.activity is DragScrollActivity ||
          (_userScrolling && position.activity is BallisticScrollActivity);
      if (_following && !userMotion) {
        controller.jumpTo(position.maxScrollExtent);
      }
      onVisibilityChanged(position.extentAfter >= threshold);
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void dispose() => _disposed = true;
}
