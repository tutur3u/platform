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

  bool observeNotification(ScrollNotification notification) {
    if (_disposed || notification.depth != 0) return false;
    if (notification is ScrollStartNotification &&
        notification.dragDetails != null) {
      _userScrolling = true;
    }
    if (notification is ScrollEndNotification) {
      observeScroll();
      _userScrolling = false;
    }
    return false;
  }

  void observeScroll() {
    if (_disposed || !controller.hasClients) return;
    if (_userScrolling) {
      _following = controller.position.extentAfter < threshold;
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
      final userMotion = _userScrolling && position.isScrollingNotifier.value;
      if (_following && !userMotion) {
        controller.jumpTo(position.maxScrollExtent);
      }
      onVisibilityChanged(position.extentAfter >= threshold);
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void dispose() => _disposed = true;
}
