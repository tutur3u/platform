import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/settings/cubit/appearance_resolution.dart';
import 'package:mobile/features/settings/cubit/theme_cubit.dart';
import 'package:mobile/features/settings/data/account_appearance_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// In-memory account store keyed by user, standing in for `user_configs`.
class _Accounts extends AccountAppearanceRepository {
  final Map<String, String> stored = {};
  final List<(String, String)> saves = [];
  final Map<String, Completer<void>> holds = {};
  bool failSave = false;

  @override
  Future<String?> load(String userId) async {
    await holds[userId]?.future;
    return stored[userId];
  }

  @override
  Future<void> save(String userId, String encoded) async {
    if (failSave) throw Exception('offline');
    saves.add((userId, encoded));
    stored[userId] = encoded;
  }
}

const _aurora = AppearanceSettings(
  theme: AppearanceThemeId.aurora,
  backgroundStyle: AppearanceBackgroundStyle.blobs,
);
const _compact = AppearanceSettings(density: AppDensity.compact);
const _sunset = AppearanceSettings(
  theme: AppearanceThemeId.sunset,
  backgroundStyle: AppearanceBackgroundStyle.gradient,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  late _Accounts accounts;
  late ThemeCubit theme;

  ThemeCubit cubit() => ThemeCubit(
    settingsRepository: SettingsRepository(),
    accountAppearanceRepository: accounts,
  );

  setUp(() {
    accounts = _Accounts();
    theme = cubit();
  });
  tearDown(() => theme.close());

  group('resolution order', () {
    test('device override wins over the account, then the default', () {
      AppearanceSettings resolve({
        bool override = false,
        String? user = 'u1',
        AppearanceSettings? device,
        AppearanceSettings? account,
      }) => resolveAppearance(
        deviceOverride: override,
        userId: user,
        device: device,
        account: account,
      );

      expect(
        resolve(override: true, device: _compact, account: _aurora),
        _compact,
      );
      expect(resolve(device: _compact, account: _aurora), _aurora);
      // An account without a stored look starts from this device's look.
      expect(resolve(device: _compact), _compact);
      expect(resolve(), const AppearanceSettings());
      expect(resolve(override: true), const AppearanceSettings());
      // Signed out there is no account, so only the device's look shows.
      expect(resolve(user: null, device: _compact, account: _aurora), _compact);
      expect(resolve(user: null), const AppearanceSettings());
    });

    test('launch reads the cached account look for the session user', () async {
      final settings = SettingsRepository();
      await settings.setAppearance(_compact.encode());
      await settings.setAccountAppearance(
        'u1',
        _aurora.encode(),
        pendingUpload: false,
      );
      expect(
        (await StoredAppearance.read(settings, userId: 'u1')).resolved,
        _aurora,
      );
      expect(
        (await StoredAppearance.read(settings, userId: null)).resolved,
        _compact,
      );
      await settings.setAppearanceDeviceOverride(value: true);
      expect(
        (await StoredAppearance.read(settings, userId: 'u1')).resolved,
        _compact,
      );
    });
  });

  test('signing in shows the account appearance from the server', () async {
    accounts.stored['u1'] = _aurora.encode();
    await theme.bindAccount('u1');
    expect(theme.state.appearance, _aurora);
    expect(theme.state.hasAccount, isTrue);
    expect(theme.state.deviceOverride, isFalse);
  });

  test('edits follow the account to another device', () async {
    await theme.bindAccount('u1');
    await theme.setAppearance(_sunset);
    expect(accounts.stored['u1'], _sunset.encode());
    // This device's own look is untouched.
    expect(await SettingsRepository().getAppearance(), isNull);

    SharedPreferences.setMockInitialValues({});
    final other = cubit();
    addTearDown(other.close);
    await other.bindAccount('u1');
    expect(other.state.appearance, _sunset);
  });

  test('an existing device look seeds an empty account once', () async {
    await SettingsRepository().setAppearance(_compact.encode());
    await theme.bindAccount('u1');
    expect(theme.state.appearance, _compact);
    expect(accounts.saves, [('u1', _compact.encode())]);
  });

  test('a failed upload stays pending and retries on next sign-in', () async {
    await theme.bindAccount('u1');
    accounts.failSave = true;
    await theme.setAppearance(_sunset);
    expect(theme.state.appearance, _sunset);
    expect(accounts.stored['u1'], isNull);

    accounts
      ..failSave = false
      ..stored['u1'] = _aurora.encode();
    final next = cubit();
    addTearDown(next.close);
    await next.bindAccount('u1');
    // The unsent local choice wins over the older server value.
    expect(next.state.appearance, _sunset);
    expect(accounts.stored['u1'], _sunset.encode());
  });

  group('device override', () {
    test(
      'turning it on keeps the look and edits stay on this device',
      () async {
        accounts.stored['u1'] = _aurora.encode();
        await theme.bindAccount('u1');
        await theme.setDeviceOverride(value: true);
        expect(theme.state.deviceOverride, isTrue);
        expect(theme.state.appearance, _aurora);

        await theme.setAppearance(_compact);
        expect(theme.state.appearance, _compact);
        expect(accounts.stored['u1'], _aurora.encode());
        expect(
          AppearanceSettings.decode(await SettingsRepository().getAppearance()),
          _compact,
        );
      },
    );

    test('turning it off shows the account values again', () async {
      accounts.stored['u1'] = _aurora.encode();
      await theme.bindAccount('u1');
      await theme.setDeviceOverride(value: true);
      await theme.setAppearance(_compact);
      await theme.setDeviceOverride(value: false);
      expect(theme.state.appearance, _aurora);
      expect(await SettingsRepository().getAppearanceDeviceOverride(), isFalse);
    });

    test('it survives account switches and sign-out', () async {
      accounts
        ..stored['u1'] = _aurora.encode()
        ..stored['u2'] = _sunset.encode();
      await theme.bindAccount('u1');
      await theme.setDeviceOverride(value: true);
      await theme.setAppearance(_compact);
      await theme.bindAccount('u2');
      expect(theme.state.appearance, _compact);
      await theme.bindAccount(null);
      expect(theme.state.appearance, _compact);
    });
  });

  group('account switching', () {
    test('switching shows the new account, never the previous one', () async {
      accounts
        ..stored['u1'] = _aurora.encode()
        ..stored['u2'] = _sunset.encode();
      await theme.bindAccount('u1');
      expect(theme.state.appearance, _aurora);

      final seen = <AppearanceSettings>[];
      final sub = theme.stream.listen((s) => seen.add(s.appearance));
      await theme.bindAccount('u2');
      await sub.cancel();
      expect(theme.state.appearance, _sunset);
      expect(seen, isNot(contains(_aurora)));
    });

    test('an account without a stored look shows the default', () async {
      accounts.stored['u1'] = _aurora.encode();
      await theme.bindAccount('u1');
      await theme.bindAccount('u2');
      expect(theme.state.appearance, const AppearanceSettings());
    });

    test('a slow load for the previous account never lands', () async {
      accounts
        ..stored['u1'] = _aurora.encode()
        ..stored['u2'] = _sunset.encode()
        ..holds['u1'] = Completer<void>();
      final first = theme.bindAccount('u1');
      await theme.bindAccount('u2');
      accounts.holds['u1']!.complete();
      await first;
      expect(theme.state.appearance, _sunset);
      // Nor does it overwrite the cache for the account it belonged to.
      final cached = await SettingsRepository().getAccountAppearance('u2');
      expect(cached.encoded, _sunset.encode());
    });

    test('an edit made while loading wins over the server value', () async {
      accounts
        ..stored['u1'] = _aurora.encode()
        ..holds['u1'] = Completer<void>();
      final bind = theme.bindAccount('u1');
      await Future<void>.delayed(Duration.zero);
      final edit = theme.setAppearance(_compact);
      accounts.holds['u1']!.complete();
      await Future.wait([bind, edit]);
      expect(theme.state.appearance, _compact);
      expect(accounts.stored['u1'], _compact.encode());
    });
  });

  group('sign-out', () {
    test(
      'the account look stops showing and the device look returns',
      () async {
        await SettingsRepository().setAppearance(_compact.encode());
        accounts.stored['u1'] = _aurora.encode();
        await theme.bindAccount('u1');
        expect(theme.state.appearance, _aurora);

        final seen = <AppearanceSettings>[];
        final sub = theme.stream.listen((s) => seen.add(s.appearance));
        await theme.bindAccount(null);
        await sub.cancel();
        expect(theme.state.appearance, _compact);
        expect(theme.state.hasAccount, isFalse);
        expect(seen, isNot(contains(_aurora)));
      },
    );

    test('a cached look is not shown after relaunching signed out', () async {
      accounts.stored['u1'] = _aurora.encode();
      await theme.bindAccount('u1');
      await theme.bindAccount(null);
      expect(theme.state.appearance, const AppearanceSettings());

      final relaunched = (await StoredAppearance.read(
        SettingsRepository(),
        userId: null,
      )).resolved;
      expect(relaunched, const AppearanceSettings());
    });

    test('signing back in restores the account look offline', () async {
      accounts.stored['u1'] = _aurora.encode();
      await theme.bindAccount('u1');
      await theme.bindAccount(null);
      accounts.holds['u1'] = Completer<void>();
      unawaited(theme.bindAccount('u1'));
      await pumpEventQueue();
      // The local cache answers before the server does.
      expect(theme.state.appearance, _aurora);
      accounts.holds['u1']!.complete();
    });
  });
}
