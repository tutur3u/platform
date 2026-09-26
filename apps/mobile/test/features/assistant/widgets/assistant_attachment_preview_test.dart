import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  late Directory directory;
  late File file;
  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp('assistant-media-');
    file = File('${directory.path}/photo.png');
    await file.writeAsBytes(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=',
      ),
    );
  });
  tearDownAll(() => directory.delete(recursive: true));

  testWidgets(
    'shows a short gallery label and opens the image before sending',
    (tester) async {
      var removed = false;
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: AssistantAttachmentPreview(
              attachment: AssistantAttachment(
                id: 'photo',
                name: 'image_picker_71BE6BAA-17C0-440A-89D9-123456789ABC.png',
                size: 1,
                type: 'image/png',
                localPath: file.path,
              ),
              onRemove: () => removed = true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Photo'), findsOneWidget);
      expect(find.textContaining('image_picker_'), findsNothing);

      await tester.tap(find.text('Photo'));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      expect(find.byType(Image), findsWidgets);
      expect(removed, isFalse);
    },
  );
}
