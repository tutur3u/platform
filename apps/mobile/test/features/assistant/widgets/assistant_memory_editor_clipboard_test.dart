import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/widgets/dismiss_keyboard_on_pointer_down.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import '../assistant_personal_settings_harness.dart';

void main() {
  for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
    for (final locale in ['en', 'vi']) {
      testWidgets('$platform $locale actual memory modal pastes '
          'selected text with IME/global dismissal', (tester) async {
        debugDefaultTargetPlatformOverride = platform;
        addTearDown(() => debugDefaultTargetPlatformOverride = null);
        tester.view.viewInsets = const FakeViewPadding(bottom: 260);
        addTearDown(tester.view.resetViewInsets);
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          (call) async {
            if (call.method == 'Clipboard.getData') {
              return <String, dynamic>{'text': 'Inserted clipboard'};
            }
            if (call.method == 'Clipboard.hasStrings') {
              return <String, dynamic>{'value': true};
            }
            return null;
          },
        );
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            SystemChannels.platform,
            null,
          ),
        );
        final repository = SettingsRepository();
        final router = GoRouter(
          initialLocation: '/test',
          routes: [
            GoRoute(
              path: '/test',
              builder: (context, state) => Scaffold(
                body: SingleChildScrollView(
                  child: AssistantPersonalSettingsSection(
                    workspaceId: 'workspace-a',
                    isScopeCurrent: () => true,
                    currentUserId: () => 'actor-a',
                    repository: repository,
                  ),
                ),
              ),
            ),
          ],
        );
        addTearDown(router.dispose);
        await tester.pumpWidget(
          shad.ShadcnApp.router(
            locale: Locale(locale),
            localizationsDelegates: const [
              ...AppLocalizations.localizationsDelegates,
              AppShadcnLocalizationsDelegate(),
            ],
            supportedLocales: AppLocalizations.supportedLocales,
            builder: (context, child) => ShadcnMaterialBridge(
              child: DismissKeyboardOnPointerDown(child: child!),
            ),
            routerConfig: router,
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(locale == 'en' ? 'Memory' : 'Bộ nhớ'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Synthetic preference'));
        await tester.pumpAndSettle();
        final field = find.byType(TextFormField);
        await tester.ensureVisible(field);
        await tester.tap(field);
        await tester.pumpAndSettle();
        await tester.longPress(find.byType(EditableText));
        await tester.pumpAndSettle();
        final controller = tester.widget<TextFormField>(field).controller!;
        controller.selection = TextSelection(
          baseOffset: 0,
          extentOffset: controller.text.length,
        );
        final editable = tester.state<EditableTextState>(
          find.byType(EditableText),
        );
        // The actual long press has already opened the native toolbar.
        // Reopening it returns false while the existing overlay is visible.
        await tester.pumpAndSettle();
        final pasteLabel = MaterialLocalizations.of(
          tester.element(field),
        ).pasteButtonLabel;
        final paste = find.text(pasteLabel);
        expect(paste, findsOneWidget);
        final wrapper = tester.element(
          find.byType(DismissKeyboardOnPointerDown),
        );
        expect(MediaQuery.viewInsetsOf(wrapper).bottom, greaterThan(0));
        final gesture = await tester.startGesture(tester.getCenter(paste));
        await tester.pump();
        await gesture.up();
        await tester.pumpAndSettle();
        expect(controller.text, 'Inserted clipboard');
        expect(editable.widget.focusNode.hasFocus, isTrue);
        final save = find.widgetWithText(
          FilledButton,
          locale == 'en' ? 'Save' : 'Lưu',
        );
        await tester.ensureVisible(save);
        await tester.pump();
        await tester.tap(save);
        await tester.pumpAndSettle();
        expect(repository.edits, 1);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        debugDefaultTargetPlatformOverride = null;
      });
    }
  }
}
