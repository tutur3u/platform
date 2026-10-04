import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_morphing_dock.dart';

void main() {
  for (final reduced in [false, true]) {
    testWidgets(
      'one dock branch retains draft and selection, reduced=$reduced',
      (tester) async {
        final controller = TextEditingController(text: 'Keep this draft')
          ..selection = const TextSelection.collapsed(offset: 5);
        final focus = FocusNode();
        addTearDown(controller.dispose);
        addTearDown(focus.dispose);
        var composing = false;
        await tester.pumpWidget(
          MaterialApp(
            home: StatefulBuilder(
              builder: (context, setState) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(disableAnimations: reduced),
                child: Scaffold(
                  body: Align(
                    alignment: Alignment.bottomCenter,
                    child: AssistantMorphingDock(
                      isComposing: composing,
                      navigation: const Icon(Icons.home_rounded),
                      composeLabel: 'Compose',
                      onCompose: () {
                        setState(() => composing = true);
                        WidgetsBinding.instance.addPostFrameCallback(
                          (_) => focus.requestFocus(),
                        );
                      },
                      composer: Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: controller,
                              focusNode: focus,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.menu_rounded),
                            onPressed: () {
                              focus.unfocus();
                              setState(() => composing = false);
                            },
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.byIcon(Icons.chat_bubble_outline_rounded));
        await tester.pump();
        expect(
          find.byKey(const ValueKey('assistant-dock-navigation')),
          findsNothing,
        );
        expect(
          find.byKey(const ValueKey('assistant-dock-chat')),
          findsOneWidget,
        );
        await tester.pumpAndSettle();
        expect(focus.hasFocus, isTrue);
        final selection = controller.selection;
        await tester.tap(find.byIcon(Icons.menu_rounded));
        await tester.pump();
        expect(find.byType(TextField), findsNothing);
        expect(
          find.byKey(const ValueKey('assistant-dock-navigation')),
          findsOneWidget,
        );
        expect(focus.hasFocus, isFalse);
        expect(controller.text, 'Keep this draft');
        expect(controller.selection, selection);
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.chat_bubble_outline_rounded));
        await tester.pumpAndSettle();
        expect(controller.text, 'Keep this draft');
        expect(controller.selection, selection);
        expect(focus.hasFocus, isTrue);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
