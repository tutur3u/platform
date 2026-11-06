import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/appearance_resolution.dart';
import 'package:mobile/features/settings/cubit/theme_state.dart';
import 'package:mobile/features/settings/data/account_appearance_repository.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart';

/// Cubit for managing user theme preferences.
class ThemeCubit extends Cubit<ThemeState> {
  ThemeCubit({
    required SettingsRepository settingsRepository,
    AccountAppearanceRepository? accountAppearanceRepository,
    ThemeMode initialThemeMode = ThemeMode.system,
    AppearanceSettings initialAppearance = const AppearanceSettings(),
  }) : _settingsRepository = settingsRepository,
       _accountRepository = accountAppearanceRepository,
       super(
         ThemeState(themeMode: initialThemeMode, appearance: initialAppearance),
       );

  final SettingsRepository _settingsRepository;
  final AccountAppearanceRepository? _accountRepository;
  int _appearanceRevision = 0;

  /// Bumped on every account change so work for a previous account stops.
  int _scopeRevision = 0;
  bool _bound = false;
  String? _userId;
  AppearanceSettings? _device;
  AppearanceSettings? _account;

  /// The device look may still seed the first account bound after the
  /// upgrade; [_seedClaimed] keeps a second bind from also claiming it.
  bool _seedAvailable = false;
  bool _seedClaimed = false;
  final Map<String, Future<void>> _uploads = {};
  final Set<String> _uploadAgain = {};

  /// Loads the persisted theme mode.
  Future<void> loadThemeMode() async {
    try {
      final mode = await _settingsRepository.getThemeMode();
      emit(state.copyWith(themeMode: parseThemeMode(mode)));
    } on Exception catch (e) {
      debugPrint('Error loading theme mode: $e');
      emit(state.copyWith(themeMode: ThemeMode.system));
    }
  }

  /// Reloads the stored appearance inputs for the bound account and shows
  /// the resolved appearance. Installs that predate customisation have no
  /// stored payload and keep the default appearance with their saved mode.
  Future<void> loadAppearance() async {
    final revision = _appearanceRevision;
    final scope = _scopeRevision;
    try {
      final stored = await StoredAppearance.read(
        _settingsRepository,
        userId: _userId,
      );
      // A newer choice or account change already decided what shows.
      if (isClosed || scope != _scopeRevision) return;
      if (revision != _appearanceRevision) return;
      _device = stored.device;
      _account = stored.account;
      _seedAvailable = stored.seedAvailable;
      _publishOverride(stored.deviceOverride);
    } on Exception catch (e) {
      debugPrint('Error loading appearance: $e');
    }
  }

  /// Follows the signed-in account: [userId] is the authenticated user, or
  /// `null` when signed out. The previous account's appearance stops showing
  /// immediately; the new one comes from the local cache, then the server.
  Future<void> bindAccount(String? userId) async {
    if (isClosed || (_bound && userId == _userId)) return;
    final switched = _bound;
    _bound = true;
    _userId = userId;
    final scope = ++_scopeRevision;
    _account = null;
    if (switched) {
      _appearanceRevision++;
      emit(state.copyWith(appearance: _resolved(), hasAccount: userId != null));
    } else {
      emit(state.copyWith(hasAccount: userId != null));
    }
    await loadAppearance();
    if (userId == null || isClosed || scope != _scopeRevision) return;
    await _syncAccount(userId, scope);
  }

  Future<void> _syncAccount(String userId, int scope) async {
    final repository = _accountRepository;
    if (repository == null) return;
    final revision = _appearanceRevision;
    bool current() => !isClosed && scope == _scopeRevision;
    // Only the first account bound after the upgrade may be seeded with the
    // device's pre-sync look; later empty accounts start from the default.
    final claimsSeed = _seedAvailable && !_seedClaimed;
    if (claimsSeed) _seedClaimed = true;
    try {
      final cached = await _settingsRepository.getAccountAppearance(userId);
      if (cached.pendingUpload && cached.encoded != null) {
        // This account already holds a local choice, so it uses the seed up.
        if (claimsSeed) await _settingsRepository.setAppearanceSeedConsumed();
        await _upload(userId);
        return;
      }
      final remote = await repository.load(userId);
      final seed = claimsSeed && !state.deviceOverride ? _device : null;
      if (claimsSeed) {
        await _settingsRepository.setAppearanceSeedConsumed();
        if (current()) _seedAvailable = false;
      }
      // A choice made while loading wins and uploads on its own.
      if (!current() || revision != _appearanceRevision) return;
      var seeded = false;
      if (remote != null) {
        await _settingsRepository.setAccountAppearance(
          userId,
          remote,
          pendingUpload: false,
        );
        if (!current()) return;
        _account = AppearanceSettings.decode(remote);
      } else if (seed != null && _account == null) {
        await _settingsRepository.setAccountAppearance(
          userId,
          seed.encode(),
          pendingUpload: true,
        );
        seeded = true;
        if (current()) _account = seed;
      }
      if (current()) emit(state.copyWith(appearance: _resolved()));
      if (seeded) await _upload(userId);
    } on Exception catch (e) {
      debugPrint('Error syncing account appearance: $e');
    }
  }

  /// Uploads the newest pending choice for [userId], one request at a time.
  /// A choice made while a request is in flight is sent after it, so an
  /// older request can never land last.
  Future<void> _upload(String userId) {
    final running = _uploads[userId];
    if (running != null) {
      _uploadAgain.add(userId);
      return running;
    }
    // Must not return the removed future: the run would await itself.
    final run = _drainUploads(
      userId,
    ).whenComplete(() => _uploads.removeWhere((key, _) => key == userId));
    _uploads[userId] = run;
    return run;
  }

  Future<void> _drainUploads(String userId) async {
    final repository = _accountRepository;
    if (repository == null) return;
    while (true) {
      _uploadAgain.remove(userId);
      final cached = await _settingsRepository.getAccountAppearance(userId);
      final encoded = cached.encoded;
      if (encoded == null || !cached.pendingUpload) {
        if (_uploadAgain.contains(userId)) continue;
        return;
      }
      try {
        await repository.save(userId, encoded);
      } on Exception catch (e) {
        // Stays pending; the next launch or sign-in retries it.
        debugPrint('Error uploading appearance: $e');
        return;
      }
      // Cleared only when nothing newer was stored meanwhile; otherwise
      // the loop sends the newer choice.
      final cleared = await _settingsRepository.clearAccountAppearancePending(
        userId,
        encoded,
      );
      if (cleared && !_uploadAgain.contains(userId)) return;
    }
  }

  /// Keeps this device on its own appearance instead of the account's.
  /// Turning it on starts from what is showing, so nothing changes until
  /// the next edit; turning it off shows the account's appearance again.
  Future<void> setDeviceOverride({required bool value}) async {
    if (isClosed || value == state.deviceOverride) return;
    _appearanceRevision++;
    if (value) _device = state.appearance;
    _publishOverride(value);
    try {
      if (value) {
        await _settingsRepository.setAppearance(state.appearance.encode());
      }
      await _settingsRepository.setAppearanceDeviceOverride(value: value);
    } on Exception catch (e) {
      debugPrint('Error saving appearance override: $e');
    }
  }

  AppearanceSettings _resolved({bool? deviceOverride}) => resolveAppearance(
    deviceOverride: deviceOverride ?? state.deviceOverride,
    userId: _userId,
    device: _device,
    account: _account,
    seedAvailable: _seedAvailable && !_seedClaimed,
  );

  void _publishOverride(bool deviceOverride) {
    if (isClosed) return;
    emit(
      state.copyWith(
        deviceOverride: deviceOverride,
        appearance: _resolved(deviceOverride: deviceOverride),
      ),
    );
  }

  /// Sets and persists the user's theme choice. Returns whether [mode] was
  /// persisted and applied. [isCurrent] fences the write at the repository's
  /// linearization point: a stale scope before it skips the write and
  /// returns false. Once the write is dispatched it cannot be cancelled, so
  /// the device-wide theme state follows the stored value even if the scope
  /// ended meanwhile. A failed or throwing platform write returns false and
  /// keeps the current theme, which the repository restores in storage. Only
  /// a write that is still the newest saved choice when it returns is
  /// published; any other completion returns false without emitting, so
  /// overlapping choices end on the newest saved one.
  Future<bool> setThemeMode(
    ThemeMode mode, {
    bool Function()? isCurrent,
  }) async {
    bool current() => isCurrent == null || (!isClosed && isCurrent());
    if (!current()) return false;
    final PreferenceWriteOutcome outcome;
    try {
      outcome = await _settingsRepository.setThemeMode(
        mode.name,
        shouldWrite: isCurrent == null ? null : current,
      );
    } on Exception catch (e) {
      if (!current()) return false;
      debugPrint('Error setting theme mode: $e');
      return false;
    }
    // Superseded, failed and skipped writes never publish.
    if (outcome != PreferenceWriteOutcome.saved) return false;
    if (!isClosed) emit(state.copyWith(themeMode: mode));
    return true;
  }

  /// Applies [appearance] immediately without persisting, for live slider
  /// feedback. Call [setAppearance] when the gesture ends.
  void previewAppearance(AppearanceSettings appearance) {
    if (isClosed || appearance == state.appearance) return;
    _appearanceRevision++;
    emit(state.copyWith(appearance: appearance));
  }

  /// Applies [appearance] immediately, then persists it to the active
  /// target: this device when signed out or overridden, otherwise the
  /// account (cached locally, then uploaded). A newer change, an account
  /// switch or closing the cubit prevents an older write from landing last.
  Future<void> setAppearance(AppearanceSettings appearance) async {
    if (isClosed) return;
    final revision = ++_appearanceRevision;
    final scope = _scopeRevision;
    final userId = _userId;
    emit(state.copyWith(appearance: appearance));
    bool current() =>
        !isClosed && revision == _appearanceRevision && scope == _scopeRevision;
    final encoded = appearance.encode();
    try {
      if (state.deviceOverride || userId == null) {
        _device = appearance;
        await _settingsRepository.setAppearance(encoded, shouldWrite: current);
        return;
      }
      _account = appearance;
      await _settingsRepository.setAccountAppearance(
        userId,
        encoded,
        pendingUpload: true,
      );
      if (!current()) return;
      await _upload(userId);
    } on Exception catch (e) {
      debugPrint('Error saving appearance: $e');
    }
  }

  /// Picks a curated theme together with its recommended background style.
  Future<void> selectTheme(AppearanceThemeId theme) => setAppearance(
    state.appearance.copyWith(
      theme: theme,
      backgroundStyle: AppearancePalettes.of(theme).preferredStyle,
    ),
  );

  /// Restores the default appearance and follows the system mode.
  Future<void> resetAppearance() async {
    await setAppearance(const AppearanceSettings());
    await setThemeMode(ThemeMode.system);
  }

  static ThemeMode parseThemeMode(String mode) {
    switch (mode) {
      case 'light':
        return ThemeMode.light;
      case 'dark':
        return ThemeMode.dark;
      case 'system':
      default:
        return ThemeMode.system;
    }
  }
}
