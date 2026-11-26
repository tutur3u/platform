import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/data/unconfigured_snapshot_source.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_reply_attachment.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_thread_repository.dart';
import 'package:mobile/features/mastermind/projects/data/fixture_projects_repository.dart';
import 'package:mobile/features/mastermind/projects/data/projects_models.dart';
import 'package:mobile/features/mastermind/projects/data/thread_models.dart';
import 'package:mobile/features/mastermind/projects/view/project_thread_page.dart';
import 'package:mobile/features/mastermind/runtime/mastermind_runtime.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

const _thread = 'p_tuturuuu_0';
const _owner = 'synthetic-owner';
final _time = DateTime.utc(2026, 11, 25);

class _AttachmentSource extends Mock implements FleetThreadAttachmentSource {}

class _Projects extends FixtureProjectsRepository {
  _Projects(this._attachmentSource) : super(now: _time);

  final _AttachmentSource _attachmentSource;

  @override
  FleetThreadSource get replySource => _attachmentSource;

  bool delivered = false;

  @override
  Future<ThreadTranscript> messages(
    ProjectsMachine machine,
    String threadId, {
    int? before,
  }) async {
    final page = await super.messages(machine, threadId, before: before);
    if (!delivered || before != null) return page;
    return ThreadTranscript(
      thread: page.thread,
      messages: [
        ...page.messages,
        ThreadMessage(
          position: 40,
          role: ThreadMessageRole.user,
          kind: FleetTranscriptKind.human,
          text: 'Owner reply with screenshot.png and notes.custom',
          at: _time,
        ),
      ],
      earlierPosition: page.earlierPosition,
    );
  }
}

void main() {
  setUpAll(() => registerFallbackValue(FleetReplyAttachmentBatch([])));

  testWidgets('attachment-only send reads its receipt and reloads history', (
    tester,
  ) async {
    final source = _AttachmentSource();
    final repository = _Projects(source);
    final machine = (await repository.machines()).first;
    final runtime = MastermindRuntime.create(
      userId: () => _owner,
      source: const UnconfiguredSnapshotSource(),
      onlineChanges: const Stream<bool>.empty(),
    );
    addTearDown(runtime.close);
    final picks = [
      FleetReplyAttachment(
        name: 'screenshot.png',
        kind: FleetReplyAttachmentKind.image,
        bytes: base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB9kAAAAASUVORK5CYII=',
        ),
      ),
      FleetReplyAttachment(
        name: 'notes.custom',
        kind: FleetReplyAttachmentKind.text,
        bytes: utf8.encode('synthetic text\n'),
      ),
    ];
    FleetThreadReply receipt(String id, FleetReplyState state) =>
        FleetThreadReply(
          id: id,
          machineId: machine.machineId,
          threadId: _thread,
          state: state,
          delivery: state == FleetReplyState.delivered
              ? FleetReplyDelivery.steered
              : null,
          createdAt: _time,
        );
    when(
      () => source.replyWithAttachments(
        userId: _owner,
        machineId: machine.machineId,
        threadId: _thread,
        text: '',
        idempotencyKey: any(named: 'idempotencyKey'),
        batch: any(named: 'batch'),
      ),
    ).thenAnswer((call) async {
      final id = call.namedArguments[#idempotencyKey]! as String;
      final batch = call.namedArguments[#batch]! as FleetReplyAttachmentBatch;
      expect(batch.files.map((file) => file.name), [
        'screenshot.png',
        'notes.custom',
      ]);
      when(() => source.receipt(id)).thenAnswer((_) async {
        repository.delivered = true;
        return receipt(id, FleetReplyState.delivered);
      });
      return receipt(id, FleetReplyState.sent);
    });
    Future<void> open() async {
      await tester.pumpApp(
        RepositoryProvider<MastermindRuntime>.value(
          value: runtime,
          child: ProjectThreadPage(
            key: UniqueKey(),
            machine: machine,
            threadId: _thread,
            repository: repository,
            live: false,
            attachmentPicker: (_) async => picks.removeAt(0),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await open();
    final attach = find.byTooltip('Add attachments');
    await tester.tap(attach);
    await tester.pumpAndSettle();
    expect(find.byType(Image), findsOneWidget);
    await tester.tap(attach);
    await tester.pumpAndSettle();
    expect(find.text('screenshot.png'), findsOneWidget);
    expect(find.text('notes.custom'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('projects-composer-send')));
    await tester.pumpAndSettle();
    expect(find.text('Sent'), findsOneWidget);
    await tester.tap(find.text('Check again'));
    await tester.pumpAndSettle();
    expect(find.text('Steered into the running turn'), findsOneWidget);
    final readBack = find.textContaining(
      'Owner reply with screenshot.png and notes.custom',
      findRichText: true,
    );
    expect(readBack, findsOneWidget);

    await open();
    expect(readBack, findsOneWidget);
    expect(find.text('Steered into the running turn'), findsNothing);
    verify(
      () => source.replyWithAttachments(
        userId: _owner,
        machineId: machine.machineId,
        threadId: _thread,
        text: '',
        idempotencyKey: any(named: 'idempotencyKey'),
        batch: any(named: 'batch'),
      ),
    ).called(1);
  }, timeout: const Timeout(Duration(seconds: 30)));
}
