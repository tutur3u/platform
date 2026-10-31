import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_parsers.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

/// Fault toggles for QA and tests. Changing one takes effect on the next call.
final class IrisFixtureFaults extends ChangeNotifier {
  bool _offline = false;
  bool _rateLimited = false;
  bool _killed = false;
  bool _slowAck = false;

  /// Every call fails as if the network were down.
  bool get offline => _offline;
  set offline(bool value) => _set(() => _offline = value);

  /// Every call is a 429 with a 30 s `Retry-After`.
  bool get rateLimited => _rateLimited;
  set rateLimited(bool value) => _set(() => _rateLimited = value);

  /// The kill switch: every call is a 423 `killed`.
  bool get killed => _killed;
  set killed(bool value) => _set(() => _killed = value);

  /// Receipts stay "delivered via queue" for several polls before the ack.
  bool get slowAck => _slowAck;
  set slowAck(bool value) => _set(() => _slowAck = value);

  void _set(VoidCallback change) {
    change();
    notifyListeners();
  }
}

/// Serves `assets/dev/mastermind/iris_fixture.json` (synthetic only) under the
/// development flavor plus `MASTERMIND_FIXTURE`, like the snapshot fixture.
///
/// Sends join the feed as phone rows and walk received → delivered → acked
/// over successive [receipt] polls. Nothing is written to disk.
final class FixtureIrisRelay implements IrisRelay {
  FixtureIrisRelay({
    AssetBundle? bundle,
    IrisFixtureFaults? faults,
    bool? enabled,
    DateTime Function()? clock,
    this.latency = Duration.zero,
  }) : _bundle = bundle ?? rootBundle,
       faults = faults ?? IrisFixtureFaults(),
       _enabled = enabled,
       _clock = clock ?? DateTime.now;

  static const assetPath = 'assets/dev/mastermind/iris_fixture.json';

  /// Fixture builds only: the native flavor and the explicit define.
  static bool get buildEnabled =>
      appFlavor == 'development' &&
      const bool.fromEnvironment('MASTERMIND_FIXTURE');

  final AssetBundle _bundle;
  final IrisFixtureFaults faults;
  final bool? _enabled;
  final DateTime Function() _clock;

  /// Simulated round trip for every call.
  final Duration latency;

  _FixtureData? _data;
  final List<ThreadMessage> _sent = [];
  final Map<String, _FixtureSend> _sends = {};
  final Map<String, String> _byKey = {};
  final List<IrisDevice> _devices = [];
  int _seq = 0;

  @override
  bool get isConfigured => _enabled ?? buildEnabled;

  Future<_FixtureData> _load() async {
    final cached = _data;
    if (cached != null) return cached;
    final text = await _bundle.loadString(assetPath);
    final json = jsonDecode(text) as Map<String, dynamic>;
    final page = parseIrisFeedPage(
      Uint8List.fromList(
        utf8.encode(
          jsonEncode({
            'thread_ref': json['thread_ref'],
            'history_digest': json['history_digest'],
            'messages': json['messages'],
            'more': false,
            'next_before': null,
          }),
        ),
      ),
    );
    final summary = parseIrisSummary(
      Uint8List.fromList(
        utf8.encode(
          jsonEncode({
            'asks': _askCounts(json['asks'] as List<dynamic>),
            'roles': json['roles'],
            'usage': json['usage'],
          }),
        ),
      ),
    );
    if (page == null || summary == null) {
      throw const FormatException('iris fixture drifted');
    }
    return _data = _FixtureData(page, summary);
  }

  /// Open asks by urgency; an expired ask no longer counts.
  Map<String, int> _askCounts(List<dynamic> asks) {
    final counts = {'urgent': 0, 'soon': 0, 'fyi': 0};
    final now = _clock().toUtc();
    for (final ask in asks.cast<Map<String, dynamic>>()) {
      final expires = DateTime.tryParse('${ask['expires_at']}');
      if (expires != null && !expires.isAfter(now)) continue;
      final urgency = ask['urgency'] as String;
      counts[urgency] = (counts[urgency] ?? 0) + 1;
    }
    return counts;
  }

  Future<IrisResult<T>> _guard<T>(Future<IrisResult<T>> Function() run) async {
    if (latency > Duration.zero) await Future<void>.delayed(latency);
    if (!isConfigured) {
      return const IrisErr(IrisFailure(IrisFailureKind.notConfigured));
    }
    if (faults.offline) {
      return const IrisErr(IrisFailure(IrisFailureKind.offline));
    }
    if (faults.killed) {
      return const IrisErr(IrisFailure(IrisFailureKind.killed));
    }
    if (faults.rateLimited) {
      return const IrisErr(
        IrisFailure(
          IrisFailureKind.rateLimited,
          retryAfter: Duration(seconds: 30),
        ),
      );
    }
    try {
      return await run();
    } on FormatException {
      return const IrisErr(IrisFailure(IrisFailureKind.malformed));
    } on Exception {
      return const IrisErr(IrisFailure(IrisFailureKind.unavailable));
    }
  }

  @override
  Future<IrisResult<IrisFeedPage>> feed({
    String? before,
    String? after,
    int limit = 50,
  }) => _guard(() async {
    if (before != null && after != null) {
      return const IrisErr(IrisFailure(IrisFailureKind.badRequest));
    }
    final all = [...(await _load()).page.messages, ..._sent];
    int indexOf(String ref) => all.indexWhere((m) => m.ref == ref);
    final cursor = before ?? after;
    if (cursor != null && indexOf(cursor) < 0) {
      return const IrisErr(IrisFailure(IrisFailureKind.notFound));
    }
    final int start;
    final int end;
    if (after != null) {
      start = indexOf(after) + 1;
      end = (start + limit).clamp(0, all.length);
    } else {
      end = before == null ? all.length : indexOf(before);
      start = (end - limit).clamp(0, end);
    }
    final rows = all.sublist(start, end);
    return IrisOk(
      IrisFeedPage(
        messages: List.unmodifiable(rows),
        // Forward polls never page back; their cursor is next_after.
        nextBefore: after == null && start > 0 ? all[start].ref : null,
        nextAfter: after == null
            ? null
            : rows.isEmpty
            ? after
            : rows.last.ref,
      ),
    );
  });

  @override
  Future<IrisResult<IrisReceipt>> send(
    String text, {
    required String idempotencyKey,
  }) => _guard(() async {
    await _load();
    final existing = _byKey[idempotencyKey];
    if (existing != null) return IrisOk(_sends[existing]!.receipt);
    final id = (++_seq).toRadixString(16).padLeft(32, 'a');
    _byKey[idempotencyKey] = id;
    final send = _sends[id] = _FixtureSend(id, slow: faults.slowAck);
    _sent.add(
      ThreadMessage(
        ref: 'm-ffffffff${_seq.toRadixString(16).padLeft(8, '0')}',
        author: ThreadAuthor.ownerPhone,
        authorLabel: 'Owner',
        createdAt: _clock().toUtc(),
        text: text,
        truncated: false,
        withheld: false,
        activity: null,
      ),
    );
    return IrisOk(send.receipt);
  });

  @override
  Future<IrisResult<IrisReceipt>> receipt(String id) => _guard(() async {
    final send = _sends[id];
    if (send == null) {
      return const IrisErr(IrisFailure(IrisFailureKind.notFound));
    }
    send.advance();
    return IrisOk(send.receipt);
  });

  @override
  Future<IrisResult<IrisSummary>> summary() =>
      _guard(() async => IrisOk((await _load()).summary));

  @override
  Future<IrisResult<IrisEnrollment>> enroll(
    String publicKey,
    String fingerprint,
  ) => _guard(() async {
    final pending = _devices.where((d) => d.status == IrisDeviceStatus.pending);
    if (pending.length >= 3) {
      return const IrisErr(IrisFailure(IrisFailureKind.rateLimited));
    }
    final id = 'dev_${(++_seq).toString().padLeft(4, '0')}';
    final prefix = _prefix(fingerprint);
    _devices.add(
      IrisDevice(
        id: id,
        label: 'Fixture phone',
        status: IrisDeviceStatus.pending,
        fingerprintPrefix: prefix,
        qa: true,
        createdAt: _clock().toUtc(),
      ),
    );
    return IrisOk(
      IrisEnrollment(
        deviceId: id,
        code: (100000 + _seq * 7919 % 900000).toString(),
        fingerprintPrefix: prefix,
        expiresAt: _clock().toUtc().add(const Duration(minutes: 15)),
      ),
    );
  });

  /// QA helper: the owner confirmed [id] on the enrol page.
  void confirmDevice(String id) =>
      _replaceDevice(id, IrisDeviceStatus.confirmed);

  void _replaceDevice(String id, IrisDeviceStatus status) {
    final index = _devices.indexWhere((d) => d.id == id);
    if (index < 0) return;
    final d = _devices[index];
    _devices[index] = IrisDevice(
      id: d.id,
      label: d.label,
      status: status,
      fingerprintPrefix: d.fingerprintPrefix,
      qa: d.qa,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
    );
  }

  @override
  Future<IrisResult<IrisDevice>> device(String id) => _guard(() async {
    for (final d in _devices) {
      if (d.id == id) return IrisOk(d);
    }
    return const IrisErr(IrisFailure(IrisFailureKind.notFound));
  });

  @override
  Future<IrisResult<List<IrisDevice>>> devices() =>
      _guard(() async => IrisOk(List.unmodifiable(_devices)));

  @override
  Future<IrisResult<void>> revoke(String id) => _guard(() async {
    _replaceDevice(id, IrisDeviceStatus.revoked);
    return const IrisOk(null);
  });

  String _prefix(String fingerprint) {
    final hex = fingerprint.toUpperCase().replaceAll(RegExp('[^0-9A-F]'), '');
    final head = (hex.length < 8 ? hex.padRight(8, '0') : hex).substring(0, 8);
    return '${head.substring(0, 4)}:${head.substring(4)}';
  }
}

final class _FixtureData {
  const _FixtureData(this.page, this.summary);
  final IrisFeedPage page;
  final IrisSummary summary;
}

/// received → delivered → acked, one step per poll; slow acks linger as
/// "delivered via queue" for four polls first.
final class _FixtureSend {
  _FixtureSend(this.id, {required this.slow});

  final String id;
  final bool slow;
  int _polls = 0;

  IrisReceipt get receipt {
    if (_polls == 0) {
      return IrisReceipt(id: id, state: IrisReceiptState.received);
    }
    final ackAt = slow ? 5 : 2;
    if (_polls < ackAt) {
      return IrisReceipt(
        id: id,
        state: IrisReceiptState.delivered,
        delivery: slow ? IrisDelivery.queue : IrisDelivery.steer,
      );
    }
    return IrisReceipt(
      id: id,
      state: IrisReceiptState.acked,
      delivery: slow ? IrisDelivery.queue : IrisDelivery.steer,
    );
  }

  void advance() => _polls++;
}
