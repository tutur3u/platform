import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_voice_message_sheet.dart';
import 'package:mocktail/mocktail.dart';
import 'package:record/record.dart';

import '../../../helpers/helpers.dart';

class _Recorder extends Mock implements AudioRecorder {}

void main() {
  setUpAll(() => registerFallbackValue(const RecordConfig()));

  testWidgets('permission inactivity does not stop a new recording', (
    tester,
  ) async {
    final recorder = _Recorder();
    final permission = Completer<bool>();
    when(recorder.hasPermission).thenAnswer((_) => permission.future);
    when(
      () => recorder.start(any(), path: any(named: 'path')),
    ).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) async => null);
    when(recorder.dispose).thenAnswer((_) async {});
    await tester.pumpApp(
      Scaffold(
        body: AssistantVoiceMessageSheet(
          recorder: recorder,
          temporaryDirectory: () async => Directory.systemTemp,
        ),
      ),
    );
    await tester.tap(find.text('Record'));
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    permission.complete(true);
    await tester.pumpAndSettle();
    expect(find.text('Stop'), findsOneWidget);
    verifyNever(recorder.stop);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();
    verifyNever(recorder.stop);
    await tester.runAsync(() async {
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await Future<void>.delayed(const Duration(milliseconds: 30));
    });
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    verify(recorder.stop).called(1);
    expect(find.text('Record'), findsOneWidget);
    expect(find.text('Attach recording'), findsNothing);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
  });

  for (final phase in ['permission', 'directory', 'native start']) {
    testWidgets('background cancels pending $phase', (tester) async {
      final recorder = _Recorder();
      final permission = Completer<bool>();
      final directoryReady = Completer<Directory>();
      final started = Completer<void>();
      final directory = Directory.systemTemp.createTempSync('voice-cancel-');
      addTearDown(() => directory.deleteSync(recursive: true));
      when(recorder.hasPermission).thenAnswer(
        (_) => phase == 'permission' ? permission.future : Future.value(true),
      );
      when(() => recorder.start(any(), path: any(named: 'path'))).thenAnswer((
        call,
      ) {
        File(call.namedArguments[#path] as String).writeAsBytesSync([1, 2]);
        return phase == 'native start' ? started.future : Future.value();
      });
      when(recorder.stop).thenAnswer((_) async => null);
      when(recorder.dispose).thenAnswer((_) async {});
      await tester.pumpApp(
        Scaffold(
          body: AssistantVoiceMessageSheet(
            recorder: recorder,
            temporaryDirectory: () => phase == 'directory'
                ? directoryReady.future
                : Future.value(directory),
          ),
        ),
      );
      await tester.tap(find.text('Record'));
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      // Returning to the app must not revive the canceled native operation.
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.runAsync(() async {
        permission.complete(true);
        directoryReady.complete(directory);
        started.complete();
        // Wait for real filesystem cleanup, not a fixed delay that races CI.
        await (() async {
          while (!await directory.list().isEmpty) {
            await Future<void>.delayed(const Duration(milliseconds: 5));
          }
          await Future<void>.delayed(Duration.zero);
        })().timeout(const Duration(seconds: 5));
      });
      await tester.pumpAndSettle();
      expect(find.text('Stop'), findsNothing);
      expect(find.text('Record'), findsOneWidget);
      expect(find.text('Attach recording'), findsNothing);
      expect(directory.listSync(), isEmpty);
      if (phase == 'native start') {
        verify(recorder.stop).called(1);
      } else {
        verifyNever(() => recorder.start(any(), path: any(named: 'path')));
      }
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    });
  }

  testWidgets('native capture failure allows retry without attaching a file', (
    tester,
  ) async {
    final recorder = _Recorder();
    when(recorder.hasPermission).thenAnswer((_) async => true);
    when(
      () => recorder.start(any(), path: any(named: 'path')),
    ).thenThrow(PlatformException(code: 'capture_failed'));
    when(recorder.dispose).thenAnswer((_) async {});
    await tester.pumpApp(
      Scaffold(
        body: AssistantVoiceMessageSheet(
          recorder: recorder,
          temporaryDirectory: () async => Directory.systemTemp,
        ),
      ),
    );
    await tester.tap(find.text('Record'));
    await tester.pumpAndSettle();
    expect(find.text('Record'), findsOneWidget);
    expect(find.text('Attach recording'), findsNothing);
    expect(
      find.text('Could not record audio. Please try again.'),
      findsOneWidget,
    );
    when(
      () => recorder.start(any(), path: any(named: 'path')),
    ).thenAnswer((_) async {});
    await tester.tap(find.text('Record'));
    await tester.pumpAndSettle();
    expect(find.text('Stop'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}
