import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_groups.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';
import 'secret_test_support.dart';

Map<String, dynamic> _ask(
  String id, {
  String urgency = 'high',
  String createdAt = '2026-11-20T02:40:00.000Z',
}) => {
  'id': id,
  'title': 'Question $id',
  'urgency': urgency,
  'options': [
    {'id': 'a', 'label': 'Option A'},
    {'id': 'b', 'label': 'Option B'},
  ],
  'createdAt': createdAt,
};

FleetPendingAnswer _pending(
  FleetSendStatus status, {
  int attempts = 0,
  String? optionId = 'b',
}) => FleetPendingAnswer(
  action: FleetAnswerAction.approve,
  idempotencyKey: 'key',
  status: status,
  createdAt: fleetTestNow,
  optionId: optionId,
  attempts: attempts,
);

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-inbox
void main() {
  FleetInboxGroups groups(
    Map<String, dynamic> json, {
    Map<String, FleetPendingAnswer> pending = const {},
    Map<String, DateTime> snoozes = const {},
  }) => FleetInboxGroups(
    FleetSnapshot.parse(json),
    snoozes,
    fleetTestNow,
    pending: pending,
  );

  test(
    'secret requests cannot appear in snoozes, history or retries',
    () async {
      final secret = await signedRequestDecision(
        id: 'secret-live',
        resign: false,
      );
      final stale = await signedRequestDecision(
        id: 'secret-stale',
        resign: false,
      );
      final snapshot = FleetSnapshot.parse(
        fleetSampleJson(
          decisions: [decisionJson(secret), _ask('ordinary')],
          resolved: [
            {
              'id': 'secret-closed',
              'title': 'Closed secret request',
              'kind': 'secret',
              'resolvedAt': '2026-11-20T02:30:00.000Z',
            },
          ],
        ),
      );
      expect(snapshot.resolved.single.kind, FleetDecisionKind.secret);
      expect(snapshot.needsYouAt(fleetTestNow).map((d) => d.id), ['ordinary']);
      final inbox = FleetInboxGroups(
        snapshot,
        {secret.id: fleetTestNow.add(const Duration(minutes: 5))},
        fleetTestNow,
        pending: {stale.id: _pending(FleetSendStatus.failed)},
        seen: (id) => id == stale.id ? stale : null,
      );

      expect(inbox.order, ['ordinary']);
      expect(inbox.snoozed, isEmpty);
      expect(inbox.history, isEmpty);
      expect(inbox.undelivered, isEmpty);
    },
  );

  test('the tab counts cover only open items', () {
    final inbox = groups(
      fleetSampleJson(
        decisions: [
          _ask('open-1'),
          _ask('open-2'),
          _ask('answered'),
          _ask('fyi-1', urgency: 'fyi'),
          _ask('fyi-answered', urgency: 'fyi'),
        ],
        answers: {
          for (final id in ['answered', 'fyi-answered'])
            id: {
              'action': 'approve',
              'optionId': 'a',
              'revision': 1,
              'answeredAt': '2026-11-20T02:59:00.000Z',
              'pickedUp': true,
            },
        },
        resolved: [
          {
            'id': 'closed',
            'title': 'Closed on WhatsApp',
            'answeredVia': 'whatsapp',
            'outcome': 'Yes',
            'resolvedAt': '2026-11-20T02:30:00.000Z',
          },
          {
            'id': 'gone',
            'title': 'Withdrawn by Iris',
            'outcome': 'Withdrawn',
            'resolvedAt': '2026-11-20T02:20:00.000Z',
          },
        ],
      ),
    );
    expect(inbox.openCount, 2);
    expect(inbox.fyiCount, 1);
    expect([for (final d in inbox.needs) d.id], ['open-1', 'open-2']);
    expect([for (final d in inbox.fyi) d.id], ['fyi-1']);
    expect(
      [for (final e in inbox.history) e.id],
      ['answered', 'fyi-answered', 'closed', 'gone'],
    );
    final withdrawn = inbox.history.last;
    expect(withdrawn.status, FleetHistoryStatus.withdrawn);
    expect(inbox.history[2].channel, FleetAnswerChannel.whatsapp);
    expect(inbox.history[2].status, FleetHistoryStatus.delivered);
  });

  test('an answer sent from here leaves Needs you at once', () {
    final json = fleetSampleJson(decisions: [_ask('one'), _ask('two')]);
    for (final status in [
      FleetSendStatus.queued,
      FleetSendStatus.sending,
      FleetSendStatus.retrying,
    ]) {
      final inbox = groups(json, pending: {'one': _pending(status)});
      expect([for (final d in inbox.needs) d.id], ['two'], reason: '$status');
      expect(inbox.openCount, 1, reason: '$status');
      final entry = inbox.history.single;
      expect(entry.id, 'one');
      expect(entry.outcome, 'Option B');
      expect(
        entry.status,
        status == FleetSendStatus.retrying
            ? FleetHistoryStatus.retrying
            : FleetHistoryStatus.sending,
      );
    }
  });

  test('a refused or stalled answer brings its card back and counts', () {
    final json = fleetSampleJson(decisions: [_ask('one'), _ask('two')]);
    for (final pending in [
      _pending(FleetSendStatus.failed),
      _pending(FleetSendStatus.retrying, attempts: fleetStalledAttempts),
    ]) {
      final inbox = groups(json, pending: {'one': pending});
      expect([for (final d in inbox.needs) d.id], ['one', 'two']);
      expect(inbox.openCount, 2);
      expect(inbox.history, isEmpty);
    }
  });

  test('a refused FYI answer and an in-flight stalled one stay in Needs', () {
    final json = fleetSampleJson(
      decisions: [
        _ask('fyi', urgency: 'fyi'),
        _ask('stalled'),
      ],
    );
    final inbox = groups(
      json,
      pending: {
        'fyi': _pending(FleetSendStatus.failed),
        // A background attempt on the wire keeps a stalled card in place.
        'stalled': _pending(
          FleetSendStatus.sending,
          attempts: fleetStalledAttempts,
        ),
      },
    );
    expect([for (final d in inbox.needs) d.id], ['stalled', 'fyi']);
    expect(inbox.fyi, isEmpty);
    expect(inbox.openCount, 2);
    expect(inbox.history, isEmpty);
  });

  test('a retrying answer under the stall threshold stays in History', () {
    final inbox = groups(
      fleetSampleJson(decisions: [_ask('one')]),
      pending: {
        'one': _pending(
          FleetSendStatus.retrying,
          attempts: fleetStalledAttempts - 1,
        ),
      },
    );
    expect(inbox.needs, isEmpty);
    expect(inbox.openCount, 0);
    expect(inbox.history.single.status, FleetHistoryStatus.retrying);
  });

  test('snoozed cards are listed apart and not counted', () {
    final inbox = groups(
      fleetSampleJson(decisions: [_ask('one'), _ask('two')]),
      snoozes: {'one': fleetTestNow.add(const Duration(hours: 1))},
    );
    expect(inbox.openCount, 1);
    expect(inbox.snoozed.single.$1.id, 'one');
    expect(inbox.order, ['two']);
  });

  test('a receipt from another device moves the decision to History', () {
    final inbox = groups(
      fleetSampleJson(
        decisions: [_ask('one')],
        answers: {
          'one': {
            'action': 'hold',
            'revision': 1,
            'answeredAt': '2026-11-20T03:01:00.000Z',
            'pickedUp': false,
          },
        },
      ),
    );
    expect(inbox.needs, isEmpty);
    expect(inbox.openCount, 0);
    expect(inbox.history.single.status, FleetHistoryStatus.waiting);
    expect(inbox.history.single.action, FleetAnswerAction.hold);
  });

  test('an answered sign-in stays in Needs you, uncounted, until verified', () {
    final inbox = groups(
      fleetSampleJson(
        decisions: [fleetLoginJson(state: 'approved')],
        answers: {
          'login-gh': {
            'action': 'signed_in',
            'revision': 1,
            'answeredAt': '2026-11-20T03:01:00.000Z',
            'pickedUp': true,
          },
        },
      ),
    );
    expect([for (final d in inbox.needs) d.id], ['login-gh']);
    expect(inbox.openCount, 0);
    expect(inbox.history, isEmpty);
  });

  test('firing alerts count in FYI', () {
    final inbox = groups(
      fleetSampleJson(
        decisions: const [],
        alerts: [
          {
            'id': 'web-availability',
            'service': 'web',
            'severity': 'page',
            'indicator': 'availability',
            'burnLong': 14.4,
            'burnShort': 20.1,
            'startedAt': '2026-11-20T02:50:00.000Z',
          },
        ],
      ),
    );
    expect(inbox.alertCount, 1);
    expect(inbox.fyiCount, 1);
  });
}
