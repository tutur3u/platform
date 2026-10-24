import 'dart:async';
import 'dart:io';

import 'package:hive/hive.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:path_provider/path_provider.dart';

/// A fresh conversation-cache snapshot cannot erase an unresolved toggle.
class AssistantReactionJournal {
  AssistantReactionJournal({Future<Box<dynamic>> Function()? openBox})
    : _openBox = openBox ?? _openPersistentBox;

  final Future<Box<dynamic>> Function() _openBox;
  static final _writes = <String, Future<void>>{};

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

  Future<bool> _run(
    String key,
    bool Function() current,
    Future<bool> Function(Box<dynamic>) work,
  ) async {
    final previous = _writes[key];
    final done = Completer<void>();
    _writes[key] = done.future;
    try {
      if (previous != null) await previous;
      if (!current()) return false;
      final box = await _openBox();
      if (!current()) return false;
      return await work(box);
    } on Object {
      return false;
    } finally {
      done.complete();
      if (identical(_writes[key], done.future)) {
        unawaited(_writes.remove(key));
      }
    }
  }

  /// Existing or malformed markers block further toggles.
  Future<bool> begin(String key, {required bool Function() isCurrent}) =>
      _run(key, isCurrent, (box) async {
        if (box.containsKey(key)) return false;
        await box.put(key, true);
        await box.flush();
        return box.get(key) == true && isCurrent();
      });

  Future<bool> confirm(String key, {required bool Function() isCurrent}) =>
      _run(key, isCurrent, (box) async {
        await box.delete(key);
        await box.flush();
        return !box.containsKey(key) && isCurrent();
      });
}
