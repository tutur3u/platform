import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/dashboard/view/dashboard_page.dart';

void main() {
  Future<DateTime> readClock(WidgetTester tester, {DateTime? pinned}) async {
    late DateTime seen;
    final reader = Builder(
      builder: (context) {
        seen = HomeWallClock.of(context);
        return const SizedBox.shrink();
      },
    );
    await tester.pumpWidget(
      pinned == null ? reader : HomeWallClock(now: pinned, child: reader),
    );
    return seen;
  }

  testWidgets('Home reads the pinned wall clock when one is provided', (
    tester,
  ) async {
    final pinned = DateTime(2026, 11, 24, 9, 20);
    expect(await readClock(tester, pinned: pinned), pinned);
  });

  testWidgets('Home falls back to the device clock without a pin', (
    tester,
  ) async {
    final before = DateTime.now();
    final seen = await readClock(tester);
    final after = DateTime.now();
    expect(seen.isBefore(before), isFalse);
    expect(seen.isAfter(after), isFalse);
  });

  testWidgets('a new pin replaces the old one', (tester) async {
    final first = DateTime(2026, 11, 24, 9, 20);
    final second = DateTime(2026, 11, 24, 19, 5);
    expect(await readClock(tester, pinned: first), first);
    expect(await readClock(tester, pinned: second), second);
  });
}
