import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_scope.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/l10n/l10n.dart';

import 'assistant_component_raster.dart';

void main() {
  setUpAll(loadAssistantRenderFonts);

  testWidgets('message pickup haptic respects the haptics toggle', (
    tester,
  ) async {
    final previousEnabled = AppHaptics.enabled;
    final previousPlatform = debugDefaultTargetPlatformOverride;
    final feedback = <Object?>[];
    try {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      AppHaptics.enabled = true;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'HapticFeedback.vibrate') {
            feedback.add(call.arguments);
          }
          return null;
        },
      );
      await tester.pumpWidget(
        const MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: Center(
              child: AssistantTranscriptBubble(
                label: 'Mira',
                alignEnd: false,
                text: 'Pick up this message',
                transcript: '',
                attachments: [],
                timestamp: null,
                toolNames: [],
              ),
            ),
          ),
        ),
      );
      final message = find.text('Pick up this message', findRichText: true);
      await tester.longPress(message);
      await tester.pumpAndSettle();
      expect(find.byType(AssistantMessageActions), findsOneWidget);
      expect(feedback, ['HapticFeedbackType.mediumImpact']);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      AppHaptics.enabled = false;
      await tester.longPress(message);
      await tester.pumpAndSettle();
      expect(find.byType(AssistantMessageActions), findsOneWidget);
      expect(feedback, ['HapticFeedbackType.mediumImpact']);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    } finally {
      AppHaptics.enabled = previousEnabled;
      debugDefaultTargetPlatformOverride = previousPlatform;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      );
    }
  });

  for (final brightness in Brightness.values) {
    for (final locale in ['en', 'vi']) {
      testWidgets(
        '$locale/${brightness.name} compact sheet at 3x text scrolls, '
        'announces selection, and dismisses without an action',
        (tester) async {
          tester.view
            ..devicePixelRatio = 1
            ..physicalSize = const Size(320, 568);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.view.resetPhysicalSize);
          final semantics = tester.ensureSemantics();
          try {
            AssistantMessageAction? result;
            var completions = 0;

            await tester.pumpWidget(
              MaterialApp(
                theme: ThemeData(brightness: brightness),
                themeAnimationDuration: Duration.zero,
                locale: Locale(locale),
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                builder: (context, child) => MediaQuery(
                  data: MediaQuery.of(context).copyWith(
                    textScaler: const TextScaler.linear(3),
                    viewInsets: const EdgeInsets.only(bottom: 200),
                  ),
                  child: child!,
                ),
                home: AssistantThemeScope(
                  value: const AssistantThemePreferences(
                    backgroundTheme: AppearanceThemeId.ocean,
                    textAccent: AppearanceAccentId.amber,
                    backgroundStyle: AssistantBackgroundStyle.gradient,
                    intensity: 1,
                  ),
                  child: Scaffold(
                    resizeToAvoidBottomInset: false,
                    body: Builder(
                      builder: (context) => Center(
                        child: AppButton(
                          key: const ValueKey('open-actions'),
                          child: const Text('Open'),
                          onPressed: () async {
                            result = await showAppSheet<AssistantMessageAction>(
                              context: context,
                              builder: (_) => AssistantMessageActions(
                                canCopy: true,
                                canReply: true,
                                canReact: true,
                                canRefresh: true,
                                selectedReactions: {
                                  AssistantReaction.like.value,
                                },
                              ),
                            );
                            completions++;
                          },
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );

            Future<void> open() async {
              await tester.tap(find.byKey(const ValueKey('open-actions')));
              await tester.pumpAndSettle();
              expect(find.byType(AssistantMessageActions), findsOneWidget);
              expect(tester.takeException(), isNull);
            }

            await open();
            final actionsContext = tester.element(
              find.byType(AssistantMessageActions),
            );
            final l10n = actionsContext.l10n;
            final selected = find.byKey(const ValueKey('assistant-react-like'));
            await tester.ensureVisible(selected);
            await tester.pumpAndSettle();
            final selectedNode = tester
                .getSemantics(selected)
                .getSemanticsData();
            expect(selectedNode.label, l10n.assistantReactionLike);
            expect(selectedNode.flagsCollection.isSelected, ui.Tristate.isTrue);
            expect(selectedNode.flagsCollection.isButton, isTrue);
            expect(selectedNode.hasAction(ui.SemanticsAction.tap), isTrue);
            expect(tester.getSize(selected).width, greaterThanOrEqualTo(48));
            expect(tester.getSize(selected).height, greaterThanOrEqualTo(48));
            final selectedFill = tester
                .widget<Material>(
                  find.descendant(
                    of: selected,
                    matching: find.byType(Material),
                  ),
                )
                .color!;
            final selectedIcon = tester
                .widget<RichText>(
                  find.descendant(
                    of: selected,
                    matching: find.byType(RichText),
                  ),
                )
                .text
                .style!
                .color!;
            expect(selectedFill.a, 1);
            expect(
              AppearanceContrast.ratio(selectedIcon, selectedFill),
              greaterThanOrEqualTo(AppearanceContrast.aaNonText),
            );
            final unselected = find.byKey(
              const ValueKey('assistant-react-love'),
            );
            expect(
              tester.widget<AppIconButton>(unselected).variant,
              AppButtonVariant.ghost,
            );
            for (final reaction in AssistantReaction.values) {
              final button = find.byKey(
                ValueKey('assistant-react-${reaction.name}'),
              );
              expect(
                tester.widget<AppIconButton>(button).tooltip,
                reaction.label(l10n),
              );
            }

            final reply = find.text(l10n.assistantReplyMessageAction);
            await tester.ensureVisible(reply);
            await tester.pumpAndSettle();
            expect(reply.hitTestable(), findsOneWidget);
            expect(tester.getBottomRight(reply).dy, lessThanOrEqualTo(368));
            expect(tester.takeException(), isNull);
            await tester.tap(reply);
            await tester.pumpAndSettle();
            expect(result, isA<AssistantReplyToMessage>());
            expect(completions, 1);

            await open();
            await tester.binding.handlePopRoute();
            await tester.pumpAndSettle();
            expect(find.byType(AssistantMessageActions), findsNothing);
            expect(result, isNull);
            expect(completions, 2);

            await open();
            final close = find.byKey(const ValueKey('app-sheet-close'));
            await tester.ensureVisible(close);
            await tester.pumpAndSettle();
            expect(close.hitTestable(), findsOneWidget);
            expect(
              tester.widget<AppIconButton>(close).tooltip,
              MaterialLocalizations.of(
                tester.element(close),
              ).closeButtonTooltip,
            );
            await tester.tap(close);
            await tester.pumpAndSettle();
            expect(result, isNull);
            expect(completions, 3);
            expect(find.byType(AssistantMessageActions), findsNothing);
            expect(tester.takeException(), isNull);
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }
}
