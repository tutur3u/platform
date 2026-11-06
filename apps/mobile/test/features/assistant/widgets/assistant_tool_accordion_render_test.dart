// Writes review renders of the tool accordion when a directory is given:
// flutter test --dart-define=ASSISTANT_TOOL_RENDER_DIR=/tmp/renders <this file>
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';

import '../../../helpers/helpers.dart';

const _outputDir = String.fromEnvironment('ASSISTANT_TOOL_RENDER_DIR');

Future<void> _loadFonts() async {
  final sans = File('assets/fonts/NotoSans.ttf').readAsBytesSync();
  for (final family in [
    'NotoSans',
    'Roboto',
    'packages/shadcn_flutter/GeistSans',
    'packages/shadcn_flutter/GeistMono',
    // Markdown code blocks request the generic monospace family.
    'monospace',
  ]) {
    await (FontLoader(
      family,
    )..addFont(Future.value(ByteData.sublistView(sans)))).load();
  }
  final icons = File('assets/fonts/lucide/LucideIcons.otf').readAsBytesSync();
  await (FontLoader(
    'LucideIcons',
  )..addFont(Future.value(ByteData.sublistView(icons)))).load();
}

AssistantMessagePart _tool(String name, String state, {Object? output}) =>
    AssistantMessagePart(
      type: 'dynamic-tool',
      toolName: name,
      toolCallId: 'render-$name',
      state: state,
      input: const {'boardId': 'b1f2-0000', 'limit': 20},
      output: output,
    );

List<AssistantMessagePart> _turn({required bool running}) => [
  const AssistantMessagePart(type: 'step-start'),
  _tool('search_tools', 'output-available', output: const {'ok': true}),
  _tool('select_tools', 'output-available', output: const {'ok': true}),
  _tool(
    'get_my_tasks',
    'output-available',
    output: const {
      'tasks': [
        {'id': 't1', 'name': 'Ship release notes'},
        {'id': 't2', 'name': 'Review Q4 budget'},
        {'id': 't3', 'name': 'Book dentist'},
      ],
    },
  ),
  _tool(
    'get_upcoming_events',
    'output-available',
    output: const {
      'events': [
        {'id': 'e1'},
      ],
    },
  ),
  _tool('google_search', 'output-error'),
  if (running)
    _tool('create_task', 'input-available')
  else ...[
    _tool(
      'create_task',
      'output-available',
      output: const {'message': 'Added "Prepare demo" to Today'},
    ),
    const AssistantMessagePart(
      type: 'text',
      text: 'You have 3 tasks and 1 event today. I added "Prepare demo".',
    ),
  ],
];

Future<void> _capture(WidgetTester tester, GlobalKey key, String name) async {
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    File('$_outputDir/$name.png')
      ..createSync(recursive: true)
      ..writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

/// Steps frame by frame; the running spinner never settles.
Future<void> _frames(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('renders tool accordion in ${mode.name}', (tester) async {
      await tester.runAsync(_loadFonts);
      tester.view
        ..physicalSize = const Size(390 * 2, 760 * 2)
        ..devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final key = GlobalKey();
      Widget bubble(List<AssistantMessagePart> parts, {bool active = false}) =>
          AssistantTranscriptBubble(
            label: 'Mira',
            alignEnd: false,
            text: '',
            transcript: '',
            attachments: const [],
            timestamp: null,
            toolNames: const [],
            orderedParts: parts,
            activityActive: active,
          );
      await tester.pumpApp(
        RepaintBoundary(
          key: key,
          child: Scaffold(
            body: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  bubble(_turn(running: true), active: true),
                  const SizedBox(height: 24),
                  bubble(_turn(running: false)),
                ],
              ),
            ),
          ),
        ),
        themeMode: mode,
      );
      await tester.pump(const Duration(milliseconds: 300));
      await _capture(tester, key, 'tool-accordion-collapsed-${mode.name}');

      final toggles = find.byKey(const ValueKey('assistant-tools-toggle'));
      await tester.tap(toggles.last);
      await _frames(tester);
      await tester.tap(
        find
            .byKey(const ValueKey('assistant-tool-details-render-get_my_tasks'))
            .last,
      );
      await _frames(tester);
      await _capture(tester, key, 'tool-accordion-expanded-${mode.name}');
      expect(find.text('Hide details'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    }, skip: _outputDir.isEmpty);
  }
}
