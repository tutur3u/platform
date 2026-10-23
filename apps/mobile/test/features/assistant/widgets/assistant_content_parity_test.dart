import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_document_link.dart';
import 'package:mobile/features/assistant/widgets/assistant_ordered_parts.dart';
import 'package:mobile/features/assistant/widgets/assistant_source_link.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('citations retain order and reject executable URLs', (
    tester,
  ) async {
    await tester.pumpApp(
      Scaffold(
        body: Column(
          children: assistantOrderedPartWidgets(const [
            AssistantMessagePart(type: 'text', text: 'An answer'),
            AssistantMessagePart(
              type: 'source-url',
              url: 'https://example.com/source',
              title: 'Source document',
            ),
            AssistantMessagePart(
              type: 'source-url',
              url: 'javascript:alert(1)',
              title: 'Invalid source',
            ),
          ], active: false),
        ),
      ),
    );
    expect(find.text('Source document'), findsOneWidget);
    expect(find.text('Invalid source'), findsNothing);
    expect(
      tester.getTopLeft(find.text('Source document')).dy,
      greaterThan(tester.getBottomLeft(find.text('An answer')).dy),
    );
    expect(
      tester
          .widget<TextButton>(
            find.descendant(
              of: find.byType(AssistantSourceLink).first,
              matching: find.byType(TextButton),
            ),
          )
          .onPressed,
      isNotNull,
    );
  });

  testWidgets('upload progress wins over an available image thumbnail', (
    tester,
  ) async {
    await tester.pumpApp(
      const Scaffold(
        body: AssistantAttachmentPreview(
          attachment: AssistantAttachment(
            id: 'photo',
            name: 'Photo',
            type: 'image/png',
            size: 12,
            previewUrl: 'https://example.com/photo.png',
            uploadState: AssistantAttachmentUploadState.uploading,
          ),
        ),
      ),
    );
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('uploaded documents open only validated remote links', (
    tester,
  ) async {
    expect(assistantDocumentUri('file:///private/file'), isNull);
    expect(assistantDocumentUri('javascript:alert(1)'), isNull);
    expect(assistantDocumentUri('https://user:pass@example.com/file'), isNull);
    await tester.pumpApp(
      const Scaffold(
        body: AssistantAttachmentPreview(
          attachment: AssistantAttachment(
            id: 'document',
            name: 'Document.pdf',
            type: 'application/pdf',
            size: 12,
            signedUrl: 'https://example.com/document.pdf',
            uploadState: AssistantAttachmentUploadState.uploaded,
          ),
        ),
      ),
    );
    expect(
      tester.widget<InputChip>(find.byType(InputChip)).onPressed,
      isNotNull,
    );
  });

  testWidgets('streamed text replaces the waiting indicator', (tester) async {
    await tester.pumpApp(
      const Scaffold(
        body: AssistantChatFeedback(
          state: AssistantChatState(
            fallbackChatId: 'chat',
            status: AssistantChatStatus.streaming,
            messages: [
              AssistantMessage(
                id: 'answer',
                role: 'assistant',
                parts: [AssistantMessagePart(type: 'text', text: 'Answer')],
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Thinking...'), findsNothing);
    expect(find.byType(NovaLoadingIndicator), findsNothing);
  });
}
