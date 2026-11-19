import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/ui.dart' show AppButton;
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mobile/widgets/pending_sync_outline_painter.dart';

PendingMutationRecord _record({
  String id = 'mutation-1',
  PendingMutationStatus status = PendingMutationStatus.queued,
}) => PendingMutationRecord(
  id: id,
  feature: 'notes',
  method: 'PUT',
  path: '/api/v1/workspaces/ws-1/notes/note-1',
  createdAt: DateTime.utc(2026, 9, 28),
  workspaceId: 'ws-1',
  userId: 'user-1',
  optimisticPatch: const {'entityId': 'note-1'},
  status: status,
);

Future<PendingSyncOutlinePainter> _pumpOutline(
  WidgetTester tester, {
  required Brightness brightness,
  BorderRadius? borderRadius,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(brightness: brightness),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: SizedBox(
            width: 300,
            child: PendingSyncFrame(
              workspaceId: 'ws-1',
              entityId: 'note-1',
              feature: 'notes',
              borderRadius: borderRadius,
              child: const SizedBox(key: ValueKey('pending-child'), height: 60),
            ),
          ),
        ),
      ),
    ),
  );
  final paint = tester.widget<CustomPaint>(
    find.byWidgetPredicate(
      (widget) =>
          widget is CustomPaint &&
          widget.foregroundPainter is PendingSyncOutlinePainter,
    ),
  );
  return paint.foregroundPainter! as PendingSyncOutlinePainter;
}

void main() {
  tearDown(() => OfflineMutationQueue.instance.pending.value = []);

  testWidgets('later matching syncing edit takes status priority', (
    tester,
  ) async {
    final queue = OfflineMutationQueue.instance;
    addTearDown(() => queue.syncingIds.value = {});
    queue.pending.value = [
      for (final id in ['queued', 'active'])
        PendingMutationRecord(
          id: id,
          feature: 'notes',
          method: 'PUT',
          path: '/api/v1/workspaces/ws-1/notes/note-1',
          createdAt: DateTime.utc(2026, 9, 28),
          workspaceId: 'ws-1',
          userId: 'user-1',
          optimisticPatch: const {'entityId': 'note-1'},
        ),
    ];
    queue.syncingIds.value = {'active'};
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: PendingSyncFrame(
            workspaceId: 'ws-1',
            entityId: 'note-1',
            feature: 'notes',
            child: Text('Edited note'),
          ),
        ),
      ),
    );
    expect(find.text('Syncing…'), findsOneWidget);
    expect(find.text('Waiting to sync'), findsNothing);
  });

  testWidgets('a failed notification edit offers retry on the affected row', (
    tester,
  ) async {
    OfflineMutationQueue.instance.pending.value = [
      PendingMutationRecord(
        id: 'mutation-1',
        feature: 'notifications',
        method: 'PATCH',
        path: '/api/v1/notifications',
        createdAt: DateTime.utc(2026, 9, 28),
        userId: 'user-1',
        workspaceId: 'personal',
        payload: const {'action': 'mark_all_read', 'wsId': 'ws-1'},
        status: PendingMutationStatus.failed,
      ),
    ];
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: Column(
            children: [
              PendingSyncFrame(
                workspaceId: 'personal',
                notificationWorkspaceId: 'ws-1',
                entityId: 'notification-1',
                feature: 'notifications',
                child: Text('Affected notification'),
              ),
              PendingSyncFrame(
                workspaceId: 'personal',
                notificationWorkspaceId: 'ws-2',
                entityId: 'notification-2',
                feature: 'notifications',
                child: Text('Other workspace'),
              ),
            ],
          ),
        ),
      ),
    );
    final retry = find.widgetWithText(AppButton, 'Sync failed. Tap to retry');
    expect(retry, findsOneWidget);
    expect(tester.widget<AppButton>(retry).onPressed, isNotNull);
    expect(find.text('Waiting to sync'), findsNothing);
  });

  testWidgets('queued item is visibly muted and outlined until synced', (
    tester,
  ) async {
    final queue = OfflineMutationQueue.instance;
    queue.pending.value = [
      PendingMutationRecord(
        id: 'mutation-1',
        feature: 'notes',
        method: 'PUT',
        path: '/api/v1/workspaces/ws-1/notes/note-1',
        createdAt: DateTime.utc(2026, 9, 28),
        workspaceId: 'ws-1',
        userId: 'user-1',
        optimisticPatch: const {'entityId': 'note-1'},
      ),
    ];
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: PendingSyncFrame(
            workspaceId: 'ws-1',
            entityId: 'note-1',
            feature: 'notes',
            child: Text('Edited note'),
          ),
        ),
      ),
    );

    expect(find.text('Waiting to sync'), findsOneWidget);
    expect(
      tester
          .widgetList<Opacity>(find.byType(Opacity))
          .any((opacity) => opacity.opacity == 0.64),
      isTrue,
    );
    expect(find.byType(CustomPaint), findsWidgets);

    queue.pending.value = [];
    await tester.pump();
    expect(find.text('Waiting to sync'), findsNothing);
    expect(find.text('Edited note'), findsOneWidget);
  });

  for (final brightness in Brightness.values) {
    testWidgets('outline uses a muted token in ${brightness.name}', (
      tester,
    ) async {
      final colors = AppColorTokens.fallback(brightness);
      OfflineMutationQueue.instance.pending.value = [_record()];
      final painter = await _pumpOutline(tester, brightness: brightness);

      expect(painter.color, isNot(colors.primary));
      expect(
        painter.color,
        colors.mutedForeground.withValues(alpha: painter.color.a),
      );
      expect(painter.color.a, inInclusiveRange(0.4, 0.6));
    });
  }

  testWidgets('failed edits outline in the destructive role', (tester) async {
    final colors = AppColorTokens.fallback(Brightness.dark);
    OfflineMutationQueue.instance.pending.value = [
      _record(status: PendingMutationStatus.failed),
    ];
    final painter = await _pumpOutline(tester, brightness: Brightness.dark);
    expect(
      painter.color,
      colors.destructive.withValues(alpha: painter.color.a),
    );
  });

  testWidgets('outline is inset and concentric with the child corners', (
    tester,
  ) async {
    OfflineMutationQueue.instance.pending.value = [_record()];
    final painter = await _pumpOutline(
      tester,
      brightness: Brightness.dark,
      borderRadius: BorderRadius.circular(16),
    );
    final child = tester.getSize(find.byKey(const ValueKey('pending-child')));
    // The outline adds no size to the item it marks.
    expect(child, const Size(300, 60));

    final outline = painter.outlineFor(child);
    const offset =
        PendingSyncOutlinePainter.defaultInset +
        PendingSyncOutlinePainter.strokeWidth / 2;
    expect(outline.outerRect, (Offset.zero & child).deflate(offset));
    expect(outline.tlRadiusX, 16 - offset);
    expect(outline.brRadiusY, 16 - offset);
    // The stroke's outer edge stays inside the item's bounds.
    expect(
      outline.left - PendingSyncOutlinePainter.strokeWidth / 2,
      greaterThan(0),
    );
  });
}
