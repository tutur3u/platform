import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/data/models/calendar_event_guest.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Why a guest or RSVP request did not apply.
enum CalendarGuestFailure {
  offline,
  denied,
  guestLimit,
  quota,
  unavailable,
  failed,
}

CalendarGuestFailure calendarGuestFailureOf(Object error) {
  if (isOfflineTransportFailure(error)) return CalendarGuestFailure.offline;
  if (error is! ApiException) return CalendarGuestFailure.failed;
  return switch (error.statusCode) {
    403 when !error.isVerificationRequired => CalendarGuestFailure.denied,
    400 when error.code == 'guest_limit' => CalendarGuestFailure.guestLimit,
    429 => CalendarGuestFailure.quota,
    404 || 409 => CalendarGuestFailure.unavailable,
    _ => CalendarGuestFailure.failed,
  };
}

/// Event guests and invitation responses on the Calendar API. None of these
/// writes enter the offline mutation queue: adding or removing a guest sends
/// email and an RSVP notifies the organizer, so a late replay would act on
/// an invitation the user may no longer see.
class CalendarGuestsRepository {
  CalendarGuestsRepository({
    ApiClient? apiClient,
    String? Function()? currentUserId,
    Future<bool> Function()? isOnline,
    bool Function()? scopeIsCurrent,
  }) : _api = apiClient ?? ApiClient(),
       _owner = currentUserId ?? currentCacheUserId,
       _isOnline = isOnline ?? hasNetworkConnection,
       _scopeIsCurrent = scopeIsCurrent;

  final ApiClient _api;
  final String? Function() _owner;
  final Future<bool> Function() _isOnline;
  final bool Function()? _scopeIsCurrent;

  static String _event(String wsId, String eventId) =>
      '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/calendar/events/'
      '${Uri.encodeComponent(eventId)}';

  void _checkScope(String? userId) {
    if (userId == null ||
        userId != _owner() ||
        _scopeIsCurrent?.call() == false) {
      throw const ApiException(
        message: 'Calendar scope changed.',
        statusCode: 401,
      );
    }
  }

  Future<T> _request<T>(Future<T> Function() operation) async {
    final userId = _owner();
    _checkScope(userId);
    final result = await ApiClient.runForUser(userId!, operation);
    _checkScope(userId);
    return result;
  }

  Future<void> _requireConnection() async {
    if (!await _isOnline()) {
      throw const ApiException.transport(message: 'Offline');
    }
  }

  Future<List<CalendarEventGuest>> listGuests(
    String wsId,
    String eventId,
  ) async {
    final response = await _request(
      () => _api.getJson('${_event(wsId, eventId)}/guests'),
    );
    if (response['native'] != true) {
      throw const ApiException(
        message: 'Guest list unavailable',
        statusCode: 409,
      );
    }
    return (response['guests'] as List<Object?>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(CalendarEventGuest.fromJson)
        .toList(growable: false);
  }

  /// Adds one guest and sends the invitation, as the web editor does.
  Future<void> addGuest(
    String wsId,
    String eventId,
    Map<String, dynamic> guest, {
    String? timeZone,
    bool allDay = false,
  }) async {
    final userId = _owner();
    await _requireConnection();
    _checkScope(userId);
    await _request(
      () => _api.postJsonGuarded('${_event(wsId, eventId)}/guests', {
        'guests': [guest],
        'notify': true,
        'display': {'timeZone': ?timeZone, 'allDay': allDay},
      }, beforeDispatch: () async => _checkScope(userId)),
    );
  }

  /// Removes a guest; an invited guest gets a cancellation.
  Future<void> removeGuest(String wsId, String eventId, String guestId) async {
    final userId = _owner();
    await _requireConnection();
    _checkScope(userId);
    await _request(
      () => _api.deleteJsonGuarded(
        '${_event(wsId, eventId)}/guests/${Uri.encodeComponent(guestId)}',
        beforeDispatch: () async => _checkScope(userId),
      ),
    );
  }

  /// A null result means the provider verified that this account can RSVP.
  Future<List<CalendarProviderAttendee>?> listProviderAttendees(
    String wsId,
    String eventId,
  ) async {
    final Map<String, dynamic> response;
    try {
      response = await _request(
        () => _api.getJson('${_event(wsId, eventId)}/attendees'),
      );
    } on ApiException catch (error) {
      if (error.statusCode == 409 && error.code == 'invited_account') {
        return null;
      }
      rethrow;
    }
    if (response['eventId'] != eventId ||
        response['attendeeEditing'] != false) {
      throw const ApiException(message: 'Snapshot mismatch', statusCode: 409);
    }
    return (response['attendees'] as List<Object?>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(CalendarProviderAttendee.fromJson)
        .toList(growable: false);
  }

  /// Answers a provider invitation for the connected account.
  Future<void> respond(
    String wsId,
    String eventId,
    CalendarRsvpAnswer answer,
  ) async {
    final userId = _owner();
    await _requireConnection();
    _checkScope(userId);
    await _request(
      () => _api.postJsonGuarded('${_event(wsId, eventId)}/response', {
        'response': answer.name,
      }, beforeDispatch: () async => _checkScope(userId)),
    );
  }

  /// Members and contacts with an email, for at least two characters.
  Future<List<CalendarGuestCandidate>> searchPeople(
    String wsId,
    String query,
  ) async {
    if (query.trim().length < 2) return const [];
    final rows = await _request(
      () => _api.getJsonList(
        '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/people'
        '?q=${Uri.encodeQueryComponent(query.trim())}&limit=10',
      ),
    );
    return rows
        .whereType<Map<String, dynamic>>()
        .where(
          (row) =>
              row['id'] is String &&
              (row['kind'] == 'member' || row['kind'] == 'contact') &&
              (row['email'] as String?)?.trim().isNotEmpty == true,
        )
        .map(
          (row) => CalendarGuestCandidate(
            id: row['id'] as String,
            isMember: row['kind'] == 'member',
            displayName: row['displayName'] as String?,
            email: (row['email'] as String).trim().toLowerCase(),
          ),
        )
        .toList(growable: false);
  }

  void dispose() => _api.dispose();
}
