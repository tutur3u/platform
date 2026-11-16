import '../store_screenshot_app.dart';
import 'assistant_screen.dart';
import 'calendar_screen.dart';
import 'dashboard_screen.dart';
import 'finance_screen.dart';
import 'habits_screen.dart';
import 'notes_screen.dart';
import 'tasks_screen.dart';
import 'time_tracker_screen.dart';

/// The listing order, matching `apps/mobile/store/metadata/*.json`.
final List<StoreScreen> storeScreens = [
  dashboardStoreScreen,
  tasksStoreScreen,
  calendarStoreScreen,
  assistantStoreScreen,
  financeStoreScreen,
  habitsStoreScreen,
  timeTrackerStoreScreen,
  notesStoreScreen,
];
