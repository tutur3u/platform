import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_scope.dart';
import 'package:mobile/features/assistant/widgets/assistant_message_actions.dart';
import 'package:mobile/features/assistant/widgets/assistant_reply_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_bubble.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';

import 'assistant_component_raster.dart';

void main() {
  setUpAll(loadAssistantRenderFonts);

  for (final brightness in Brightness.values) {
    for (final background in AppearanceThemeId.values) {
      for (final alignEnd in [false, true]) {
        testWidgets('${brightness.name}/${background.name}/user=$alignEnd '
            'paints readable reaction chips and reply preview at intensity 1', (
          tester,
        ) async {
          for (final readOnly in [false, true]) {
            await tester.pumpWidget(
              MaterialApp(
                theme: ThemeData(brightness: brightness),
                themeAnimationDuration: Duration.zero,
                localizationsDelegates: AppLocalizations.localizationsDelegates,
                supportedLocales: AppLocalizations.supportedLocales,
                home: Scaffold(
                  body: AssistantThemeScope(
                    value: AssistantThemePreferences(
                      backgroundTheme: background,
                      messageTheme: AppearanceThemeId.sunset,
                      textAccent: AppearanceAccentId.amber,
                      backgroundStyle: AssistantBackgroundStyle.gradient,
                      intensity: 1,
                    ),
                    child: AssistantThemeBackdrop(
                      child: Center(
                        child: AssistantTranscriptBubble(
                          label: 'Mira',
                          alignEnd: alignEnd,
                          text: 'A readable answer',
                          transcript: '',
                          attachments: const [],
                          timestamp: null,
                          toolNames: const [],
                          actorId: 'actor',
                          onReact: readOnly ? null : (_) {},
                          reactions: [
                            ChatReactionSummary(
                              emoji: AssistantReaction.like.value,
                              count: 2,
                              userIds: const ['actor', 'other'],
                            ),
                            ChatReactionSummary(
                              emoji: AssistantReaction.love.value,
                              count: 3,
                              userIds: const ['other'],
                            ),
                          ],
                          replyPreview: AssistantReplyPreview(
                            label: 'Reply author',
                            text: 'Earlier reply',
                            onCancel: () {},
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
            await tester.pumpAndSettle();

            final backdrop = tester.widget<DecoratedBox>(
              find
                  .descendant(
                    of: find.byType(AssistantThemeBackdrop),
                    matching: find.byType(DecoratedBox),
                  )
                  .first,
            );
            final gradient =
                (backdrop.decoration as BoxDecoration).gradient!
                    as LinearGradient;
            final backgrounds = [
              for (var i = 0; i <= 20; i++)
                Color.lerp(
                  gradient.colors.first,
                  gradient.colors.last,
                  i / 20,
                )!,
            ];

            for (final entry in {
              AssistantReaction.like: 'Like 2',
              AssistantReaction.love: 'Love 3',
            }.entries) {
              final chip = find.byKey(
                ValueKey('assistant-reaction-${entry.key.value}'),
              );
              final fill = _chipFill(tester, chip, readOnly: readOnly);
              final foreground = _paintedColor(
                tester,
                find.descendant(of: chip, matching: find.text(entry.value)),
              );
              final icon = _paintedColor(
                tester,
                find.descendant(of: chip, matching: find.byType(Icon)),
              );
              for (final background in backgrounds) {
                final surface = AppearanceContrast.over(fill, background);
                _contrast(
                  AppearanceContrast.over(foreground, background),
                  surface,
                  AppearanceContrast.aaText,
                );
                _contrast(
                  AppearanceContrast.over(icon, background),
                  surface,
                  AppearanceContrast.aaNonText,
                );
              }
            }

            final preview = find.byKey(
              const ValueKey('assistant-reply-preview'),
            );
            final decoration =
                tester.widget<Container>(preview).decoration! as BoxDecoration;
            final surface = decoration.color!;
            for (final text in ['Reply author', 'Earlier reply']) {
              _contrast(
                _paintedColor(tester, find.text(text)),
                surface,
                AppearanceContrast.aaText,
              );
            }
            for (final icon
                in find
                    .descendant(of: preview, matching: find.byType(Icon))
                    .evaluate()) {
              _contrast(
                _paintedColor(tester, find.byWidget(icon.widget)),
                surface,
                AppearanceContrast.aaNonText,
              );
            }

            final content = find.byKey(
              const ValueKey('assistant-message-content'),
            );
            final bubbleFill =
                (tester.widget<AnimatedContainer>(content).decoration!
                        as BoxDecoration)
                    .color!;
            final body = find.descendant(
              of: content,
              matching: find.byWidgetPredicate(
                (widget) =>
                    widget is RichText &&
                    widget.text.toPlainText() == 'A readable answer',
              ),
            );
            expect(body, findsOneWidget);
            final paragraph = tester.widget<RichText>(body);
            _contrast(
              _spanColor(paragraph.text)!,
              bubbleFill,
              AppearanceContrast.aaText,
            );
            final bubbleTokens = AppTokens.of(tester.element(body)).colorScheme;
            expect(bubbleTokens.background, bubbleFill);
            expect(bubbleTokens.foreground, _spanColor(paragraph.text));
            expect(tester.takeException(), isNull);
          }
        });
      }
    }
  }
}

Color _paintedColor(WidgetTester tester, Finder widget) {
  final text = find
      .descendant(of: widget, matching: find.byType(RichText))
      .first;
  final color = _spanColor(tester.widget<RichText>(text).text)!;
  return color.withValues(alpha: color.a * _paintedOpacity(tester, text));
}

Color _chipFill(WidgetTester tester, Finder chip, {required bool readOnly}) {
  final surface = find
      .descendant(
        of: chip,
        matching: find.byType(readOnly ? DecoratedBox : Material),
      )
      .first;
  final color = readOnly
      ? (tester.widget<DecoratedBox>(surface).decoration as BoxDecoration).color
      : tester.widget<Material>(surface).color;
  final fill = color ?? Colors.transparent;
  return fill.withValues(alpha: fill.a * _paintedOpacity(tester, surface));
}

double _paintedOpacity(WidgetTester tester, Finder widget) {
  var opacity = 1.0;
  tester.element(widget).visitAncestorElements((element) {
    if (element is RenderObjectElement) {
      final render = element.renderObject;
      if (render is RenderOpacity) opacity *= render.opacity;
      if (render is RenderAnimatedOpacity) opacity *= render.opacity.value;
    }
    return true;
  });
  return opacity;
}

Color? _spanColor(InlineSpan span, [Color? inherited]) {
  final color = span.style?.color ?? inherited;
  if (span is TextSpan) {
    if (span.text?.isNotEmpty ?? false) return color;
    for (final child in span.children ?? <InlineSpan>[]) {
      final found = _spanColor(child, color);
      if (found != null) return found;
    }
  }
  return null;
}

void _contrast(Color foreground, Color background, double minimum) => expect(
  AppearanceContrast.ratio(
    AppearanceContrast.over(foreground, background),
    background,
  ),
  greaterThanOrEqualTo(minimum),
  reason: '$foreground on $background',
);
