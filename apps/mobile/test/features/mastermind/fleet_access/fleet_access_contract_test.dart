import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';

import 'fleet_access_fakes.dart';

// Product rule: apps/docs/platform/features/fleet-access.mdx#mastermind-mobile
// Wire contract: apps/docs/reference/api-reference/fleet-access.mdx
void main() {
  group('access answer', () {
    test('disabled, stopped and enabled answers parse', () {
      final disabled = FleetAccess.parse(const {
        'enabled': false,
        'tier': null,
        'projects': <String>[],
        'capabilities': <String>[],
        'stopped': true,
      });
      expect(disabled.enabled, isFalse);
      expect(disabled.stopped, isTrue);

      final enabled = FleetAccess.parse(const {
        'enabled': true,
        'tier': 'observer',
        'projects': ['platform'],
        'capabilities': ['status.read', 'ask', 'intent.request'],
        'stopped': false,
      });
      expect(enabled, observerAccess);
      expect(enabled.approves, isFalse);
    });

    test('anything else is unreadable rather than enabled', () {
      for (final json in <Object?>[
        null,
        {'enabled': 'true', 'stopped': false},
        {
          'enabled': true,
          'tier': 'root',
          'projects': <String>[],
          'capabilities': <String>[],
          'stopped': false,
        },
        {
          'enabled': true,
          'tier': 'observer',
          'projects': ['Platform'],
          'capabilities': <String>[],
          'stopped': false,
        },
        // A stopped Fleet never admits anyone.
        {
          'enabled': true,
          'tier': 'observer',
          'projects': <String>[],
          'capabilities': <String>[],
          'stopped': true,
        },
      ]) {
        expect(() => FleetAccess.parse(json), throwsFormatException);
      }
    });
  });

  group('digest', () {
    Map<String, Object?> sectionJson({bool stale = false}) => {
      'projectKey': 'platform',
      'generatedAt': '2026-11-21T08:58:00.000Z',
      'receivedAt': '2026-11-21T09:00:00.000Z',
      'stale': stale,
      'lanes': [
        {
          'lane': 'Release train',
          'state': 'blocked',
          'eta': '2026-11-21T12:00:00.000Z',
          'shortSha': 'abc1234',
          'blockerCodes': ['release_hold', 'ci'],
        },
      ],
    };

    test('sections carry generated and received times and lanes', () {
      final digest = FleetDigest.parse({
        'sections': [sectionJson()],
        'totals': const {'projects': 1, 'lanes': 1},
      });
      final s = digest.sections.single;
      expect(s.generatedAt, DateTime.utc(2026, 11, 21, 8, 58));
      expect(s.receivedAt, DateTime.utc(2026, 11, 21, 9));
      expect(s.lanes.single.blockers, [
        FleetBlocker.releaseHold,
        FleetBlocker.ci,
      ]);
      expect(digest.count(FleetLaneState.blocked), 1);
    });

    test('stale follows the server flag or an hour since receipt', () {
      final fresh = FleetDigestSection.parse(sectionJson());
      final received = DateTime.utc(2026, 11, 21, 9);
      expect(fresh.staleAt(received.add(const Duration(minutes: 59))), isFalse);
      expect(fresh.staleAt(received.add(const Duration(hours: 1))), isTrue);
      expect(
        FleetDigestSection.parse(sectionJson(stale: true)).staleAt(received),
        isTrue,
      );
    });

    test('an unknown lane state or blocker is unreadable', () {
      final json = sectionJson();
      (json['lanes']! as List).add({
        'lane': 'Other',
        'state': 'sleeping',
        'blockerCodes': <String>[],
      });
      expect(() => FleetDigestSection.parse(json), throwsFormatException);
    });
  });

  test('receipts parse with typed kinds and states', () {
    final page = FleetIntentPage.parse({
      'intents': [
        {
          'id': 'fc000000-0000-4000-8000-000000000002',
          'kind': 'priority.set',
          'state': 'pending_approval',
          'createdAt': '2026-11-21T08:00:00.000Z',
        },
      ],
      'nextBefore': null,
    });
    expect(page.intents.single.kind, FleetIntentKind.prioritySet);
    expect(page.intents.single.state, FleetIntentState.pendingApproval);
    expect(page.nextBefore, isNull);
  });

  test('a link preview must not report a finished link and back', () {
    expect(
      FleetLinkPreview.parse(const {
        'linked': false,
        'channel': 'whatsapp',
        'accountLabel': 'Mira WhatsApp',
      }).channel,
      FleetChannel.whatsapp,
    );
    expect(
      () => FleetLinkPreview.parse(const {
        'linked': false,
        'channel': 'telegram',
        'accountLabel': 'Mira',
      }),
      throwsFormatException,
    );
  });

  test('errors map to closed categories, never server text', () {
    FleetAccessFailure of(Object error) =>
        FleetAccessException.from(error).failure;
    expect(of(fleetApiError(401)), FleetAccessFailure.session);
    expect(
      of(fleetApiError(403, 'inactive_grant')),
      FleetAccessFailure.forbidden,
    );
    expect(
      of(fleetApiError(403, 'invalid_confirmation')),
      FleetAccessFailure.invalidConfirmation,
    );
    expect(
      of(fleetApiError(409, 'identity_already_linked')),
      FleetAccessFailure.alreadyLinked,
    );
    expect(
      of(fleetApiError(409, 'stale_project_mapping')),
      FleetAccessFailure.staleMapping,
    );
    expect(of(fleetApiError(429)), FleetAccessFailure.quota);
    expect(of(fleetApiError(400)), FleetAccessFailure.invalid);
    expect(of(fleetApiError(503)), FleetAccessFailure.unavailable);
    expect(
      of(const ApiException.transport(message: 'offline')),
      FleetAccessFailure.unavailable,
    );
    expect(of(const FormatException('x')), FleetAccessFailure.unreadable);
  });

  group('request draft', () {
    test('every missing field of a kind is reported', () {
      const draft = FleetIntentDraft(kind: FleetIntentKind.approveDeploy);
      expect(draft.validate(), {
        FleetDraftField.project: FleetDraftError.required,
        FleetDraftField.target: FleetDraftError.required,
        FleetDraftField.environment: FleetDraftError.required,
        FleetDraftField.commitSha: FleetDraftError.required,
      });
    });

    test('targets and commits must match the server syntax', () {
      const draft = FleetIntentDraft(
        kind: FleetIntentKind.approveProductionChange,
        projectKey: 'platform',
        targetKey: 'Lane Alpha',
        commitSha: 'abc1234',
      );
      expect(draft.validate(), {
        FleetDraftField.target: FleetDraftError.invalid,
        FleetDraftField.commitSha: FleetDraftError.invalid,
      });
    });

    test('a comment needs its text, and every note is capped', () {
      const comment = FleetIntentDraft(
        kind: FleetIntentKind.comment,
        projectKey: 'platform',
        targetKey: 'lane-alpha',
        quote: '   ',
      );
      expect(comment.validate(), {
        FleetDraftField.quote: FleetDraftError.required,
      });
      expect(comment.copyWith(quote: 'x' * 1001).validate(), {
        FleetDraftField.quote: FleetDraftError.tooLong,
      });
    });

    test('the body holds only the fields the kind sends', () {
      const draft = FleetIntentDraft(
        kind: FleetIntentKind.statusQuestion,
        projectKey: 'platform',
        topic: FleetTopic.timeline,
        // Left over from another kind; never sent.
        targetKey: 'lane-alpha',
        priority: FleetPriority.high,
      );
      expect(draft.validate(), isEmpty);
      expect(draft.toJson(), {
        'kind': 'status_question',
        'payload': {'projectKey': 'platform', 'topic': 'timeline'},
      });

      const change = FleetIntentDraft(
        kind: FleetIntentKind.approveProductionChange,
        projectKey: 'platform',
        targetKey: ' change-1 ',
        commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        quote: ' ship it ',
      );
      expect(change.toJson(), {
        'kind': 'approve.production_change',
        'payload': {
          'projectKey': 'platform',
          'targetKey': 'change-1',
          'environment': 'production',
          'commitSha': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        'quote': 'ship it',
      });
    });

    test('an Observer is offered every kind as a request for the owner', () {
      expect(
        FleetIntentKind.values.where((k) => k.offeredBy(observerAccess)),
        FleetIntentKind.values,
      );
      const readOnly = FleetAccess(
        enabled: true,
        tier: FleetTier.observer,
        capabilities: {'status.read'},
      );
      expect(
        FleetIntentKind.values.where((k) => k.offeredBy(readOnly)),
        isEmpty,
      );
    });
  });
}
