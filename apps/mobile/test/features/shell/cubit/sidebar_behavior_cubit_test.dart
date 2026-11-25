import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior.dart';
import 'package:mobile/features/shell/cubit/sidebar_behavior_cubit.dart';
import 'package:mobile/features/shell/cubit/sidebar_preferences.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Preferences extends SidebarPreferences {
  final remote = <String, SidebarBehavior>{};
  final writes = <(String, SidebarBehavior)>[];
  final reads = <String, Completer<SidebarBehavior?>>{};
  final firstRead = Completer<void>();
  bool rejectWrites = false;
  Exception? failure;

  @override
  Future<SidebarBehavior?> loadAccount(String userId) async {
    if (!firstRead.isCompleted) firstRead.complete();
    if (failure case final error?) throw error;
    final pending = reads[userId];
    if (pending != null) return await pending.future;
    return remote[userId];
  }

  @override
  Future<void> saveAccount(String userId, SidebarBehavior behavior) async {
    if (rejectWrites) throw StateError('offline');
    writes.add((userId, behavior));
    remote[userId] = behavior;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('normalizes stored modes and the retired hidden alias', () {
    for (final mode in SidebarBehavior.values) {
      expect(SidebarBehavior.parse(mode.name), mode);
    }
    expect(SidebarBehavior.parse('hidden'), SidebarBehavior.minimal);
    expect(SidebarBehavior.parse('unknown'), isNull);
    expect(SidebarBehavior.parse(null), isNull);
  });

  test(
    'keeps an unset device responsive and restores an explicit choice',
    () async {
      final cubit = SidebarBehaviorCubit();
      await cubit.restore(null);
      expect(cubit.state.behavior, isNull);
      await cubit.setBehavior(SidebarBehavior.hover);
      await cubit.close();

      final reopened = SidebarBehaviorCubit();
      addTearDown(reopened.close);
      await reopened.restore(null);
      expect(reopened.state.behavior, SidebarBehavior.hover);
    },
  );

  test(
    'local override survives restart without uploading local edits',
    () async {
      final prefs = _Preferences()..remote['a'] = SidebarBehavior.expanded;
      final cubit = SidebarBehaviorCubit(preferences: prefs);
      await cubit.restore('a');
      expect(cubit.state.behavior, SidebarBehavior.expanded);
      await cubit.setBehavior(SidebarBehavior.collapsed);
      expect(prefs.writes, [('a', SidebarBehavior.collapsed)]);
      await cubit.setLocalOverride(
        value: true,
        displayed: SidebarBehavior.collapsed,
      );
      expect(cubit.state.behavior, SidebarBehavior.collapsed);
      await cubit.setBehavior(SidebarBehavior.minimal);
      await cubit.close();

      final reopened = SidebarBehaviorCubit(preferences: prefs);
      addTearDown(reopened.close);
      await reopened.restore('a');
      expect(reopened.state.localOverride, isTrue);
      expect(reopened.state.behavior, SidebarBehavior.minimal);
      expect(prefs.writes, [('a', SidebarBehavior.collapsed)]);
      await reopened.setLocalOverride(
        value: false,
        displayed: SidebarBehavior.minimal,
      );
      expect(reopened.state.behavior, SidebarBehavior.collapsed);
    },
  );

  test('pending choices are scoped to their account and retried', () async {
    final prefs = _Preferences()
      ..remote.addAll({
        'a': SidebarBehavior.collapsed,
        'b': SidebarBehavior.hover,
      })
      ..rejectWrites = true;
    final cubit = SidebarBehaviorCubit(preferences: prefs);
    await cubit.restore('a');
    await cubit.setBehavior(SidebarBehavior.minimal);
    await cubit.close();

    prefs.rejectWrites = false;
    final reopened = SidebarBehaviorCubit(preferences: prefs);
    addTearDown(reopened.close);
    await reopened.restore('b');
    expect(reopened.state.behavior, SidebarBehavior.hover);
    expect(prefs.writes, isEmpty);
    await reopened.bindAccount('a');
    expect(reopened.state.behavior, SidebarBehavior.minimal);
    expect(prefs.writes, [('a', SidebarBehavior.minimal)]);
  });

  test('a stale account load cannot overwrite the active choice', () async {
    final slow = Completer<SidebarBehavior?>();
    final prefs = _Preferences()
      ..reads['a'] = slow
      ..remote['b'] = SidebarBehavior.collapsed;
    final cubit = SidebarBehaviorCubit(preferences: prefs);
    addTearDown(cubit.close);
    final restore = cubit.restore('a');
    await prefs.firstRead.future;
    await cubit.bindAccount('b');
    slow.complete(SidebarBehavior.expanded);
    await restore;
    expect(cubit.state.behavior, SidebarBehavior.collapsed);
    expect((await prefs.readAccount('a')).behavior, isNull);
  });

  test(
    'a failed account sync logs the failure kind without its content',
    () async {
      final logs = <String?>[];
      final original = debugPrint;
      debugPrint = (message, {wrapWidth}) => logs.add(message);
      addTearDown(() => debugPrint = original);
      final prefs = _Preferences()
        ..failure = const ApiException(
          message: 'response body with private details',
          statusCode: 503,
        );
      final cubit = SidebarBehaviorCubit(preferences: prefs);
      addTearDown(cubit.close);

      await cubit.restore('a');

      final joined = logs.join('\n');
      expect(joined, contains('Could not sync sidebar preference'));
      expect(joined, contains('ApiException(503)'));
      expect(joined, isNot(contains('private details')));
    },
  );
}
