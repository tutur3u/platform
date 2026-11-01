import 'dart:async';
import 'dart:math';

import 'package:bloc/bloc.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_state.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_state.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';

export 'mastermind_replies_state.dart';

typedef AccessLostCallback =
    Future<void> Function(SnapshotUnavailableKind kind);

/// The reply write path: capability gate, per-user outbox and idempotent send.
///
/// Every reply is persisted with its Idempotency-Key before the first send and
/// retried with that same key, so an unknown outcome (timeout, 5xx, a lost
/// response) can never become a second reply. `clear` bumps a generation that
/// fences every in-flight send and store write, mirroring the snapshot cubit.
final class MastermindRepliesCubit extends Cubit<MastermindRepliesState> {
  MastermindRepliesCubit({
    required MastermindOutboxStore store,
    MastermindReplyTransport? transport,
    Future<CapabilitiesFetch> Function()? fetchCapabilities,
    Future<void> Function()? refreshSnapshot,
    AccessLostCallback? onAccessLost,
    bool Function(String itemId)? isAnsweredElsewhere,
    DateTime Function()? clock,
    Random? random,
    this.optionUndoWindow = defaultOptionUndoWindow,
  }) : _store = store,
       _isAnsweredElsewhere = isAnsweredElsewhere,
       _transport = transport,
       _fetchCapabilities = fetchCapabilities,
       _refreshSnapshot = refreshSnapshot,
       _onAccessLost = onAccessLost,
       _clock = clock ?? DateTime.now,
       _random = random,
       super(const MastermindRepliesState());

  /// How long a one-tap option reply can be undone before it is queued.
  static const defaultOptionUndoWindow = Duration(seconds: 30);
  static const _capabilityMaxAge = Duration(minutes: 5);
  static const _defaultRetryAfter = Duration(minutes: 1);

  final Duration optionUndoWindow;
  final MastermindOutboxStore _store;
  final MastermindReplyTransport? _transport;
  final Future<CapabilitiesFetch> Function()? _fetchCapabilities;
  final Future<void> Function()? _refreshSnapshot;
  final AccessLostCallback? _onAccessLost;

  /// Whether the latest live snapshot shows the item answered: a 409 for it
  /// is then that answer, never an error.
  final bool Function(String itemId)? _isAnsweredElsewhere;
  final DateTime Function() _clock;
  final Random? _random;
  final _drafts = <String, ReplyDraft>{};
  final _inFlight = <String>{};
  final _undoTimers = <String, Timer>{};
  int _generation = 0;
  DateTime? _capabilityCheckedAt;
  Future<void> _storeTail = Future<void>.value();
  Future<void>? _loading;
  Future<void>? _capabilityLoad;

  /// The cubit's clock, so views can count down to [ReplyItemStatus.retryAt].
  DateTime now() => _clock();

  bool _current(int generation) => !isClosed && generation == _generation;

  // ---- drafts (not state: typing must not rebuild the page) ----

  ReplyDraft draftFor(String itemId) => _drafts[itemId] ?? const ReplyDraft();

  void saveDraft(String itemId, ReplyDraft draft) {
    if (draft.isEmpty) {
      _drafts.remove(itemId);
    } else {
      _drafts[itemId] = draft;
    }
  }

  // ---- capabilities ----

  /// Asks the hub whether replies are on. A known answer is reused for a few
  /// minutes; a failed re-check never flips a known answer. Callers that
  /// overlap share one request, so a send that arrives during the first-ever
  /// check waits for its answer instead of being refused.
  Future<void> loadCapabilities({bool force = false}) {
    final fetch = _fetchCapabilities;
    if (fetch == null) {
      emit(state.copyWith(capability: ReplyCapability.unsupported));
      return Future<void>.value();
    }
    final pending = _capabilityLoad;
    if (pending != null) return pending;
    final known = state.capability;
    final checkedAt = _capabilityCheckedAt;
    final fresh =
        checkedAt != null &&
        _clock().difference(checkedAt) < _capabilityMaxAge &&
        (known == ReplyCapability.supported ||
            known == ReplyCapability.unsupported);
    if (!force && fresh) return Future<void>.value();
    final load = Completer<void>();
    final shared = load.future;
    _capabilityLoad = shared;
    unawaited(() async {
      try {
        await _checkCapabilities(fetch);
        load.complete();
      } on Object catch (error, stackTrace) {
        load.completeError(error, stackTrace);
      } finally {
        // A `clear` meanwhile may already have started the next request.
        if (identical(_capabilityLoad, shared)) _capabilityLoad = null;
      }
    }());
    return shared;
  }

  Future<void> _checkCapabilities(
    Future<CapabilitiesFetch> Function() fetch,
  ) async {
    final generation = _generation;
    final known = state.capability;
    final settled =
        known == ReplyCapability.supported ||
        known == ReplyCapability.unsupported;
    if (!settled) emit(state.copyWith(capability: ReplyCapability.checking));
    final CapabilitiesFetch result;
    try {
      result = await fetch();
    } on Object {
      if (_current(generation) && !settled) {
        emit(state.copyWith(capability: ReplyCapability.unavailable));
      }
      return;
    }
    if (!_current(generation)) return;
    switch (result) {
      case CapabilitiesFetchOk(:final capabilities):
        _capabilityCheckedAt = _clock();
        emit(
          state.copyWith(
            capability: capabilities.replies && capabilities.supportsSchema14
                ? ReplyCapability.supported
                : ReplyCapability.unsupported,
          ),
        );
      case CapabilitiesFetchUnavailable(:final kind):
        if (kind.isAccessLost) {
          await _onAccessLost?.call(kind);
        } else if (!settled) {
          emit(state.copyWith(capability: ReplyCapability.unavailable));
        }
    }
  }

  // ---- outbox ----

  /// Reads the persisted outbox once per user session.
  Future<void> ensureLoaded() => state.loaded
      ? Future<void>.value()
      : (_loading ??= _load().whenComplete(() => _loading = null));

  Future<void> _load() async {
    final generation = _generation;
    List<OutboxEntry> entries;
    try {
      await _storeTail;
      entries = await _store.read();
    } on Object {
      entries = const [];
    }
    if (!_current(generation)) return;
    // Entries created while this read was in flight are newer than the file.
    final known = {for (final entry in state.outbox) entry.idempotencyKey};
    emit(
      state.copyWith(
        loaded: true,
        outbox: [
          ...entries.where((entry) => !known.contains(entry.idempotencyKey)),
          ...state.outbox,
        ],
      ),
    );
    _scheduleHeld(entries);
  }

  Future<bool> _persist() {
    final generation = _generation;
    final entries = state.outbox;
    var saved = true;
    final future = _storeTail.then((_) async {
      if (!_current(generation)) return;
      try {
        await _store.write(entries);
      } on Object {
        saved = false;
      }
    });
    _storeTail = future;
    return future.then((_) => saved);
  }

  void _setStatus(String itemId, ReplyItemStatus status) {
    final next = {...state.statuses};
    if (identical(status, ReplyItemStatus.idle)) {
      next.remove(itemId);
    } else {
      next[itemId] = status;
    }
    emit(state.copyWith(statuses: next));
  }

  List<OutboxEntry> _without(OutboxEntry entry) => [
    for (final other in state.outbox)
      if (other.idempotencyKey != entry.idempotencyKey) other,
  ];

  void _replace(OutboxEntry next) => emit(
    state.copyWith(
      outbox: [
        for (final entry in state.outbox)
          if (entry.idempotencyKey == next.idempotencyKey) next else entry,
      ],
    ),
  );

  // ---- sending ----

  /// Starts the undo window for a one-tap option reply. It is immediately
  /// persisted with its deadline, but flush holds it until the window ends.
  /// Returns false when no window started (a reply or
  /// window already exists for the item, replies are off, or no real option).
  ///
  /// The window belongs to the cubit, not the screen, so leaving the screen
  /// before it ends still sends; only [clear] (logout, account switch) cancels
  /// it. At most one window exists per item.
  bool queueOption({required NeedsYou item, required int optionIndex}) {
    final options = item.options;
    if (optionIndex < 0 ||
        optionIndex >= options.length ||
        options[optionIndex] == mastermindReplyPlaceholderOption ||
        !state.canReply ||
        !state.loaded ||
        state.pendingOptions.containsKey(item.id) ||
        state.entryFor(item.id, item.versionHash) != null ||
        state.statusFor(item.id).sending) {
      return false;
    }
    final generation = _generation;
    final entry = OutboxEntry(
      idempotencyKey: newReplyIdempotencyKey(_random),
      itemId: item.id,
      versionHash: item.versionHash,
      createdAt: _clock().toUtc(),
      optionIndex: optionIndex,
      optionLabel: item.optionLabel(optionIndex),
      holdUntil: _clock().add(optionUndoWindow).toUtc(),
    );
    emit(
      state.copyWith(
        outbox: [...state.outbox, entry],
        pendingOptions: {
          ...state.pendingOptions,
          item.id: PendingOptionReply(
            versionHash: item.versionHash,
            optionIndex: optionIndex,
            option: item.optionLabel(optionIndex),
          ),
        },
      ),
    );
    _undoTimers[item.id] = Timer(
      optionUndoWindow,
      () => unawaited(_commitOption(entry, generation)),
    );
    unawaited(_persistHeldOption(entry, generation));
    return true;
  }

  /// Cancels an option reply still inside its undo window. A reply that was
  /// already queued is not touched: it is discarded from its status panel.
  void undoOption(String itemId) {
    final timer = _undoTimers.remove(itemId);
    if (timer == null) return;
    timer.cancel();
    _clearPending(itemId);
    final pending = state.outbox.where(
      (entry) => entry.itemId == itemId && entry.holdUntil != null,
    );
    if (pending.isNotEmpty) {
      emit(
        state.copyWith(
          outbox: [
            for (final entry in state.outbox)
              if (!pending.any(
                (held) => held.idempotencyKey == entry.idempotencyKey,
              ))
                entry,
          ],
        ),
      );
      unawaited(_persist());
    }
  }

  /// Cancels every reply still inside its undo window, as judged by the same
  /// [MastermindRepliesState.heldEntries] the bar counts: one state emit and
  /// one persist. Replies already committed or queued are untouched. Returns
  /// how many were cancelled.
  int undoAll() {
    final held = state.heldEntries(_clock());
    if (held.isEmpty) return 0;
    final keys = {for (final entry in held) entry.idempotencyKey};
    final items = {for (final entry in held) entry.itemId};
    for (final id in items) {
      _undoTimers.remove(id)?.cancel();
    }
    emit(
      state.copyWith(
        outbox: [
          for (final entry in state.outbox)
            if (!keys.contains(entry.idempotencyKey)) entry,
        ],
        pendingOptions: {
          for (final entry in state.pendingOptions.entries)
            if (!items.contains(entry.key)) entry.key: entry.value,
        },
      ),
    );
    unawaited(_persist());
    return held.length;
  }

  Future<void> _persistHeldOption(OutboxEntry entry, int generation) async {
    if (await _persist() || !_current(generation)) return;
    _undoTimers.remove(entry.itemId)?.cancel();
    _clearPending(entry.itemId);
    emit(state.copyWith(outbox: _without(entry)));
    _setStatus(entry.itemId, const ReplyItemStatus(issue: ReplyIssue.notSaved));
    unawaited(_persist());
  }

  void _scheduleHeld(Iterable<OutboxEntry> entries) {
    final generation = _generation;
    for (final entry in entries) {
      final until = entry.holdUntil;
      if (entry.status != OutboxStatus.pending || until == null) continue;
      final delay = until.difference(_clock());
      if (!delay.isNegative && delay != Duration.zero) {
        _undoTimers[entry.itemId] = Timer(
          delay,
          () => unawaited(_commitOption(entry, generation)),
        );
      } else {
        unawaited(_commitOption(entry, generation));
      }
    }
  }

  Future<void> _commitOption(OutboxEntry held, int generation) async {
    _undoTimers.remove(held.itemId);
    final pending = state.pendingOptions[held.itemId];
    if (!_current(generation)) return;
    if (pending != null) {
      emit(
        state.copyWith(
          pendingOptions: {
            ...state.pendingOptions,
            held.itemId: pending.asCommitted,
          },
        ),
      );
    }
    await _storeTail;
    if (!_current(generation)) return;
    final current = state.outbox.where(
      (entry) => entry.idempotencyKey == held.idempotencyKey,
    );
    if (current.isEmpty || current.single.status != OutboxStatus.pending) {
      _clearPending(held.itemId);
      return;
    }
    final ready = current.single.withoutHold();
    _replace(ready);
    await _persist();
    if (!_current(generation)) return;
    _clearPending(held.itemId);
    await _dispatch(ready);
  }

  void _clearPending(String itemId) {
    if (!state.pendingOptions.containsKey(itemId)) return;
    emit(
      state.copyWith(
        pendingOptions: {
          for (final entry in state.pendingOptions.entries)
            if (entry.key != itemId) entry.key: entry.value,
        },
      ),
    );
  }

  void _cancelUndoTimers() {
    for (final timer in _undoTimers.values) {
      timer.cancel();
    }
    _undoTimers.clear();
  }

  /// Persists the reply (with its new key), then sends it. Returns false only
  /// when nothing was queued: no choice made, bad text, an earlier reply still
  /// open for this item version, or the device could not save it.
  Future<bool> submit({
    required NeedsYou item,
    int? optionIndex,
    String? text,
  }) async {
    if ((optionIndex == null) == (text == null)) return false;
    final options = item.options;
    if (optionIndex != null &&
        (optionIndex < 0 ||
            optionIndex >= options.length ||
            options[optionIndex] == mastermindReplyPlaceholderOption)) {
      return false;
    }
    if (text != null && !isValidReplyText(text)) return false;
    // A logout during either await below must not queue into the next account.
    final generation = _generation;
    if (!await _mayReply() || !_current(generation)) return false;
    await ensureLoaded();
    if (!_current(generation)) return false;
    final existing = state.outbox.where(
      (entry) =>
          entry.itemId == item.id && entry.versionHash == item.versionHash,
    );
    if (existing.isNotEmpty || state.statusFor(item.id).sending) return false;
    final entry = OutboxEntry(
      idempotencyKey: newReplyIdempotencyKey(_random),
      itemId: item.id,
      versionHash: item.versionHash,
      createdAt: _clock().toUtc(),
      optionIndex: optionIndex,
      optionLabel: optionIndex == null ? null : options[optionIndex],
      text: text?.trim(),
    );
    emit(state.copyWith(outbox: [...state.outbox, entry]));
    if (!await _persist() || !_current(generation)) {
      if (_current(generation)) {
        emit(state.copyWith(outbox: _without(entry)));
        _setStatus(item.id, const ReplyItemStatus(issue: ReplyIssue.notSaved));
      }
      return false;
    }
    await _dispatch(entry);
    return true;
  }

  /// Sends the queued reply for [itemId] at [versionHash] again, with its
  /// original key. Nothing goes out while replies are off: it stays queued.
  Future<void> retry(String itemId, String versionHash) async {
    final entry = state.entryFor(itemId, versionHash);
    if (entry == null || entry.status != OutboxStatus.pending) return;
    final retryAt = state.statusFor(itemId).retryAt;
    if (retryAt != null && _clock().isBefore(retryAt)) return;
    if (!await _mayReply()) return;
    await _dispatch(entry);
  }

  /// Retries every queued reply that is neither waiting out a 429 nor refused
  /// by the session or account. Called when the app resumes, a page opens or
  /// the device comes back online ([recheckCapabilities]: the hub may have
  /// turned replies off meanwhile). While replies are off, queued entries stay
  /// queued: neither sent nor dropped.
  Future<void> flush({
    bool recheckCapabilities = false,
    bool includeHeld = false,
  }) async {
    await ensureLoaded();
    await loadCapabilities(force: recheckCapabilities);
    for (final entry in List.of(state.outbox)) {
      if (!state.canReply) return;
      if (entry.status != OutboxStatus.pending) continue;
      if (entry.holdUntil != null &&
          !includeHeld &&
          entry.holdUntil!.isAfter(_clock())) {
        continue;
      }
      if (entry.holdUntil != null) {
        _undoTimers.remove(entry.itemId)?.cancel();
        _clearPending(entry.itemId);
        final ready = entry.withoutHold();
        _replace(ready);
        if (!await _persist()) continue;
        await _dispatch(ready);
        continue;
      }
      final status = state.statusFor(entry.itemId);
      final blocked =
          status.issue == ReplyIssue.unauthorized ||
          status.issue == ReplyIssue.forbidden ||
          (status.retryAt?.isAfter(_clock()) ?? false);
      if (!blocked) await _dispatch(entry);
    }
  }

  /// Background transition is the last reliable chance to send before the OS
  /// suspends this process, so it releases even replies still inside Undo.
  Future<void> flushOnBackground() => flush(includeHeld: true);

  /// Drops a queued reply the user no longer wants sent.
  Future<void> discard(String itemId, String versionHash) async {
    final entry = state.entryFor(itemId, versionHash);
    if (entry == null) return;
    _undoTimers.remove(itemId)?.cancel();
    _clearPending(itemId);
    emit(state.copyWith(outbox: _without(entry)));
    _setStatus(itemId, ReplyItemStatus.idle);
    await _persist();
  }

  /// Whether replies are on, asking the hub first if that is not yet known.
  Future<bool> _mayReply() async {
    await loadCapabilities();
    return state.canReply;
  }

  Future<void> _dispatch(OutboxEntry entry) async {
    final transport = _transport;
    final key = entry.idempotencyKey;
    // The last line of defence for every path (submit, retry, flush): a reply
    // is never sent while the hub does not say replies are on.
    final current = state.outbox.where(
      (candidate) => candidate.idempotencyKey == key,
    );
    if (!state.canReply ||
        _inFlight.contains(key) ||
        current.isEmpty ||
        current.single.status != OutboxStatus.pending ||
        current.single.holdUntil?.isAfter(_clock()) == true) {
      return;
    }
    final generation = _generation;
    final before = state.statusFor(entry.itemId);
    _setStatus(
      entry.itemId,
      ReplyItemStatus(sending: true, authFailures: before.authFailures),
    );
    _inFlight.add(key);
    ReplyOutcome outcome;
    try {
      outcome = transport == null
          ? const ReplyUnavailable()
          : await transport.send(entry);
    } on Object {
      outcome = const ReplyUnavailable();
    }
    _inFlight.remove(key);
    if (!_current(generation)) return;
    await _apply(entry, outcome, before.authFailures, generation);
  }

  Future<void> _apply(
    OutboxEntry entry,
    ReplyOutcome outcome,
    int auth,
    int generation,
  ) async {
    final id = entry.itemId;
    switch (outcome) {
      case ReplyAccepted():
        _drafts.remove(id);
        _replace(entry.withStatus(OutboxStatus.sent));
        _setStatus(id, ReplyItemStatus.idle);
        await _persist();
      case ReplyStale():
        // Still "sending" until the refreshed snapshot says why: an ask
        // answered elsewhere shows that answer, never an error.
        emit(state.copyWith(outbox: _without(entry)));
        await _persist();
        final answered = _isAnsweredElsewhere ?? (_) => false;
        if (_current(generation) && !answered(id)) {
          await _refreshSnapshot?.call();
        }
        if (!_current(generation)) return;
        if (answered(id)) {
          _drafts.remove(id);
          return _setStatus(id, ReplyItemStatus.idle);
        }
        // The words survive: the user re-asks against the refreshed item.
        _drafts[id] ??= ReplyDraft(
          optionIndex: entry.optionIndex,
          optionLabel: entry.optionLabel,
          text: entry.text ?? '',
        );
        _setStatus(id, const ReplyItemStatus(issue: ReplyIssue.stale));
      case ReplyKeyConflict():
        await _drop(entry, ReplyIssue.conflict);
      case ReplyRejected(:final unsafeText):
        await _drop(
          entry,
          unsafeText ? ReplyIssue.unsafeText : ReplyIssue.rejected,
        );
      case ReplyTooLarge():
        await _drop(entry, ReplyIssue.tooLarge);
      case ReplyForbidden(:final disabled):
        await _drop(entry, ReplyIssue.forbidden);
        // The drop awaited the store: a logout meanwhile owns the cleanup.
        if (!_current(generation)) return;
        if (disabled) {
          emit(state.copyWith(capability: ReplyCapability.unsupported));
        } else {
          await _onAccessLost?.call(SnapshotUnavailableKind.forbidden);
        }
      case ReplyUnauthorized():
        _setStatus(
          id,
          ReplyItemStatus(
            issue: ReplyIssue.unauthorized,
            authFailures: auth + 1,
          ),
        );
      case ReplyRateLimited(:final retryAfter):
        _setStatus(
          id,
          ReplyItemStatus(
            issue: ReplyIssue.rateLimited,
            retryAt: _clock().add(retryAfter ?? _defaultRetryAfter),
          ),
        );
      case ReplyUnavailable():
        _setStatus(id, const ReplyItemStatus(issue: ReplyIssue.offline));
    }
  }

  Future<void> _drop(OutboxEntry entry, ReplyIssue issue) async {
    emit(state.copyWith(outbox: _without(entry)));
    _setStatus(entry.itemId, ReplyItemStatus(issue: issue));
    await _persist();
  }

  // ---- snapshot and lifecycle ----

  /// A live snapshot is the truth about which items are still open: a reply
  /// whose item left (answered or withdrawn) or whose question changed is no
  /// longer pending anything. Old entries age out after a week.
  void syncSnapshot(MastermindSnapshotReady ready) {
    final open = <String, String>{
      for (final item in ready.snapshot.now.needsYou)
        if (item is NeedsYou && item.state == ItemState.open)
          item.id: item.versionHash,
    };
    final live = ready.origin == SnapshotOrigin.live;
    if (live) {
      // An option still inside its undo window for a question that is gone or
      // changed would only come back stale: cancel it.
      for (final entry in state.pendingOptions.entries.toList()) {
        if (!entry.value.committed &&
            open[entry.key] != entry.value.versionHash) {
          undoOption(entry.key);
        }
      }
    }
    if (!state.loaded) return;
    final now = _clock().toUtc();
    final kept = normalizeOutbox([
      for (final entry in state.outbox)
        if (!live ||
            open[entry.itemId] == entry.versionHash ||
            (entry.status == OutboxStatus.pending &&
                open.containsKey(entry.itemId)))
          entry,
    ], now: now);
    if (kept.length == state.outbox.length) return;
    emit(state.copyWith(outbox: kept));
    unawaited(_persist());
  }

  /// Logout, account switch or lost access: the outbox belongs to the previous
  /// account. In-flight sends and queued store writes are fenced off first.
  Future<void> clear() {
    ++_generation;
    _cancelUndoTimers();
    _drafts.clear();
    _inFlight.clear();
    _capabilityCheckedAt = null;
    _loading = null;
    _capabilityLoad = null;
    emit(const MastermindRepliesState());
    final future = _storeTail.then((_) async {
      try {
        await _store.clear();
      } on Object {
        /* The in-memory outbox is already gone. */
      }
    });
    _storeTail = future;
    return future;
  }

  @override
  Future<void> close() {
    _cancelUndoTimers();
    return super.close();
  }
}
