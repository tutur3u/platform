import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_attachment_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_options.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  for (final width in [320.0, 1000.0]) {
    testWidgets(
      'plus menu uses adaptive model picker and active allowlist $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        const allowed = AssistantGatewayModel(
          value: 'provider/allowed',
          label: 'Allowed',
          provider: 'Provider',
        );
        const locked = AssistantGatewayModel(
          value: 'provider/locked',
          label: 'Locked',
          provider: 'Provider',
        );
        const disabled = AssistantGatewayModel(
          value: 'provider/disabled',
          label: 'Disabled',
          provider: 'Provider',
          disabled: true,
        );
        AssistantGatewayModel? picked;
        final router = GoRouter(
          routes: [
            GoRoute(
              path: '/',
              builder: (_, _) => shad.Theme(
                data: const shad.ThemeData(
                  colorScheme: shad.ColorSchemes.lightZinc,
                ),
                child: Scaffold(
                  body: Center(
                    child: AssistantComposerOptions(
                      chatState: const AssistantChatState(
                        fallbackChatId: 'draft',
                      ),
                      shellState: const AssistantShellState(
                        selectedModel: allowed,
                        availableModels: [allowed, locked, disabled],
                        activeCredits: AssistantCredits(
                          allowedModels: ['allowed', 'disabled'],
                        ),
                      ),
                      onOpenAttachments: () async {},
                      onOpenCreditSourceSheet: () async {},
                      onThinkingModeChanged: (_) async {},
                      onRemoveAttachment: (_) async {},
                      onCloseComposer: () {},
                      onModelSelected: (model) async {
                        picked = model;
                      },
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          MaterialApp.router(
            routerConfig: router,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
          ),
        );
        await tester.tap(
          find.byKey(const ValueKey('assistant-composer-options')),
        );
        await tester.pumpAndSettle();
        expect(find.text('Fast'), findsNothing);
        expect(find.text('Thinking'), findsNothing);
        expect(find.text('Add attachments'), findsOneWidget);
        await tester.tap(find.byIcon(LucideIcons.sparkles));
        await tester.pumpAndSettle();
        expect(find.text('Locked'), findsNothing);
        expect(find.text('Disabled'), findsNothing);
        expect(
          tester.widget<AppCard>(find.widgetWithText(AppCard, 'Allowed')).onTap,
          isNotNull,
        );
        await tester.tap(find.text('Allowed'));
        await tester.pumpAndSettle();
        expect(picked, allowed);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'removing an attachment closes the options sheet before the mutation',
    (tester) async {
      String? removed;
      var sheetWasOpen = true;
      await tester.pumpWidget(
        MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => AppScaffold(
              child: AssistantComposerOptions(
                chatState: const AssistantChatState(
                  fallbackChatId: 'draft',
                  composerAttachments: [
                    AssistantAttachment(
                      id: 'file',
                      name: 'Draft.txt',
                      size: 1,
                      type: 'text/plain',
                    ),
                  ],
                ),
                shellState: const AssistantShellState(),
                onOpenAttachments: () async {},
                onOpenCreditSourceSheet: () async {},
                onThinkingModeChanged: (_) async {},
                onCloseComposer: () {},
                onModelSelected: (_) async {},
                onRemoveAttachment: (id) async {
                  removed = id;
                  sheetWasOpen = ModalRoute.of(
                    tester.element(find.byType(AssistantAttachmentPreview)),
                  )!.isCurrent;
                },
              ),
            ),
          ),
        ),
      );
      await tester.tap(
        find.byKey(const ValueKey('assistant-composer-options')),
      );
      await tester.pumpAndSettle();
      expect(find.text('Draft.txt'), findsOneWidget);
      await tester.tap(find.byTooltip('Delete: Draft.txt'));
      await tester.pumpAndSettle();
      expect(removed, 'file');
      expect(sheetWasOpen, isFalse);
      expect(find.text('Draft.txt'), findsNothing);
      expect(find.byType(AppSheetScaffold), findsNothing);
    },
  );
}
