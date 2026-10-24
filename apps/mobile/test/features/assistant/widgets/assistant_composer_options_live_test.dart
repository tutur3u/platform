import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_options.dart';
import 'package:mobile/l10n/l10n.dart';

class _Chat extends MockCubit<AssistantChatState>
    implements AssistantChatCubit {}

void main() {
  testWidgets(
    'open options sheet follows upload status from its owning cubit',
    (tester) async {
      final chat = _Chat();
      final changes = StreamController<AssistantChatState>();
      AssistantChatState state(AssistantAttachmentUploadState upload) =>
          AssistantChatState(
            fallbackChatId: 'draft',
            composerAttachments: [
              AssistantAttachment(
                id: 'file',
                name: 'Draft.pdf',
                size: 1,
                type: 'application/pdf',
                uploadState: upload,
              ),
            ],
          );
      final initial = state(AssistantAttachmentUploadState.uploading);
      whenListen(chat, changes.stream, initialState: initial);
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: BlocProvider<AssistantChatCubit>.value(
            value: chat,
            child: AppScaffold(
              child: AssistantComposerOptions(
                chatState: initial,
                shellState: const AssistantShellState(),
                onOpenAttachments: () async {},
                onOpenCreditSourceSheet: () async {},
                onThinkingModeChanged: (_) async {},
                onRemoveAttachment: (_) async {},
                onCloseComposer: () {},
                onModelSelected: (_) async {},
              ),
            ),
          ),
        ),
      );
      await tester.tap(
        find.byKey(const ValueKey('assistant-composer-options')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(
        tester
            .widget<AssistantAttachmentPreview>(
              find.byType(AssistantAttachmentPreview),
            )
            .attachment
            .uploadState,
        AssistantAttachmentUploadState.uploading,
      );
      changes.add(state(AssistantAttachmentUploadState.error));
      await tester.pump();
      await tester.pump();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(AssistantAttachmentPreview)),
      );
      final failed = 'Draft.pdf · ${l10n.assistantAttachmentFailedShort}';
      expect(find.text(failed), findsOneWidget);
      changes.add(state(AssistantAttachmentUploadState.uploaded));
      await tester.pump();
      await tester.pump();
      expect(find.text(failed), findsNothing);
      expect(find.text('Draft.pdf'), findsOneWidget);
      expect(
        tester
            .widget<AssistantAttachmentPreview>(
              find.byType(AssistantAttachmentPreview),
            )
            .attachment
            .uploadState,
        AssistantAttachmentUploadState.uploaded,
      );
      expect(find.byType(AppSheetScaffold), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await changes.close();
      await chat.close();
    },
  );
}
