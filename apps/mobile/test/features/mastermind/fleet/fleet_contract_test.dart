import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_snooze_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_snooze_store.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';

class _Api extends Mock implements ApiClient {}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
void main() {
  group('fleet contract additions', () {
    test('parses login requests, context, resolved and release', () {
      final snapshot = FleetSnapshot.parse(
        fleetSampleJson(
          decisions: [
            fleetLoginJson(),
            fleetLoginJson(id: 'bad-login', service: 'unknown'),
            {...fleetLoginJson(id: 'no-payload'), 'login': null},
            {
              'id': 'ask',
              'title': 'Roll back?',
              'why': 'Error rate rose.',
              'defaultOutcome': 'Rolls back at the deadline.',
              'requester': 'post-deploy watch',
              'urgency': 'urgent',
              'createdAt': '2026-11-20T02:58:00.000Z',
            },
          ],
          resolved: [
            {
              'id': 'old',
              'title': 'Retire the cron?',
              'answeredVia': 'whatsapp',
              'outcome': 'Retire it',
              'resolvedAt': '2026-11-20T02:11:00.000Z',
            },
            {'id': 'broken'},
          ],
          release: {
            'main': {'state': 'frozen', 'queued': 3},
            'production': {'state': 'healthy', 'sha': 'abc1234'},
            'migrations': {'pending': 1, 'state': 'gated'},
            'incidents': [
              {
                'id': 'cal',
                'title': 'Calendar Worker error rate',
                'severity': 'high',
                'openedAt': '2026-11-20T02:05:00.000Z',
              },
            ],
          },
        ),
      );
      expect(snapshot.decisions.map((d) => d.id), ['login-gh', 'ask']);
      final login = snapshot.decisions.first.login!;
      expect(login.service, FleetLoginService.github);
      expect(login.flow, FleetLoginFlow.device);
      expect(login.userCode, '8F3K-Q2MX');
      expect(snapshot.decisions.last.defaultOutcome, isNotNull);
      expect(snapshot.resolved.single.answeredVia, FleetAnswerChannel.whatsapp);
      expect(snapshot.release?.mainState, FleetMainState.frozen);
      expect(
        snapshot.release?.incidents.single.severity,
        FleetIncidentSeverity.high,
      );
    });

    test('a passed expiry reads as expired on the client clock', () {
      final login = FleetLogin.parse(
        fleetLoginJson()['login'] as Map<String, dynamic>,
      )!;
      expect(login.stateAt(fleetTestNow), FleetLoginState.waiting);
      expect(
        login.stateAt(DateTime.utc(2026, 11, 20, 3, 12)),
        FleetLoginState.expired,
      );
    });

    test('an open request without a safe link, expiry or code is dropped', () {
      final base = fleetLoginJson()['login'] as Map<String, dynamic>;
      for (final broken in [
        {...base, 'url': 'http://github.com/login/device'},
        {...base, 'url': 'https://user:pw@github.com/login/device'},
        {...base}..remove('expiresAt'),
        {...base, 'expiresAt': 'soon'},
        {...base}..remove('userCode'),
      ]) {
        expect(FleetLogin.parse(broken), isNull, reason: '$broken');
      }
      final ended = FleetLogin.parse({...base, 'state': 'verified'})!;
      expect(ended.url, isNull);
      expect(ended.userCode, isNull);
    });

    test('an ended login no longer needs the owner, a signed-in one still '
        'blocks', () {
      final snapshot = FleetSnapshot.parse(
        fleetSampleJson(
          decisions: [
            fleetLoginJson(),
            fleetLoginJson(id: 'answered'),
          ],
          answers: {
            'answered': {
              'action': 'signed_in',
              'revision': 1,
              'answeredAt': '2026-11-20T03:01:00.000Z',
              'pickedUp': false,
            },
          },
        ),
      );
      expect(snapshot.needsYouAt(fleetTestNow).map((d) => d.id), ['login-gh']);
      expect(snapshot.openLoginsAt(fleetTestNow), hasLength(2));
      final later = DateTime.utc(2026, 11, 20, 3, 12);
      expect(snapshot.needsYouAt(later), isEmpty);
      expect(snapshot.openLoginsAt(later), isEmpty);
    });
  });

  group('FleetRepository', () {
    late _Api api;
    setUp(() => api = _Api());

    test('declares the login feature on every read', () async {
      when(
        () => api.getJsonWithHeaders(any(), any()),
      ).thenAnswer((_) async => fleetSampleJson());
      await FleetRepository(api: api).fetch();
      verify(
        () => api.getJsonWithHeaders(FleetRepository.statePath, {
          'x-mastermind-fleet-features': 'login',
        }),
      ).called(1);
    });

    test('posts signed_in and reads its receipt', () async {
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'action': 'signed_in',
          'revision': 1,
          'answeredAt': '2026-11-20T03:02:00.000Z',
          'pickedUp': false,
        },
      );
      final receipt = await FleetRepository(api: api).answer(
        decisionId: 'login-gh',
        action: FleetAnswerAction.signedIn,
        idempotencyKey: 'k',
      );
      expect(receipt.action, FleetAnswerAction.signedIn);
      final body =
          verify(() => api.postJson(any(), captureAny())).captured.single
              as Map<String, Object?>;
      expect(body['action'], 'signed_in');
    });

    test('a 409 is a closed request, not a retryable failure', () async {
      when(
        () => api.postJson(any(), any()),
      ).thenThrow(const ApiException(message: 'login_closed', statusCode: 409));
      await expectLater(
        FleetRepository(api: api).answer(
          decisionId: 'login-gh',
          action: FleetAnswerAction.signedIn,
          idempotencyKey: 'k',
        ),
        throwsA(
          isA<FleetException>().having(
            (e) => e.failure,
            'failure',
            FleetFailure.closed,
          ),
        ),
      );
    });
  });

  group('FleetCubit undo window', () {
    test('Undo inside the window sends nothing', () async {
      final source = FakeFleetSource();
      final cubit = FleetCubit(
        source: source,
        undoWindow: const Duration(milliseconds: 40),
      );
      unawaited(cubit.answer('pool-switch', FleetAnswerAction.hold));
      expect(
        cubit.state.pending['pool-switch']?.status,
        FleetSendStatus.queued,
      );
      cubit.undo('pool-switch');
      await Future<void>.delayed(const Duration(milliseconds: 80));
      expect(source.answers, isEmpty);
      expect(cubit.state.pending, isEmpty);

      await cubit.answer('pool-switch', FleetAnswerAction.hold);
      expect(source.answers, hasLength(1));
      await cubit.close();
    });

    test('a queued answer to a decision closed elsewhere is dropped', () async {
      final source = FakeFleetSource();
      final cubit = FleetCubit(
        source: source,
        undoWindow: const Duration(minutes: 1),
      );
      await cubit.refresh();
      final queued = cubit.answer('pool-switch', FleetAnswerAction.hold);
      source.json = fleetSampleJson(
        decisions: const [],
        resolved: [
          {
            'id': 'pool-switch',
            'title': 'Move the M4 lanes?',
            'answeredVia': 'whatsapp',
            'resolvedAt': '2026-11-20T03:01:00.000Z',
          },
        ],
      );
      await cubit.refresh();
      await queued.timeout(const Duration(seconds: 1));
      expect(cubit.state.pending, isEmpty);
      expect(source.answers, isEmpty);
      await cubit.close();
    });

    test('a queued sign-in to a login that ended is never sent', () async {
      final source = FakeFleetSource(
        json: fleetSampleJson(decisions: [fleetLoginJson()]),
      );
      var now = fleetTestNow;
      final cubit = FleetCubit(
        source: source,
        undoWindow: const Duration(milliseconds: 40),
        clock: () => now,
      );
      await cubit.refresh();
      final queued = cubit.answer('login-gh', FleetAnswerAction.signedIn);
      now = DateTime.utc(2026, 11, 20, 3, 12);
      await queued;
      expect(source.answers, isEmpty);
      expect(cubit.state.pending['login-gh']?.status, FleetSendStatus.closed);
      await cubit.close();
    });

    test('a cancelled queued answer still completes its future', () async {
      final cubit = FleetCubit(
        source: FakeFleetSource(),
        undoWindow: const Duration(minutes: 1),
      );
      final undone = cubit.answer('pool-switch', FleetAnswerAction.hold);
      cubit.undo('pool-switch');
      await undone.timeout(const Duration(seconds: 1));

      final reset = cubit.answer('pool-switch', FleetAnswerAction.hold);
      cubit.clear();
      await reset.timeout(const Duration(seconds: 1));

      final closed = cubit.answer('pool-switch', FleetAnswerAction.hold);
      await cubit.close();
      await closed.timeout(const Duration(seconds: 1));
    });

    test('a closed request is marked closed and refetched', () async {
      final source = FakeFleetSource()
        ..answerError = const ApiException(message: 'x', statusCode: 409);
      final cubit = FleetCubit(source: source);
      await cubit.refresh();
      await cubit.answer('login-gh', FleetAnswerAction.signedIn);
      expect(cubit.state.pending['login-gh']?.status, FleetSendStatus.closed);
      await Future<void>.delayed(Duration.zero);
      expect(source.fetches, 2);
      await cubit.close();
    });
  });

  group('snoozes', () {
    test('a failed storage read never lets a write replace stored '
        'snoozes', () async {
      final until = fleetTestNow.add(const Duration(hours: 1));
      final store = _GatedStore({'kept': until})
        ..failReads = 2
        ..gate.complete();
      final cubit = FleetSnoozeCubit(store: store);
      await cubit.snooze('first', until);
      expect(store.written, isNull);
      await cubit.snooze('second', until);
      expect(store.written?.keys.toSet(), {'kept', 'second'});
      await cubit.close();
    });

    test('signed out reads nothing; the next sign-in keeps its stored '
        'snoozes', () async {
      final until = fleetTestNow.add(const Duration(hours: 1));
      final store = _GatedStore({'kept': until})
        ..scope = null
        ..gate.complete();
      final cubit = FleetSnoozeCubit(store: store);
      await cubit.load();
      await cubit.snooze('ignored', until);
      expect(cubit.state, isEmpty);
      expect(store.written, isNull);

      store.scope = 'u2';
      await cubit.snooze('new', until);
      expect(store.written?.keys.toSet(), {'kept', 'new'});
      await cubit.close();
    });

    test(
      'a snooze made for one user is never written under the next',
      () async {
        final until = fleetTestNow.add(const Duration(hours: 1));
        final store = _GatedStore({'a-old': until})..scope = 'a';
        final cubit = FleetSnoozeCubit(store: store);
        final pending = cubit.snooze('a-new', until);
        store
          ..scope = 'b'
          ..gate.complete();
        await pending;
        expect(store.written, isNull);
        await cubit.close();
      },
    );

    test('a read that finishes after an account switch is dropped', () async {
      final store = _GatedStore({
        'a-decision': fleetTestNow.add(const Duration(hours: 1)),
      });
      final cubit = FleetSnoozeCubit(store: store);
      final loading = cubit.load();
      cubit.clear();
      store.stored = {'b-decision': fleetTestNow.add(const Duration(hours: 2))};
      store.gate.complete();
      await loading;
      expect(cubit.state, isEmpty);

      store.gate = Completer<void>()..complete();
      await cubit.snooze('b-new', fleetTestNow.add(const Duration(hours: 3)));
      expect(cubit.state.keys.toSet(), {'b-decision', 'b-new'});
      expect(store.written?.keys.toSet(), {'b-decision', 'b-new'});
      await cubit.close();
    });

    test('persist per user and prune passed or closed ones', () async {
      SharedPreferences.setMockInitialValues({});
      String? user = 'u1';
      final store = PrefsFleetSnoozeStore(userId: () => user);
      final first = FleetSnoozeCubit(store: store);
      await first.load();
      final until = fleetTestNow.add(const Duration(minutes: 15));
      await first.snooze('ship-fleet-sync', until);
      await first.snooze('gone', until);

      final again = FleetSnoozeCubit(store: store);
      await again.load();
      expect(again.isSnoozed('ship-fleet-sync', fleetTestNow), isTrue);
      expect(
        again.isSnoozed(
          'ship-fleet-sync',
          until.add(const Duration(seconds: 1)),
        ),
        isFalse,
      );
      await again.prune({'ship-fleet-sync'}, fleetTestNow);
      expect(again.state.keys, ['ship-fleet-sync']);

      user = 'u2';
      final other = FleetSnoozeCubit(store: store);
      await other.load();
      expect(other.state, isEmpty);
      await Future.wait([first.close(), again.close(), other.close()]);
    });
  });
}

class _GatedStore implements FleetSnoozeStore {
  _GatedStore(this.stored);

  Map<String, DateTime> stored;
  Map<String, DateTime>? written;
  Completer<void> gate = Completer<void>();

  @override
  String? scope = 'memory';

  int failReads = 0;

  @override
  Future<Map<String, DateTime>> read() async {
    final snapshot = stored;
    await gate.future;
    if (failReads > 0) {
      failReads--;
      throw StateError('storage unavailable');
    }
    return snapshot;
  }

  @override
  Future<void> write(Map<String, DateTime> snoozes) async => written = snoozes;
}
