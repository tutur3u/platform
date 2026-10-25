import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../../helpers/pump_app.dart';

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  Size size = const Size(390, 844),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.reset);
  await tester.pumpThemedHome(
    Material(
      type: MaterialType.transparency,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: child,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('AppAdaptiveGrid.columnsFor', () {
    test('fits as many min-width columns as the width allows', () {
      expect(AppAdaptiveGrid.columnsFor(358), 2);
      expect(AppAdaptiveGrid.columnsFor(772), 4);
      expect(AppAdaptiveGrid.columnsFor(120), 1);
      expect(AppAdaptiveGrid.columnsFor(1376, maxColumns: 6), 6);
      expect(AppAdaptiveGrid.columnsFor(0), 1);
      expect(AppAdaptiveGrid.columnsFor(double.infinity), 1);
    });

    testWidgets('equal-height rows stretch tiles to the tallest', (
      tester,
    ) async {
      await _pump(
        tester,
        const AppAdaptiveGrid(
          equalHeight: true,
          children: [
            AppStatTile(key: ValueKey('a'), label: 'Done', value: '28'),
            AppStatTile(
              key: ValueKey('b'),
              label: 'Focus',
              value: '14h',
              caption: 'Goal 20h',
              progress: 0.7,
            ),
          ],
        ),
      );
      final a = tester.getRect(find.byKey(const ValueKey('a')));
      final b = tester.getRect(find.byKey(const ValueKey('b')));
      expect(a.height, b.height);
      expect(a.top, b.top);
      expect(a.right, lessThan(b.left));
    });
  });

  testWidgets('AppFilterBar selects one option and exposes selection', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    var selected = 'all';
    await _pump(
      tester,
      StatefulBuilder(
        builder: (context, setState) => AppFilterBar<String>(
          options: const [
            AppFilterOption(value: 'all', label: 'All', count: 4),
            AppFilterOption(value: 'open', label: 'Open'),
          ],
          selected: selected,
          onSelected: (value) => setState(() => selected = value),
          trailing: AppFilterButton(
            label: 'Newest',
            tooltip: 'Sort',
            onPressed: () {},
          ),
        ),
      ),
    );
    expect(
      tester.getSemantics(find.text('All')),
      matchesSemantics(
        isSelected: true,
        hasSelectedState: true,
        isInMutuallyExclusiveGroup: true,
        isButton: true,
        label: 'All\n4',
        hasTapAction: true,
        hasFocusAction: true,
        isFocusable: true,
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pump();
    expect(selected, 'open');
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });

  testWidgets('AppSectionHeader shows its action only with a callback', (
    tester,
  ) async {
    var taps = 0;
    await _pump(
      tester,
      Column(
        children: [
          const AppSectionHeader(title: 'Plain', actionLabel: 'Hidden'),
          AppSectionHeader(
            title: 'Today',
            count: 3,
            actionLabel: 'See all',
            onAction: () => taps++,
          ),
        ],
      ),
    );
    expect(find.text('Hidden'), findsNothing);
    expect(find.text('3'), findsOneWidget);
    await tester.tap(find.text('See all'));
    expect(taps, 1);
  });

  testWidgets('AppStatTile shows value, trend and responds to taps', (
    tester,
  ) async {
    var taps = 0;
    await _pump(
      tester,
      AppStatTile(
        label: 'Spent',
        value: '5.7M',
        icon: LucideIcons.wallet,
        tone: AppTone.warning,
        trend: const AppStatTrend(
          label: '-8%',
          direction: AppTrendDirection.down,
          positive: true,
        ),
        onTap: () => taps++,
      ),
    );
    final trendIcon = tester.widget<Icon>(
      find.byIcon(LucideIcons.arrowDownRight),
    );
    final colors = AppTokens.of(tester.element(find.text('5.7M'))).colorScheme;
    // A falling expense is good news, so it reads as success.
    expect(trendIcon.color, colors.success);
    await tester.tap(find.text('5.7M'));
    expect(taps, 1);
  });

  testWidgets('AppRichRow marks the selected row for assistive tech', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    var taps = 0;
    await _pump(
      tester,
      AppRichRow(
        title: 'Design retainer',
        subtitle: 'Studio North',
        meta: const [AppMetaItem(icon: LucideIcons.clock, label: '09:40')],
        trailing: const Text('+8,000,000'),
        trailingCaption: 'VND',
        selected: true,
        onTap: () => taps++,
      ),
    );
    expect(
      tester.getSemantics(find.text('Design retainer')),
      isSemantics(isSelected: true, isButton: true),
    );
    await tester.tap(find.text('Design retainer'));
    expect(taps, 1);
    expect(
      tester.getSize(find.byType(AppRichRow)).height,
      greaterThanOrEqualTo(kMinInteractiveDimension),
    );
    handle.dispose();
  });

  testWidgets('AppMeter clamps its value and reports a percentage', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await _pump(tester, const AppMeter(value: 1.4));
    expect(
      tester.getSemantics(find.byType(AppMeter)),
      matchesSemantics(value: '100%'),
    );
    handle.dispose();
  });

  testWidgets('AppSummaryHero moves facts beside the headline when wide', (
    tester,
  ) async {
    Widget hero() => const AppSummaryHero(
      eyebrow: 'October',
      headline: '12,480,000',
      facts: [AppHeroFact(label: 'Income', value: '18.2M')],
    );
    await _pump(tester, hero());
    final narrowHeadline = tester.getRect(find.text('12,480,000'));
    final narrowFact = tester.getRect(find.text('18.2M'));
    expect(narrowFact.top, greaterThan(narrowHeadline.bottom));

    await _pump(tester, hero(), size: const Size(1024, 800));
    final wideHeadline = tester.getRect(find.text('12,480,000'));
    final wideFact = tester.getRect(find.text('18.2M'));
    expect(wideFact.left, greaterThan(wideHeadline.right));
  });

  testWidgets('AppPanel and AppSummaryHero turn solid in high contrast', (
    tester,
  ) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(highContrast: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await _pump(
      tester,
      const Column(
        children: [
          AppPanel(title: 'Budget', child: Text('body')),
          AppSummaryHero(eyebrow: 'October', headline: '12'),
        ],
      ),
    );
    final colors = AppTokens.of(tester.element(find.text('body'))).colorScheme;
    final boxes = tester
        .widgetList<Container>(
          find.descendant(
            of: find.byType(AppSummaryHero),
            matching: find.byType(Container),
          ),
        )
        .map((c) => c.decoration)
        .whereType<BoxDecoration>();
    expect(boxes.first.gradient, isNull);
    expect(boxes.first.color, colors.card);
    final panel = tester.widget<DecoratedBox>(
      find
          .descendant(
            of: find.byType(AppPanel),
            matching: find.byType(DecoratedBox),
          )
          .first,
    );
    expect((panel.decoration as BoxDecoration).color, colors.card);
  });

  testWidgets('AppSegmentedControl switches modes with selection semantics', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    var selected = 'day';
    await _pump(
      tester,
      StatefulBuilder(
        builder: (context, setState) => AppSegmentedControl<String>(
          segments: const [
            AppSegment(value: 'day', label: 'Day'),
            AppSegment(value: 'week', label: 'Week'),
          ],
          selected: selected,
          onChanged: (value) => setState(() => selected = value),
        ),
      ),
    );
    expect(
      tester.getSemantics(find.text('Day')),
      isSemantics(isSelected: true, isInMutuallyExclusiveGroup: true),
    );
    await tester.tap(find.text('Week'));
    await tester.pump();
    expect(selected, 'week');
    expect(
      tester.getSize(find.text('Day')).width,
      lessThan(tester.getSize(find.byType(AppSegmentedControl<String>)).width),
    );
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    handle.dispose();
  });

  test('AppSlicePosition marks the ends of a run', () {
    expect(AppSlicePosition.of(0, 1), AppSlicePosition.only);
    expect(AppSlicePosition.of(0, 3), AppSlicePosition.first);
    expect(AppSlicePosition.of(1, 3), AppSlicePosition.middle);
    expect(AppSlicePosition.of(2, 3), AppSlicePosition.last);
    expect(AppSlicePosition.first.roundsTop, isTrue);
    expect(AppSlicePosition.middle.roundsBottom, isFalse);
  });
}
