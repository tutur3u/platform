/// Metadata shared with Mira Live only when the user opts in to browsing mode.
/// No screen text, query parameters, or arbitrary route identifiers are sent.
Map<String, dynamic> assistantMobileScreenContext(Uri? uri) {
  final segments =
      uri?.pathSegments.where((segment) => segment.isNotEmpty).toList() ?? [];
  if (segments.isEmpty) return {'screen': 'home'};

  const knownScreens = {
    'apps',
    'assistant',
    'calendar',
    'chat',
    'cms',
    'documents',
    'drive',
    'education',
    'finance',
    'habits',
    'inventory',
    'mail',
    'meet',
    'notes',
    'notifications',
    'profile',
    'settings',
    'tasks',
    'timer',
  };
  final screen = knownScreens.contains(segments.first)
      ? segments.first
      : 'other';
  final context = <String, dynamic>{'screen': screen};

  // A task ID can be resolved with the declared get_task_details tool.
  if (screen == 'tasks' &&
      segments.length == 2 &&
      RegExp(
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-'
        r'[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
      ).hasMatch(segments[1])) {
    context['taskId'] = segments[1];
  }
  return context;
}
