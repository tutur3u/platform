import 'package:shared_preferences/shared_preferences.dart';

/// The "What brings you here?" tiles, in display order.
///
/// [goal] maps each tile onto the shared onboarding goal vocabulary
/// (`ONBOARDING_GOALS` in `packages/utils/src/onboarding.ts`), the values the
/// web onboarding-progress API stores.
enum OnboardingInterest {
  calendar('focus'),
  tasks('focus'),
  chat('collaborate'),
  education('learn'),
  finance('operate'),
  mira('focus');

  const OnboardingInterest(this.goal);

  final String goal;

  /// Distinct goals for [interests], in tile order.
  static List<String> goalsFor(Iterable<OnboardingInterest> interests) => {
    for (final interest in values)
      if (interests.contains(interest)) interest.goal,
  }.toList(growable: false);
}

/// Local record of the onboarding choices, next to the earlier carousel's
/// `connected_onboarding_*` preferences, keyed per account.
abstract final class OnboardingChoices {
  static String interestsKey(String userId) =>
      'connected_onboarding_interests:$userId';
  static String goalsKey(String userId) => 'connected_onboarding_goals:$userId';

  static Future<void> save(
    String userId,
    Set<OnboardingInterest> interests,
  ) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(interestsKey(userId), [
      for (final interest in OnboardingInterest.values)
        if (interests.contains(interest)) interest.name,
    ]);
    await prefs.setStringList(
      goalsKey(userId),
      OnboardingInterest.goalsFor(interests),
    );
  }
}
