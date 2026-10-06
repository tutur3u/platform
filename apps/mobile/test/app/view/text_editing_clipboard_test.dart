import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    testWidgets('$platform toolbar paste replaces selection with IME open', (
      tester,
    ) async {
      debugDefaultTargetPlatformOverride = platform;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      tester.view.viewInsets = const FakeViewPadding(bottom: 260);
      addTearDown(tester.view.resetViewInsets);
      var clipboard = 'replacement';
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.getData') {
            return <String, dynamic>{'text': clipboard};
          }
          if (call.method == 'Clipboard.hasStrings') {
            return <String, dynamic>{'value': clipboard.isNotEmpty};
          }
          if (call.method == 'Clipboard.setData') {
            clipboard = (call.arguments as Map)['text'] as String;
          }
          return null;
        },
      );
      addTearDown(() {
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        );
      });
      final controller = TextEditingController(text: 'old text');
      final focus = FocusNode();
      addTearDown(controller.dispose);
      addTearDown(focus.dispose);
      await tester.pumpWidget(
        shad.ShadcnApp(
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: (context, child) => ShadcnMaterialBridge(
            child: DismissKeyboardOnPointerDown(child: child!),
          ),
          home: Scaffold(
            body: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.only(top: 100),
                child: shad.TextField(
                  controller: controller,
                  focusNode: focus,
                  contextMenuBuilder: platformTextContextMenuBuilder(),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byType(shad.TextField));
      await tester.pump();
      controller.selection = const TextSelection(
        baseOffset: 0,
        extentOffset: 3,
      );
      final editable = tester.state<EditableTextState>(
        find.byType(EditableText),
      );
      expect(editable.showToolbar(), isTrue);
      await tester.pumpAndSettle();
      expect(find.text('Paste'), findsOneWidget);
      final wrapperContext = tester.element(
        find.byType(DismissKeyboardOnPointerDown),
      );
      expect(MediaQuery.viewInsetsOf(wrapperContext).bottom, greaterThan(0));
      final focusedBox = focus.context!.findRenderObject()! as RenderBox;
      final pastePosition = tester.getCenter(find.text('Paste'));
      expect(
        focusedBox.size.contains(focusedBox.globalToLocal(pastePosition)),
        isFalse,
      );
      final gesture = await tester.startGesture(pastePosition);
      await tester.pump();
      expect(focus.hasFocus, isTrue);
      await gesture.up();
      await tester.pumpAndSettle();
      expect(controller.text, 'replacement text');
      expect(focus.hasFocus, isTrue);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      debugDefaultTargetPlatformOverride = null;
    });
  }
}
