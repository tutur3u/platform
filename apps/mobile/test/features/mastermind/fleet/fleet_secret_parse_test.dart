import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

import 'secret_test_support.dart';

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#wire-format
void main() {
  Map<String, dynamic> decision(Object? secret, {String? id}) => {
    'id': id ?? 'secret-0123456789abcdef01234567',
    'kind': 'secret',
    'title': 'Secret',
    'urgency': 'high',
    'createdAt': '2026-11-22T10:00:00.000Z',
    'secret': secret,
  };

  test('parses the fixture request and pairing', () {
    final request = FleetDecision.parse(decision(requestSecretJson()))!;
    expect(request.kind, FleetDecisionKind.secret);
    final secret = request.secret! as FleetSecretRequest;
    expect(secret.parsedCommand.argv.first, '/usr/bin/ssh');
    expect(secret.audienceIds, hasLength(2));
    final pairing = pairDecision();
    expect(pairing.secret, isA<FleetSecretPairing>());
  });

  test('drops a secret decision whose payload is off-shape', () {
    final bad = <Map<String, Object?>>[
      {'v': '2'},
      {'mode': 'other'},
      {'requestId': 'secret-XYZ'},
      {'machineId': 'Has Space'},
      {'requester': 'lane-1'},
      {'command': '["/usr/bin/true"]'},
      {'command': '{"argv":[]}'},
      {'command': '{"argv":["/bin/x"],"env":{}}'},
      {'command': '{"argv":["/bin/x"],"remote":[1]}'},
      {'output': 'stdout'},
      {'purpose': ''},
      {'purpose': 'line\nbreak'},
      {'expiresAt': '2026-11-22T10:10:00Z'},
      {'expiresAt': '2026-13-22T10:10:00.000Z'},
      {'publicKey': 'QxDul9iMwfCIpVdsd6sM9cOseX89lROcbIS1QpxZZip'},
      {'publicKey': 'QxDul9iMwfCIpVdsd6sM9cOseX89lROcbIS1QpxZZio='},
      {'signerKey': 'short'},
      {
        'audience':
            'ffffffffffffffffffffffffffffffff,1325b850c2871916eae203f0efc3c898',
      },
      {'audience': '1325b850c2871916eae203f0efc3c898,'},
      {'sig': 'AAAA'},
      {'purpose': null},
    ];
    for (final change in bad) {
      expect(
        FleetDecision.parse(decision(requestSecretJson(change))),
        isNull,
        reason: '$change',
      );
    }
    expect(FleetDecision.parse(decision(null)), isNull);
    expect(FleetDecision.parse(decision('text')), isNull);
  });

  test('keeps an id mismatch for the verifier to explain', () {
    final parsed = FleetDecision.parse(
      decision(requestSecretJson(), id: 'secret-ffffffffffffffffffffffff'),
    );
    expect(parsed, isNotNull);
    expect(parsed!.secret!.signedId, isNot(parsed.id));
  });

  test('a snapshot drops bad secret entries and keeps the rest', () {
    final snapshot = secretSnapshot(
      decisions: [
        decision(requestSecretJson()),
        decision(requestSecretJson({'output': 'x'}), id: 'secret-bad'),
        {
          'id': 'ask',
          'title': 'Roll back?',
          'urgency': 'urgent',
          'createdAt': '2026-11-22T10:00:00.000Z',
        },
      ],
      resolved: [
        {
          'id': 'pair-0123456789abcdef01234567',
          'kind': 'secret',
          'title': 'Pair',
          'resolvedAt': '2026-11-22T10:05:00.000Z',
          'secretOutcome': {
            'outcome': 'paired',
            'answerDigest': '1325b850c2871916eae203f0efc3c898',
            'sig': (secretFixture['outcome'] as Map<String, dynamic>)['sig'],
          },
        },
        {
          'id': 'secret-old',
          'kind': 'secret',
          'title': 'Old',
          'resolvedAt': '2026-11-22T10:04:00.000Z',
          'secretOutcome': {'outcome': 'nope', 'answerDigest': '', 'sig': ''},
        },
      ],
    );
    expect(snapshot.decisions.map((d) => d.id), [
      'secret-0123456789abcdef01234567',
      'ask',
    ]);
    expect(
      snapshot.resolved.first.secretOutcome?.outcome,
      FleetSecretOutcomeKind.paired,
    );
    expect(snapshot.resolved.last.secretOutcome, isNull);
  });
}
