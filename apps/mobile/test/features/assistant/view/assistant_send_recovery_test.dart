import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';

import 'assistant_settings_repair_harness.dart';

void main() {
  setUpAll(() async {
    for (final font in {
      'Roboto': 'assets/fonts/NotoSans.ttf',
      'NotoSans': 'assets/fonts/NotoSans.ttf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }
  });
  const legacy = {
    '$repairActor::mira-dashboard-workspace-context-$repairWorkspace':
        'personal',
  };
  testWidgets('legacy send offers recovery and preserves a cancelled draft', (
    tester,
  ) async {
    final raster = Platform.environment['ASSISTANT_RECOVERY_RASTER'];
    if (raster != null) {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
    }
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester, initialPreferences: legacy);
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    final draft = h.composer(tester)..text = "Today's focus";
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('assistant-navigation-toggle')));
    await tester.pumpAndSettle();
    expect(find.text('Start a new chat'), findsOneWidget);
    expect(h.repository.api.creates, 0);
    if (raster != null) {
      await tester.runAsync(() async {
        final view = tester.binding.renderViews.first;
        final scene = view.debugLayer!.buildScene(ui.SceneBuilder());
        final image = await scene.toImage(
          tester.view.physicalSize.width.toInt(),
          tester.view.physicalSize.height.toInt(),
        );
        scene.dispose();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File(raster).writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(draft.text, "Today's focus");
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    expect(h.repository.chats.sends, 0);
  });

  testWidgets(
    'confirmed legacy send dispatches once and clears only after ACK',
    (tester) async {
      final h = RepairHarness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester, initialPreferences: legacy);
      final draft = h.composer(tester)..text = "Today's focus";
      await tester.pump();
      await tester.tap(
        find.byKey(const ValueKey('assistant-navigation-toggle')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Start a new chat'), findsOneWidget);
      expect(draft.text, "Today's focus");
      await tester.tap(find.text('Start a new chat'));
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
      }
      expect(h.repository.api.creates, 1);
      expect(h.repository.chats.sends, 1);
      expect(h.chat.state.storedChatId, h.chat.state.fallbackChatId);
      expect(draft.text, isEmpty);
    },
  );

  for (final rapid in [false, true]) {
    testWidgets('fresh scope '
        '${rapid ? 'rapid Sends create once' : 'sends without reset'}', (
      tester,
    ) async {
      final h = RepairHarness();
      final acknowledgment = Completer<void>();
      h.repository.chats.acknowledgmentGate = acknowledgment;
      addTearDown(() async {
        if (!acknowledgment.isCompleted) acknowledgment.complete();
        await h.dispose(tester);
      });
      await h.mount(tester);
      expect(h.chat.state.creationOutcomeUnknown, isFalse);
      final draft = h.composer(tester)..text = "Today's focus";
      await tester.pump();
      final send = find.byKey(const ValueKey('assistant-navigation-toggle'));
      await tester.tap(send);
      if (rapid) await tester.tap(send);
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 10)),
        );
      }
      expect(find.text('Start a new chat'), findsNothing);
      expect(h.repository.api.creates, 1);
      expect(h.repository.chats.sends, 1);
      // The composer clears on Send, before the acknowledgment arrives.
      expect(draft.text, isEmpty);
      acknowledgment.complete();
      await tester.pumpAndSettle();
      expect(draft.text, isEmpty);
      expect(h.repository.api.creates, 1);
      expect(h.repository.chats.sends, 1);
    });
  }

  testWidgets('pending creation still requires informed recovery', (
    tester,
  ) async {
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(
      tester,
      initialPreferences: {
        '$repairActor::mira-conversation-envelope::v1::$repairWorkspace':
            jsonEncode({
              'schema': 1,
              'actorId': repairActor,
              'workspaceId': repairWorkspace,
              'revision': 1,
              'generation': 1,
              'selectedChatId': null,
              'contextId': null,
              'creation': {
                'status': 'unknown',
                'attemptId': '88888888-8888-4888-8888-888888888888',
              },
              'resetConsent': null,
              'resetIntent': null,
            }),
      },
    );
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    final draft = h.composer(tester)..text = 'Keep pending creation safe';
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('assistant-navigation-toggle')));
    await tester.pumpAndSettle();
    expect(find.text('Start a new chat'), findsOneWidget);
    expect(h.repository.api.creates, 0);
    expect(h.repository.chats.sends, 0);
    expect(draft.text, 'Keep pending creation safe');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
  });

  testWidgets('a voice note to a held chat starts with informed recovery', (
    tester,
  ) async {
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester, initialPreferences: legacy);
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    final microphone = find.descendant(
      of: find.byKey(const ValueKey('assistant-composer-microphone-slot')),
      matching: find.byIcon(LucideIcons.mic),
    );
    await tester.tap(microphone);
    await tester.pumpAndSettle();
    // Recording first would upload into a chat that cannot be created.
    expect(find.text('Start a new chat'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    expect(h.chat.state.composerAttachments, isEmpty);
    expect(h.repository.api.creates, 0);

    final recorderCalls = <String>[];
    tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.record/messages'),
        (call) async {
          recorderCalls.add(call.method);
          if (call.method == 'create') {
            final id = (call.arguments as Map)['recorderId'];
            tester.binding.defaultBinaryMessenger.setMockStreamHandler(
              EventChannel('com.llfbandit.record/events/$id'),
              MockStreamHandler.inline(onListen: (_, _) {}),
            );
          }
          return call.method == 'hasPermission' ? true : null;
        },
      )
      ..setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/path_provider'),
        (call) async => Directory.systemTemp.path,
      );
    await tester.tap(microphone);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start a new chat'));
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
    }
    expect(h.chat.state.creationOutcomeUnknown, isFalse);
    expect(h.repository.api.creates, 0);
    // The confirmed new chat goes on to record the voice note.
    expect(recorderCalls, contains('start'));
    expect(
      find.byKey(const ValueKey('assistant-inline-voice-waveform')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('voice-cancel')));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 10)),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('assistant-inline-voice-waveform')),
      findsNothing,
    );
  });

  testWidgets('files from the sheet wait for informed recovery', (
    tester,
  ) async {
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester, initialPreferences: legacy);
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    await tester.tap(find.byKey(const ValueKey('assistant-composer-options')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add attachments'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Files'));
    await tester.pumpAndSettle();
    // Picking first would upload into a chat that cannot be created.
    expect(find.text('Start a new chat'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(h.chat.state.creationOutcomeUnknown, isTrue);
    expect(h.chat.state.composerAttachments, isEmpty);
    expect(h.repository.api.creates, 0);
  });

  testWidgets('remote navbar never advertises a local model during hydration', (
    tester,
  ) async {
    final h = RepairHarness();
    addTearDown(() => h.dispose(tester));
    void expectRemoteTitle() {
      final title = tester.widget<ShellTitleOverride>(
        find.byType(ShellTitleOverride),
      );
      expect(title.title, 'Mira');
      expect(title.subtitle, isNull);
      expect(title.onSubtitlePressed, isNull);
    }

    await h.mount(tester, onFirstFrame: expectRemoteTitle);
    expectRemoteTitle();
  });
}
