import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

import '../../../../helpers/helpers.dart';

class _TimezoneCubit extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

void main() {
  // 09:26 on 29 Oct in GMT+7; [at] is five minutes earlier.
  final start = DateTime.utc(2026, 10, 29, 2, 26);
  final at = DateTime.utc(2026, 10, 29, 2, 21);
  late DateTime now;

  setUp(() => now = start);

  Future<void> pumpLabel(
    WidgetTester tester,
    Widget child, {
    String locale = 'en',
    double textScale = 1,
    double width = 400,
    TimezoneSettingsCubit? timezone,
  }) {
    Widget body = Center(
      child: SizedBox(width: width, child: child),
    );
    if (timezone != null) {
      body = BlocProvider<TimezoneSettingsCubit>.value(
        value: timezone,
        child: body,
      );
    }
    return tester.pumpApp(
      MastermindClockScope(
        now: () => now,
        child: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: Localizations.override(
              context: context,
              locale: Locale(locale),
              child: body,
            ),
          ),
        ),
      ),
    );
  }

  /// The visible words of every label on screen, without the clock glyph.
  List<String> visible(WidgetTester tester) => [
    for (final text in tester.widgetList<Text>(
      find.descendant(
        of: find.byType(MastermindTimeLabel),
        matching: find.byType(Text),
      ),
    ))
      text.textSpan!.toPlainText(includePlaceholders: false),
  ];

  testWidgets('shows the relative value followed by a clock', (tester) async {
    await pumpLabel(tester, MastermindTimeLabel(at));
    expect(visible(tester), ['5m']);
    expect(find.byIcon(LucideIcons.clock), findsOneWidget);
  });

  testWidgets('a sentence wraps the value and keeps the clock last', (
    tester,
  ) async {
    await pumpLabel(
      tester,
      MastermindTimeLabel(at, sentence: (time) => 'Updated $time'),
    );
    expect(visible(tester), ['Updated 5m']);
    final text = tester.widget<Text>(
      find.descendant(
        of: find.byType(MastermindTimeLabel),
        matching: find.byType(Text),
      ),
    );
    expect((text.textSpan! as TextSpan).children!.last, isA<WidgetSpan>());
  });

  testWidgets('a long press shows the absolute time in GMT+7', (tester) async {
    await pumpLabel(tester, MastermindTimeLabel(at));
    expect(find.text('29 Oct, 09:21 GMT+7'), findsNothing);
    await tester.longPress(find.byType(MastermindTimeLabel));
    await tester.pump();
    expect(find.text('29 Oct, 09:21 GMT+7'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('a tap on the clock shows the absolute time', (tester) async {
    await pumpLabel(tester, MastermindTimeLabel(at));
    await tester.tap(find.byIcon(LucideIcons.clock));
    await tester.pump();
    expect(find.text('29 Oct, 09:21 GMT+7'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('the clock is a 48 dp target and the words are not', (
    tester,
  ) async {
    await pumpLabel(tester, MastermindTimeLabel(at));
    final clock = tester.getSize(find.byType(FocusableActionDetector));
    expect(clock.width, greaterThanOrEqualTo(kMinInteractiveDimension));
    expect(clock.height, greaterThanOrEqualTo(kMinInteractiveDimension));
    // A tap on the words never shows the tooltip, so a row still opens.
    await tester.tapAt(
      tester.getTopLeft(find.byType(MastermindTimeLabel)) + const Offset(4, 4),
    );
    await tester.pump();
    expect(find.text('29 Oct, 09:21 GMT+7'), findsNothing);
  });

  testWidgets('the clock is reachable and activated from the keyboard', (
    tester,
  ) async {
    await pumpLabel(tester, MastermindTimeLabel(at));
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    // Keyboard focus shows the absolute time and its offset.
    expect(find.text('29 Oct, 09:21 GMT+7'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('29 Oct, 09:21 GMT+7'), findsNothing);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump();
    expect(find.text('29 Oct, 09:21 GMT+7'), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.enter);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('29 Oct, 09:21 GMT+7'), findsNothing);
    for (final visible in [true, false]) {
      await tester.sendKeyEvent(LogicalKeyboardKey.space);
      await tester.pump(const Duration(seconds: 1));
      expect(
        find.text('29 Oct, 09:21 GMT+7'),
        visible ? findsOneWidget : findsNothing,
      );
    }
  });

  testWidgets('screen readers can activate the label to show the time', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await pumpLabel(tester, MastermindTimeLabel(at));
    final node = tester.getSemantics(find.byType(MastermindTimeLabel));
    expect(
      node,
      isSemantics(
        isButton: true,
        hasTapAction: true,
        hasLongPressAction: true,
        hint: 'Show exact time',
      ),
    );
    tester.semantics.tap(find.semantics.byLabel(RegExp('5 minutes ago')));
    await tester.pump();
    expect(find.text('29 Oct, 09:21 GMT+7'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    handle.dispose();
  });

  testWidgets('the spoken label includes the zone offset', (tester) async {
    final handle = tester.ensureSemantics();
    final cubit = _TimezoneCubit();
    whenListen(
      cubit,
      const Stream<TimezoneSettingsState>.empty(),
      initialState: const TimezoneSettingsState(
        personal: 'Europe/London',
        loading: false,
        resolved: true,
      ),
    );
    final summer = DateTime.utc(2026, 7, 15, 8, 21);
    now = summer.add(const Duration(minutes: 5));
    await pumpLabel(tester, MastermindTimeLabel(summer), timezone: cubit);
    expect(
      tester.getSemantics(find.byType(MastermindTimeLabel)).label,
      '5 minutes ago, 15 July 09:21 GMT+1',
    );
    handle.dispose();
  });

  testWidgets('screen readers get the spoken age and absolute time', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await pumpLabel(tester, MastermindTimeLabel(at));
    expect(
      tester.getSemantics(find.byType(MastermindTimeLabel)).label,
      '5 minutes ago, 29 October 09:21 GMT+7',
    );
    // The tooltip text is not announced twice.
    expect(find.bySemanticsLabel('29 Oct, 09:21 GMT+7'), findsNothing);
    handle.dispose();
  });

  testWidgets('the sentence is applied to the spoken label too', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await pumpLabel(
      tester,
      MastermindTimeLabel(at, sentence: (time) => 'Updated $time'),
    );
    expect(
      tester.getSemantics(find.byType(MastermindTimeLabel)).label,
      'Updated 5 minutes ago, 29 October 09:21 GMT+7',
    );
    handle.dispose();
  });

  testWidgets('every label refreshes from one shared ticker', (tester) async {
    expect(MastermindClock.instance.isTicking, isFalse);
    await pumpLabel(
      tester,
      Column(children: [MastermindTimeLabel(at), MastermindTimeLabel(at)]),
    );
    expect(visible(tester), ['5m', '5m']);
    expect(MastermindClock.instance.isTicking, isTrue);

    now = start.add(const Duration(minutes: 1));
    await tester.pump(MastermindClock.period);
    expect(visible(tester), ['6m', '6m']);

    now = start.add(const Duration(hours: 1));
    await tester.pump(MastermindClock.period);
    expect(visible(tester), ['1h', '1h']);

    // The last label to leave stops the timer.
    await tester.pumpWidget(const SizedBox.shrink());
    expect(MastermindClock.instance.isTicking, isFalse);
  });

  testWidgets('the ticker period keeps a label under a minute stale', (
    tester,
  ) async {
    expect(
      MastermindClock.period,
      lessThanOrEqualTo(const Duration(minutes: 1)),
    );
    await pumpLabel(tester, MastermindTimeLabel(at));
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('uses the Settings time zone when one is resolved', (
    tester,
  ) async {
    final cubit = _TimezoneCubit();
    whenListen(
      cubit,
      const Stream<TimezoneSettingsState>.empty(),
      initialState: const TimezoneSettingsState(
        personal: 'Europe/London',
        loading: false,
        resolved: true,
      ),
    );
    // 08:21 UTC in July is 09:21 BST.
    final summer = DateTime.utc(2026, 7, 15, 8, 21);
    now = summer.add(const Duration(minutes: 5));
    await pumpLabel(tester, MastermindTimeLabel(summer), timezone: cubit);
    await tester.longPress(find.byType(MastermindTimeLabel));
    await tester.pump();
    expect(find.text('15 Jul, 09:21 GMT+1'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('an unresolved Settings zone falls back to GMT+7', (
    tester,
  ) async {
    final cubit = _TimezoneCubit();
    whenListen(
      cubit,
      const Stream<TimezoneSettingsState>.empty(),
      initialState: const TimezoneSettingsState(),
    );
    await pumpLabel(tester, MastermindTimeLabel(at), timezone: cubit);
    await tester.longPress(find.byType(MastermindTimeLabel));
    await tester.pump();
    expect(find.text('29 Oct, 09:21 GMT+7'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('vi', (tester) async {
    final handle = tester.ensureSemantics();
    await pumpLabel(tester, MastermindTimeLabel(at), locale: 'vi');
    expect(visible(tester), ['5 phút']);
    expect(
      tester.getSemantics(find.byType(MastermindTimeLabel)).label,
      '5 phút trước, 29 tháng 10 09:21 GMT+7',
    );
    await tester.longPress(find.byType(MastermindTimeLabel));
    await tester.pump();
    expect(find.text('29 thg 10, 09:21 GMT+7'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    handle.dispose();
  });

  testWidgets('a date-old value shows the short date', (tester) async {
    await pumpLabel(
      tester,
      MastermindTimeLabel(start.subtract(const Duration(days: 9))),
    );
    expect(visible(tester), ['20 Oct']);
  });

  testWidgets('a sentence at 2.0× text in 320 px wraps without overflow', (
    tester,
  ) async {
    await pumpLabel(
      tester,
      MastermindTimeLabel(
        at,
        sentence: (time) => 'Mastermind could not refresh, showing $time',
      ),
      textScale: 2,
      width: 320,
    );
    expect(tester.takeException(), isNull);
    expect(visible(tester), ['Mastermind could not refresh, showing 5m']);
    // The clock scales with the text.
    final icon = tester.widget<Icon>(find.byIcon(LucideIcons.clock));
    expect(icon.size, 24);
  });
}
