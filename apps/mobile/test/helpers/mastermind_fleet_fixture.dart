import 'dart:async';

import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';

/// Wall clock for fleet tests: two minutes after the sample was received.
final fleetTestNow = DateTime.utc(2026, 11, 20, 3, 2);

/// A synthetic fleet snapshot envelope, as `GET /fleet/state` returns it.
Map<String, dynamic> fleetSampleJson({
  List<Map<String, dynamic>>? decisions,
  Map<String, dynamic> answers = const {},
  String receivedAt = '2026-11-20T03:00:00.000Z',
  List<Map<String, dynamic>>? resolved,
  Map<String, dynamic>? release,
  List<Map<String, dynamic>>? alerts,
}) => {
  'receivedAt': receivedAt,
  'answers': answers,
  'alerts': ?alerts,
  'state': {
    'version': 1,
    'generatedAt': '2026-11-20T02:59:58.000Z',
    'orchestrator': {
      'label': 'Iris',
      'state': 'running',
      'lastActiveAt': '2026-11-20T02:59:00.000Z',
    },
    'counts': {'running': 3, 'waiting': 1, 'queued': 1, 'idle': 6, 'failed': 1},
    'machines': [
      {'id': 'skr-m4', 'label': 'M4', 'status': 'online'},
      {
        'id': 'macstudio1',
        'label': 'MacStudio1',
        'status': 'online',
        'lastSeenAt': '2026-11-20T02:58:00.000Z',
      },
      {
        'id': 'macbook-m3',
        'label': 'Macbook M3',
        'status': 'offline',
        'lastSeenAt': '2026-11-19T17:56:00.000Z',
      },
    ],
    'lanes': [
      _lane('lane-a', 'Mobile Mastermind rebuild', 'running', 'claude'),
      _lane('lane-b', 'Gateway apex mounts', 'running', 'codex'),
      _lane('lane-c', 'CI green on main', 'running', 'codex'),
      _lane('lane-d', 'Mira channel threads', 'waiting', 'codex'),
      _lane('lane-e', 'Perf regression workflow', 'queued', 'claude'),
      _lane('lane-f', 'Prod migration check', 'failed', 'codex'),
      _lane('lane-g', 'Docs cleanup', 'idle', 'claude', machine: 'macstudio1'),
      {'id': 'broken'},
    ],
    'decisions':
        decisions ??
        [
          {
            'id': 'ship-fleet-sync',
            'title': 'Ship fleet sync to production?',
            'body': 'Web endpoints and the publisher are green on main.',
            'urgency': 'urgent',
            'options': [
              {'id': 'now', 'label': 'Ship now'},
              {'id': 'tonight', 'label': 'Tonight'},
            ],
            'recommendedOptionId': 'now',
            'createdAt': '2026-11-20T02:40:00.000Z',
            'deadlineAt': '2026-11-20T10:00:00.000Z',
          },
          {
            'id': 'pool-switch',
            'title': 'Move the M4 lanes to the second pool?',
            'urgency': 'normal',
            'createdAt': '2026-11-20T02:50:00.000Z',
          },
        ],
    'resolved': ?resolved,
    'release': ?release,
  },
};

/// An open access request, as the publisher sends it with the `login`
/// feature.
Map<String, dynamic> fleetLoginJson({
  String id = 'login-gh',
  String service = 'github',
  String flow = 'device',
  String state = 'waiting',
  String? url = 'https://github.com/login/device',
  String? userCode = '8F3K-Q2MX',
  String? expiresAt = '2026-11-20T03:12:00.000Z',
  String machineId = 'macstudio1',
  String urgency = 'high',
}) => {
  'id': id,
  'kind': 'login',
  'title': 'Sign in to GitHub for the release bot',
  'why': 'The release bot sign-off needs repo scope.',
  'requester': 'release-bot-signoff',
  'urgency': urgency,
  'createdAt': '2026-11-20T02:58:00.000Z',
  'login': {
    'service': service,
    'flow': flow,
    'state': state,
    'url': ?url,
    'userCode': ?userCode,
    'expiresAt': ?expiresAt,
    'machineId': machineId,
  },
};

Map<String, dynamic> _lane(
  String id,
  String title,
  String state,
  String provider, {
  String machine = 'skr-m4',
}) => {
  'id': id,
  'title': title,
  'project': 'tuturuuu',
  'provider': provider,
  'model': provider == 'claude' ? 'claude-opus-5-5' : 'gpt-6.2',
  'machineId': machine,
  'state': state,
  'updatedAt': '2026-11-20T02:55:00.000Z',
};

class FakeFleetSource implements FleetSource {
  FakeFleetSource({Map<String, dynamic>? json})
    : json = json ?? fleetSampleJson();

  Map<String, dynamic> json;
  Exception? fetchError;
  Exception? answerError;
  int fetches = 0;
  final answers = <Map<String, Object?>>[];
  Completer<void>? answerGate;

  @override
  Future<FleetSnapshot> fetch() async {
    fetches++;
    if (fetchError case final error?) throw error;
    return FleetSnapshot.parse(json);
  }

  @override
  Future<FleetAnswerReceipt> answer({
    required String decisionId,
    required FleetAnswerAction action,
    required String idempotencyKey,
    String? optionId,
    String? text,
  }) async {
    answers.add({
      'decisionId': decisionId,
      'action': action,
      'key': idempotencyKey,
      'optionId': optionId,
      'text': text,
    });
    await answerGate?.future;
    if (answerError case final error?) throw error;
    // Like Web, a recorded answer comes back as a receipt on later reads.
    final receipts = json['answers'];
    json = {
      ...json,
      'answers': <String, dynamic>{
        if (receipts is Map<String, dynamic>) ...receipts,
        decisionId: {
          'action': action.wire,
          'optionId': ?optionId,
          'revision': 1,
          'answeredAt': fleetTestNow.toIso8601String(),
          'pickedUp': false,
        },
      },
    };
    return FleetAnswerReceipt(
      action: action,
      revision: 1,
      answeredAt: fleetTestNow,
      pickedUp: false,
      optionId: optionId,
    );
  }
}

/// A retry timer that never fires and leaves nothing pending: widget tests
/// drive retries through Retry now, resume or the cubit itself.
Timer inertFleetTimer(Duration delay, void Function() callback) =>
    _InertTimer();

final class _InertTimer implements Timer {
  @override
  bool get isActive => false;

  @override
  int get tick => 0;

  @override
  void cancel() {}
}
