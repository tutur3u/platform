import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/calendar_event_guest.dart';
import 'package:mobile/data/repositories/calendar_guests_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

const _event = '/api/v1/workspaces/workspace/calendar/events/event';

void main() {
  setUpAll(() => registerFallbackValue(() async {}));

  test('decodes a native guest list and keeps the organizer marker', () async {
    final api = _Api();
    when(() => api.getJson('$_event/guests')).thenAnswer(
      (_) async => {
        'native': true,
        'guests': [
          {
            'id': 'guest',
            'email': 'guest@example.com',
            'displayName': 'Guest',
            'isOrganizer': true,
            'rsvpStatus': 'accepted',
          },
        ],
      },
    );
    final repo = CalendarGuestsRepository(
      apiClient: api,
      currentUserId: () => 'owner',
    );

    final guest = (await repo.listGuests('workspace', 'event')).single;
    expect(guest.label, 'Guest');
    expect(guest.isOrganizer, isTrue);
    expect(guest.rsvp, CalendarGuestRsvp.accepted);
  });

  test('only a verified invitee enters RSVP mode', () async {
    final api = _Api();
    final repo = CalendarGuestsRepository(
      apiClient: api,
      currentUserId: () => 'owner',
    );
    when(
      () => api.getJson('$_event/attendees'),
    ).thenThrow(const ApiException(message: 'unavailable', statusCode: 409));
    await expectLater(
      repo.listProviderAttendees('workspace', 'event'),
      throwsA(isA<ApiException>()),
    );
    when(() => api.getJson('$_event/attendees')).thenThrow(
      const ApiException(
        message: 'unavailable',
        statusCode: 409,
        code: 'invited_account',
      ),
    );
    expect(await repo.listProviderAttendees('workspace', 'event'), isNull);
  });

  test('checks workspace scope again before removing a guest', () async {
    final api = _Api();
    var current = true;
    var dispatched = false;
    when(
      () => api.deleteJsonGuarded(
        '$_event/guests/guest',
        beforeDispatch: any(named: 'beforeDispatch'),
      ),
    ).thenAnswer((invocation) async {
      current = false;
      final guard =
          invocation.namedArguments[#beforeDispatch] as Future<void> Function();
      await guard();
      dispatched = true;
      return {};
    });
    final repo = CalendarGuestsRepository(
      apiClient: api,
      currentUserId: () => 'owner',
      isOnline: () async => true,
      scopeIsCurrent: () => current,
    );
    await expectLater(
      repo.removeGuest('workspace', 'event', 'guest'),
      throwsA(isA<ApiException>()),
    );
    expect(dispatched, isFalse);
  });

  test('does not dispatch a guest removal after the account changes', () async {
    final api = _Api();
    var owner = 'first';
    final connected = Completer<bool>();
    final repo = CalendarGuestsRepository(
      apiClient: api,
      currentUserId: () => owner,
      isOnline: () => connected.future,
    );

    final removal = repo.removeGuest('workspace', 'event', 'guest');
    owner = 'second';
    connected.complete(true);
    await expectLater(removal, throwsA(isA<ApiException>()));
    verifyZeroInteractions(api);
  });

  test(
    'sends an online provider RSVP using the Calendar answer enum',
    () async {
      final api = _Api();
      when(
        () => api.postJsonGuarded('$_event/response', {
          'response': 'tentative',
        }, beforeDispatch: any(named: 'beforeDispatch')),
      ).thenAnswer((invocation) async {
        final guard =
            invocation.namedArguments[#beforeDispatch]
                as Future<void> Function();
        await guard();
        return {'response': 'tentative'};
      });
      final repo = CalendarGuestsRepository(
        apiClient: api,
        currentUserId: () => 'owner',
        isOnline: () async => true,
      );

      await repo.respond('workspace', 'event', CalendarRsvpAnswer.tentative);
      verify(
        () => api.postJsonGuarded('$_event/response', {
          'response': 'tentative',
        }, beforeDispatch: any(named: 'beforeDispatch')),
      ).called(1);
    },
  );
}
