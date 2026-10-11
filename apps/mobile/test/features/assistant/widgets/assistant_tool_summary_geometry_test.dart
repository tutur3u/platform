import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_tool_summary.dart';

import '../../../helpers/helpers.dart';

const _longName = 'read_every_task_in_the_current_workspace_and_calendar';

List<AssistantMessagePart> _parts(int count) => [
  for (var index = 0; index < count; index++)
    AssistantMessagePart(
      type: 'dynamic-tool',
      toolCallId: 'call-$index',
      toolName: index == count - 1 ? _longName : 'read_tasks_$index',
      state: index == count - 1 ? 'input-available' : 'output-available',
    ),
];

Widget _summary(List<AssistantMessagePart> parts, {double scale = 1}) =>
    Scaffold(
      body: MediaQuery(
        data: MediaQueryData(textScaler: TextScaler.linear(scale)),
        child: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(
            width: 240,
            child: AssistantToolSummary(
              parts: parts,
              tileBuilder: (part) => Text('${part.toolName}:${part.state}'),
            ),
          ),
        ),
      ),
    );

void main() {
  for (final scale in [1.0, 3.0]) {
    testWidgets('count stays visible beside truncated tool at scale $scale', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      await tester.pumpApp(_summary(_parts(2), scale: scale));
      final toggle = find.byKey(const ValueKey('assistant-tools-toggle'));
      final slot = find.byKey(const ValueKey('assistant-tools-count-slot'));
      final preview = tester.renderObject<RenderParagraph>(
        find.text('$_longName ·'),
      );
      expect(preview.didExceedMaxLines, isTrue);
      final count = tester.renderObject<RenderParagraph>(find.text('2'));
      expect(count.didExceedMaxLines, isFalse);
      expect(
        tester.getRect(toggle).contains(tester.getCenter(find.text('2'))),
        isTrue,
      );
      expect(
        tester.getRect(slot).contains(tester.getCenter(find.text('2'))),
        isTrue,
      );
      final node = tester.getSemantics(toggle);
      expect(node.label, 'Tools: $_longName · 2');
      expect(node.flagsCollection.isButton, isTrue);
      expect(node.flagsCollection.isExpanded, Tristate.isFalse);
      expect(
        tester
            .widget<Material>(
              find.ancestor(of: toggle, matching: find.byType(Material)).first,
            )
            .color,
        Colors.transparent,
      );
      expect(find.text('read_tasks_0:output-available'), findsNothing);
      expect(tester.takeException(), isNull);
      semantics.dispose();
    });
  }

  testWidgets('streamed counts retain header and reserved count geometry', (
    tester,
  ) async {
    final parts = ValueNotifier(_parts(1));
    addTearDown(parts.dispose);
    await tester.pumpApp(
      ValueListenableBuilder(
        valueListenable: parts,
        builder: (_, value, _) => _summary(value),
      ),
    );
    Rect? header;
    Rect? countSlot;
    for (final count in [1, 9, 10, 99, 100, 999]) {
      parts.value = _parts(count);
      await tester.pump();
      final currentHeader = tester.getRect(
        find.byKey(const ValueKey('assistant-tools-toggle')),
      );
      final currentSlot = tester.getRect(
        find.byKey(const ValueKey('assistant-tools-count-slot')),
      );
      header ??= currentHeader;
      countSlot ??= currentSlot;
      expect(currentHeader, header);
      expect(currentSlot, countSlot);
      expect(find.text(count.toString()), findsOneWidget);
      expect(find.textContaining(':output-available'), findsNothing);
      expect(tester.takeException(), isNull);
    }
    parts.value = _parts(1000);
    await tester.pump();
    expect(find.text('1000'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('expanded tools retain order and status through stream updates', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    final parts = ValueNotifier(_parts(2));
    addTearDown(parts.dispose);
    await tester.pumpApp(
      ValueListenableBuilder(
        valueListenable: parts,
        builder: (_, value, _) => _summary(value),
      ),
    );
    final toggle = find.byKey(const ValueKey('assistant-tools-toggle'));
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(toggle).flagsCollection.isExpanded,
      Tristate.isTrue,
    );
    final first = find.text('read_tasks_0:output-available');
    final latest = find.text('$_longName:input-available');
    expect(tester.getTopLeft(first).dy, lessThan(tester.getTopLeft(latest).dy));
    parts.value = _parts(3);
    await tester.pumpAndSettle();
    expect(
      tester.getSemantics(toggle).flagsCollection.isExpanded,
      Tristate.isTrue,
    );
    expect(find.text('read_tasks_1:output-available'), findsOneWidget);
    expect(find.text('$_longName:input-available'), findsOneWidget);
    expect(find.text('3'), findsOneWidget);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(find.text('read_tasks_1:output-available'), findsNothing);
    expect(
      tester.getSemantics(toggle).flagsCollection.isExpanded,
      Tristate.isFalse,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
  });
}
