import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_creation_hold_banner.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  for (final (locale, message, history, start, dismiss) in [
    (
      const Locale('en'),
      'Your last chat may not have been saved. Starting a new chat does not '
          'retry it and may create a separate conversation.',
      'Check history',
      'Start a new chat',
      'Dismiss',
    ),
    (
      const Locale('vi'),
      'Cuộc trò chuyện gần nhất của bạn có thể chưa được lưu. Bắt đầu cuộc '
          'trò chuyện mới sẽ không thử lại cuộc trò chuyện đó và có thể tạo '
          'một cuộc trò chuyện riêng.',
      'Xem lịch sử',
      'Bắt đầu cuộc trò chuyện mới',
      'Đóng',
    ),
  ]) {
    testWidgets('banner renders and acts in ${locale.languageCode}', (
      tester,
    ) async {
      final taps = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          locale: locale,
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: AssistantCreationHoldBanner(
              onCheckHistory: () => taps.add('history'),
              onStartNewChat: () => taps.add('new'),
              onDismiss: () => taps.add('dismiss'),
            ),
          ),
        ),
      );
      expect(find.text(message), findsOneWidget);
      expect(find.widgetWithText(TextButton, history), findsOneWidget);
      expect(find.widgetWithText(TextButton, start), findsOneWidget);
      expect(find.byTooltip(dismiss), findsOneWidget);
      await tester.tap(find.text(history));
      await tester.tap(find.text(start));
      await tester.tap(find.byTooltip(dismiss));
      expect(taps, ['history', 'new', 'dismiss']);
    });
  }

  test('dismissal is per scope and cleared by a new session', () {
    AssistantCreationHoldBanner.resetDismissals();
    AssistantCreationHoldBanner.dismiss('actor::ws-a');
    expect(AssistantCreationHoldBanner.isDismissed('actor::ws-a'), isTrue);
    expect(AssistantCreationHoldBanner.isDismissed('actor::ws-b'), isFalse);
    AssistantCreationHoldBanner.resetDismissals();
    expect(AssistantCreationHoldBanner.isDismissed('actor::ws-a'), isFalse);
  });
}
