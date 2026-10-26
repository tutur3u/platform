import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';

/// Which stored appearance is shown.
///
/// The device override wins, then the signed-in account, then the default.
/// An account with no stored look yet uses this device's look, which is also
/// what it is seeded with. Signed out there is no account, so the device's
/// own look shows and an account's look never leaks onto sign-in screens.
AppearanceSettings resolveAppearance({
  required bool deviceOverride,
  required String? userId,
  required AppearanceSettings? device,
  required AppearanceSettings? account,
}) {
  if (deviceOverride || userId == null) {
    return device ?? const AppearanceSettings();
  }
  return account ?? device ?? const AppearanceSettings();
}

/// Stored inputs for [resolveAppearance], read once at launch so the first
/// frame already shows the right appearance.
class StoredAppearance {
  const StoredAppearance({
    this.deviceOverride = false,
    this.userId,
    this.device,
    this.account,
  });

  final bool deviceOverride;
  final String? userId;
  final AppearanceSettings? device;
  final AppearanceSettings? account;

  AppearanceSettings get resolved => resolveAppearance(
    deviceOverride: deviceOverride,
    userId: userId,
    device: device,
    account: account,
  );

  static Future<StoredAppearance> read(
    SettingsRepository settings, {
    required String? userId,
  }) async {
    final rawDevice = await settings.getAppearance();
    final rawAccount = userId == null
        ? null
        : (await settings.getAccountAppearance(userId)).encoded;
    return StoredAppearance(
      deviceOverride: await settings.getAppearanceDeviceOverride(),
      userId: userId,
      device: rawDevice == null ? null : AppearanceSettings.decode(rawDevice),
      account: rawAccount == null
          ? null
          : AppearanceSettings.decode(rawAccount),
    );
  }
}
