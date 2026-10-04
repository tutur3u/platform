import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_sheet_body.dart';
import 'package:mobile/features/assistant/widgets/assistant_capture_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  Widget host(Widget child) => MaterialApp(
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: child),
  );
  testWidgets('three attachment sources invoke their own action', (
    tester,
  ) async {
    final calls = <String>[];
    await tester.pumpWidget(
      host(
        AssistantAttachmentSheetBody(
          hasAttachments: false,
          onPickFiles: () async => calls.add('files'),
          onPickGalleryMedia: () async => calls.add('library'),
          onCapture: () async => calls.add('capture'),
          onClearAttachments: () async {},
        ),
      ),
    );
    for (final title in [
      'Files',
      'Photos & Videos Library',
      'Capture & Record',
    ]) {
      await tester.tap(find.text(title));
    }
    expect(calls, ['files', 'library', 'capture']);
  });
  for (final cameraSupported in [false, true]) {
    testWidgets('camera capture availability=$cameraSupported', (tester) async {
      final calls = <String>[];
      await tester.pumpWidget(
        host(
          AssistantCaptureSheet(
            cameraSupported: cameraSupported,
            onPhoto: () async => calls.add('photo'),
            onVideo: () async => calls.add('video'),
            onAudio: () async => calls.add('audio'),
          ),
        ),
      );
      expect(
        find.text('Take photo'),
        cameraSupported ? findsOneWidget : findsNothing,
      );
      expect(
        find.text('Record video'),
        cameraSupported ? findsOneWidget : findsNothing,
      );
      if (cameraSupported) {
        await tester.tap(find.text('Take photo'));
        await tester.tap(find.text('Record video'));
      }
      await tester.tap(find.text('Record audio'));
      expect(calls, cameraSupported ? ['photo', 'video', 'audio'] : ['audio']);
    });
  }
}
