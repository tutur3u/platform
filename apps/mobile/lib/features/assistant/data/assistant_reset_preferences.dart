import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/data/chat_creation_receipt.dart';
import 'package:shared_preferences/shared_preferences.dart';

part 'assistant_reset_consent_target.dart';

enum AssistantResetDisposition {
  deniedBeforeEffect,
  committedCurrent,
  committedStale,
  uncertain,
}

final class AssistantCreationSelectedException implements Exception {
  const AssistantCreationSelectedException();
}

final class AssistantResetOutcome {
  const AssistantResetOutcome(this.disposition);
  final AssistantResetDisposition disposition;
  bool get committedCurrent =>
      disposition == AssistantResetDisposition.committedCurrent;
}

/// A capability prepared without storage or shell effects.
final class AssistantPreparedResetContext {
  const AssistantPreparedResetContext({
    required this.actorId,
    required this.workspaceId,
    required this.isCurrent,
    required this.publishCurrent,
  });
  final String actorId;
  final String workspaceId;
  final bool Function() isCurrent;
  final bool Function() publishCurrent;
}

/// One strict logical tuple. No history, prompts, or credentials are stored.
final class AssistantResetEnvelope {
  AssistantResetEnvelope._(Map<String, dynamic> value)
    : _value = Map.unmodifiable(value);

  factory AssistantResetEnvelope.decode(
    String raw,
    String actorId,
    String workspaceId,
  ) {
    final value = _record(jsonDecode(raw), {
      'schema',
      'actorId',
      'workspaceId',
      'revision',
      'generation',
      'selectedChatId',
      'contextId',
      'creation',
      'resetConsent',
      'resetIntent',
    });
    if (value['schema'] is! int ||
        value['schema'] != 1 ||
        value['actorId'] != actorId ||
        value['workspaceId'] != workspaceId) {
      throw const FormatException('Invalid Assistant envelope scope/version');
    }
    _uuid(actorId);
    _uuid(workspaceId);
    _positive(value['revision']);
    _positive(value['generation']);
    _chat(value['selectedChatId']);
    _context(value['contextId']);
    final creation = _record(value['creation'], {'status', 'attemptId'});
    _status(creation['status']);
    _nullableUuid(creation['attemptId']);
    if (creation['status'] == 'clear' && creation['attemptId'] != null) {
      throw const FormatException('Invalid cleared Assistant attempt');
    }
    _consent(value['resetConsent']);
    final consent = value['resetConsent'];
    if (consent is Map && consent['generation'] != value['generation']) {
      throw const FormatException('Invalid Assistant consent generation');
    }
    if (value['resetIntent'] != null) {
      final intent = _record(value['resetIntent'], {
        'operationId',
        'baseRevision',
        'baseGeneration',
        'beforeSelectedChatId',
        'beforeContextId',
        'priorHold',
        'priorConsent',
        'status',
      });
      _uuid(intent['operationId']);
      _nullablePositive(intent['baseRevision']);
      _nullablePositive(intent['baseGeneration']);
      _chat(intent['beforeSelectedChatId']);
      _context(intent['beforeContextId']);
      _hold(intent['priorHold']);
      _consent(intent['priorConsent']);
      final baseRevision = intent['baseRevision'];
      final baseGeneration = intent['baseGeneration'];
      if ((baseRevision == null) != (baseGeneration == null) ||
          value['revision'] !=
              (baseRevision == null ? 1 : (baseRevision as int) + 1) ||
          value['generation'] != (baseGeneration ?? 1) ||
          (intent['priorHold'] as Map)['generation'] != baseGeneration) {
        throw const FormatException('Invalid Assistant intent revision');
      }
      if (intent['status'] != 'pending' ||
          creation['status'] != 'unknown' ||
          intent['beforeSelectedChatId'] != value['selectedChatId'] ||
          intent['beforeContextId'] != value['contextId']) {
        throw const FormatException('Invalid Assistant pending reset');
      }
    }
    return AssistantResetEnvelope._(value);
  }

  final Map<String, dynamic> _value;
  int get revision => _value['revision'] as int;
  int get generation => _value['generation'] as int;
  String? get selectedChatId => _value['selectedChatId'] as String?;
  String? get contextId => _value['contextId'] as String?;
  bool get pending => _value['resetIntent'] != null;
  bool get held => (_value['creation'] as Map)['status'] != 'clear';
  String? get attemptId => (_value['creation'] as Map)['attemptId'] as String?;
  String encode() => jsonEncode(_value);

  static Map<String, dynamic> _record(Object? raw, Set<String> fields) {
    if (raw is! Map<String, dynamic> ||
        raw.length != fields.length ||
        !raw.keys.every(fields.contains)) {
      throw const FormatException('Invalid Assistant envelope fields');
    }
    return raw;
  }

  static void _uuid(Object? value) {
    if (value is! String || value.trim() != value || !isUuid(value)) {
      throw const FormatException('Invalid Assistant envelope identity');
    }
  }

  static void _nullableUuid(Object? value) {
    if (value != null) _uuid(value);
  }

  static void _positive(Object? value) {
    if (value is! int || value < 1) {
      throw const FormatException('Invalid Assistant envelope revision');
    }
  }

  static void _nullablePositive(Object? value) {
    if (value != null) _positive(value);
  }

  static void _context(Object? value) {
    if (value != null && (value is! String || value.trim().isEmpty)) {
      throw const FormatException('Invalid Assistant envelope context');
    }
  }

  static void _chat(Object? value) {
    if (value == null) return;
    if (value is! String) {
      throw const FormatException('Invalid Assistant envelope chat');
    }
    final id = value.startsWith('ai-chat-')
        ? value.substring(8)
        : value.startsWith('legacy-ai-')
        ? value.substring(10)
        : value;
    _uuid(id);
  }

  static void _status(Object? value) {
    if (value != 'unknown' && value != 'clear') {
      throw const FormatException('Invalid Assistant creation status');
    }
  }

  static void _hold(Object? raw) {
    final value = _record(raw, {
      'status',
      'attemptId',
      'generation',
      'legacyDigest',
    });
    _status(value['status']);
    _nullableUuid(value['attemptId']);
    _nullablePositive(value['generation']);
    final digest = value['legacyDigest'];
    if (value['generation'] == null
        ? digest is! String || !RegExp(r'^[a-f0-9]{64}$').hasMatch(digest)
        : digest != null) {
      throw const FormatException('Invalid Assistant prior hold provenance');
    }
  }

  static void _consent(Object? raw) {
    if (raw == null) return;
    final value = _record(raw, {
      'operationId',
      'generation',
      'priorHold',
      'informed',
      'phase',
    });
    _uuid(value['operationId']);
    _positive(value['generation']);
    _hold(value['priorHold']);
    if (value['informed'] != true || value['phase'] != 'committed') {
      throw const FormatException('Invalid Assistant reset consent');
    }
  }
}

/// All owning writers use this single actor/workspace lock. Internal methods
/// never reacquire it. Host acknowledgement is separate from physical effect.
final class AssistantResetPreferences {
  AssistantResetPreferences({
    required this.actorId,
    required this.workspaceId,
    required this.isCurrent,
  }) {
    AssistantResetEnvelope._uuid(actorId);
    AssistantResetEnvelope._uuid(workspaceId);
  }
  final String actorId;
  final String workspaceId;
  final bool Function() isCurrent;
  String get key => '$actorId::mira-conversation-envelope::v1::$workspaceId';
  static final _locks = <String, Future<void>>{};
  static final _holds = <String>{};
  static final _tickets =
      <String, ({String operationId, int generation, int revision})>{};
  static void revokeConsent(String key) {
    _tickets.remove(key);
    AssistantResetConsentTarget._issued.remove(key);
  }

  static Future<T> serialized<T>(String key, Future<T> Function() work) async {
    final previous = _locks[key];
    final done = Completer<void>();
    _locks[key] = done.future;
    try {
      if (previous != null) await previous;
      return await work();
    } finally {
      done.complete();
      if (identical(_locks[key], done.future)) {
        unawaited(_locks.remove(key));
      }
    }
  }

  void _check() {
    if (!isCurrent()) throw const FormatException('Assistant scope changed');
  }

  void hold() {
    AssistantResetConsentTarget._issued.remove(key);
    _holds.add(key);
    _tickets.remove(key);
  }

  Future<AssistantResetEnvelope?> _read(SharedPreferences prefs) async {
    await prefs.reload();
    _check();
    AssistantResetEnvelope? value;
    if (prefs.containsKey(key)) {
      final raw = prefs.getString(key);
      if (raw == null) {
        throw const FormatException('Unreadable Assistant record');
      }
      value = AssistantResetEnvelope.decode(raw, actorId, workspaceId);
    }
    _observeConsentAuthority(prefs, value);
    return value;
  }

  AssistantResetEnvelope _legacy(SharedPreferences prefs) {
    final selected = prefs.getString(
      '$actorId::mira-dashboard-chat-$workspaceId',
    );
    final context = prefs.getString(
      '$actorId::mira-dashboard-workspace-context-$workspaceId',
    );
    return _decode({
      'schema': 1,
      'actorId': actorId,
      'workspaceId': workspaceId,
      'revision': 1,
      'generation': 1,
      'selectedChatId': selected,
      'contextId': context,
      'creation': {'status': 'unknown', 'attemptId': null},
      'resetConsent': null,
      'resetIntent': null,
    });
  }

  AssistantResetEnvelope _decode(Map<String, dynamic> value) =>
      AssistantResetEnvelope.decode(jsonEncode(value), actorId, workspaceId);
  AssistantResetEnvelope _next(
    AssistantResetEnvelope old,
    Map<String, dynamic> fields,
  ) => _decode({...old._value, 'revision': old.revision + 1, ...fields});

  Future<AssistantResetDisposition> _write(
    SharedPreferences prefs,
    AssistantResetEnvelope next,
  ) async {
    _check();
    AssistantResetConsentTarget._issued.remove(key);
    var accepted = false;
    var matches = false;
    try {
      accepted = await prefs.setString(key, next.encode());
    } on Object {
      hold();
    } finally {
      try {
        await prefs.reload();
        matches = prefs.getString(key) == next.encode();
      } on Object {
        hold();
      }
    }
    if (accepted && matches) {
      if (isCurrent()) return AssistantResetDisposition.committedCurrent;
      hold();
      return AssistantResetDisposition.committedStale;
    }
    hold();
    return AssistantResetDisposition.uncertain;
  }

  Future<AssistantResetEnvelope?> read() => serialized(key, () async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _check();
      return await _read(prefs);
    } on Object {
      hold();
      rethrow;
    }
  });

  Future<({String? selectedChatId, String? contextId})> readSelection() =>
      serialized(key, () async {
        try {
          final prefs = await SharedPreferences.getInstance();
          _check();
          final value = await _read(prefs);
          if (value != null) {
            return (
              selectedChatId: value.selectedChatId,
              contextId: value.contextId,
            );
          }
          final selected = prefs.getString(
            '$actorId::mira-dashboard-chat-$workspaceId',
          );
          final context = prefs.getString(
            '$actorId::mira-dashboard-workspace-context-$workspaceId',
          );
          AssistantResetEnvelope._chat(selected);
          AssistantResetEnvelope._context(context);
          return (selectedChatId: selected, contextId: context);
        } on Object {
          hold();
          rethrow;
        }
      });

  bool _canCreate(AssistantResetEnvelope value) {
    if (_holds.contains(key) || value.pending) return false;
    if (!value.held) return true;
    final ticket = _tickets[key];
    final consent = value._value['resetConsent'];
    return ticket != null &&
        consent is Map &&
        ticket.operationId == consent['operationId'] &&
        ticket.generation == value.generation &&
        ticket.revision == value.revision &&
        value.selectedChatId == null;
  }

  Future<bool> hasUnknownCreation() => serialized(key, () async {
    try {
      final prefs = await SharedPreferences.getInstance();
      _check();
      // A vanished inspected envelope is prior state, not a fresh scope.
      final inspectedEnvelope =
          AssistantResetConsentTarget._issued[key]?._hadEnvelope ?? false;
      final value = await _read(prefs);
      if (value != null) return !_canCreate(value);
      if (inspectedEnvelope) {
        hold();
        return true;
      }
      final legacy = _legacy(prefs);
      if (legacy.selectedChatId != null ||
          legacy.contextId != null ||
          prefs.containsKey('$actorId::mira-chat-creation::$workspaceId') ||
          _holds.contains(key) ||
          _tickets.containsKey(key)) {
        return true;
      }
      final fresh = _decode({
        ...legacy._value,
        'creation': {'status': 'clear', 'attemptId': null},
      });
      return await _write(prefs, fresh) !=
          AssistantResetDisposition.committedCurrent;
    } on Object {
      hold();
      rethrow;
    }
  });

  Future<bool> update({
    String? selectedChatId,
    String? contextId,
    bool changeSelected = false,
    bool changeContext = false,
  }) => serialized(key, () async {
    if (!isCurrent()) return false;
    final prefs = await SharedPreferences.getInstance();
    if (!isCurrent()) return false;
    final AssistantResetEnvelope? old;
    try {
      old = await _read(prefs);
    } on Object {
      if (!isCurrent()) return false;
      rethrow;
    }
    final value = old ?? _legacy(prefs);
    if (value.pending) return false;
    final fields = <String, dynamic>{
      if (changeSelected) 'selectedChatId': selectedChatId,
      if (changeContext) 'contextId': contextId,
    };
    _tickets.remove(key);
    final next = old == null
        ? _decode({...value._value, ...fields})
        : _next(value, fields);
    return await _write(prefs, next) ==
        AssistantResetDisposition.committedCurrent;
  });

  Future<AssistantResetOutcome> reset(
    String operationId, {
    required bool informed,
    AssistantResetConsentTarget? consentTarget,
  }) => serialized(key, () async {
    var effectsStarted = false;
    try {
      _check();
      AssistantResetEnvelope._uuid(operationId);
      final prefs = await SharedPreferences.getInstance();
      _check();
      final old = await _read(prefs);
      final value = old ?? _legacy(prefs);
      final requiresConsent = !_canCreate(value);
      if (consentTarget != null) {
        if (!consentTarget._isCurrent() ||
            !identical(
              AssistantResetConsentTarget._issued[key],
              consentTarget,
            ) ||
            consentTarget.actorId != actorId ||
            consentTarget.workspaceId != workspaceId ||
            consentTarget._identity != _consentIdentity(prefs, old, value)) {
          if (identical(
            AssistantResetConsentTarget._issued[key],
            consentTarget,
          )) {
            AssistantResetConsentTarget._issued.remove(key);
          }
          return const AssistantResetOutcome(
            AssistantResetDisposition.deniedBeforeEffect,
          );
        }
      } else if (requiresConsent) {
        return const AssistantResetOutcome(
          AssistantResetDisposition.deniedBeforeEffect,
        );
      }
      final previousConsent = value._value['resetConsent'];
      final previousIntent = value._value['resetIntent'];
      if ((previousConsent is Map &&
              previousConsent['operationId'] == operationId) ||
          (previousIntent is Map &&
              previousIntent['operationId'] == operationId)) {
        return const AssistantResetOutcome(
          AssistantResetDisposition.deniedBeforeEffect,
        );
      }
      if (value.pending && consentTarget == null) {
        return const AssistantResetOutcome(
          AssistantResetDisposition.deniedBeforeEffect,
        );
      }
      final priorHold = {
        'status': value.held ? 'unknown' : 'clear',
        'attemptId': value.attemptId,
        'generation': old?.generation,
        'legacyDigest': old == null ? _legacyDigest(prefs) : null,
      };
      final intent = {
        'operationId': operationId,
        'baseRevision': old?.revision,
        'baseGeneration': old?.generation,
        'beforeSelectedChatId': value.selectedChatId,
        'beforeContextId': value.contextId,
        'priorHold': priorHold,
        'priorConsent': value._value['resetConsent'],
        'status': 'pending',
      };
      // Consume only the winning capability under the same process lock.
      AssistantResetConsentTarget._issued.remove(key);
      effectsStarted = true;
      hold();
      final pending = old == null
          ? _decode({
              ...value._value,
              'creation': {'status': 'unknown', 'attemptId': value.attemptId},
              'resetIntent': intent,
            })
          : _next(value, {
              'creation': {'status': 'unknown', 'attemptId': value.attemptId},
              'resetIntent': intent,
            });
      final admitted = await _write(prefs, pending);
      if (admitted != AssistantResetDisposition.committedCurrent) {
        return const AssistantResetOutcome(AssistantResetDisposition.uncertain);
      }
      final observed = await _read(prefs);
      if (observed?.encode() != pending.encode()) {
        return const AssistantResetOutcome(AssistantResetDisposition.uncertain);
      }
      final generation = pending.generation + 1;
      final finalValue = _next(pending, {
        'selectedChatId': null,
        'contextId': 'personal',
        'generation': generation,
        'creation': {'status': 'unknown', 'attemptId': null},
        'resetIntent': null,
        'resetConsent': {
          'operationId': operationId,
          'generation': generation,
          'priorHold': priorHold,
          'informed': true,
          'phase': 'committed',
        },
      });
      final outcome = await _write(prefs, finalValue);
      if (outcome == AssistantResetDisposition.committedCurrent) {
        _holds.remove(key);
        _tickets[key] = (
          operationId: operationId,
          generation: generation,
          revision: finalValue.revision,
        );
      }
      return AssistantResetOutcome(outcome);
    } on Object {
      if (!effectsStarted) {
        AssistantResetConsentTarget._issued.remove(key);
        return const AssistantResetOutcome(
          AssistantResetDisposition.deniedBeforeEffect,
        );
      }
      hold();
      return const AssistantResetOutcome(AssistantResetDisposition.uncertain);
    }
  });

  Future<AssistantResetEnvelope> beginCreation(String attemptId) =>
      serialized(key, () async {
        final prefs = await SharedPreferences.getInstance();
        _check();
        final old = await _read(prefs);
        if (old?.selectedChatId != null) {
          throw const AssistantCreationSelectedException();
        }
        if (old == null || !_canCreate(old)) {
          throw const FormatException('Assistant creation requires inspection');
        }
        AssistantResetEnvelope._uuid(attemptId);
        hold();
        final next = _next(old, {
          'generation': old.generation + 1,
          'creation': {'status': 'unknown', 'attemptId': attemptId},
          'resetConsent': null,
        });
        if (await _write(prefs, next) !=
            AssistantResetDisposition.committedCurrent) {
          throw const FormatException('Assistant creation hold unconfirmed');
        }
        return next;
      });

  Future<void> finishCreation(
    AssistantResetEnvelope attempt, {
    AcknowledgedChatConversation? acknowledged,
    ApiException? denial,
  }) => serialized(key, () async {
    try {
      final selectedChatId = acknowledged?.conversation.id;
      final acknowledgedHere =
          acknowledged != null &&
          denial == null &&
          acknowledged.conversation.wsId == workspaceId;
      final deniedBeforeEffect =
          acknowledged == null &&
          denial != null &&
          denial.statusCode == 400 &&
          denial.code == 'chat_create_invalid_request';
      if (!acknowledgedHere && !deniedBeforeEffect) {
        throw const FormatException(
          'Assistant creation completion lacks evidence',
        );
      }
      final prefs = await SharedPreferences.getInstance();
      _check();
      final old = await _read(prefs);
      if (old == null ||
          old.pending ||
          old.generation != attempt.generation ||
          old.attemptId != attempt.attemptId ||
          attempt.attemptId == null) {
        throw const FormatException('Assistant creation attempt changed');
      }
      final next = _next(old, {
        if (selectedChatId != null) 'selectedChatId': selectedChatId,
        'creation': {'status': 'clear', 'attemptId': null},
        'resetConsent': null,
      });
      if (await _write(prefs, next) !=
          AssistantResetDisposition.committedCurrent) {
        throw const FormatException('Assistant creation receipt unconfirmed');
      }
      _holds.remove(key);
    } on Object {
      hold();
      rethrow;
    }
  });
}
