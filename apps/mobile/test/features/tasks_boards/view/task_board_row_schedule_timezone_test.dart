import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/phone_surface.dart';
import 'task_board_row_actions_fixture.dart';

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

void main() {
  usePhoneSurface();
  setUpAll(CacheStore.instance.init);

  testWidgets(
    'row schedule preserves picked day across device and task zones',
    (tester) async {
      const zone = 'Pacific/Kiritimati';
      final timezone = _Timezone();
      whenListen(
        timezone,
        const Stream<TimezoneSettingsState>.empty(),
        initialState: const TimezoneSettingsState(
          personal: zone,
          loading: false,
          resolved: true,
        ),
      );
      final repository = RowActionsRepository();
      final workspace = rowActionsWorkspaceCubit();
      addTearDown(timezone.close);
      addTearDown(workspace.close);
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: workspace,
        repository: repository,
        timezone: timezone,
      );
      await tester.drag(taskRow('Alpha task'), const Offset(-320, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-row-swipe-schedule')));
      await tester.pumpAndSettle();
      final picker = tester.widget<AppDatePicker>(find.byType(AppDatePicker));
      final picked = DateTime(
        picker.initialDate.year,
        picker.initialDate.month,
        22,
      );
      expect(picked.timeZoneOffset, isNot(const Duration(hours: 14)));
      await tester.tap(
        find.descendant(
          of: find.byType(AppDatePicker),
          matching: find.text('22'),
        ),
      );
      await tester.pump();
      expect(repository.updates, hasLength(1));
      final saved = repository.updates.single.endDate!;
      expect(saved, isA<tz.TZDateTime>());
      final wall = tz.TZDateTime.from(saved, timezoneLocation(zone));
      expect(
        [wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second],
        [picked.year, picked.month, 22, 23, 59, 59],
      );
      await drainToasts(tester);
    },
  );
}
