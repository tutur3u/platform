import 'package:mobile/core/config/app_flavor.dart';

enum ApiOrigin {
  platform,
  finance,
  inventory,
  tasks,
  contacts,
  calendar,
  teach,
  track,
  infrastructure,
}

/// Resolves each mobile API path to the app that owns it.
///
/// A repository can intentionally call APIs from multiple apps. Keeping the
/// decision at the request boundary prevents a repository-wide base URL from
/// sending platform storage calls to Finance or member lookups to Tasks.
class ApiOrigins {
  ApiOrigins._({required this.flavor, required Map<ApiOrigin, String> urls})
    : _urls = Map.unmodifiable(urls);

  factory ApiOrigins.forFlavor(
    AppFlavor flavor, {
    String? platformOverride,
    String? financeOverride,
    String? inventoryOverride,
    String? tasksOverride,
    String? contactsOverride,
    String? calendarOverride,
    String? teachOverride,
    String? trackOverride,
    String? infrastructureOverride,
  }) {
    final production = flavor != AppFlavor.development;
    String resolve(String? override, String localUrl, String productionUrl) =>
        _normalize(
          override != null && override.isNotEmpty
              ? override
              : (production ? productionUrl : localUrl),
        );

    return ApiOrigins._(
      flavor: flavor,
      urls: {
        ApiOrigin.platform: resolve(
          platformOverride,
          'http://localhost:7803',
          'https://tuturuuu.com',
        ),
        ApiOrigin.finance: resolve(
          financeOverride,
          'http://localhost:7808',
          'https://finance.tuturuuu.com',
        ),
        ApiOrigin.inventory: resolve(
          inventoryOverride,
          'http://localhost:7815',
          'https://inventory.tuturuuu.com',
        ),
        ApiOrigin.tasks: resolve(
          tasksOverride,
          'http://localhost:7809',
          'https://tasks.tuturuuu.com',
        ),
        ApiOrigin.contacts: resolve(
          contactsOverride,
          'http://localhost:7827',
          'https://contacts.tuturuuu.com',
        ),
        ApiOrigin.calendar: resolve(
          calendarOverride,
          'http://localhost:7806',
          'https://calendar.tuturuuu.com',
        ),
        ApiOrigin.teach: resolve(
          teachOverride,
          'http://localhost:7813',
          'https://teach.tuturuuu.com',
        ),
        ApiOrigin.track: resolve(
          trackOverride,
          'http://localhost:7810',
          'https://track.tuturuuu.com',
        ),
        ApiOrigin.infrastructure: resolve(
          infrastructureOverride,
          'http://localhost:7823',
          'https://infrastructure.tuturuuu.com',
        ),
      },
    )..validate();
  }

  final AppFlavor flavor;
  final Map<ApiOrigin, String> _urls;

  String urlFor(ApiOrigin origin) => _urls[origin]!;

  String baseUrlForPath(String path) => urlFor(ownerForPath(path));

  ApiOrigin ownerForPath(String rawPath) {
    final path = rawPath.split('?').first;

    if (_matchesWorkspace(path, r'(?:wallets|transactions)(?:/|$)') ||
        _matchesWorkspaceV1(path, r'finance(?:/|$)')) {
      return ApiOrigin.finance;
    }
    if (_matchesWorkspaceV1(
      path,
      r'(?:inventory|products|product-categories|product-units|product-warehouses)(?:/|$)',
    )) {
      return ApiOrigin.inventory;
    }
    if (RegExp(r'^/api/v1/users/me/tasks(?:/|$)').hasMatch(path) ||
        _matchesWorkspaceV1(
          path,
          r'(?:tasks|task-boards|boards|labels|task-projects|task-initiatives|habit-trackers)(?:/|$)',
        )) {
      return ApiOrigin.tasks;
    }
    if (_matchesWorkspaceV1(path, r'users(?:/|$)') &&
        !_matchesWorkspaceV1(path, r'users/feedbacks(?:/|$)')) {
      return ApiOrigin.contacts;
    }
    if (RegExp(r'^/api/v1/calendar(?:/|$)').hasMatch(path) ||
        _matchesWorkspaceV1(path, r'calendar(?:/|$)')) {
      return ApiOrigin.calendar;
    }
    if (_matchesWorkspaceV1(
      path,
      r'(?:education|courses|quizzes|quiz-sets|flashcards)(?:/|$)',
    )) {
      return ApiOrigin.teach;
    }
    if (_matchesWorkspaceV1(path, r'time-tracking(?:/|$)')) {
      return ApiOrigin.track;
    }
    if (RegExp(r'^/api/v1/infrastructure(?:/|$)').hasMatch(path)) {
      return ApiOrigin.infrastructure;
    }
    return ApiOrigin.platform;
  }

  void validate() {
    for (final entry in _urls.entries) {
      final uri = Uri.tryParse(entry.value);
      if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
        throw StateError(
          'Invalid ${entry.key.name} API origin: ${entry.value}',
        );
      }
      if (flavor != AppFlavor.development &&
          (uri.scheme != 'https' ||
              uri.host == 'localhost' ||
              uri.host == '10.0.2.2')) {
        throw StateError(
          '${flavor.value} ${entry.key.name} API origin must use a remote '
          'HTTPS host.',
        );
      }
    }
  }

  static bool _matchesWorkspace(String path, String remainder) => RegExp(
    '^/api/workspaces/[^/]+/$remainder',
  ).hasMatch(path);

  static bool _matchesWorkspaceV1(String path, String remainder) => RegExp(
    '^/api/v1/workspaces/[^/]+/$remainder',
  ).hasMatch(path);

  static String _normalize(String url) =>
      url.trim().replaceAll(RegExp(r'/$'), '');
}
