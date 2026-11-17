import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/sources/api_client.dart';

typedef MailPeopleLookup =
    Future<Map<String, Map<String, dynamic>>> Function(
      String workspaceId,
      Iterable<String> emails,
    );

/// Stateless access to the permission-filtered workspace people resolver.
class MailPeopleResolver {
  MailPeopleResolver({ApiClient? apiClient, String? Function()? currentUserId})
    : _api = apiClient ?? ApiClient(),
      _ownsApi = apiClient == null,
      _currentUserId = currentUserId ?? currentCacheUserId;

  final ApiClient _api;
  final bool _ownsApi;
  final String? Function() _currentUserId;

  Future<Map<String, Map<String, dynamic>>> resolve(
    String workspaceId,
    Iterable<String> emails,
  ) async {
    if (workspaceId.trim().isEmpty) {
      throw ArgumentError('Workspace is required');
    }
    final addresses = emails
        .map((email) => email.trim().toLowerCase())
        .where((email) => email.isNotEmpty)
        .toSet()
        .take(50)
        .toList();
    if (addresses.isEmpty) return {};
    final userId = _currentUserId();
    if (userId == null) throw _accountChanged;
    final response = await ApiClient.runForUser(
      userId,
      () => _api.postJson(
        '/api/v1/workspaces/${Uri.encodeComponent(workspaceId)}/people/resolve',
        {'emails': addresses},
      ),
    );
    if (_currentUserId() != userId) throw _accountChanged;
    return parseMailResolvedPeople(response, addresses.toSet());
  }

  void dispose() {
    if (_ownsApi) _api.dispose();
  }
}

const _accountChanged = ApiException(
  message: 'Account changed during request',
  statusCode: 401,
);

/// Reject malformed and unsolicited results rather than treating them as
/// unknown people.
Map<String, Map<String, dynamic>> parseMailResolvedPeople(
  Map<String, dynamic> response,
  Set<String> requestedEmails,
) {
  final data = response['data'];
  if (data is! List || data.length > 50) {
    throw const FormatException('Invalid people response');
  }
  final result = <String, Map<String, dynamic>>{};
  for (final value in data) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('Invalid person');
    }
    final email = value['email'];
    final kind = value['kind'];
    if (email is! String || !{'member', 'contact', 'unknown'}.contains(kind)) {
      throw const FormatException('Invalid person identity');
    }
    final key = email.trim().toLowerCase();
    if (!requestedEmails.contains(key) || result.containsKey(key)) {
      throw const FormatException('Unexpected person identity');
    }
    final name = value['displayName'];
    final avatar = value['avatarUrl'];
    if ((name != null && name is! String) ||
        (avatar != null && avatar is! String)) {
      throw const FormatException('Invalid person presentation');
    }
    if (kind != 'unknown' &&
        (value['id'] is! String ||
            value['emailVisible'] is! bool ||
            (kind == 'contact' && value['mailBlocked'] is! bool))) {
      throw const FormatException('Invalid person visibility');
    }
    result[key] = {
      'kind': kind,
      'email': key,
      'displayName': name,
      'avatarUrl': avatar,
      if (kind != 'unknown') 'id': value['id'],
      if (kind != 'unknown') 'emailVisible': value['emailVisible'],
      if (kind == 'contact') 'mailBlocked': value['mailBlocked'],
    };
  }
  if (result.length != requestedEmails.length) {
    throw const FormatException('Incomplete people response');
  }
  return result;
}
