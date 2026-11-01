import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_insight.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_options.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/mastermind_replies_fixture.dart';

// Semantic widget tests for the Inbox ask card: no goldens. The variants are
// full + recommended, incomplete, risky, expired, answered, long text and many
// options, in light and dark, at large text and in Vietnamese.

final DateTime _now = DateTime.utc(2026, 11, 2, 3);

const _longText =
    'Line one of a long ask that keeps going so that it needs more room than '
    'four lines. Line two adds detail about the consequence of each option. '
    'Line three explains the history behind this decision for the owner. '
    'Line four lists everything that has been tried already, in order. '
    'Line five names the people affected and what they have been told. '
    'Line six repeats the deadline and the risk in plain words. '
    'Line seven is the last line and must only appear once expanded.';

NeedsYou _item({
  String title = 'Ship the Orchid release candidate?',
  String body = 'The candidate is green and waiting for a go.',
  List<String> options = const ['Ship now', 'Hold until Monday', 'Staging'],
  String? recommended = 'Ship now',
  ItemState state = ItemState.open,
  AskV2Fields v2 = askV2FieldsEmpty,
  AskUrgency? urgency,
  String? by,
}) => NeedsYou(
  id: inboxItemId(1),
  title: title,
  body: body,
  options: options,
  recommendedOption: recommended,
  state: state,
  versionHash: inboxHash('a'),
  kind: ItemKind.decision,
  hubTitle: title,
  hubText: body,
  urgency: urgency,
  by: by,
  createdAt: _now.subtract(const Duration(hours: 2)),
  askV2: v2,
);

AskV2Fields _v2({
  List<AskOption> options = const [],
  String? recommendedId,
  String? why,
  AskInboxClass? inboxClass,
  AskRiskClass? risk,
  AskStatus? status,
  AskResolvedVia? via,
  DateTime? deadline,
  bool? reversible,
}) => AskV2Fields(
  optionsV2: options,
  recommendedId: recommendedId,
  recommendedWhy: why,
  inboxClass: inboxClass,
  riskClass: risk,
  status: status,
  resolvedVia: via,
  deadlineAt: deadline,
  reversible: reversible,
);

Future<void> _pump(
  WidgetTester tester,
  NeedsYou item, {
  MastermindAskCardVariant variant = MastermindAskCardVariant.list,
  ValueChanged<int>? onSelect,
  VoidCallback? onOpen,
  Locale locale = const Locale('en'),
  bool dark = false,
  double scale = 1,
  Size size = const Size(390, 3000),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: AppearanceTheme.materialTheme(
        const AppearanceSettings(),
        dark ? Brightness.dark : Brightness.light,
      ),
      home: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: Scaffold(
            body: SingleChildScrollView(
              child: MastermindAskCard(
                ask: inboxAskFor(item, now: _now),
                title: item.hubTitle ?? item.title,
                variant: variant,
                now: _now,
                onOpen: onOpen,
                onSelectOption: onSelect,
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

final AskV2Fields _threeOptions = _v2(
  options: const [
    AskOption(id: 'a', label: 'Ship now', note: 'Promotes to production.'),
    AskOption(id: 'b', label: 'Hold until Monday'),
    AskOption(id: 'c', label: 'Staging'),
  ],
  recommendedId: 'b',
  why: 'Fewer services are active on weekends.',
  inboxClass: AskInboxClass.urgent,
  deadline: DateTime.utc(2026, 11, 2, 3, 30),
  reversible: true,
);

Finder _tiles() => find.byType(AskOptionTile);

List<String> _tileLabels(WidgetTester tester) => [
  for (final tile in tester.widgetList<AskOptionTile>(_tiles()))
    tile.option.label,
];

void main() {
  group('full card with a recommendation', () {
    testWidgets('shows question, text, every option and the why', (
      tester,
    ) async {
      final taps = <int>[];
      await _pump(tester, _item(v2: _threeOptions), onSelect: taps.add);
      expect(find.text('Ship the Orchid release candidate?'), findsOneWidget);
      expect(
        find.text('The candidate is green and waiting for a go.'),
        findsOneWidget,
      );
      // The recommended option moves first, the rest keep publisher order.
      expect(_tileLabels(tester), ['Hold until Monday', 'Ship now', 'Staging']);
      expect(find.text('Recommended'), findsOneWidget);
      expect(
        find.text('Fewer services are active on weekends.'),
        findsOneWidget,
      );
      expect(find.text('Promotes to production.'), findsOneWidget);
      // Chips carry text and an icon.
      expect(find.text('Urgent'), findsOneWidget);
      expect(find.textContaining('Due '), findsOneWidget);
      expect(find.text('Reversible'), findsOneWidget);
      expect(find.text('Reply in your own words'), findsNothing);

      // Tapping reports the wire index, not the display position.
      await tester.tap(find.text('Hold until Monday'));
      await tester.tap(find.text('Ship now'));
      expect(taps, [1, 0]);
    });

    testWidgets('every target is at least 48 dp, and labels never ellipsize', (
      tester,
    ) async {
      await _pump(tester, _item(v2: _threeOptions), onSelect: (_) {});
      for (final tile in _tiles().evaluate()) {
        final size = tester.getSize(find.byWidget(tile.widget));
        expect(size.height, greaterThanOrEqualTo(48));
        // Full width of the card, less its 16 dp padding on each side.
        expect(size.width, 390 - 32);
      }
      final label = tester.widget<Text>(find.text('Hold until Monday'));
      expect(label.overflow, isNot(TextOverflow.ellipsis));
      expect(label.maxLines, isNull);
    });

    testWidgets('reads as one node: tier, due, title, recommended, count', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await _pump(tester, _item(v2: _threeOptions), onOpen: () {});
      final node = tester.getSemantics(
        find.bySemanticsLabel(RegExp('^Urgent. Due ')),
      );
      expect(
        node.label,
        allOf(
          contains('Ship the Orchid release candidate?'),
          contains('Recommended: Hold until Monday'),
          endsWith('3 options'),
        ),
      );
      expect(node.hint, 'Opens the ask');
      final recommended = tester.getSemantics(
        find.bySemanticsLabel(RegExp('^Recommended. Hold until Monday')),
      );
      expect(recommended.flagsCollection.isButton, isTrue);
      handle.dispose();
    });

    testWidgets('a legacy ask with only options and recommended_option works', (
      tester,
    ) async {
      await _pump(
        tester,
        _item(options: const ['Yes', 'No'], recommended: 'No'),
        onSelect: (_) {},
      );
      expect(_tileLabels(tester), ['No', 'Yes']);
      expect(find.text('Recommended'), findsOneWidget);
      expect(find.text('Needs decision'), findsOneWidget);
    });
  });

  group('incomplete card', () {
    NeedsYou incomplete() =>
        _item(body: '', options: const [], recommended: null);

    testWidgets('says so, shows no options and offers the full question', (
      tester,
    ) async {
      var opened = 0;
      await _pump(
        tester,
        incomplete(),
        onSelect: (_) => fail('one-tap answer must be off'),
        onOpen: () => opened++,
      );
      expect(find.text('Incomplete card'), findsOneWidget);
      expect(
        find.textContaining('The publisher sent only part of this ask'),
        findsOneWidget,
      );
      expect(_tiles(), findsNothing);
      await tester.tap(find.text('Open full question'));
      expect(opened, 1);
    });

    testWidgets('options that are present stay visible but disabled', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      final item = _item(
        v2: _v2(
          options: const [
            AskOption(id: 'a', label: 'Yes'),
            AskOption(id: 'b', label: 'No'),
          ],
        ),
      );
      final cut = NeedsYou(
        id: item.id,
        title: item.title,
        body: item.body,
        options: item.options,
        recommendedOption: item.recommendedOption,
        state: item.state,
        versionHash: item.versionHash,
        kind: item.kind,
        hubTitle: item.hubTitle,
        askTruncated: true,
        askV2: item.askV2,
      );
      await _pump(
        tester,
        cut,
        onSelect: (_) => fail('one-tap answer must be off'),
        onOpen: () {},
      );
      expect(find.text('Incomplete card'), findsOneWidget);
      expect(_tileLabels(tester), ['Yes', 'No']);
      await tester.tap(find.text('Yes'), warnIfMissed: false);
      final yes = tester.getSemantics(find.bySemanticsLabel('Yes'));
      expect(yes.flagsCollection.isEnabled, ui.Tristate.isFalse);
      expect(find.text('Open full question'), findsOneWidget);
      handle.dispose();
    });
  });

  group('risky card', () {
    final risky = _v2(
      options: const [
        AskOption(id: 'a', label: 'Rotate now', note: 'Irreversible.'),
        AskOption(id: 'b', label: 'Schedule for the weekend'),
      ],
      recommendedId: 'b',
      why: 'Fewer services are active on weekends.',
      risk: AskRiskClass.deploy,
      inboxClass: AskInboxClass.urgent,
      reversible: false,
    );

    testWidgets('never answers on one tap and opens the detail instead', (
      tester,
    ) async {
      var opened = 0;
      await _pump(
        tester,
        _item(
          title: 'Rotate the production signing key?',
          options: const ['Rotate now', 'Schedule for the weekend'],
          recommended: 'Schedule for the weekend',
          v2: risky,
        ),
        onSelect: (_) => fail('a risky ask is never one tap'),
        onOpen: () => opened++,
      );
      expect(find.text('Needs Face ID or fingerprint'), findsOneWidget);
      expect(find.text('One-way'), findsOneWidget);
      expect(_tileLabels(tester), ['Schedule for the weekend', 'Rotate now']);
      await tester.tap(find.text('Rotate now'), warnIfMissed: false);
      await tester.tap(find.text('Open to answer with Face ID'));
      expect(opened, 1);
    });
  });

  group('unrecognised risk class', () {
    testWidgets('is never one tap and opens the detail instead', (
      tester,
    ) async {
      var opened = 0;
      await _pump(
        tester,
        _item(
          title: 'Rotate the production signing key?',
          options: const ['Rotate now', 'Schedule for the weekend'],
          recommended: 'Schedule for the weekend',
          v2: _v2(
            options: const [
              AskOption(id: 'a', label: 'Rotate now'),
              AskOption(id: 'b', label: 'Schedule for the weekend'),
            ],
            recommendedId: 'b',
            risk: AskRiskClass.unknown,
          ),
        ),
        onSelect: (_) => fail('an unrecognised risk is never one tap'),
        onOpen: () => opened++,
      );
      expect(find.text('Needs Face ID or fingerprint'), findsOneWidget);
      await tester.tap(find.text('Rotate now'), warnIfMissed: false);
      await tester.tap(find.text('Open to answer with Face ID'));
      expect(opened, 1);
    });
  });

  group('other phases', () {
    testWidgets('an expired ask is closed and says so', (tester) async {
      await _pump(
        tester,
        _item(v2: _v2(status: AskStatus.expired)),
        onSelect: (_) => fail('an expired ask is closed'),
        onOpen: () {},
      );
      expect(find.text('Expired'), findsOneWidget);
      expect(find.textContaining('answering is closed'), findsOneWidget);
      expect(find.text('Urgent'), findsNothing);
      expect(find.text('Reply in your own words'), findsNothing);
    });

    testWidgets('an answered ask names where it was answered', (tester) async {
      await _pump(
        tester,
        _item(
          state: ItemState.answered,
          v2: _v2(via: AskResolvedVia.discord),
        ),
        onSelect: (_) => fail('an answered ask is closed'),
      );
      expect(find.text('Answered on Discord'), findsOneWidget);
    });
  });

  group('text and options in place', () {
    testWidgets('long text clamps to four lines and expands in place', (
      tester,
    ) async {
      await _pump(tester, _item(body: _longText, v2: _threeOptions));
      expect(tester.widget<Text>(find.textContaining('Line one')).maxLines, 4);
      await tester.tap(find.text('Show full text'));
      await tester.pump();
      expect(
        find.textContaining('Line seven is the last line'),
        findsOneWidget,
      );
      expect(find.text('Show less'), findsOneWidget);
      await tester.tap(find.text('Show less'));
      await tester.pump();
      expect(find.text('Show full text'), findsOneWidget);
    });

    testWidgets('the detail variant never clamps and has no toggle', (
      tester,
    ) async {
      await _pump(
        tester,
        _item(body: _longText),
        variant: MastermindAskCardVariant.detail,
      );
      expect(
        find.textContaining('Line seven is the last line'),
        findsOneWidget,
      );
      expect(find.text('Show full text'), findsNothing);
    });

    testWidgets('chat clamps harder than the list', (tester) async {
      await _pump(
        tester,
        _item(body: _longText),
        variant: MastermindAskCardVariant.chat,
      );
      expect(tester.widget<Text>(find.textContaining('Line one')).maxLines, 2);
    });

    testWidgets('past four options the rest fold into a disclosure', (
      tester,
    ) async {
      final options = [for (var i = 1; i <= 6; i++) 'Option $i'];
      await _pump(
        tester,
        _item(options: options, recommended: 'Option 5'),
        onSelect: (_) {},
      );
      // The recommended option plus three others.
      expect(_tileLabels(tester), [
        'Option 5',
        'Option 1',
        'Option 2',
        'Option 3',
      ]);
      expect(find.text('+2 more options'), findsOneWidget);
      await tester.tap(find.text('+2 more options'));
      await tester.pump();
      expect(_tiles(), findsNWidgets(6));
      expect(find.text('Show fewer options'), findsOneWidget);
    });

    testWidgets('the detail variant always shows every option', (tester) async {
      final options = [for (var i = 1; i <= 6; i++) 'Option $i'];
      await _pump(
        tester,
        _item(options: options),
        variant: MastermindAskCardVariant.detail,
      );
      expect(_tiles(), findsNWidgets(6));
      expect(find.textContaining('more options'), findsNothing);
    });
  });

  group('themes, locales and large text', () {
    for (final dark in [false, true]) {
      for (final locale in const [Locale('en'), Locale('vi')]) {
        testWidgets(
          '${dark ? 'dark' : 'light'} ${locale.languageCode} at 2x on 320',
          (tester) async {
            await _pump(
              tester,
              _item(
                title: 'Rotate the production signing key before the weekend?',
                body: _longText,
                v2: _v2(
                  options: const [
                    AskOption(
                      id: 'a',
                      label: 'Rotate now and tell every dependent team first',
                      note: 'Immediate and irreversible.',
                    ),
                    AskOption(id: 'b', label: 'Schedule for the weekend'),
                  ],
                  recommendedId: 'b',
                  why: 'Fewer services are active on weekends.',
                  risk: AskRiskClass.deploy,
                  inboxClass: AskInboxClass.urgent,
                  deadline: DateTime.utc(2026, 11, 2, 11),
                  reversible: false,
                ),
              ),
              onOpen: () {},
              locale: locale,
              dark: dark,
              scale: 2,
              size: const Size(320, 6000),
            );
            expect(tester.takeException(), isNull);
            for (final tile in _tiles().evaluate()) {
              expect(
                tester.getSize(find.byWidget(tile.widget)).height,
                greaterThanOrEqualTo(48),
              );
            }
          },
        );
      }
    }
  });
  group('detail page insight', () {
    Future<void> pumpInsight(WidgetTester tester, NeedsYou item) =>
        tester.pumpWidget(
          MaterialApp(
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(
              body: AskCardInsight(item: item, now: _now),
            ),
          ),
        );

    testWidgets('shows the risk chips and why the option is recommended', (
      tester,
    ) async {
      await pumpInsight(
        tester,
        _item(
          v2: _v2(
            options: const [
              AskOption(id: 'a', label: 'Ship now'),
              AskOption(id: 'b', label: 'Hold until Monday'),
            ],
            recommendedId: 'b',
            why: 'Fewer services are active on weekends.',
            risk: AskRiskClass.deploy,
          ),
        ),
      );
      expect(find.text('Needs Face ID or fingerprint'), findsOneWidget);
      expect(
        find.text(
          'Recommended: Hold until Monday. '
          'Fewer services are active on weekends.',
        ),
        findsOneWidget,
      );
      // The page already shows the tier and timing; they do not repeat.
      expect(find.text('Urgent'), findsNothing);
    });

    testWidgets('renders nothing for an older hub', (tester) async {
      await pumpInsight(tester, _item());
      expect(find.byType(Text), findsNothing);
    });

    testWidgets('marks a card whose options are missing', (tester) async {
      await pumpInsight(tester, _item(options: const [], recommended: null));
      expect(find.text('Incomplete card'), findsOneWidget);
      expect(
        find.textContaining('The publisher sent only part of this ask'),
        findsOneWidget,
      );
    });
  });
}
