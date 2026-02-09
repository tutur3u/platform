import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/sources/supabase_client.dart';

part 'calendar_settings_state.dart';

/// Manages first-day-of-week and related calendar preferences.
///
/// Fetches user and workspace preferences from Supabase and resolves them
/// using the same priority system as the web app: User > Workspace > Auto.
class CalendarSettingsCubit extends Cubit<CalendarSettingsState> {
  CalendarSettingsCubit() : super(const CalendarSettingsState());

  /// Loads the authenticated user's calendar preference.
  Future<void> loadUserPreference() async {
    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    try {
      final response = await supabase
          .from('users')
          .select('first_day_of_week')
          .eq('id', userId)
          .maybeSingle();

      if (response != null) {
        emit(
          state.copyWith(
            userPreference: _parseFirstDayOfWeek(
              response['first_day_of_week'] as String?,
            ),
          ),
        );
      }
    } on Exception catch (_) {
      // Silently keep default — not critical.
    }
  }

  /// Loads the workspace's calendar default.
  Future<void> loadWorkspacePreference(String wsId) async {
    try {
      final response = await supabase
          .from('workspaces')
          .select('first_day_of_week')
          .eq('id', wsId)
          .maybeSingle();

      if (response != null) {
        emit(
          state.copyWith(
            workspacePreference: _parseFirstDayOfWeek(
              response['first_day_of_week'] as String?,
            ),
          ),
        );
      }
    } on Exception catch (_) {
      // Silently keep default.
    }
  }

  /// Updates the user's first-day-of-week preference in the database.
  Future<void> setFirstDayOfWeek(FirstDayOfWeek value) async {
    // Optimistic update.
    emit(state.copyWith(userPreference: value));

    final userId = supabase.auth.currentUser?.id;
    if (userId == null) return;

    try {
      await supabase.from('users').update({
        'first_day_of_week': _firstDayOfWeekToString(value),
      }).eq('id', userId);
    } on Exception catch (_) {
      // Rollback on failure would be ideal, but the preference isn't critical
      // enough to warrant the complexity.
    }
  }
}
