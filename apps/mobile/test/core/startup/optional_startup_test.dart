import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/startup/optional_startup.dart';

void main() {
  testWidgets('recovery starts after paint and runs only once', (tester) async {
    var paints = 0;
    var starts = 0;
    scheduleOptionalStartup(() async {
      expect(paints, 1);
      starts++;
    });
    expect(starts, 0);
    await tester.pumpWidget(
      CustomPaint(painter: _PaintRecorder(() => paints++)),
    );
    expect(starts, 1);
    await tester.pump();
    expect(starts, 1);
  });

  testWidgets('pending recovery does not block subsequent frames', (
    tester,
  ) async {
    final recovery = Completer<void>();
    scheduleOptionalStartup(() => recovery.future);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(const SizedBox(key: ValueKey('next-frame')));
    expect(find.byKey(const ValueKey('next-frame')), findsOneWidget);
    recovery.complete();
    await tester.pump();
  });

  testWidgets('synchronous failure cannot abort startup', (tester) async {
    scheduleOptionalStartup(() => throw StateError('recovery failed'));
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('asynchronous failure cannot abort startup', (tester) async {
    final recovery = Completer<void>();
    scheduleOptionalStartup(() => recovery.future);
    await tester.pumpWidget(const SizedBox());
    recovery.completeError(StateError('recovery failed'));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}

class _PaintRecorder extends CustomPainter {
  _PaintRecorder(this.onPaint);

  final VoidCallback onPaint;

  @override
  void paint(Canvas canvas, Size size) => onPaint();

  @override
  bool shouldRepaint(_PaintRecorder oldDelegate) => false;
}
