import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_options.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_primary_action.dart';

import 'assistant_component_raster.dart';
import 'assistant_composer_stability_harness.dart';

typedef _Geometry = ({Rect surface, Rect editor, Rect primary, Offset attach});

_Geometry _geometry(WidgetTester tester) => (
  surface: tester.getRect(
    find.byKey(const ValueKey('persistent-shell-dock-material')),
  ),
  editor: tester.getRect(find.byType(AppTextField)),
  primary: tester.getRect(find.byType(AssistantComposerPrimaryAction)),
  attach: tester.getCenter(find.byType(AssistantComposerOptions)),
);

void main() {
  setUpAll(loadAssistantRenderFonts);

  for (final width in [320.0, 390.0]) {
    for (final keyboard in [0.0, 300.0]) {
      for (final scale in [1.0, 3.0]) {
        testWidgets('composer geometry stays stable width$width IME$keyboard '
            'scale$scale', (tester) async {
          final controller = TextEditingController();
          final focus = FocusNode();
          addTearDown(controller.dispose);
          addTearDown(focus.dispose);
          await pumpStableComposer(
            tester,
            controller: controller,
            focus: focus,
            width: width,
            keyboard: keyboard,
            textScale: scale,
          );
          final empty = _geometry(tester);
          final surface = tester.element(
            find.byKey(const ValueKey('persistent-shell-dock-material')),
          );
          expect(find.byIcon(LucideIcons.menu), findsOneWidget);
          expect(find.byIcon(LucideIcons.mic).hitTestable(), findsOneWidget);
          controller.text = 'k';
          await tester.pumpAndSettle();
          final typed = _geometry(tester);
          expect(typed.editor, empty.editor);
          expect(typed.surface, empty.surface);
          expect(typed.primary, empty.primary);
          expect(typed.attach, empty.attach);
          expect(find.byIcon(LucideIcons.arrowUp), findsOneWidget);
          expect(find.byIcon(LucideIcons.mic).hitTestable(), findsNothing);
          expect(
            tester.element(
              find.byKey(const ValueKey('persistent-shell-dock-material')),
            ),
            same(surface),
          );

          controller.text = 'a\nb\nc\nd\ne';
          await tester.pumpAndSettle();
          final multiline = _geometry(tester);
          expect(multiline.editor.width, empty.editor.width);
          expect(multiline.editor.bottom, empty.editor.bottom);
          expect(multiline.surface.width, empty.surface.width);
          expect(multiline.surface.bottom, empty.surface.bottom);
          expect(multiline.surface.height, greaterThan(empty.surface.height));
          expect(multiline.primary, empty.primary);
          expect(multiline.attach, empty.attach);
          controller.text = 'a\nb\nc\nd\ne\nf';
          await tester.pumpAndSettle();
          expect(_geometry(tester).surface, multiline.surface);

          controller.clear();
          await tester.pumpAndSettle();
          expect(_geometry(tester), empty);
          expect(find.byIcon(LucideIcons.mic).hitTestable(), findsOneWidget);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }

  for (final brightness in Brightness.values) {
    testWidgets('390x844 composer render ${brightness.name}', (tester) async {
      final controller = TextEditingController();
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      await pumpStableComposer(
        tester,
        controller: controller,
        focus: focus,
        brightness: brightness,
      );
      await renderAssistantComponent(
        tester,
        'assistant-composer-${brightness.name}-empty',
      );
      controller.text = 'Help me plan today';
      await tester.pumpAndSettle();
      await renderAssistantComponent(
        tester,
        'assistant-composer-${brightness.name}-typed',
      );
      controller.text = 'One clear priority\nA realistic plan\nTime to focus';
      await tester.pumpAndSettle();
      await renderAssistantComponent(
        tester,
        'assistant-composer-${brightness.name}-multiline',
      );
      expect(tester.takeException(), isNull);
    });
  }
}
