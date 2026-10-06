import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TextEditingHarness {
  TextEditingHarness(this.tester, {String text = 'alpha beta'})
    : controller = TextEditingController(text: text);

  final WidgetTester tester;
  final TextEditingController controller;
  final focus = FocusNode();
  String clipboard = 'pasted';

  EditableTextState get editable =>
      tester.state<EditableTextState>(find.byType(EditableText));

  Future<void> mount({
    TargetPlatform platform = TargetPlatform.android,
    bool material = false,
    bool multiline = false,
    bool textArea = false,
    bool formField = false,
    List<TextInputFormatter>? inputFormatters,
    bool readOnly = false,
    bool enabled = true,
    bool obscured = false,
    bool nativeMenu = true,
    bool modal = false,
    bool nestedDismissal = false,
    bool largeText = false,
    bool keyboard = true,
    Locale locale = const Locale('en'),
    Widget? accessory,
    void Function(PointerDownEvent)? onTapOutside,
  }) async {
    debugDefaultTargetPlatformOverride = platform;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    tester.view.viewInsets = FakeViewPadding(bottom: keyboard ? 260 : 0);
    addTearDown(tester.view.resetViewInsets);
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        switch (call.method) {
          case 'Clipboard.getData':
            return <String, dynamic>{'text': clipboard};
          case 'Clipboard.hasStrings':
            return <String, dynamic>{'value': clipboard.isNotEmpty};
          case 'Clipboard.setData':
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
      controller.dispose();
      focus.dispose();
    });
    final Widget field;
    if (formField) {
      field = TextFormField(
        controller: controller,
        focusNode: focus,
        maxLines: multiline ? 4 : 1,
        readOnly: readOnly,
        enabled: enabled,
        obscureText: obscured,
        inputFormatters: inputFormatters,
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: platformTextContextMenuBuilder(),
      );
    } else if (textArea) {
      field = shad.TextArea(
        controller: controller,
        focusNode: focus,
        readOnly: readOnly,
        enabled: enabled,
        inputFormatters: inputFormatters,
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: platformTextContextMenuBuilder(),
      );
    } else if (material) {
      field = TextField(
        controller: controller,
        focusNode: focus,
        maxLines: multiline ? 4 : 1,
        readOnly: readOnly,
        enabled: enabled,
        obscureText: obscured,
        onTapOutside: onTapOutside,
        inputFormatters: inputFormatters,
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: platformTextContextMenuBuilder(),
      );
    } else {
      field = shad.TextField(
        controller: controller,
        focusNode: focus,
        maxLines: multiline ? 4 : 1,
        readOnly: readOnly,
        enabled: enabled,
        obscureText: obscured,
        onTapOutside: onTapOutside,
        inputFormatters: inputFormatters,
        selectionControls: platformTextSelectionControls(),
        contextMenuBuilder: nativeMenu
            ? platformTextContextMenuBuilder()
            : shad.TextField.defaultContextMenuBuilder,
      );
    }
    final content = SingleChildScrollView(
      child: Column(
        children: [
          const SizedBox(height: 100),
          field,
          if (accessory != null) TextFieldTapRegion(child: accessory),
          const SizedBox(height: 80),
          const Text('Outside field'),
          const SizedBox(height: 500),
        ],
      ),
    );
    await tester.pumpWidget(
      shad.ShadcnApp(
        locale: locale,
        localizationsDelegates: const [
          ...AppLocalizations.localizationsDelegates,
          shad.ShadcnLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(largeText ? 2 : 1)),
          child: ShadcnMaterialBridge(
            child: DismissKeyboardOnPointerDown(child: child!),
          ),
        ),
        home: Scaffold(
          body: modal
              ? AlertDialog(
                  content: nestedDismissal
                      ? DismissKeyboardOnPointerDown(child: content)
                      : content,
                )
              : content,
        ),
      ),
    );
  }

  Future<void> focusField() async {
    await tester.tap(find.byType(EditableText));
    await tester.pump();
  }

  Future<void> menu({int start = 0, int end = 5}) async {
    controller.selection = TextSelection(baseOffset: start, extentOffset: end);
    expect(editable.showToolbar(), isTrue);
    await tester.pumpAndSettle();
  }

  Future<void> tapMenu(String action) async {
    expect(find.text(action), findsOneWidget);
    final gesture = await tester.startGesture(
      tester.getCenter(find.text(action)),
    );
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }

  Future<void> unmount() async {
    await tester.pumpWidget(const SizedBox.shrink());
    debugDefaultTargetPlatformOverride = null;
  }
}
