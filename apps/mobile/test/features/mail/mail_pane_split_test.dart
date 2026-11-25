import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mail/view/mail_pane_split_preference.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/helpers.dart';

const _body = 1008.0;
const ValueKey<String> _handle = ValueKey('master-detail-split-handle');

/// The Mail split as the workspace wires it, in a known body width.
Future<void> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(_body, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final preference = MailPaneSplitPreference.instance;
  await tester.pumpApp(
    ValueListenableBuilder<double>(
      valueListenable: preference,
      builder: (context, fraction, _) => AppMasterDetail(
        master: const ColoredBox(
          key: ValueKey('list'),
          color: Colors.transparent,
          child: SizedBox.expand(),
        ),
        emptyDetail: const SizedBox.expand(key: ValueKey('reader')),
        split: AppMasterDetailSplit(
          bounds: mailPaneSplitBounds,
          fraction: fraction,
          semanticLabel: 'Resize the list and reader',
          onChanged: preference.select,
          onReset: preference.reset,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

double _listFraction(WidgetTester tester) =>
    tester.getSize(find.byKey(const ValueKey('list'))).width /
    (_body - AppMasterDetailSplitHandle.extent);

Future<double?> _stored() async => (await SharedPreferences.getInstance())
    .getDouble(MailPaneSplitPreference.storageKey);

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    MailPaneSplitPreference.instance.debugReset();
  });

  test('bounds clamp to 28-48% and discard stored values outside them', () {
    expect(mailPaneSplitBounds.clamp(0.1), 0.28);
    expect(mailPaneSplitBounds.clamp(0.7), 0.48);
    expect(mailPaneSplitBounds.clamp(double.nan), 0.38);
    expect(mailPaneSplitBounds.normalize(0.42), 0.42);
    expect(mailPaneSplitBounds.normalize(0.6), 0.38);
    // The reader keeps at least 45%, so 1 - minDetail never undercuts 48%.
    expect(1 - mailPaneSplitBounds.clamp(1), greaterThanOrEqualTo(0.45));
  });

  test('a stored split loads and an invalid one falls back', () async {
    SharedPreferences.setMockInitialValues({'mail.paneSplit': 0.44});
    await MailPaneSplitPreference.instance.load();
    expect(MailPaneSplitPreference.instance.value, 0.44);

    MailPaneSplitPreference.instance.debugReset();
    SharedPreferences.setMockInitialValues({'mail.paneSplit': 0.9});
    await MailPaneSplitPreference.instance.load();
    expect(MailPaneSplitPreference.instance.value, 0.38);
  });

  testWidgets('dragging clamps the list and persists where it ends', (
    tester,
  ) async {
    await _pump(tester);
    expect(_listFraction(tester), closeTo(0.38, 0.001));
    final semantics = tester.getSemantics(find.byKey(_handle));
    expect(semantics.label, 'Resize the list and reader');
    expect(semantics.value, '38%');

    await tester.drag(find.byKey(_handle), const Offset(-600, 0));
    await tester.pumpAndSettle();
    expect(_listFraction(tester), closeTo(0.28, 0.001));
    expect(await _stored(), closeTo(0.28, 0.0001));

    await tester.drag(find.byKey(_handle), const Offset(900, 0));
    await tester.pumpAndSettle();
    expect(_listFraction(tester), closeTo(0.48, 0.001));
    expect(await _stored(), closeTo(0.48, 0.0001));
    expect(tester.takeException(), isNull);
  });

  testWidgets('semantic increase and decrease step the split', (tester) async {
    final handle = tester.ensureSemantics();
    await _pump(tester);
    final node = tester.getSemantics(find.byKey(_handle));
    tester.binding.pipelineOwner.semanticsOwner!.performAction(
      node.id,
      SemanticsAction.increase,
    );
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.39, 0.0001));
    tester.binding.pipelineOwner.semanticsOwner!.performAction(
      node.id,
      SemanticsAction.decrease,
    );
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.38, 0.0001));
    handle.dispose();
  });

  testWidgets('desktop keys resize and a double click resets', (tester) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.macOS;
    addTearDown(() => debugDefaultTargetPlatformOverride = null);
    await _pump(tester);
    final focus = tester.widget<Focus>(
      find.descendant(of: find.byKey(_handle), matching: find.byType(Focus)),
    );
    expect(focus.canRequestFocus, isTrue);
    Focus.of(
      tester.element(
        find.descendant(
          of: find.byKey(_handle),
          matching: find.byType(MouseRegion),
        ),
      ),
    ).requestFocus();
    await tester.pump();

    await tester.sendKeyEvent(LogicalKeyboardKey.arrowRight);
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.39, 0.0001));
    await tester.sendKeyEvent(LogicalKeyboardKey.end);
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.48, 0.0001));
    await tester.sendKeyEvent(LogicalKeyboardKey.home);
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.28, 0.0001));
    expect(await _stored(), closeTo(0.28, 0.0001));

    final center = tester.getCenter(find.byKey(_handle));
    await tester.tapAt(center);
    await tester.pump(kDoubleTapMinTime);
    await tester.tapAt(center);
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.38, 0.0001));
    expect(await _stored(), closeTo(0.38, 0.0001));
    expect(_listFraction(tester), closeTo(0.38, 0.001));
  });

  testWidgets('touch platforms neither focus the handle nor reset on '
      'double tap', (tester) async {
    await _pump(tester);
    final focus = tester.widget<Focus>(
      find.descendant(of: find.byKey(_handle), matching: find.byType(Focus)),
    );
    expect(focus.canRequestFocus, isFalse);
    await tester.drag(find.byKey(_handle), const Offset(-600, 0));
    await tester.pumpAndSettle();
    final center = tester.getCenter(find.byKey(_handle));
    await tester.tapAt(center);
    await tester.pump(kDoubleTapMinTime);
    await tester.tapAt(center);
    await tester.pumpAndSettle();
    expect(MailPaneSplitPreference.instance.value, closeTo(0.28, 0.0001));
  });
}
