import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/calendar/widgets/calendar_minute_clock.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:timezone/data/latest.dart' as data;
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/helpers.dart';

class _Preferences extends TimezoneSettingsRepository {
  _Preferences(this.zone);
  String zone;
  String workspace = 'auto';
  int writes = 0;

  @override
  Future<String> loadPersonal() async => zone;

  @override
  Future<String> loadWorkspace(String id) async => workspace;

  @override
  Future<String> savePersonal(String value) async {
    writes++;
    return zone = value;
  }
}

void main() {
  test('timezone lookup preserves the initialized local timezone', () {
    data.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Ho_Chi_Minh'));
    addTearDown(() => tz.setLocalLocation(tz.UTC));
    timezoneLocation('Europe/London');
    expect(tz.local.name, 'Asia/Ho_Chi_Minh');
  });

  test('native IANA aliases resolve after compact initialization', () {
    data.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Ho_Chi_Minh'));
    addTearDown(() => tz.setLocalLocation(tz.UTC));
    final alias = timezoneLocation('Asia/Saigon');
    expect(
      tz.TZDateTime.from(DateTime.utc(2030), alias).timeZoneOffset,
      const Duration(hours: 7),
    );
    expect(tz.local.name, 'Asia/Ho_Chi_Minh');
  });

  test('repeated invalid lookups do not reload the complete database', () {
    final alias = timezoneLocation('Asia/Saigon');
    for (var i = 0; i < 2; i++) {
      expect(() => timezoneLocation('Invalid/Zone'), throwsException);
      expect(timezoneLocation('Asia/Saigon'), same(alias));
    }
  });

  test('unsupported save input is rejected before any write', () async {
    final repository = _Preferences('UTC');
    final preferences = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
    );
    addTearDown(preferences.close);
    addTearDown(repository.dispose);
    await preferences.load(userId: 'timezone-regression', workspaceId: null);
    await preferences.save('Invalid/Zone');
    expect(repository.writes, 0);
    expect(preferences.state.personal, 'UTC');
    expect(preferences.state.failed, isTrue);
  });

  test('acknowledged auto save retains the saved value when fallback is '
      'unsupported', () async {
    final repository = _Preferences('UTC')..workspace = 'Invalid/Zone';
    final preferences = TimezoneSettingsCubit(
      repository: repository,
      deviceLoader: () async => 'UTC',
    );
    addTearDown(preferences.close);
    addTearDown(repository.dispose);
    await preferences.load(
      userId: 'timezone-regression',
      workspaceId: 'shared',
    );
    expect(preferences.state.resolved, isTrue);
    await preferences.save('auto');
    expect(repository.writes, 1);
    expect(repository.zone, 'auto');
    expect(preferences.state.personal, 'auto');
    expect(preferences.state.failedSaveZone, isNull);
    expect(preferences.state.resolved, isFalse);
    expect(preferences.state.failed, isTrue);
  });

  for (final device in [false, true]) {
    testWidgets('unsupported ${device ? 'device' : 'saved'} timezone does not '
        'replace the calendar with ErrorWidget', (tester) async {
      final repository = _Preferences(device ? 'auto' : 'Invalid/Zone');
      final preferences = TimezoneSettingsCubit(
        repository: repository,
        deviceLoader: () async => device ? 'GMT+07:00' : 'UTC',
      );
      addTearDown(preferences.close);
      addTearDown(repository.dispose);
      await preferences.load(userId: 'timezone-regression', workspaceId: null);
      await tester.pumpApp(
        BlocProvider<TimezoneSettingsCubit>.value(
          value: preferences,
          child: const CalendarMinuteClock(child: Text('Calendar body')),
        ),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('Calendar body'), findsOneWidget);
      expect(preferences.state.failed, isTrue);
      expect(preferences.state.resolved, isFalse);
    });
  }
}
