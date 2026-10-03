import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
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
        await tester.tap(find.byIcon(Icons.auto_awesome_outlined));
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<ListTile>(find.widgetWithText(ListTile, 'Locked'))
              .enabled,
          isFalse,
        );
        expect(
          tester
              .widget<ListTile>(find.widgetWithText(ListTile, 'Disabled'))
              .enabled,
          isFalse,
        );
        expect(
          tester
              .widget<ListTile>(find.widgetWithText(ListTile, 'Allowed'))
              .enabled,
          isTrue,
        );
        await tester.tap(find.text('Allowed'));
        await tester.pumpAndSettle();
        expect(picked, allowed);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
