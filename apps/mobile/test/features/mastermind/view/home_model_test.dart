import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';

import '../../../helpers/mastermind_home_fixture.dart';

void main() {
  group('MastermindHomeModel', () {
    final model = MastermindHomeModel.from(parsedSnapshot(homeJson()));

    test('orders needs-you decision, action, fyi, then publisher order', () {
      expect(model.needsYou.map((item) => item.title), [
        'First decision',
        'Second decision',
        'Action item',
        'Fyi note',
      ]);
      expect(model.needsYouShown, hasLength(3));
      expect(model.needsYouShown.last.title, 'Action item');
    });

    test('counts only normal items and keeps security rows apart', () {
      expect(model.needsYouCount, 4);
      expect(model.security, hasLength(1));
      expect(model.security.single.product, Product.mastermind);
    });

    test('tallies lanes by state and ignores security lanes', () {
      expect(model.laneCounts, {
        LaneState.running: 2,
        LaneState.waiting: 1,
        LaneState.queued: 1,
        LaneState.failed: 1,
      });
    });

    test('lists failing environments separately from releases', () {
      expect(model.failingEnvironments, hasLength(1));
      expect(model.failingEnvironments.single.environment, Environment.staging);
      expect(model.releases, hasLength(1));
    });

    test('takes the newest three decisions and five events', () {
      expect(model.decisions.map((d) => d.title), [
        'Decision log 3',
        'Decision log 2',
        'Decision log 1',
      ]);
      expect(model.activity, hasLength(5));
      expect(model.activity.first.seq, 8);
      final times = model.activity.map((event) => event.ts).toList();
      expect([...times]..sort((a, b) => b.compareTo(a)), times);
    });

    test('an export with only security rows has no normal items', () {
      final only = MastermindHomeModel.from(
        parsedSnapshot(homeJson(needsYou: false)),
      );
      expect(only.needsYou, isEmpty);
      expect(only.needsYouCount, 0);
      expect(only.security, hasLength(1));
    });
  });
}
