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
