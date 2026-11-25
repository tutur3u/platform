import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';

import '../../helpers/design_render_harness.dart';
import '../../helpers/pump_app.dart';

void main() {
  setUpAll(() => DesignRender.loadFonts(forGoldens: true));

  const cancelKey = ValueKey('cancel');
  const saveKey = ValueKey('save');
  const uploadKey = ValueKey('upload');

  for (final legacyScaffold in [false, true]) {
    for (final (width, scale, cancel, save, upload) in [
      (440.0, 1.0, 'Cancel', 'Save', 'Upload avatar'),
      (280.0, 2.0, 'Hủy', 'Tạo không gian làm việc', 'Tải lên ảnh đại diện'),
    ]) {
      testWidgets('stable action geometry at $width and scale $scale '
          '(legacy scaffold: $legacyScaffold)', (tester) async {
        DesignRender.setSize(tester, Size(width, 650));
        final busy = ValueNotifier(false);
        addTearDown(busy.dispose);
        var presses = 0;
        await tester.pumpThemedHome(
          Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: Scaffold(
                body: ValueListenableBuilder<bool>(
                  valueListenable: busy,
                  builder: (context, saving, _) {
                    final actions = [
                      AppButton.outline(
                        key: cancelKey,
                        onPressed: saving ? null : () => presses++,
                        child: Text(cancel),
                      ),
                      AppButton.primary(
                        key: saveKey,
                        loading: saving,
                        replaceLabelWhileLoading: true,
                        onPressed: () => presses++,
                        child: Text(save),
                      ),
                    ];
                    final content = SizedBox(
                      width: double.infinity,
                      child: AppButton.outline(
                        key: uploadKey,
                        onPressed: saving ? null : () => presses++,
                        child: Text(upload),
                      ),
                    );
                    return legacyScaffold
                        ? AppDialogScaffold(
                            title: 'Workspace',
                            actions: actions,
                            child: content,
                          )
                        : AppDialog(
                            title: 'Workspace',
                            actions: actions,
                            content: content,
                          );
                  },
                ),
              ),
            ),
          ),
        );

        final cancelButton = find.byKey(cancelKey);
        final saveButton = find.byKey(saveKey);
        final uploadButton = find.byKey(uploadKey);
        final cancelRect = tester.getRect(cancelButton);
        final saveRect = tester.getRect(saveButton);
        final uploadRect = tester.getRect(uploadButton);
        expect(cancelRect.center.dy, closeTo(saveRect.center.dy, 0.01));
        expect(cancelRect.right, lessThan(saveRect.left));
        for (final (rect, label) in [
          (cancelRect, cancel),
          (saveRect, save),
          (uploadRect, upload),
        ]) {
          expect(rect.width, greaterThanOrEqualTo(48));
          expect(rect.height, greaterThanOrEqualTo(48));
          expect(
            (tester.getCenter(find.text(label)) - rect.center).distance,
            lessThan(0.01),
          );
        }

        await tester.tap(saveButton);
        expect(presses, 1);
        busy.value = true;
        await tester.pump();

        expect(tester.getRect(cancelButton), cancelRect);
        expect(tester.getRect(saveButton), saveRect);
        expect(tester.getRect(uploadButton), uploadRect);
        expect(
          tester.getCenter(find.byType(CircularProgressIndicator)),
          saveRect.center,
        );
        await tester.tapAt(cancelRect.center);
        await tester.tapAt(saveRect.center);
        await tester.tapAt(uploadRect.center);
        expect(presses, 1);
      });
    }
  }

  testWidgets('pending delete preserves wrapped action and name', (
    tester,
  ) async {
    DesignRender.setSize(tester, const Size(280, 650));
    final semantics = tester.ensureSemantics();
    try {
      final pending = Completer<void>();
      const label = 'Xóa lượt nhập';
      await tester.pumpThemedHome(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: Scaffold(
              body: AsyncDeleteConfirmationDialog(
                title: 'Xóa',
                message: '',
                cancelLabel: 'Hủy',
                confirmLabel: label,
                onConfirm: () => pending.future,
              ),
            ),
          ),
        ),
      );
      final action = find.widgetWithText(AppButton, label);
      final before = tester.getRect(action);
      await tester.tap(action);
      await tester.pump();
      expect(tester.getRect(action), before);
      expect(
        tester.getCenter(find.byType(CircularProgressIndicator)),
        before.center,
      );
      expect(find.bySemanticsLabel(label), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      pending.complete();
      await tester.pump();
    } finally {
      semantics.dispose();
    }
  });

  testWidgets('explicit leading button alignment is respected', (tester) async {
    const key = ValueKey('navigation');
    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: SizedBox(
            width: 260,
            child: AppButton.ghost(
              key: key,
              alignment: AlignmentDirectional.centerStart,
              onPressed: () {},
              child: const Text('Navigation'),
            ),
          ),
        ),
      ),
    );
    expect(
      tester.getTopLeft(find.text('Navigation')).dx -
          tester.getTopLeft(find.byKey(key)).dx,
      16,
    );
  });
}
