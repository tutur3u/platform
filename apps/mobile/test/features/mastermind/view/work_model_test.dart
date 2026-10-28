import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_work_fixture.dart';

MastermindWorkModel _model(
  List<Map<String, dynamic>> lanes, {
  String query = '',
  LaneState? state,
  Product? product,
}) => MastermindWorkModel.from(
  parsedSnapshot(workJson(lanes)),
  query: query,
  state: state,
  product: product,
);

void main() {
  group('grouping', () {
    test('lists states in priority order, whatever the publisher order', () {
      final model = _model([
        workLane(1, state: 'completed'),
        workLane(2, state: 'queued'),
        workLane(3),
        workLane(4, state: 'unknown'),
        workLane(5, state: 'failed'),
        workLane(6, state: 'waiting'),
        workLane(7, state: 'idle'),
        workLane(8, state: 'stale'),
        workLane(9, state: 'cancelled'),
      ]);
      expect(
        [for (final group in model.groups) group.state.wireName],
        [
          'failed',
          'waiting',
          'running',
          'queued',
          'idle',
          'stale',
          'completed',
          'cancelled',
          'unknown',
        ],
      );
    });

    test('sorts a group by age, oldest first, no age last', () {
      final model = _model([
        workLane(1, ageSeconds: null),
        workLane(2, ageSeconds: 60),
        workLane(3, ageSeconds: 9000),
        workLane(4, ageSeconds: 60),
      ]);
      expect(
        [for (final lane in model.groups.single.lanes) lane.title],
        ['Lane 3', 'Lane 2', 'Lane 4', 'Lane 1'],
      );
    });

    test('counts normal lanes per state and never the security row', () {
      final model = _model([
        workLane(1),
        workLane(2),
        workLane(3, state: 'failed'),
      ]);
      expect(model.total, 3);
      expect(model.stateCounts, {LaneState.running: 2, LaneState.failed: 1});
      expect(model.presentStates, [LaneState.failed, LaneState.running]);
      expect(model.security, hasLength(1));
      expect(model.groups.expand((group) => group.lanes), hasLength(3));
    });
  });

  group('filters', () {
    final lanes = [
      workLane(1, state: 'failed', product: 'Mastermind'),
      workLane(2, title: 'Billing sync', role: 'Ops'),
      workLane(3, state: 'failed'),
    ];

    test('state narrows the groups but not the chip counts', () {
      final model = _model(lanes, state: LaneState.failed);
      expect(model.groups.single.lanes, hasLength(2));
      expect(model.stateCounts[LaneState.running], 1);
      expect(model.hasNoMatches, isFalse);
    });

    test('product and search combine', () {
      expect(
        _model(
          lanes,
          product: Product.mastermind,
        ).groups.single.lanes.single.title,
        'Lane 1',
      );
      expect(
        _model(lanes, query: ' billing ').groups.single.lanes.single.title,
        'Billing sync',
      );
      expect(_model(lanes, query: 'ops').shownCount, 1);
      expect(_model(lanes, query: 'zzz').hasNoMatches, isTrue);
    });

    test('a state with no lanes shows nothing but is not empty', () {
      final model = _model(lanes, state: LaneState.idle);
      expect(model.shownCount, 0);
      expect(model.hasNoMatches, isTrue);
      expect(model.isEmpty, isFalse);
    });

    test('search never matches the security row', () {
      expect(_model(lanes, query: 'security').shownCount, 0);
    });
  });

  group('query and lookup', () {
    test('?state= names a lane state or is ignored', () {
      expect(laneStateFromQuery('failed'), LaneState.failed);
      expect(laneStateFromQuery('Failed'), isNull);
      expect(laneStateFromQuery('bogus'), isNull);
      expect(laneStateFromQuery(null), isNull);
    });

    test('laneById finds a normal lane and never a security row', () {
      final snapshot = parsedSnapshot(workJson([workLane(1)]));
      expect(laneById(snapshot, laneId(1))?.title, 'Lane 1');
      expect(laneById(snapshot, laneId(2)), isNull);
      expect(laneById(snapshot, ''), isNull);
    });

    test('lane ids are encoded in the route path only', () {
      expect(
        Routes.mastermindWorkLanePath('item-0a/b'),
        '/mastermind/work/lane/item-0a%2Fb',
      );
    });
  });
}
