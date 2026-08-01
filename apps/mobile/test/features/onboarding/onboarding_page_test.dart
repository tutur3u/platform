import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/onboarding/view/onboarding_page.dart';
// import 'package:mocktail/mocktail.dart'; // Unused
// import 'package:go_router/go_router.dart'; // Unused
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/pump_app.dart';

// class MockGoRouter extends Mock implements GoRouter {} // Unused

void main() {
  // late SharedPreferences prefs; // Unused

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    // prefs = await SharedPreferences.getInstance(); // Unused
    await SharedPreferences.getInstance();
  });

  group('OnboardingPage', () {
    testWidgets('renders first slide initially', (tester) async {
      await tester.pumpApp(const OnboardingPage());
      expect(find.text('Your goals, connected'), findsOneWidget);
      expect(find.text('Next'), findsOneWidget);
    });

    testWidgets('can navigate to next slide', (tester) async {
      await tester.pumpApp(const OnboardingPage());

      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      expect(find.text('Make Tuturuuu yours'), findsOneWidget);
    });

    testWidgets('shows the ecosystem action on the last slide', (tester) async {
      await tester.pumpApp(const OnboardingPage());

      // Slide 1 -> 2
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      // Slide 2 -> 3
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      // Slide 3 -> 4
      await tester.tap(find.text('Next'));
      await tester.pumpAndSettle();

      expect(find.text('A toolkit that adapts to you'), findsOneWidget);
      expect(find.text('Explore Tuturuuu'), findsOneWidget);
    });

    // Note: Testing actual navigation requires mocking GoRouter which helper
    // doesn't fully support yet or overriding dependencies.
    // For now, UI verification covers key interactions.
  });
}
