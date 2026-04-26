import 'package:mobile/core/router/routes.dart';

const _rootHosts = {'tuturuuu.com', 'www.tuturuuu.com'};
const _tasksHosts = {'tasks.tuturuuu.com'};
const _localeSegments = {'en', 'vi', 'es'};
const _nativeOptOutQueryKeys = {
  'app',
  'native',
  'nativeApp',
  'openInApp',
  'openInBrowser',
};

final class MobileDeepLink {
  const MobileDeepLink({
    required this.location,
    this.workspaceSlug,
    this.openExternally = false,
  });

  final String location;
  final String? workspaceSlug;
  final bool openExternally;
}

MobileDeepLink? resolveMobileDeepLink(Uri uri) {
  final normalizedUri = _normalizeUri(uri);
  if (normalizedUri == null) return null;

  final host = normalizedUri.host.toLowerCase();
  final segments = _withoutLocale(_cleanPathSegments(normalizedUri));
  final openExternally = _shouldOpenExternally(normalizedUri);

  if (_tasksHosts.contains(host)) {
    return _resolveTasksHostLink(
      normalizedUri,
      segments,
      openExternally: openExternally,
    );
  }

  if (!_rootHosts.contains(host)) {
    return null;
  }

  return _resolveRootHostLink(
    normalizedUri,
    segments,
    openExternally: openExternally,
  );
}

Uri? _normalizeUri(Uri uri) {
  if (!uri.hasScheme) {
    return Uri(
      scheme: 'https',
      host: 'tuturuuu.com',
      path: uri.path,
      query: uri.query,
      fragment: uri.fragment,
    );
  }

  final scheme = uri.scheme.toLowerCase();
  if (scheme != 'http' && scheme != 'https') {
    return null;
  }

  return uri;
}

List<String> _cleanPathSegments(Uri uri) {
  return uri.pathSegments
      .map((segment) => segment.trim())
      .where((segment) => segment.isNotEmpty)
      .toList(growable: false);
}

List<String> _withoutLocale(List<String> segments) {
  if (segments.isNotEmpty && _localeSegments.contains(segments.first)) {
    return segments.skip(1).toList(growable: false);
  }
  return segments;
}

bool _shouldOpenExternally(Uri uri) {
  for (final key in _nativeOptOutQueryKeys) {
    final value = uri.queryParameters[key]?.trim().toLowerCase();
    if (value == null) continue;
    if (value == '0' ||
        value == 'false' ||
        value == 'no' ||
        value == 'browser' ||
        value == 'external' ||
        value == '1' && key == 'openInBrowser') {
      return true;
    }
  }
  return false;
}

MobileDeepLink? _resolveRootHostLink(
  Uri uri,
  List<String> segments, {
  required bool openExternally,
}) {
  if (segments.isEmpty) {
    return _link(Routes.home, openExternally: openExternally);
  }

  if (segments.first == 'apps') {
    return _link(Routes.apps, openExternally: openExternally);
  }
  if (segments.first == 'assistant') {
    return _link(Routes.assistant, openExternally: openExternally);
  }
  if (segments.first == 'notifications') {
    return _link(
      segments.length > 1 && segments[1] == 'archive'
          ? Routes.notificationsArchive
          : Routes.notifications,
      openExternally: openExternally,
    );
  }

  final workspaceSlug = segments.first;
  final moduleSegments = segments.skip(1).toList(growable: false);
  final location = _moduleLocation(uri, moduleSegments);
  if (location == null) return null;

  return _link(
    location,
    workspaceSlug: workspaceSlug,
    openExternally: openExternally,
  );
}

MobileDeepLink? _resolveTasksHostLink(
  Uri uri,
  List<String> segments, {
  required bool openExternally,
}) {
  if (segments.isEmpty) {
    return _link(Routes.tasks, openExternally: openExternally);
  }

  final workspaceSlug = segments.first;
  final moduleSegments = segments.length > 1
      ? ['tasks', ...segments.skip(1)]
      : const ['tasks'];
  final location = _moduleLocation(uri, moduleSegments);
  if (location == null) return null;

  return _link(
    location,
    workspaceSlug: workspaceSlug,
    openExternally: openExternally,
  );
}

String? _moduleLocation(Uri uri, List<String> segments) {
  if (segments.isEmpty) return Routes.home;

  return switch (segments.first) {
    'apps' => Routes.apps,
    'assistant' => Routes.assistant,
    'notifications' =>
      segments.length > 1 && segments[1] == 'archive'
          ? Routes.notificationsArchive
          : Routes.notifications,
    'tasks' => _tasksLocation(uri, segments),
    'habits' => _habitsLocation(segments),
    'calendar' => Routes.calendar,
    'finance' => _financeLocation(segments),
    'education' => Routes.education,
    'inventory' => _inventoryLocation(segments),
    'drive' => Routes.drive,
    'documents' => _documentsLocation(segments),
    'cms' => Routes.cms,
    'crm' => Routes.crm,
    'meet' => Routes.meet,
    'timer' => _timerLocation(uri, segments),
    'settings' => _settingsLocation(segments),
    _ => null,
  };
}

String? _tasksLocation(Uri uri, List<String> segments) {
  if (segments.length == 1) return Routes.tasks;

  return switch (segments[1]) {
    'boards' => _taskBoardsLocation(uri, segments),
    'estimates' => Routes.taskEstimates,
    'portfolio' => _taskPortfolioLocation(segments),
    'projects' =>
      segments.length > 2
          ? Routes.taskPortfolioProjectPath(segments[2])
          : Routes.taskPortfolio,
    'habits' => Routes.habits,
    _ => null,
  };
}

String _taskBoardsLocation(Uri uri, List<String> segments) {
  if (segments.length <= 2) return Routes.taskBoards;

  final boardId = segments[2];
  final taskId = _taskIdFromQuery(uri);
  if (taskId == null || taskId.isEmpty) {
    return Routes.taskBoardDetailPath(boardId);
  }

  return Routes.taskBoardTaskDetailPath(boardId, taskId);
}

String _taskPortfolioLocation(List<String> segments) {
  if (segments.length > 2 && segments[2] == 'projects' && segments.length > 3) {
    return Routes.taskPortfolioProjectPath(segments[3]);
  }
  return Routes.taskPortfolio;
}

String? _taskIdFromQuery(Uri uri) {
  final taskId = uri.queryParameters['taskId'] ?? uri.queryParameters['task'];
  final normalized = taskId?.trim();
  return normalized == null || normalized.isEmpty ? null : normalized;
}

String _habitsLocation(List<String> segments) {
  if (segments.length > 1 && segments[1] == 'activity') {
    return Routes.habitsActivity;
  }
  if (segments.length > 1 && segments[1] == 'library') {
    return Routes.habitsLibrary;
  }
  return Routes.habits;
}

String _financeLocation(List<String> segments) {
  if (segments.length > 2 && segments[1] == 'wallets') {
    return Routes.walletDetailPath(segments[2]);
  }
  if (segments.length > 1 && segments[1] == 'wallets') return Routes.wallets;
  if (segments.length > 1 && segments[1] == 'transactions') {
    return Routes.transactions;
  }
  if (segments.length > 1 && segments[1] == 'categories') {
    return Routes.categories;
  }
  return Routes.finance;
}

String _inventoryLocation(List<String> segments) {
  if (segments.length > 2 && segments[1] == 'products') {
    return Routes.inventoryProductDetailPath(segments[2]);
  }
  if (segments.length > 1 && segments[1] == 'products') {
    return Routes.inventoryProducts;
  }
  if (segments.length > 1 && segments[1] == 'sales') {
    return Routes.inventorySales;
  }
  if (segments.length > 1 && segments[1] == 'manage') {
    return Routes.inventoryManage;
  }
  if (segments.length > 1 && segments[1] == 'audit-logs') {
    return Routes.inventoryAuditLogs;
  }
  if (segments.length > 1 && segments[1] == 'checkout') {
    return Routes.inventoryCheckout;
  }
  return Routes.inventory;
}

String _documentsLocation(List<String> segments) {
  if (segments.length > 1) return Routes.documentDetailPath(segments[1]);
  return Routes.documents;
}

String _timerLocation(Uri uri, List<String> segments) {
  if (segments.length > 1 && segments[1] == 'history') {
    return Routes.timerHistory;
  }
  if (segments.length > 1 && segments[1] == 'stats') {
    return Routes.timerStats;
  }
  if (segments.length > 1 && segments[1] == 'requests') {
    return Routes.timerRequestsPath(
      requestId: uri.queryParameters['requestId'],
      status: uri.queryParameters['status'],
    );
  }
  if (segments.length > 1 && segments[1] == 'management') {
    return Routes.timerManagement;
  }
  return Routes.timer;
}

String _settingsLocation(List<String> segments) {
  if (segments.length > 1 && segments[1] == 'workspace') {
    if (segments.length > 2 && segments[2] == 'secrets') {
      return Routes.settingsWorkspaceSecrets;
    }
    if (segments.length > 2 && segments[2] == 'members') {
      return Routes.settingsWorkspaceMembers;
    }
    if (segments.length > 2 && segments[2] == 'roles') {
      return Routes.settingsWorkspaceRoles;
    }
    return Routes.settingsWorkspace;
  }
  if (segments.length > 1 && segments[1] == 'mobile-versions') {
    return Routes.settingsMobileVersions;
  }
  return Routes.settings;
}

MobileDeepLink _link(
  String location, {
  required bool openExternally,
  String? workspaceSlug,
}) {
  return MobileDeepLink(
    location: location,
    workspaceSlug: workspaceSlug,
    openExternally: openExternally,
  );
}
