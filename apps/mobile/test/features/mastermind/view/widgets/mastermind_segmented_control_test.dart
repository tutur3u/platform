import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';

import '../../../../helpers/helpers.dart';

Future<List<String>> _pump(
  WidgetTester tester, {
  String selected = 'a',
  double textScale = 1,
}) async {
  final changes = <String>[];
  await tester.pumpApp(
    Builder(
      builder: (context) => MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(textScale)),
        child: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: 360,
            child: MastermindSegmentedControl<String>(
              selected: selected,
              onChanged: changes.add,
              segments: const [
                AppSegment(value: 'a', label: 'Needs you'),
                AppSegment(value: 'b', label: 'Decisions'),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  return changes;
}

void main() {
  testWidgets('a compact 32 pt track inside a 44 pt hit area', (tester) async {
    await _pump(tester);
    final control = tester.getSize(
      find.byType(MastermindSegmentedControl<String>),
    );
    expect(control.height, 44);
    final track = tester.getSize(
      find
          .descendant(
            of: find.byType(MastermindSegmentedControl<String>),
            matching: find.byType(DecoratedBox),
          )
          .first,
    );
    expect(track.height, MastermindSegmentedControl.trackHeight);
    // The old control was a tall pill; this one is visibly shorter.
    expect(track.height, lessThan(44));
  });

  testWidgets('every segment owns a full 44 pt target, edges included', (
    tester,
  ) async {
    final changes = await _pump(tester);
    final control = tester.getRect(
      find.byType(MastermindSegmentedControl<String>),
    );
    final label = tester.getCenter(find.text('Decisions'));
    expect(control.height, greaterThanOrEqualTo(44));
    // A tap in the transparent band above the track still selects, and so
    // does one in the band below it.
    await tester.tapAt(Offset(label.dx, control.top + 2));
    await tester.tapAt(Offset(label.dx, control.bottom - 2));
    expect(changes, ['b', 'b']);
  });

  testWidgets('announces selection in a mutually exclusive group', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    await _pump(tester);
    expect(
      tester.getSemantics(find.text('Needs you')),
      isSemantics(
        label: 'Needs you',
        isButton: true,
        isSelected: true,
        isInMutuallyExclusiveGroup: true,
        hasTapAction: true,
      ),
    );
    expect(
      tester.getSemantics(find.text('Decisions')),
      isSemantics(
        label: 'Decisions',
        isButton: true,
        isSelected: false,
        isInMutuallyExclusiveGroup: true,
      ),
    );
    handle.dispose();
  });

  testWidgets('grows with large text instead of clipping', (tester) async {
    await _pump(tester, textScale: 2);
    expect(tester.takeException(), isNull);
    final control = tester.getSize(
      find.byType(MastermindSegmentedControl<String>),
    );
    expect(control.height, greaterThanOrEqualTo(44));
    final label = tester.getRect(find.text('Needs you'));
    final box = tester.getRect(find.byType(MastermindSegmentedControl<String>));
    expect(box.top, lessThanOrEqualTo(label.top));
    expect(box.bottom, greaterThanOrEqualTo(label.bottom));
  });

  for (final labels in [
    ['Needs you', 'Resolved', 'Decisions'],
    ['Cần bạn', 'Đã xử lý', 'Quyết định'],
  ]) {
    for (final width in [320.0, 375.0, 390.0]) {
      for (final scale in [1.0, 1.3, 2.0]) {
        testWidgets('labels $labels width $width scale $scale', (tester) async {
          await tester.pumpApp(
            MediaQuery(
              data: MediaQueryData(textScaler: TextScaler.linear(scale)),
              child: Align(
                // Screen left edge at x = 0, plus the page's 16 pt gutter.
                alignment: Alignment.topLeft,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: SizedBox(
                    width: width - 32,
                    child: MastermindSegmentedControl<int>(
                      segments: [
                        for (var i = 0; i < labels.length; i++)
                          AppSegment(value: i, label: labels[i]),
                      ],
                      selected: 0,
                      onChanged: (_) {},
                    ),
                  ),
                ),
              ),
            ),
          );
          final screen = Rect.fromLTWH(0, 0, width, 800);
          for (final label in labels) {
            final paragraph = tester.renderObject<RenderParagraph>(
              find.text(label),
            );
            // Never truncated: no line limit, no ellipsis, no fade.
            expect(paragraph.didExceedMaxLines, isFalse, reason: label);
            expect(paragraph.maxLines, isNull, reason: label);
            expect(
              tester.widget<Text>(find.text(label)).overflow,
              isNot(TextOverflow.ellipsis),
            );
            // Fully on screen, and inside the control.
            final rect = tester.getRect(find.text(label));
            final control = tester.getRect(
              find.byType(MastermindSegmentedControl<int>),
            );
            expect(rect.left, greaterThanOrEqualTo(screen.left), reason: label);
            expect(rect.right, lessThanOrEqualTo(screen.right), reason: label);
            expect(rect.top, greaterThanOrEqualTo(screen.top), reason: label);
            expect(rect.left, greaterThanOrEqualTo(control.left));
            expect(rect.right, lessThanOrEqualTo(control.right));
            expect(
              tester
                  .getRect(find.byType(MastermindSegmentedControl<int>))
                  .width,
              lessThanOrEqualTo(width - 32),
            );
          }
          // Never a hidden horizontal scroller.
          expect(
            find.descendant(
              of: find.byType(MastermindSegmentedControl<int>),
              matching: find.byType(SingleChildScrollView),
            ),
            findsNothing,
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
  testWidgets('stacks into full-width 44 pt rows when it cannot fit across', (
    tester,
  ) async {
    final handle = tester.ensureSemantics();
    final changes = <int>[];
    await tester.pumpApp(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: 288,
            child: MastermindSegmentedControl<int>(
              segments: const [
                AppSegment(value: 0, label: 'Needs you'),
                AppSegment(value: 1, label: 'Resolved'),
                AppSegment(value: 2, label: 'Decisions'),
              ],
              selected: 1,
              onChanged: changes.add,
            ),
          ),
        ),
      ),
    );
    final tops = [
      for (final label in ['Needs you', 'Resolved', 'Decisions'])
        tester.getRect(find.text(label)).top,
    ];
    expect(tops[0], lessThan(tops[1]));
    expect(tops[1], lessThan(tops[2]));
    expect(
      tester.getSize(find.byType(MastermindSegmentedControl<int>)).height,
      greaterThanOrEqualTo(3 * 44),
    );
    // The selected row is marked by shape, not colour alone.
    expect(find.byIcon(AppIcons.check), findsOneWidget);
    expect(
      tester.getSemantics(find.text('Resolved')),
      isSemantics(
        label: 'Resolved',
        isButton: true,
        isSelected: true,
        isInMutuallyExclusiveGroup: true,
        hasTapAction: true,
      ),
    );
    await tester.tap(find.text('Decisions'));
    expect(changes, [2]);
    handle.dispose();
  });

  test('keeps the track between the 44 pt bounds', () {
    expect(
      MastermindSegmentedControl.trackHeight +
          2 * MastermindSegmentedControl.trackInset,
      44,
    );
  });
}
