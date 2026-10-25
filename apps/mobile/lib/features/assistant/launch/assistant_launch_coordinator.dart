import 'package:flutter/foundation.dart';
import 'package:mobile/features/assistant/launch/assistant_launch_action.dart';

enum AssistantLaunchWorkspace { ready, loading, missing }

/// Host hooks supplied by the app shell. Each read reflects current state.
class AssistantLaunchHost {
  const AssistantLaunchHost({
    required this.currentActor,
    required this.appLocked,
    required this.workspace,
    required this.openAssistant,
    required this.openWorkspacePicker,
  });

  final String? Function() currentActor;
  final bool Function() appLocked;
  final AssistantLaunchWorkspace Function() workspace;
  final void Function() openAssistant;
  final void Function() openWorkspacePicker;
}

/// Single entry point for shortcut launches across cold, warm and background
/// starts. Holds one pending action until the user is signed in, the app
/// lock is cleared and a workspace is selected, then publishes one request
/// for the Assistant page to claim exactly once.
class AssistantLaunchCoordinator {
  AssistantLaunchCoordinator({
    DateTime Function()? clock,
    this.maxAge = const Duration(minutes: 5),
  }) : _clock = clock ?? DateTime.now;

  static final instance = AssistantLaunchCoordinator();
  static const _recentIdLimit = 32;

  final DateTime Function() _clock;
  final Duration maxAge;
  final _recentIds = <String>{};
  final _request = ValueNotifier<AssistantLaunchRequest?>(null);
  AssistantLaunchHost? _host;
  AssistantLaunchAction? _pending;
  String? _pickerShownFor;

  ValueListenable<AssistantLaunchRequest?> get request => _request;
  AssistantLaunchAction? get pending => _pending;

  void bind(AssistantLaunchHost host) {
    _host = host;
    tryDeliver();
  }

  void unbind(AssistantLaunchHost host) {
    if (identical(_host, host)) _host = null;
  }

  /// Accepts a native action. Repeated ids (cold pull plus warm push, or a
  /// double-fired shortcut) are ignored.
  void submit(AssistantLaunchAction action) {
    if (!_recentIds.add(action.id)) return;
    while (_recentIds.length > _recentIdLimit) {
      _recentIds.remove(_recentIds.first);
    }
    if (_isExpired(action)) return;
    _pending = action;
    _pickerShownFor = null;
    tryDeliver();
  }

  /// Re-evaluates gates. Call on auth, workspace, app-lock and resume changes.
  void tryDeliver() {
    final action = _pending;
    final host = _host;
    if (action == null || host == null) return;
    if (_isExpired(action)) {
      _pending = null;
      return;
    }
    // Signed-out users stay on the router's sign-in redirect; the action is
    // held until sign-in or expiry.
    final actor = host.currentActor();
    if (actor == null) return;
    if (host.appLocked()) return;
    switch (host.workspace()) {
      case AssistantLaunchWorkspace.loading:
        return;
      case AssistantLaunchWorkspace.missing:
        if (_pickerShownFor != action.id) {
          _pickerShownFor = action.id;
          host.openWorkspacePicker();
        }
        return;
      case AssistantLaunchWorkspace.ready:
        break;
    }
    _pending = null;
    _request.value = AssistantLaunchRequest(action: action, actorId: actor);
    host.openAssistant();
  }

  /// Claims [request] for the current actor. Returns false when it was
  /// already claimed, superseded, expired or issued for another actor.
  bool claim(AssistantLaunchRequest request, {required String? actorId}) {
    if (!identical(_request.value, request)) return false;
    _request.value = null;
    return actorId == request.actorId && !_isExpired(request.action);
  }

  /// Drops pending and delivered work when a signed-in actor signs out or
  /// switches accounts. A first sign-in keeps the held action.
  void onActorChanged({required String? previous, required String? next}) {
    if (previous == next) return;
    if (previous != null) {
      _pending = null;
      _request.value = null;
    }
    tryDeliver();
  }

  bool _isExpired(AssistantLaunchAction action) =>
      _clock().difference(action.createdAt) > maxAge;

  @visibleForTesting
  void resetForTest() {
    _host = null;
    _pending = null;
    _pickerShownFor = null;
    _recentIds.clear();
    _request.value = null;
  }
}
