import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_state.dart';

class FinancePreferencesCubit extends Cubit<FinancePreferencesState> {
  FinancePreferencesCubit({required SettingsRepository settingsRepository})
    : _settingsRepository = settingsRepository,
      super(const FinancePreferencesState());

  final SettingsRepository _settingsRepository;

  Future<void> load() async {
    final showAmounts = await _settingsRepository.getFinanceAmountsVisible();
    emit(state.copyWith(showAmounts: showAmounts));
  }

  Future<void> setShowAmounts({required bool value}) async {
    emit(state.copyWith(showAmounts: value));
    await _settingsRepository.setFinanceAmountsVisible(value: value);
  }

  Future<void> toggleShowAmounts() async {
    await setShowAmounts(value: !state.showAmounts);
  }
}
