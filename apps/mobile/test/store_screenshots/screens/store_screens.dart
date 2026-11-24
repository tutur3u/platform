import '../store_screenshot_app.dart';
import 'assistant_screen.dart';
import 'calendar_screen.dart';
import 'dashboard_screen.dart';
import 'finance_screen.dart';
import 'habits_screen.dart';
import 'notes_screen.dart';
import 'tasks_screen.dart';
import 'time_tracker_screen.dart';

/// The story order, matching `SCREEN_IDS` in
/// `scripts/store-screenshots/specs.mjs` and `apps/mobile/store/metadata`.
final List<StoreScreen> storeScreens = [
  dashboardStoreScreen,
  assistantStoreScreen,
  tasksStoreScreen,
  calendarStoreScreen,
  timeTrackerStoreScreen,
  financeStoreScreen,
  habitsStoreScreen,
  notesStoreScreen,
];

/// Screens for the roadmap's feature previews, in showcase order. Ids match
/// `SHOWCASE_SCREENS` in `scripts/store-screenshots/specs.mjs`.
final List<StoreScreen> showcaseScreens = [
  tasksStoreScreen,
  taskDetailStoreScreen,
  calendarStoreScreen,
  assistantStoreScreen,
  dashboardStoreScreen,
  timeTrackerStoreScreen,
];
