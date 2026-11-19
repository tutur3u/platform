import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/kit/illustration/app_illustration.dart';
import 'package:mobile/core/ui/kit/illustration/illustration_painter.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/widgets/notifications_feed_list.dart';

import '../../../helpers/pump_app.dart';

/// [sorbetTestApp] turns animations off; this host restores them unless
/// [reduceMotion] is set.
Widget _host({required bool reduceMotion}) => sorbetTestApp(
  brightness: Brightness.dark,
  home: Builder(
    builder: (context) => MediaQuery(
      data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
      child: Scaffold(
        body: NotificationsFeedList(
          tab: NotificationsTab.inbox,
          feed: const NotificationFeedState(
            status: NotificationFeedStatus.loaded,
          ),
          onRefresh: () async {},
          onLoadMore: () async {},
          itemBuilder: (_) => const SizedBox.shrink(),
          now: DateTime(2026, 11, 19, 10),
        ),
      ),
    ),
  ),
);

Animation<double> _progress(WidgetTester tester) {
  final paint = tester.widget<CustomPaint>(
    find.descendant(
      of: find.byType(AppIllustration),
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is CustomPaint && widget.painter is AppIllustrationPainter,
      ),
    ),
  );
  return (paint.painter! as AppIllustrationPainter).progress;
}

void main() {
  const title = "You're all caught up";

  testWidgets('the all-caught-up illustration animates by default', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(_host(reduceMotion: false));
    await tester.pump();

    expect(
      tester.widget<AppIllustration>(find.byType(AppIllustration)).kind,
      AppIllustrationKind.notificationsClear,
    );
    final start = _progress(tester).value;
    await tester.pump(AppIllustration.period ~/ 4);
    expect(_progress(tester).value, isNot(start));
    expect(tester.binding.hasScheduledFrame, isTrue);
    expect(find.text(title), findsOneWidget);
    expect(find.bySemanticsLabel(title), findsOneWidget);

    // Let the loop finish so no ticker outlives the test.
    await tester.pump(AppIllustration.period * 4);
    semantics.dispose();
  });

  testWidgets('reduced motion shows a static frame with the same meaning', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await tester.pumpWidget(_host(reduceMotion: true));
    await tester.pump();

    expect(find.byType(AppIllustration), findsOneWidget);
    expect(_progress(tester).value, 0);
    await tester.pump(AppIllustration.period ~/ 4);
    expect(_progress(tester).value, 0);
    expect(tester.binding.hasScheduledFrame, isFalse);
    expect(find.text(title), findsOneWidget);
    expect(find.bySemanticsLabel(title), findsOneWidget);
    semantics.dispose();
  });
}
