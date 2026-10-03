import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

import '../../helpers/timezone_http_harness.dart';

void main() {
  late TimezoneHttpHarness h;
  late TimezoneSettingsCubit cubit;
  setUp(() {
    h = TimezoneHttpHarness();
    cubit = TimezoneSettingsCubit(
      repository: h.repository,
      deviceLoader: () async => 'Asia/Ho_Chi_Minh',
    );
  });
  tearDown(() async {
    await cubit.close();
    h.dispose();
  });
  test(
    'production GET/PATCH preference contracts retain Bearer and gateway',
    () async {
      final values = {
        'users/calendar-settings': 'auto',
        'workspaces/synthetic-ws/calendar-settings': 'UTC',
      };
      h.respond = (req) async {
        expect(req.url.host, 'infrastructure.tuturuuu.com');
        expect(req.headers['authorization'], 'Bearer synthetic-access');
        expect(
          req.url.path,
          isIn(const [
            '/api/v1/mobile-calendar/api/v1/users/calendar-settings',
            '/api/v1/mobile-calendar/api/v1/workspaces/synthetic-ws/calendar-settings',
          ]),
        );
        final path = req.url.path.split('/api/v1/').last;
        if (req.method == 'PATCH') {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          expect(body.keys, ['timezone']);
          values[path] = body['timezone'] as String;
        }
        return TimezoneHttpHarness.json({'timezone': values[path]});
      };
      await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
      expect(cubit.state.effective, 'UTC');
      expect(h.requests.every((r) => r.method == 'GET'), true);
      await cubit.save('Europe/London');
      await cubit.save(
        'Asia/Ho_Chi_Minh',
        workspace: true,
        canManageWorkspace: true,
      );
      expect(cubit.state.personal, 'Europe/London');
      expect(cubit.state.workspace, 'Asia/Ho_Chi_Minh');
      expect(
        h.requests.map((r) => '${r.method} ${r.url.path}'),
        containsAll(const [
          'GET /api/v1/mobile-calendar/api/v1/users/calendar-settings',
          'GET /api/v1/mobile-calendar/api/v1/workspaces/synthetic-ws/calendar-settings',
          'PATCH /api/v1/mobile-calendar/api/v1/users/calendar-settings',
          'PATCH /api/v1/mobile-calendar/api/v1/workspaces/synthetic-ws/calendar-settings',
        ]),
      );
      expect(h.requests.where((r) => r.method == 'PATCH'), hasLength(2));
    },
  );
  test('scope-reset placeholder cannot resolve auto after cooldown', () async {
    await cubit.close();
    var now = DateTime.utc(2030);
    var deviceReads = 0;
    var limited = false;
    cubit = TimezoneSettingsCubit(
      repository: h.repository,
      clock: () => now,
      deviceLoader: () async {
        deviceReads++;
        return 'America/New_York';
      },
    );
    h.respond = (req) async => limited && req.method == 'GET'
        ? TimezoneHttpHarness.json({'retryAfter': 30}, status: 429)
        : TimezoneHttpHarness.json({'timezone': 'auto'});
    await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
    limited = true;
    await cubit.reload();
    await cubit.load(userId: 'synthetic-actor', workspaceId: null);
    now = now.add(const Duration(seconds: 31));
    final beforeSave = deviceReads;
    await cubit.save('auto');
    expect(cubit.state.effective, 'America/New_York');
    expect(deviceReads, beforeSave + 1);
  });

  test('loaded personal scope remains editable after workspace403', () async {
    h.respond = (req) async => req.url.path.contains('/workspaces/')
        ? TimezoneHttpHarness.json({'error': 'Denied'}, status: 403)
        : TimezoneHttpHarness.json({
            'timezone': req.method == 'PATCH' ? 'Europe/London' : 'auto',
          });
    await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
    expect(cubit.state.personalLoaded, true);
    expect(cubit.state.workspaceLoaded, false);
    await cubit.save('Europe/London');
    expect(cubit.state.personal, 'Europe/London');
    await cubit.save('UTC', workspace: true, canManageWorkspace: true);
    expect(h.requests.where((r) => r.method == 'PATCH'), hasLength(1));
  });
  test(
    'native lookup failure permits explicit named preference save',
    () async {
      await cubit.close();
      cubit = TimezoneSettingsCubit(
        repository: h.repository,
        deviceLoader: () async =>
            throw Exception('Synthetic native unavailable'),
      );
      h.respond = (req) async => TimezoneHttpHarness.json({
        'timezone': req.method == 'PATCH' ? 'Asia/Ho_Chi_Minh' : 'auto',
      });
      await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
      expect(cubit.state.resolved, false);
      expect(cubit.state.personalLoaded, true);
      await cubit.save('Asia/Ho_Chi_Minh');
      expect(cubit.state.effective, 'Asia/Ho_Chi_Minh');
      expect(cubit.state.resolved, true);
    },
  );
  test('both reads fail then retry recovers without implicit save', () async {
    var fail = true;
    h.respond = (_) async => fail
        ? TimezoneHttpHarness.json({'error': 'Unavailable'}, status: 500)
        : TimezoneHttpHarness.json({'timezone': 'UTC'});
    await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
    expect(cubit.state.personalLoaded, false);
    expect(cubit.state.workspaceLoaded, false);
    await cubit.save('Europe/London');
    expect(h.requests.every((r) => r.method == 'GET'), true);
    fail = false;
    await cubit.reload();
    expect(cubit.state.resolved, true);
  });
  test('failed explicit save preserves preference and permits retry', () async {
    var fail = true;
    h.respond = (req) async => req.method == 'PATCH' && fail
        ? TimezoneHttpHarness.json({'error': 'Denied'}, status: 403)
        : TimezoneHttpHarness.json({
            'timezone': req.method == 'PATCH' ? 'Europe/London' : 'UTC',
          });
    await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
    await cubit.save('Europe/London');
    expect(cubit.state.personal, 'UTC');
    expect(cubit.state.failed, true);
    fail = false;
    await cubit.save('Europe/London');
    expect(cubit.state.personal, 'Europe/London');
  });
  test('workspace edit cannot invent an unread personal preference', () async {
    h.respond = (req) async => req.url.path.contains('/users/')
        ? TimezoneHttpHarness.json({'error': 'Denied'}, status: 403)
        : TimezoneHttpHarness.json({
            'timezone': req.method == 'PATCH' ? 'Europe/London' : 'UTC',
          });
    await cubit.load(userId: 'synthetic-actor', workspaceId: 'synthetic-ws');
    expect(cubit.state.personalLoaded, false);
    expect(cubit.state.workspaceLoaded, true);
    await cubit.save(
      'Europe/London',
      workspace: true,
      canManageWorkspace: true,
    );
    expect(cubit.state.workspace, 'Europe/London');
    expect(cubit.state.personalLoaded, false);
    expect(cubit.state.resolved, false);
    expect(cubit.state.failed, true);
    expect(h.requests.where((r) => r.method == 'PATCH'), hasLength(1));
  });
}
