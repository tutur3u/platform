import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/app_notification.dart';
import 'package:mobile/features/notifications/cubit/notifications_cubit.dart';
import 'package:mobile/features/notifications/widgets/notifications_sheet.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';

class _Cubit extends MockCubit<NotificationsState>
    implements NotificationsCubit {}

void main() {
  for (final tab in NotificationsTab.values) {
    for (final initial in ['empty', 'short', 'error']) {
      testWidgets('$tab $initial feed refreshes and waits for new data', (
        tester,
      ) async {
        final cubit = _Cubit();
        final states = StreamController<NotificationsState>.broadcast();
        addTearDown(states.close);
        final response = Completer<void>();
        AppNotification item(String title) => AppNotification(
          id: title,
          userId: 'synthetic-actor',
          type: 'system',
          title: title,
          data: const {},
          createdAt: DateTime(2026, 10, 27),
          readAt: tab == NotificationsTab.archive
              ? DateTime(2026, 10, 27)
              : null,
        );
        final feed = NotificationFeedState(
          status: initial == 'error'
              ? NotificationFeedStatus.error
              : NotificationFeedStatus.loaded,
          items: initial == 'short' ? [item('Old item')] : [],
          totalCount: initial == 'short' ? 1 : 0,
        );
        final state = const NotificationsState().copyWith(
          feed: feed,
          targetTab: tab,
        );
        whenListen(cubit, states.stream, initialState: state);
        when(cubit.refreshUnreadCount).thenAnswer((_) async {});
        when(() => cubit.loadMore(tab)).thenAnswer((_) async {});
        when(() => cubit.loadTab(tab, refresh: true)).thenAnswer((_) async {});
        await tester.pumpApp(
          BlocProvider<NotificationsCubit>.value(
            value: cubit,
            child: Scaffold(
              body: Builder(
                builder: (context) => NotificationsView(
                  parentContext: context,
                  pageMode: false,
                  initialTab: tab,
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        clearInteractions(cubit);
        when(
          () => cubit.loadTab(tab, refresh: true),
        ).thenAnswer((_) => response.future);
        await tester.drag(find.byType(ListView).last, const Offset(0, 450));
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
        verify(() => cubit.loadTab(tab, refresh: true)).called(1);
        expect(find.byType(NovaLoadingIndicator), findsOneWidget);
        expect(find.textContaining('Fresh item'), findsNothing);

        states.add(
          state.copyWith(
            feed: NotificationFeedState(
              status: NotificationFeedStatus.loaded,
              items: [item('Fresh item')],
              totalCount: 1,
            ),
            targetTab: tab,
          ),
        );
        response.complete();
        await tester.pumpAndSettle();
        expect(find.textContaining('Fresh item'), findsOneWidget);
        expect(find.textContaining('Old item'), findsNothing);
        expect(find.byType(NovaLoadingIndicator), findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
