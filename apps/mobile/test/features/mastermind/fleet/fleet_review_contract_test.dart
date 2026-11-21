import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_fetch_clock_store.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';

class _Api extends Mock implements ApiClient {}

const assetId =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

Map<String, dynamic> fleetReviewJson({
  String id = 'review-inbox',
  Object? mockupUrl = 'https://claude.ai/artifact/abc-123',
  Object? preview = const {
    'source': 'asset',
    'assetId': assetId,
    'contentType': 'image/png',
  },
}) => {
  'id': id,
  'kind': 'review',
  'title': 'Review the Inbox redesign',
  'why': 'Two lanes, numbered options and inline replies.',
  'urgency': 'high',
  'createdAt': '2026-11-20T02:58:00.000Z',
  'review': {'mockupUrl': mockupUrl, 'preview': ?preview},
};

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#design-review-asks
void main() {
  FleetDecision? parse(Map<String, dynamic> json) => FleetDecision.parse(json);

  group('design reviews', () {
    test('parses a review with an uploaded preview', () {
      final decision = parse(fleetReviewJson())!;
      expect(decision.kind, FleetDecisionKind.review);
      expect(decision.why, 'Two lanes, numbered options and inline replies.');
      final review = decision.review!;
      expect(review.mockupUrl.toString(), 'https://claude.ai/artifact/abc-123');
      final preview = review.preview! as FleetAssetPreview;
      expect(preview.assetId, assetId);
      expect(preview.contentType, 'image/png');
    });

    test('accepts claude.ai artifact paths and first-party hosts only', () {
      for (final url in [
        'https://claude.ai/artifact/x',
        'https://claude.ai/code/artifact/x',
        'https://claude.ai/public/artifacts/x',
        'https://tuturuuu.com/design/x',
        'https://mastermind.tuturuuu.com/x',
      ]) {
        expect(fleetSafeReviewLink(url), isNotNull, reason: url);
      }
      for (final url in [
        'http://claude.ai/artifact/x',
        'https://claude.ai/chat/x',
        'https://claude.ai.evil.com/artifact/x',
        'https://evil-tuturuuu.com/x',
        'https://tuturuuu.com.evil.com/x',
        'https://user:pass@tuturuuu.com/x',
        'https://tuturuuu.com:8443/x',
        'https://tuturuuu.com/x#frag',
        'javascript:alert(1)',
        'https://${'a' * 2050}.tuturuuu.com/',
        42,
      ]) {
        expect(fleetSafeReviewLink(url), isNull, reason: '$url');
      }
    });

    test('a hosted preview must be a first-party image without a query', () {
      expect(
        fleetSafeReviewImage('https://cdn.tuturuuu.com/mock/inbox.PNG'),
        isNotNull,
      );
      for (final url in [
        'https://cdn.tuturuuu.com/mock/inbox.png?v=1',
        'https://cdn.tuturuuu.com/mock/inbox.svg',
        'https://claude.ai/artifact/inbox.png',
        'https://example.com/inbox.png',
        'http://cdn.tuturuuu.com/inbox.png',
      ]) {
        expect(fleetSafeReviewImage(url), isNull, reason: url);
      }
    });

    test('drops a review whose mockup link fails, keeps one whose preview '
        'fails', () {
      expect(parse(fleetReviewJson(mockupUrl: 'https://evil.com/x')), isNull);
      expect(parse({...fleetReviewJson(), 'review': null}), isNull);
      for (final preview in [
        {'source': 'hosted', 'url': 'https://evil.com/a.png'},
        {'source': 'asset', 'assetId': 'ABC', 'contentType': 'image/png'},
        {'source': 'asset', 'assetId': assetId, 'contentType': 'image/svg'},
        {'source': 'file', 'file': 'a.png'},
      ]) {
        final decision = parse(fleetReviewJson(preview: preview));
        expect(decision?.review, isNotNull, reason: '$preview');
        expect(decision!.review!.preview, isNull, reason: '$preview');
      }
      final hosted = parse(
        fleetReviewJson(
          preview: const {
            'source': 'hosted',
            'url': 'https://tuturuuu.com/r/inbox.webp',
          },
        ),
      );
      expect(hosted!.review!.preview, isA<FleetHostedPreview>());
    });

    test('request_changes is its own answer action', () {
      expect(FleetAnswerAction.requestChanges.wire, 'request_changes');
      final receipt = FleetAnswerReceipt.parse({
        'action': 'request_changes',
        'revision': 2,
        'answeredAt': '2026-11-20T03:01:00.000Z',
      });
      expect(receipt?.action, FleetAnswerAction.requestChanges);
    });
  });

  group('failure split', () {
    test('reads resolution counts and lane resolutions', () {
      final json = fleetSampleJson();
      final state = json['state'] as Map<String, dynamic>;
      state['counts'] = {
        'running': 9,
        'waiting': 0,
        'queued': 0,
        'idle': 41,
        'failed': 3,
        'recovered': 2,
        'quotaRecovered': 6,
        'cancelled': 31,
      };
      (state['lanes'] as List).add({
        'id': 'lane-r',
        'title': 'Retried',
        'machineId': 'skr-m4',
        'state': 'idle',
        'resolution': 'quotaRecovered',
        'updatedAt': '2026-11-20T02:55:00.000Z',
      });
      final snapshot = FleetSnapshot.parse(json);
      expect(snapshot.counts.failed, 3);
      expect(snapshot.counts.resolved, 39);
      expect(
        snapshot.lanes.singleWhere((l) => l.id == 'lane-r').resolution,
        FleetLaneResolution.quotaRecovered,
      );
    });

    test('an older publisher without the split reads as zero', () {
      final snapshot = FleetSnapshot.parse(fleetSampleJson());
      expect(snapshot.counts.resolved, 0);
      expect(snapshot.lanes.every((l) => l.resolution == null), isTrue);
    });
  });

  group('review assets', () {
    late _Api api;
    setUp(() => api = _Api());

    test('reads an asset by its hash, capped at 200 KiB', () async {
      when(
        () => api.getBytes(any(), maxBytes: any(named: 'maxBytes')),
      ).thenAnswer((_) async => Uint8List.fromList([1, 2, 3]));
      final bytes = await FleetRepository(api: api).reviewAsset(assetId);
      expect(bytes, [1, 2, 3]);
      verify(
        () => api.getBytes(
          '/api/v1/mastermind/fleet/review-assets/$assetId',
          maxBytes: 200 * 1024,
        ),
      ).called(1);
    });

    test('never requests anything but a content hash', () async {
      await expectLater(
        FleetRepository(api: api).reviewAsset('../state'),
        throwsA(isA<FleetException>()),
      );
      verifyNever(() => api.getBytes(any(), maxBytes: any(named: 'maxBytes')));
    });
  });

  group('last successful fetch', () {
    test('is kept across cubits and survives a failing refresh', () async {
      final store = MemoryFleetFetchClockStore();
      final source = FakeFleetSource();
      final first = FleetCubit(
        source: source,
        fetchClock: store,
        clock: () => fleetTestNow,
      );
      await first.refresh();
      expect(first.state.lastFetchedAt, fleetTestNow);
      await first.close();

      final restarted = FleetCubit(
        source: source..fetchError = Exception('offline'),
        fetchClock: store,
        clock: () => fleetTestNow.add(const Duration(hours: 1)),
      )..attach();
      await Future<void>.delayed(Duration.zero);
      await restarted.refresh();
      expect(restarted.state.lastFetchedAt, fleetTestNow);
      expect(restarted.state.failure, FleetFailure.unavailable);
      await restarted.close();
    });
  });
}
