import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_intent.dart';
import 'package:path_provider/path_provider.dart';

export 'assistant_reaction_intent.dart';

/// Independent journal; every replay retains its original intent.
class AssistantReactionJournal {
  AssistantReactionJournal({Future<Box<dynamic>> Function()? openBox})
    : _openBox = openBox ?? _openPersistentBox;

  final Future<Box<dynamic>> Function() _openBox;
  static final _writes = <String, Future<void>>{};
  static final _epochs = <String, int>{};
  static int actorEpoch(String actor) => _epochs[actor] ?? 0;
  String _retirementKey(String actor) =>
      'retired::${sha256.convert(utf8.encode(actor))}';

  List<String> _retirementIds(Object? raw) {
    if (raw == null) return const [];
    if (raw is! List || raw.any((id) => id is! String || !isUuid(id))) {
      throw const FormatException('Invalid reaction retirement fence');
    }
    return raw.cast<String>();
  }

  Future<List<String>> retirementIds(String actor) => _run(
    actor,
    (box) async => _retirementIds(box.get(_retirementKey(actor))),
  );

  Future<void> finishRetirement(String actor, List<String> opIds) =>
      _run(actor, (box) async {
        final completed = opIds.toSet();
        final keys = box.keys
            .where((key) => '$key'.startsWith('$actor::mira-reaction-'))
            .toList();
        for (final key in keys) {
          final raw = box.get(key);
          if (raw is Map && completed.contains(raw['opId'])) {
            await box.delete(key);
          }
        }
        final remaining = _retirementIds(
          box.get(_retirementKey(actor)),
        ).where((id) => !completed.contains(id)).toList();
        if (remaining.isEmpty) {
          await box.delete(_retirementKey(actor));
        } else {
          await box.put(_retirementKey(actor), remaining);
        }
        await box.flush();
      });

  static Future<Box<dynamic>> _openPersistentBox() async {
    final support = await getApplicationSupportDirectory();
    final directory = await Directory(
      '${support.path}/assistant-reactions',
    ).create(recursive: true);
    return await Hive.openBox<dynamic>(
      'assistant_reaction_pending_v1',
      path: directory.path,
      crashRecovery: false,
    );
  }

  static String keyFor(
    String actor,
    String workspace,
    String chat,
    String message,
  ) {
    if (![actor, workspace, chat, message].every(isUuid)) {
      throw const FormatException('Invalid reaction journal scope');
    }
    return '$actor::mira-reaction-pending::v1::$workspace::$chat::$message';
  }

  Future<T> _run<T>(String actor, Future<T> Function(Box<dynamic>) work) async {
    final previous = _writes[actor];
    final done = Completer<void>();
    _writes[actor] = done.future;
    try {
      if (previous != null) await previous;
      return await work(await _openBox());
    } finally {
      done.complete();
      if (identical(_writes[actor], done.future)) {
        unawaited(_writes.remove(actor));
      }
    }
  }

  Future<AssistantReactionBegin> begin(
    String key, {
    required AssistantReactionIntent intent,
    required bool Function() isCurrent,
  }) async {
    try {
      AssistantReactionIntent.decode(intent.toJson());
    } on FormatException {
      return AssistantReactionBegin.failed;
    }
    final actor = key.split('::').first;
    final epoch = _epochs[actor] ?? 0;
    bool current() => (_epochs[actor] ?? 0) == epoch && isCurrent();
    if (!current()) return AssistantReactionBegin.failed;
    try {
      return await _run(actor, (box) async {
        if (!current()) return AssistantReactionBegin.failed;
        if (box.containsKey(key)) return AssistantReactionBegin.alreadyPending;
        try {
          await box.put(key, intent.toJson());
          await box.flush();
          if (current()) return AssistantReactionBegin.recorded;
        } on Object {
          // No POST has been admitted; remove only this attempted record.
        }
        await _remove(box, key, intent.opId);
        return AssistantReactionBegin.failed;
      });
    } on Object {
      return AssistantReactionBegin.failed;
    }
  }

  Future<AssistantReactionIntent?> pending(String key) =>
      _run(key.split('::').first, (box) async {
        if (!box.containsKey(key)) return null;
        return AssistantReactionIntent.decode(box.get(key));
      });

  Future<bool> _remove(Box<dynamic> box, String key, String opId) async {
    if (!box.containsKey(key)) return true;
    final raw = box.get(key);
    if (raw is! Map || raw['opId'] != opId) return false;
    await box.delete(key);
    await box.flush();
    return !box.containsKey(key);
  }

  /// Receipt cleanup is bound to operation identity, not the current UI scope.
  Future<bool> confirm(String key, {required String opId}) async {
    try {
      return await _run(
        key.split('::').first,
        (box) => _remove(box, key, opId),
      );
    } on Object {
      return false;
    }
  }

  /// Remove actor metadata, retaining only IDs needed to retire delayed writes.
  Future<bool> clearActor(String actor) async {
    if (!isUuid(actor)) return false;
    _epochs[actor] = actorEpoch(actor) + 1;
    try {
      return await _run(actor, (box) async {
        final keys = box.keys
            .where((key) => '$key'.startsWith('$actor::mira-reaction-'))
            .toList();
        final pendingIds = _retirementIds(
          box.get(_retirementKey(actor)),
        ).toSet();
        for (final key in keys) {
          final raw = box.get(key);
          if (raw is Map &&
              raw['opId'] is String &&
              isUuid(raw['opId'] as String)) {
            pendingIds.add(raw['opId'] as String);
          }
        }
        if (pendingIds.isNotEmpty) {
          await box.put(_retirementKey(actor), pendingIds.toList());
          await box.flush();
        }
        await box.deleteAll(keys);
        await box.flush();
        return true;
      });
    } on Object {
      return false;
    }
  }
}
