import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Cubit extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

void main() {
  testWidgets(
    'actual timezone chooser searches and persists supported choice',
    (tester) async {
      final cubit = _Cubit();
      const state = TimezoneSettingsState(loading: false, resolved: true);
      when(() => cubit.state).thenReturn(state);
      whenListen(
        cubit,
        const Stream<TimezoneSettingsState>.empty(),
        initialState: state,
      );
      when(
        () => cubit.load(userId: 'user', workspaceId: 'ws'),
      ).thenAnswer((_) async {});
      when(() => cubit.save('America/New_York')).thenAnswer((_) async {});
      await tester.pumpApp(
        BlocProvider<TimezoneSettingsCubit>.value(
          value: cubit,
          child: const TimezoneSettingsTile(userId: 'user', workspaceId: 'ws'),
        ),
      );
      await tester.tap(find.text('Personal timezone'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(EditableText), 'new york');
      await tester.pumpAndSettle();
      expect(find.text('America/New_York'), findsOneWidget);
      await tester.tap(find.text('America/New_York'));
      await tester.pumpAndSettle();
      verify(() => cubit.save('America/New_York')).called(1);
      expect(tester.takeException(), isNull);
      await cubit.close();
    },
  );
}
