import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';

import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart';

Future<void> openMemory(
  WidgetTester tester,
  SettingsRepository repository, {
  String locale = 'en',
}) async {
  tester.platformDispatcher.localesTestValue = [Locale(locale)];
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  await tester.pumpApp(
    SingleChildScrollView(
      child: AssistantPersonalSettingsSection(
        workspaceId: 'workspace-a',
        isScopeCurrent: () => true,
        currentUserId: () => repository.ownerId,
        repository: repository,
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text(locale == 'en' ? 'Memory' : 'Bộ nhớ'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Synthetic preference'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Synthetic preference'));
  await tester.pumpAndSettle();
}

Future<void> pressSave(WidgetTester tester, {String text = 'Save'}) async {
  await tester.pump();
  final save = find.widgetWithText(FilledButton, text);
  await tester.ensureVisible(save);
  await tester.tap(save);
  await tester.pumpAndSettle();
}

void main() {
  for (final locale in ['en', 'vi']) {
    testWidgets('$locale actual list opens canonical editor and '
        'applies confirmed receipt', (tester) async {
      final repository = SettingsRepository();
      await openMemory(tester, repository, locale: locale);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField))
            .controller!
            .text,
        'Synthetic canonical content',
      );
      await tester.enterText(find.byType(TextFormField), 'Saved replacement');
      await pressSave(tester, text: locale == 'en' ? 'Save' : 'Lưu');
      expect(repository.edits, 1);
      expect(find.byType(TextFormField), findsNothing);
      expect(find.text('Saved replacement'), findsOneWidget);
      expect(repository.productsSent, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
    testWidgets('$locale audit failure says saved, updates list '
        'and prevents repeated save', (tester) async {
      final repository = SettingsRepository()
        ..updateEdit = (value, _) async => AssistantMemoryEditReceipt(
          memory: EditableAssistantMemory(
            id: 'memory-a',
            content: value,
            revision: 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ),
          auditRecorded: false,
        );
      await openMemory(tester, repository, locale: locale);
      await tester.enterText(
        find.byType(TextFormField),
        'Saved with audit warning',
      );
      await pressSave(tester, text: locale == 'en' ? 'Save' : 'Lưu');
      expect(
        find.text(
          locale == 'en'
              ? 'Your changes are saved, but the activity record '
                    'could not be confirmed. Do not save them again.'
              : 'Thay đổi đã được lưu, nhưng chưa thể xác nhận '
                    'bản ghi hoạt động. Không cần lưu lại.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(
                FilledButton,
                locale == 'en' ? 'Save' : 'Lưu',
              ),
            )
            .onPressed,
        isNull,
      );
      expect(repository.edits, 1);
      final done = find.text(locale == 'en' ? 'Done' : 'Xong');
      await tester.ensureVisible(done);
      await tester.tap(done);
      await tester.pumpAndSettle();
      expect(find.text('Saved with audit warning'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets('409 preserves draft, reviews actual current '
      'content and explicitly retries new revision', (tester) async {
    final repository = SettingsRepository()
      ..updateEdit = (_, _) => Future.error(
        const ApiException(message: 'Synthetic conflict', statusCode: 409),
      );
    await openMemory(tester, repository);
    await tester.enterText(find.byType(TextFormField), 'Unsaved draft');
    await pressSave(tester);
    expect(
      tester.widget<TextFormField>(find.byType(TextFormField)).controller!.text,
      'Unsaved draft',
    );
    expect(
      tester
          .widget<FilledButton>(find.widgetWithText(FilledButton, 'Save'))
          .onPressed,
      isNull,
    );
    repository.readEdit = () async => const EditableAssistantMemory(
      id: 'memory-a',
      content: 'Other saved changes',
      revision: 'v1:cccccccccccccccccccccccccccccccc',
    );
    final review = find.text('Review latest version');
    await tester.ensureVisible(review);
    await tester.tap(review);
    await tester.pumpAndSettle();
    expect(find.text('Other saved changes'), findsOneWidget);
    expect(
      tester.widget<TextFormField>(find.byType(TextFormField)).controller!.text,
      'Unsaved draft',
    );
    expect(repository.edits, 1);
    String? revision;
    repository.updateEdit = (value, captured) async {
      revision = captured;
      return AssistantMemoryEditReceipt(
        memory: EditableAssistantMemory(
          id: 'memory-a',
          content: value,
          revision: 'v1:dddddddddddddddddddddddddddddddd',
        ),
        auditRecorded: true,
      );
    };
    await pressSave(tester, text: 'Save my changes');
    expect(revision, 'v1:cccccccccccccccccccccccccccccccc');
    expect(repository.edits, 2);
    expect(find.text('Unsaved draft'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'typing while a save is held retains newer draft and new receipt revision',
    (tester) async {
      final held = Completer<AssistantMemoryEditReceipt>();
      final repository = SettingsRepository()
        ..updateEdit = (_, _) => held.future;
      await openMemory(tester, repository);
      await tester.enterText(find.byType(TextFormField), 'Submitted');
      await tester.pump();
      await tester.ensureVisible(find.text('Save'));
      await tester.tap(find.text('Save'));
      await tester.pump();
      await tester.enterText(find.byType(TextFormField), 'Newer unsaved draft');
      held.complete(
        const AssistantMemoryEditReceipt(
          memory: EditableAssistantMemory(
            id: 'memory-a',
            content: 'Submitted',
            revision: 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ),
          auditRecorded: true,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(TextFormField), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(find.byType(TextFormField))
            .controller!
            .text,
        'Newer unsaved draft',
      );
      expect(repository.edits, 1);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  for (final scale in [1.0, 2.0, 3.0]) {
    testWidgets(
      '320px scale$scale keyboard editor scrolls to accessible48px save',
      (tester) async {
        tester.view.physicalSize = const Size(320, 800);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = scale;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final repository = SettingsRepository();
        await openMemory(tester, repository);
        tester.view.viewInsets = const FakeViewPadding(bottom: 260);
        addTearDown(tester.view.resetViewInsets);
        await tester.enterText(
          find.byType(TextFormField),
          'Accessible changed text',
        );
        final save = find.widgetWithText(FilledButton, 'Save');
        await tester.ensureVisible(save);
        await tester.pumpAndSettle();
        expect(tester.getSize(save).height, greaterThanOrEqualTo(48));
        expect(tester.getRect(save).bottom, lessThanOrEqualTo(540));
        expect(tester.takeException(), isNull);
        await tester.tap(save);
        await tester.pumpAndSettle();
        expect(repository.edits, 1);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}
