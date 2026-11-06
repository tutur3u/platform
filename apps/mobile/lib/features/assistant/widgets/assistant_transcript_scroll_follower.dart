import 'package:flutter/widgets.dart';

/// Keeps streaming output pinned to the bottom only while the user is there.
///
/// Following is a statement of user intent, not of distance: any user drag
/// toward older messages detaches immediately (even a few pixels from the
/// bottom), and only the user returning to the bottom, an explicit jump, or a
/// new send re-attaches it. Programmatic jumps never change intent, and no
/// jump happens while a finger rests on the transcript.
class AssistantTranscriptScrollFollower {
  AssistantTranscriptScrollFollower({
    required this.controller,
    required this.onVisibilityChanged,
    this.reattachDistance = 24,
  });

  final ScrollController controller;

  /// Reports whether a "jump to latest" affordance should be visible.
  final ValueChanged<bool> onVisibilityChanged;
  final double reattachDistance;
  bool _following = true;
  bool _userScrolling = false;
  int _pointers = 0;
  bool _scheduled = false;
  bool _disposed = false;

  bool get following => _following;

  void suspend() {
    _following = false;
    _userScrolling = false;
  }

  void resume() {
    _following = true;
    _userScrolling = false;
  }

  void pointerDown() => _pointers++;

  void pointerUp() {
    if (_pointers > 0) _pointers--;
  }

  bool observeNotification(ScrollNotification notification) {
    if (_disposed || notification.depth != 0) return false;
    if (notification is ScrollStartNotification &&
        notification.dragDetails != null) {
      _userScrolling = true;
    } else if (notification is ScrollUpdateNotification &&
        notification.dragDetails != null &&
        (notification.scrollDelta ?? 0) < 0) {
      // Reading back through history: stop following at once.
      _following = false;
      _userScrolling = true;
      _reportVisibility();
    } else if (notification is ScrollEndNotification) {
      if (_userScrolling &&
          notification.metrics.extentAfter <= reattachDistance) {
        _following = true;
      }
      _userScrolling = false;
      _reportVisibility();
    }
    return false;
  }

  /// Retained for callers that observe raw offsets; intent comes from
  /// [observeNotification].
  void observeScroll() {}

  void followUpdate() {
    if (_disposed || _scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (_disposed || !controller.hasClients) return;
      final position = controller.position;
      if (_following &&
          _pointers == 0 &&
          !_userScrolling &&
          position.pixels != position.maxScrollExtent) {
        controller.jumpTo(position.maxScrollExtent);
      }
      _reportVisibility();
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  void _reportVisibility() {
    if (_disposed || !controller.hasClients) return;
    final position = controller.position;
    if (!position.hasContentDimensions) return;
    onVisibilityChanged(!_following && position.extentAfter > reattachDistance);
  }

  void dispose() => _disposed = true;
}
