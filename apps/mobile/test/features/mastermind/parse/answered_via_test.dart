import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/answered_via_labels.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/open_asks.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

Map<String, dynamic> _history(Map<String, dynamic> extra) =>
    inboxJson([])
      ..['decisions_resolved'] = [
        {...inboxItem(1), 'status': 'resolved', 'resolution': 'Approve'}
          ..addAll(extra),
      ];

void main() {
  test('answered_via matches the security enum and localizes batch', () async {
    expect(AnsweredVia.values.map((via) => via.wireName).toSet(), {
      'phone',
      'mac',
      'chat',
      'auto',
      'batch',
    });
    expect(AnsweredVia.fromWire('batch'), AnsweredVia.batch);
    for (final language in ['en', 'vi']) {
      final l10n = await AppLocalizations.delegate.load(Locale(language));
      expect(
        answeredViaText(l10n, AnsweredVia.batch),
        language == 'en' ? 'Answered in batch' : 'Đã trả lời theo lô',
      );
      expect(
        alreadyAnsweredText(l10n, AnsweredVia.batch),
        language == 'en'
            ? 'Already answered in batch'
            : 'Đã được trả lời theo lô',
      );
      expect(answeredByParts(l10n, AnsweredVia.batch), [
        if (language == 'en') 'in batch' else 'theo lô',
      ]);
      expect(
        answeredViaText(l10n, AnsweredVia.fromWire('unknown')),
        l10n.mastermindAnsweredElsewhere,
      );
    }
  });

  test('answered_via parses on history rows and open rows', () {
    for (final via in AnsweredVia.values) {
      final snapshot = parsedSnapshot(_history({'answered_via': via.wireName}));
      expect(snapshot.resolvedItems.single.answeredVia, via);
    }
    final open = parsedItem({...inboxItem(2), 'answered_via': 'chat'});
    expect(open.answeredVia, AnsweredVia.chat);
  });

  test('an unknown or malformed answered_via is left out, not fatal', () {
    for (final value in ['watch', 7, null, '']) {
      final snapshot = parsedSnapshot(_history({'answered_via': value}));
      final item = snapshot.resolvedItems.single;
      expect(item.answeredVia, isNull);
      expect(item.resolution, 'Approve');
    }
  });

  test('a withdrawn history row stays withdrawn without an answer', () {
    for (final extra in [
      {'status': 'withdrawn'},
      {'state': 'withdrawn'},
    ]) {
      final snapshot = parsedSnapshot(
        _history({...extra, 'answered_via': 'mac'}),
      );
      final item = snapshot.resolvedItems.single;
      expect(item.state, ItemState.withdrawn);
      expect(item.resolution, isNull);
      expect(item.answeredVia, isNull);
      expect(openAsks(snapshot), isEmpty);
      expect(resolvedNeedsYouById(snapshot, inboxItemId(1)), same(item));
    }
  });
}
