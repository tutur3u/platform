import 'dart:async';

import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';

final fleetAccessTestNow = DateTime.utc(2026, 11, 21, 9);

const observerAccess = FleetAccess(
  enabled: true,
  tier: FleetTier.observer,
  projects: ['platform'],
  capabilities: {'status.read', 'ask', 'intent.request'},
);

const operatorAccess = FleetAccess(
  enabled: true,
  tier: FleetTier.operator,
  projects: ['platform', 'mobile'],
  capabilities: {'status.read', 'ask', 'comment', 'approve.low'},
);

ApiException fleetApiError(int status, [String message = 'error']) =>
    ApiException(message: message, statusCode: status);

const linkId = 'fc000000-0000-4000-8000-000000000010';
final String linkCode = 'a' * 43;
final String confirmationCode = 'b' * 43;

FleetDigestSection section({
  String project = 'platform',
  DateTime? receivedAt,
  bool stale = false,
  List<FleetDigestLane> lanes = const [
    FleetDigestLane(lane: 'Release train', state: FleetLaneState.running),
    FleetDigestLane(
      lane: 'Mobile review',
      state: FleetLaneState.blocked,
      blockers: [FleetBlocker.review],
    ),
  ],
}) {
  final received = receivedAt ?? fleetAccessTestNow;
  return FleetDigestSection(
    projectKey: project,
    generatedAt: received.subtract(const Duration(minutes: 2)),
    receivedAt: received,
    stale: stale,
    lanes: lanes,
  );
}

/// Answers each call from its queue (a value, or an error to throw), then
/// with the last answer again.
final class FakeFleetAccessSource implements FleetAccessSource {
  final accessAnswers = <Object>[observerAccess];
  final digestAnswers = <Object>[
    FleetDigest(sections: [section()]),
  ];
  final intentAnswers = <Object>[const FleetIntentPage(intents: [])];
  final submitAnswers = <Object>['fc000000-0000-4000-8000-000000000099'];
  final codeAnswers = <Object>[];
  final confirmAnswers = <Object>[];

  final submitted = <FleetIntentDraft>[];
  final confirmCalls = <({String linkId, String code, bool preview})>[];
  final intentCursors = <String?>[];
  int accessCalls = 0;
  int digestCalls = 0;

  /// Holds the next access answer until completed.
  Completer<void>? accessGate;

  T _next<T>(List<Object> answers) {
    final answer = answers.length > 1 ? answers.removeAt(0) : answers.single;
    if (answer case final Exception error) throw error;
    return answer as T;
  }

  @override
  Future<FleetAccess> access() async {
    accessCalls++;
    await accessGate?.future;
    return _next<FleetAccess>(accessAnswers);
  }

  @override
  Future<FleetDigest> digest() async {
    digestCalls++;
    return _next<FleetDigest>(digestAnswers);
  }

  @override
  Future<FleetIntentPage> intents({String? before}) async {
    intentCursors.add(before);
    return _next<FleetIntentPage>(intentAnswers);
  }

  @override
  Future<String> submit(FleetIntentDraft draft) async {
    submitted.add(draft);
    return _next<String>(submitAnswers);
  }

  @override
  Future<FleetLinkCode> createLinkCode() async => _next<FleetLinkCode>(
    codeAnswers.isEmpty
        ? [
            FleetLinkCode(
              code: linkCode,
              expiresAt: fleetAccessTestNow.add(const Duration(minutes: 10)),
            ),
          ]
        : codeAnswers,
  );

  @override
  Future<FleetLinkPreview> confirmLink({
    required String linkId,
    required String confirmationCode,
    required bool preview,
  }) async {
    confirmCalls.add((
      linkId: linkId,
      code: confirmationCode,
      preview: preview,
    ));
    if (confirmAnswers.isNotEmpty) {
      return _next<FleetLinkPreview>(confirmAnswers);
    }
    return FleetLinkPreview(
      channel: FleetChannel.zalo,
      accountLabel: 'Mira Zalo',
      linked: !preview,
    );
  }
}
