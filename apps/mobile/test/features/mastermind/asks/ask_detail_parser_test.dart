import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/asks/ask_detail.dart';
import 'package:mobile/features/mastermind/model/enums.dart';

import '../../../helpers/mastermind_ask_details_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';

Map<String, dynamic> _minimal([Map<String, dynamic> extra = const {}]) => {
  'id': inboxItemId(1),
  'version_hash': inboxHash('a'),
  ...extra,
};

void main() {
  test('parses the full payload', () {
    final detail = parseAskDetail(askDetailBody(inboxItemId(1)))!;
    expect(detail.id, inboxItemId(1));
    expect(detail.versionHash, inboxHash('a'));
    expect(detail.askText, startsWith('Full synthetic ask'));
    expect(detail.options, ['Approve', 'Defer']);
    expect(detail.recommendedOption, 'Approve');
    expect(detail.reason, 'Synthetic reason: the plan is ready.');
    expect(detail.defaultOption, 'Defer');
    expect(detail.urgency, AskUrgency.high);
    expect(detail.deadline, AskDeadline.today);
    expect(detail.deadlineAt, DateTime.utc(2026, 1, 31, 12));
    expect(detail.reversible, isTrue);
    expect(detail.blocksCount, 2);
    expect(detail.ownerName, 'Synthetic owner');
    expect(detail.actionKind, AskActionKind.answer);
    expect(detail.actionSummary, 'Pick an option here.');
    expect(detail.risk, 'Low');
    expect(detail.answeredVia, isNull);
  });

  test('keeps only https links on the tuturuuu.com allowlist', () {
    final detail = parseAskDetail(askDetailBody(inboxItemId(1)))!;
    expect(detail.links.map((link) => link.url.toString()), [
      'https://tuturuuu.com/synthetic/plan',
      'https://ci.tuturuuu.com/synthetic/run',
    ]);
    expect(
      isAllowedAskLink(Uri.parse('https://user:pw@tuturuuu.com/x')),
      isFalse,
    );
    expect(isAllowedAskLink(Uri.parse('https://eviltuturuuu.com/x')), isFalse);
    expect(isAllowedAskLink(Uri.parse('tuturuuu://x')), isFalse);
  });

  test('covers every action kind in the fixture', () {
    final kinds = [
      for (var n = 1; n <= 4; n++)
        parseAskDetail(askDetailBody(inboxItemId(n)))!.actionKind,
    ];
    expect(kinds, AskActionKind.values);
  });

  test('a partial payload leaves absent sections empty', () {
    final detail = parseAskDetail(_minimal())!;
    expect(detail.askText, isNull);
    expect(detail.options, isEmpty);
    expect(detail.reason, isNull);
    expect(detail.defaultOption, isNull);
    expect(detail.links, isEmpty);
    expect(detail.actionKind, isNull);
    expect(detail.answeredVia, isNull);
  });

  test('unknown keys are ignored and unknown enums are absent', () {
    final detail = parseAskDetail(
      _minimal({
        'group_key': 'x',
        'action_kind': 'teleport',
        'urgency': 'whenever',
        'deadline': 'someday',
        'reversible': 'yes',
        'blocks_count': -1,
        'deadline_at': 'not a time',
        'links': [
          'https://tuturuuu.com',
          {'url': 'https://tuturuuu.com/no-label'},
        ],
      }),
    )!;
    expect(detail.actionKind, isNull);
    expect(detail.urgency, isNull);
    expect(detail.deadline, isNull);
    expect(detail.reversible, isNull);
    expect(detail.blocksCount, isNull);
    expect(detail.deadlineAt, isNull);
    expect(detail.links, isEmpty);
  });

  test('an unknown answered_via displays as elsewhere', () {
    expect(
      parseAskDetail(askDetailBody(inboxItemId(4)))!.answeredVia,
      AskAnsweredVia.elsewhere,
    );
    for (final via in ['phone', 'mac', 'chat', 'auto', 'batch']) {
      expect(
        parseAskDetail(_minimal({'answered_via': via}))!.answeredVia!.wireName,
        via,
      );
    }
  });

  test('an out-of-range default option is hidden', () {
    final detail = parseAskDetail(
      _minimal({
        'options': ['A'],
        'default_option_index': 3,
      }),
    )!;
    expect(detail.defaultOption, isNull);
  });

  test('a malformed identity rejects the payload', () {
    expect(parseAskDetail(null), isNull);
    expect(parseAskDetail(['x']), isNull);
    expect(parseAskDetail({'id': inboxItemId(1)}), isNull);
    expect(
      parseAskDetail({'id': 'bad', 'version_hash': inboxHash('a')}),
      isNull,
    );
  });
}
