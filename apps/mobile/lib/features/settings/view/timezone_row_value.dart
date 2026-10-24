import 'package:mobile/core/utils/timezone_label.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// What a Time zone row shows: one `value` line under the title and an
/// optional short `trailing` value ("Auto") on the title line.
typedef TimezoneRowText = ({String value, String? trailing});

/// The single value line of a Time zone row.
///
/// Rows name the zone as a city with its offset ("Ho Chi Minh City
/// (GMT+7)"). A personal Automatic choice shows "Auto" on the title line and
/// names the zone that applies, so the effective zone needs no extra line.
/// The workspace row shows only the workspace choice. Loading and account
/// states replace the value instead of adding lines; errors stay in the
/// row's subtitle.
TimezoneRowText timezoneRowText(
  AppLocalizations l10n,
  TimezoneSettingsState state, {
  required bool workspace,
  DateTime? at,
}) {
  if (state.loading || state.saving) {
    return (value: l10n.settingsTimezoneLoading, trailing: null);
  }
  final loaded = workspace ? state.workspaceLoaded : state.personalLoaded;
  if (!loaded) {
    return (
      value: state.failed || state.resolved
          ? l10n.settingsTimezoneUnknown
          : l10n.settingsTimezoneAccountPending,
      trailing: null,
    );
  }
  final cities = {'Ho Chi Minh City': l10n.settingsTimezoneCityHoChiMinh};
  String label(String zone) =>
      timezoneLabel(zone, at: at, localizedCities: cities);
  final choice = workspace ? state.workspace : state.personal;
  if (choice != 'auto') return (value: label(choice), trailing: null);
  if (workspace || !state.resolved || state.effective.isEmpty) {
    return (value: l10n.settingsTimezoneAuto, trailing: null);
  }
  return (
    value: label(state.effective),
    trailing: l10n.settingsTimezoneAutoShort,
  );
}
