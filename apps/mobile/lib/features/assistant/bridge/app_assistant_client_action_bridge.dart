import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/assistant/bridge/assistant_client_actions.dart';

/// Mira `open_app` destinations mapped to mobile shell routes. Access gates
/// (habits, experimental apps) stay with the router redirects.
const assistantAppDestinationRoutes = <String, String>{
  'home': Routes.home,
  'assistant': Routes.assistant,
  'tasks': Routes.tasks,
  'habits': Routes.habits,
  'calendar': Routes.calendar,
  'finance': Routes.finance,
  'time_tracker': Routes.timer,
  'mail': Routes.mail,
  'drive': Routes.drive,
  'meet': Routes.meet,
  'notes': Routes.notes,
  'chat': Routes.chat,
};

class AppAssistantClientActionBridge implements AssistantClientActionBridge {
  AppAssistantClientActionBridge({
    required void Function(String location) go,
    required Future<bool> Function(String theme, bool Function() isCurrent)
    setTheme,
    required String? Function() currentWorkspaceId,
    required String? Function() currentActorId,
  }) : _go = go,
       _setTheme = setTheme,
       _currentWorkspaceId = currentWorkspaceId,
       _currentActorId = currentActorId;

  final void Function(String location) _go;
  final Future<bool> Function(String theme, bool Function() isCurrent)
  _setTheme;
  final String? Function() _currentWorkspaceId;
  final String? Function() _currentActorId;

  @override
  Set<String> get capabilities => const {'theme', 'navigate'};

  @override
  Future<AssistantClientActionResult> apply(
    String toolName,
    Map<String, dynamic> output, {
    bool Function()? isCurrent,
  }) async {
    if (output['success'] != true || output.containsKey('error')) {
      return const AssistantClientActionResult.rejected('not_successful');
    }
    // An action belongs to the actor and workspace that requested it; a
    // sign-out, account or workspace switch cancels it, as does the caller.
    final actor = _currentActorId();
    final workspace = _currentWorkspaceId();
    bool current() =>
        (isCurrent?.call() ?? true) &&
        _currentActorId() == actor &&
        _currentWorkspaceId() == workspace;
    if (!current()) return const AssistantClientActionResult.rejected('stale');
    switch (toolName) {
      case 'set_theme':
        final theme = output['theme'];
        if (theme is! String ||
            !const ['light', 'dark', 'system'].contains(theme)) {
          return const AssistantClientActionResult.rejected('invalid_theme');
        }
        final applied = await _setTheme(theme, current);
        if (applied) return const AssistantClientActionResult.applied();
        return AssistantClientActionResult.rejected(
          current() ? 'theme_not_saved' : 'stale',
        );
      case 'open_app':
        final route = assistantAppDestinationRoutes[output['destination']];
        if (route == null) {
          return const AssistantClientActionResult.rejected(
            'unknown_destination',
          );
        }
        // Mobile routes follow the selected workspace; never show another
        // workspace's app under the current one.
        final wsId = output['wsId'];
        if (wsId is String && workspace != null && wsId != workspace) {
          return const AssistantClientActionResult.rejected(
            'workspace_mismatch',
          );
        }
        _go(route);
        return const AssistantClientActionResult.applied();
      default:
        return const AssistantClientActionResult.unsupported();
    }
  }
}
