import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/cubit/assistant_memory_editor_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';

import '../assistant_personal_settings_harness.dart';

const a = EditableAssistantMemory(
  id: 'memory-a',
  content: 'Canonical original',
  revision: 'v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
);
const b = EditableAssistantMemory(
  id: 'memory-a',
  content: 'Remote changed',
  revision: 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
);
void main() {
  late SettingsRepository repository;
  late AssistantMemoryEditorCubit cubit;
  late bool scope;
  late List<EditableAssistantMemory> confirmed;
  setUp(() {
    scope = true;
    confirmed = [];
    repository = SettingsRepository()..readEdit = () async => a;
    cubit = AssistantMemoryEditorCubit(
      repository: repository,
      workspaceId: 'workspace-a',
      memoryId: a.id,
      isScopeCurrent: () => scope,
      onConfirmed: confirmed.add,
    );
  });
  tearDown(() async {
    if (!cubit.isClosed) await cubit.close();
  });
  test('reads canonical text and does not edit unchanged content', () async {
    await cubit.load();
    expect(cubit.state.draft, a.content);
    expect(cubit.state.canSave, false);
    await cubit.save();
    expect(repository.edits, 0);
  });
  test('rejects blank and oversized draft without provider requests', () async {
    await cubit.load();
    for (final value in ['  ', 'x' * 20001]) {
      cubit.changeDraft(value);
      await cubit.save();
    }
    expect(repository.edits, 0);
    expect(confirmed, isEmpty);
  });
  test('accepts 20000 boundary and confirmed text only once', () async {
    await cubit.load();
    cubit.changeDraft('x' * 20000);
    await cubit.save();
    await cubit.save();
    expect(repository.edits, 1);
    expect(confirmed.single.content.length, 20000);
    expect(cubit.state.saved, true);
  });
  test('conflict preserves draft, explicit review gets '
      'revision, explicit save retries', () async {
    await cubit.load();
    cubit.changeDraft('My changes');
    repository.updateEdit = (_, _) =>
        Future.error(const ApiException(message: 'Conflict', statusCode: 409));
    await cubit.save();
    expect(cubit.state.failure, MemoryEditFailure.conflict);
    expect(cubit.state.draft, 'My changes');
    await cubit.save();
    expect(repository.edits, 1);
    repository.readEdit = () async => b;
    await cubit.load(reviewLatest: true);
    expect(cubit.state.draft, 'My changes');
    expect(cubit.state.latestContent, b.content);
    expect(cubit.state.memory!.revision, b.revision);
    expect(repository.edits, 1);
    String? submittedRevision;
    repository.updateEdit = (text, revision) async {
      submittedRevision = revision;
      return AssistantMemoryEditReceipt(
        memory: EditableAssistantMemory(
          id: a.id,
          content: text,
          revision: 'v1:cccccccccccccccccccccccccccccccc',
        ),
        auditRecorded: true,
      );
    };
    await cubit.save();
    expect(submittedRevision, b.revision);
    expect(repository.edits, 2);
    expect(confirmed.single.content, 'My changes');
  });
  test(
    'failed conflict refresh retains draft and does not resume blind overwrite',
    () async {
      await cubit.load();
      cubit.changeDraft('My changes');
      repository.updateEdit = (_, _) => Future.error(
        const ApiException(message: 'Conflict', statusCode: 409),
      );
      await cubit.save();
      repository.readEdit = () =>
          Future.error(StateError('synthetic unavailable'));
      await cubit.load(reviewLatest: true);
      expect(cubit.state.draft, 'My changes');
      expect(cubit.state.memory!.revision, a.revision);
      await cubit.save();
      expect(repository.edits, 1);
    },
  );
  for (final status in [401, 403, 404, 429, 502]) {
    test('failure status preserves unsaved text: $status', () async {
      await cubit.load();
      cubit.changeDraft('Unsaved');
      repository.updateEdit = (_, _) => Future.error(
        ApiException(message: 'Synthetic unavailable', statusCode: status),
      );
      await cubit.save();
      expect(cubit.state.draft, 'Unsaved');
      expect(confirmed, isEmpty);
      expect(cubit.state.saved, false);
    });
  }
  test('confirmed audit failure is saved, updates list '
      'once and blocks duplicate save', () async {
    await cubit.load();
    cubit.changeDraft('Saved changes');
    repository.updateEdit = (text, _) async => AssistantMemoryEditReceipt(
      memory: EditableAssistantMemory(
        id: a.id,
        content: text,
        revision: b.revision,
      ),
      auditRecorded: false,
    );
    await cubit.save();
    await cubit.save();
    expect(cubit.state.saved, true);
    expect(cubit.state.auditWarning, true);
    expect(confirmed.single.content, 'Saved changes');
    expect(repository.edits, 1);
  });
  test('edits typed while save is held remain dirty '
      'against confirmed new revision', () async {
    final held = Completer<AssistantMemoryEditReceipt>();
    repository.updateEdit = (_, _) => held.future;
    await cubit.load();
    cubit.changeDraft('Submitted');
    final saving = cubit.save();
    cubit.changeDraft('Newer draft');
    await cubit.save();
    expect(repository.edits, 1);
    held.complete(
      AssistantMemoryEditReceipt(
        memory: EditableAssistantMemory(
          id: a.id,
          content: 'Submitted',
          revision: b.revision,
        ),
        auditRecorded: true,
      ),
    );
    await saving;
    expect(confirmed.single.content, 'Submitted');
    expect(cubit.state.draft, 'Newer draft');
    expect(cubit.state.saved, false);
    expect(cubit.state.canSave, true);
    expect(cubit.state.memory!.revision, b.revision);
  });
  test('newest read wins without stale private text publication', () async {
    final held = Completer<EditableAssistantMemory>();
    repository.readEdit = () => held.future;
    final old = cubit.load();
    repository.readEdit = () async => b;
    await cubit.load();
    held.complete(a);
    await old;
    expect(cubit.state.draft, b.content);
  });
  for (final operation in ['load', 'save', 'review']) {
    test(
      '$operation account/workspace ABA denies late data and later requests',
      () async {
        await cubit.load();
        cubit.changeDraft('Draft');
        final read = Completer<EditableAssistantMemory>();
        final write = Completer<AssistantMemoryEditReceipt>();
        repository
          ..readEdit = () {
            return read.future;
          }
          ..updateEdit = (_, _) => write.future;
        final future = operation == 'save'
            ? cubit.save()
            : cubit.load(reviewLatest: operation == 'review');
        scope = false;
        expect(cubit.admitted, false);
        scope = true;
        read.complete(b);
        write.complete(
          const AssistantMemoryEditReceipt(memory: b, auditRecorded: true),
        );
        await future;
        expect(confirmed, isEmpty);
        expect(cubit.state.draft, 'Draft');
        expect(cubit.admitted, false);
        final count = repository.edits;
        await cubit.save();
        expect(repository.edits, count);
      },
    );
    test('$operation disposal denies held callbacks', () async {
      await cubit.load();
      cubit.changeDraft('Draft');
      final read = Completer<EditableAssistantMemory>();
      final write = Completer<AssistantMemoryEditReceipt>();
      repository
        ..readEdit = () {
          return read.future;
        }
        ..updateEdit = (_, _) => write.future;
      final future = operation == 'save'
          ? cubit.save()
          : cubit.load(reviewLatest: operation == 'review');
      await cubit.close();
      read.complete(b);
      write.complete(
        const AssistantMemoryEditReceipt(memory: b, auditRecorded: true),
      );
      await future;
      expect(confirmed, isEmpty);
    });
  }
}
