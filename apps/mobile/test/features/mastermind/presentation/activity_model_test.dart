import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/presentation/activity_model.dart';

import '../../../helpers/mastermind_home_fixture.dart';

// homeJson(): lanes running ×2, waiting, queued, failed; the default fleet
// point (at generated_at, coverage ok) reads running 1, waiting 1, idle 1 and
// unknown 1; needs-you holds an FYI, an action and two decisions, all open.
Map<String, dynamic> _fleet(Map<String, dynamic> root) =>
    (root['observability'] as Map<String, dynamic>)['fleet']
        as Map<String, dynamic>;

void main() {
  group('MastermindActivity.from', () {
    test('prefers the hub work.counts, which equal its lane statuses', () {
      final json = homeJson()
        ..['work'] = {
          'counts': {'running': 3, 'waiting': 2, 'idle': 13},
        };
      final activity = MastermindActivity.from(parsedSnapshot(json));
      expect(activity.source, ActivitySource.hub);
      expect((activity.running, activity.waiting, activity.idle), (3, 2, 13));
      // Queued and failed always come from the lanes.
      expect((activity.queued, activity.failed), (1, 1));
    });

    test('uses a recent fleet point before the lane states', () {
      final activity = MastermindActivity.from(parsedSnapshot(homeJson()));
      expect(activity.source, ActivitySource.fleet);
      expect((activity.running, activity.waiting, activity.idle), (1, 1, 1));
      expect(activity.notReporting, 1);
      expect((activity.queued, activity.failed), (1, 1));
    });

    test('falls back to lane states when the fleet point is stale', () {
      final json = homeJson();
      final series = _fleet(json)['series'] as List<dynamic>;
      (series.first as Map<String, dynamic>)['t'] = '2026-01-31T17:14:00+00:00';
      final activity = MastermindActivity.from(parsedSnapshot(json));
      expect(activity.source, ActivitySource.lanes);
      expect((activity.running, activity.waiting, activity.idle), (2, 1, 0));
    });

    test('falls back to lane states when fleet coverage is missing', () {
      final json = homeJson();
      _fleet(json)['coverage'] = 'missing';
      final activity = MastermindActivity.from(parsedSnapshot(json));
      expect(activity.source, ActivitySource.lanes);
      expect(activity.running, 2);
      expect(activity.notReporting, 0);
    });

    test('counts open decisions and actions as waiting on you, not FYI', () {
      final activity = MastermindActivity.from(parsedSnapshot(homeJson()));
      expect(activity.waitingOnYou, 3);
      final none = MastermindActivity.from(
        parsedSnapshot(homeJson(needsYou: false)),
      );
      expect(none.waitingOnYou, 0);
    });
  });
}
