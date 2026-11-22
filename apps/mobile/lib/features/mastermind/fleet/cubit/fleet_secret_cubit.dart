import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_state.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pairing.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';
import 'package:mobile/features/mastermind/replies/reply_idempotency_key.dart';

export 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_state.dart';

/// One secret request or pairing, from verification to the machine-signed
/// outcome. The typed value never enters this cubit's state: [send] takes
/// its bytes, seals them and zeroes them. Answers are posted directly with
/// in-memory retries and dropped when the cubit closes.
/// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#phone.
class FleetSecretCubit extends Cubit<FleetSecretState> {
  FleetSecretCubit({
    required this.decision,
    required FleetSecretCrypto crypto,
    required FleetSecretPins pins,
    required FleetSecretAnswerSource source,
    required String? Function() accountId,
    Stream<FleetSnapshot?>? snapshots,
    this.snapshot,
    DateTime Function()? now,
    String Function()? newKey,
    Duration Function(int attempt)? retryDelay,
    FleetPairingAttempts? attempts,
    void Function()? onHandled,
  }) : _crypto = crypto,
       _pins = pins,
       _source = source,
       _accountId = accountId,
       _snapshots = snapshots,
       _now = now ?? DateTime.now,
       _newKey = newKey ?? newReplyIdempotencyKey,
       _retryDelay = retryDelay ?? _defaultDelay,
       _pairer = FleetSecretPairer(crypto: crypto, attempts: attempts),
       _attempts = attempts ?? FleetPairingAttempts.shared,
       _onHandled = onHandled,
       super(const FleetSecretState());

  /// Input stops this long before `expiresAt`; Web stops at 15 seconds.
  static const inputCutoff = Duration(seconds: 45);
  static const _answerCutoff = Duration(seconds: 15);

  static Duration _defaultDelay(int attempt) =>
      Duration(seconds: const [2, 4, 8, 15][attempt.clamp(0, 3)]);

  final FleetDecision decision;
  FleetSnapshot? snapshot;
  final FleetSecretCrypto _crypto;
  final FleetSecretPins _pins;
  final FleetSecretAnswerSource _source;
  final String? Function() _accountId;
  final Stream<FleetSnapshot?>? _snapshots;
  final DateTime Function() _now;
  final String Function() _newKey;
  final Duration Function(int attempt) _retryDelay;
  final FleetSecretPairer _pairer;
  final FleetPairingAttempts _attempts;
  final void Function()? _onHandled;

  bool _started = false;
  bool _handledNotified = false;

  void _notifyHandled() {
    if (_handledNotified) return;
    _handledNotified = true;
    _onHandled?.call();
  }

  /// [fleetSecretErasures] when this cubit was made. Any later erasure ends
  /// its work: no owner key, pin write, answer or retry runs after it.
  final int _erasure = fleetSecretErasures.value;
  StreamSubscription<FleetSnapshot?>? _snapshotSub;
  Timer? _cutoff;
  late String _account;
  late Uint8List _ownerKey;
  String? _keyId;

  /// The answer in flight and its key, kept for resends while open.
  FleetSecretAnswer? _pending;
  late String _pendingKey;

  /// SHA-256 hex of the owner transcript this phone signed.
  String? _digest;

  FleetSecret get secret => decision.secret!;

  /// Verifies the decision and moves to the step-up, or says why not.
  /// Runs once; later calls do nothing.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    fleetSecretErasures.addListener(_onErased);
    _snapshotSub = _snapshots?.listen(_onSnapshot);
    final block = await _verify();
    if (_ended || state.phase != FleetSecretPhase.verifying) return;
    if (block != null) {
      emit(state.copyWith(phase: FleetSecretPhase.blocked, block: block));
      return;
    }
    if (state.phase == FleetSecretPhase.verifying &&
        state.pin == null &&
        secret is FleetSecretRequest) {
      emit(state.copyWith(phase: FleetSecretPhase.needsPairing));
      return;
    }
    final untilCutoff = secret.expiresAtTime
        .subtract(inputCutoff)
        .difference(_now());
    _cutoff = Timer(untilCutoff, _onCutoff);
    emit(state.copyWith(phase: FleetSecretPhase.stepUp));
    if (snapshot case final current?) _onSnapshot(current);
  }

  /// Null when the decision may be answered; a pin of null with no block
  /// means a request from an unpaired machine.
  Future<FleetSecretBlock?> _verify() async {
    final secret = this.secret;
    if (decision.id != secret.signedId) return FleetSecretBlock.idMismatch;
    if (!await _crypto.supported()) return FleetSecretBlock.unsupported;
    final account = _accountId();
    if (account == null || account.isEmpty) return FleetSecretBlock.signedOut;
    _account = account;
    final signerKey = Uint8List.fromList(
      fleetSecretFromB64url(secret.signerKey, length: 32)!,
    );
    emit(
      state.copyWith(fingerprint: FleetSecretBinding.fingerprint(signerKey)),
    );
    try {
      if (_ended) return FleetSecretBlock.failed;
      _ownerKey = await _crypto.ownerPublicKey(account);
      _keyId = FleetSecretBinding.ownerKeyId(_ownerKey);
      if (secret is FleetSecretPairing) {
        if (_attempts.locked(secret.pairingId)) return FleetSecretBlock.locked;
        return _expiring() ? FleetSecretBlock.expiring : null;
      }
      final request = secret as FleetSecretRequest;
      if (snapshot case final current?) await _activatePending(current);
      final pin = (await _pins.read())[request.machineId];
      if (pin == null) return null;
      if (!pin.active) return FleetSecretBlock.pendingPin;
      if (pin.signerKey != request.signerKey) {
        return FleetSecretBlock.keyChanged;
      }
      emit(
        state.copyWith(
          pin: pin,
          requestCode: FleetSecretBinding.requestCode(request),
        ),
      );
      final signed = await _crypto.verifyEd25519(
        publicKey: signerKey,
        message: FleetSecretBinding.request(request),
        signature: _bytes(request.sig, 64),
      );
      if (!signed) return FleetSecretBlock.badSignature;
      if (!request.audienceIds.contains(_keyId)) {
        return FleetSecretBlock.notInAudience;
      }
      if (!FleetSecretBinding.quotingOk(request.parsedCommand)) {
        return FleetSecretBlock.quoting;
      }
      return _expiring() ? FleetSecretBlock.expiring : null;
    } on FleetSecretCryptoException catch (error) {
      return error.code == 'unsupported'
          ? FleetSecretBlock.unsupported
          : FleetSecretBlock.failed;
    }
  }

  bool _expiring() => secret.expiresAtTime.difference(_now()) < inputCutoff;

  /// Closed, or the owner keys and pins were erased since [start].
  bool get _ended => isClosed || fleetSecretErasures.value != _erasure;

  static Uint8List _bytes(String b64url, int length) =>
      Uint8List.fromList(fleetSecretFromB64url(b64url, length: length)!);

  void _onCutoff() {
    if (isClosed) return;
    if (state.phase == FleetSecretPhase.stepUp ||
        state.phase == FleetSecretPhase.input) {
      _pending = null;
      emit(
        state.copyWith(
          phase: FleetSecretPhase.blocked,
          block: FleetSecretBlock.expiring,
        ),
      );
    }
  }

  void _onErased() {
    _pending = null;
    if (!isClosed) emit(state.copyWith(phase: FleetSecretPhase.closed));
  }

  /// The step-up passed: show the field, or resend the sealed answer.
  void stepUpVerified() {
    if (state.phase != FleetSecretPhase.stepUp) return;
    if (_expiring() && !state.resend) {
      _onCutoff();
      return;
    }
    final pending = _pending;
    if (pending != null) {
      unawaited(_post(pending));
      return;
    }
    emit(state.copyWith(phase: FleetSecretPhase.input));
  }

  /// Seals [value] (UTF-8 bytes) to the request, signs and sends it. Zeroes
  /// [value] whatever happens.
  Future<void> send(Uint8List value) async {
    final request = secret;
    if (state.phase != FleetSecretPhase.input ||
        request is! FleetSecretRequest ||
        _expiring()) {
      FleetSecretBinding.wipe(value);
      return;
    }
    if (value.isEmpty || value.length > FleetSecretBinding.maxValueBytes) {
      FleetSecretBinding.wipe(value);
      return;
    }
    emit(state.copyWith(phase: FleetSecretPhase.sealing));
    final plaintext = FleetSecretBinding.plaintext(value);
    FleetSecretBinding.wipe(value);
    try {
      final sealed = await _crypto.seal(
        publicKey: _bytes(request.publicKey, 32),
        aad: FleetSecretBinding.answer(request),
        plaintext: plaintext,
      );
      FleetSecretBinding.wipe(plaintext);
      if (_ended) return;
      final enc = fleetSecretB64url(sealed.enc);
      final ct = fleetSecretB64url(sealed.ct);
      final owner = await _sign(request, 'secret', enc, ct);
      if (_ended) return;
      await _post(FleetSecretValueAnswer(enc: enc, ct: ct, owner: owner));
    } on FleetSecretCryptoException {
      _fail(FleetSecretBlock.failed);
    } finally {
      FleetSecretBinding.wipe(plaintext);
    }
  }

  /// Declines the request with a signed answer.
  Future<void> decline() async {
    final request = secret;
    if (request is! FleetSecretRequest ||
        (state.phase != FleetSecretPhase.stepUp &&
            state.phase != FleetSecretPhase.input)) {
      return;
    }
    emit(state.copyWith(phase: FleetSecretPhase.sealing, declined: true));
    try {
      final owner = await _sign(request, 'decline', '', '');
      if (_ended) return;
      await _post(FleetSecretDeclineAnswer(owner: owner));
    } on FleetSecretCryptoException {
      _fail(FleetSecretBlock.failed);
    }
  }

  Future<FleetSecretOwnerProof> _sign(
    FleetSecretRequest request,
    String action,
    String enc,
    String ct,
  ) async {
    final signedAt = DateTime.fromMillisecondsSinceEpoch(
      _now().millisecondsSinceEpoch,
      isUtc: true,
    ).toIso8601String();
    final transcript = FleetSecretBinding.ownerTranscript(
      request,
      action: action,
      enc: enc,
      ct: ct,
      signedAt: signedAt,
      keyId: _keyId!,
    );
    final sig = await _crypto.ownerSign(_account, transcript);
    _digest = FleetSecretBinding.sha256Hex(transcript);
    return FleetSecretOwnerProof(
      publicKey: fleetSecretB64url(_ownerKey),
      keyId: _keyId!,
      signedAt: signedAt,
      sig: fleetSecretB64url(sig),
    );
  }

  /// Checks a typed pairing code; when it proves the machine, records a
  /// pending pin and sends this phone's owner key.
  Future<void> submitCode(String code) async {
    final pairing = secret;
    if (pairing is! FleetSecretPairing ||
        state.phase != FleetSecretPhase.input) {
      return;
    }
    emit(state.copyWith(phase: FleetSecretPhase.sealing));
    try {
      final (check, key) = await _pairer.check(pairing, code);
      if (_ended) return;
      switch (check) {
        case FleetPairingCheck.malformed || FleetPairingCheck.wrong:
          emit(
            state.copyWith(
              phase: FleetSecretPhase.input,
              codeError: check == FleetPairingCheck.wrong
                  ? FleetSecretCodeError.wrong
                  : FleetSecretCodeError.malformed,
              codesLeft: _attempts.remaining(pairing.pairingId),
            ),
          );
          return;
        case FleetPairingCheck.locked:
          _fail(FleetSecretBlock.locked);
          return;
        case FleetPairingCheck.ok:
          break;
      }
      final ownerKey = fleetSecretB64url(_ownerKey);
      final mac = await _pairer.ownerMac(pairing, key!, ownerKey);
      if (_ended) return;
      await _pins.putPending(
        machineId: pairing.machineId,
        signerKey: pairing.signerKey,
        label: pairing.machineLabel,
        pairingId: pairing.pairingId,
        now: _now(),
        account: _account,
      );
      if (_ended) return;
      await _post(FleetSecretPairAnswer(ownerKey: ownerKey, ownerMac: mac));
    } on FleetSecretCryptoException {
      _fail(FleetSecretBlock.failed);
    }
  }

  void _fail(FleetSecretBlock block) {
    _pending = null;
    if (!_ended) {
      emit(state.copyWith(phase: FleetSecretPhase.blocked, block: block));
    }
  }

  Future<void> _post(FleetSecretAnswer answer) async {
    if (!identical(_pending, answer)) {
      _pending = answer;
      _pendingKey = _newKey();
    }
    final key = _pendingKey;
    for (var attempt = 0; !_ended; attempt++) {
      emit(
        state.copyWith(phase: FleetSecretPhase.sealing, retrying: attempt > 0),
      );
      try {
        await _source.answerSecret(
          decisionId: decision.id,
          answer: answer,
          idempotencyKey: key,
        );
        _pending = null;
        if (_ended) return;
        emit(state.copyWith(phase: FleetSecretPhase.sent));
        _notifyHandled();
        if (snapshot case final current?) _onSnapshot(current);
        return;
      } on FleetSecretSendException catch (error) {
        if (_ended) return;
        switch (error.failure) {
          case FleetSecretSendFailure.mfaRequired:
            emit(state.copyWith(phase: FleetSecretPhase.stepUp, resend: true));
            return;
          case FleetSecretSendFailure.closed:
            _pending = null;
            emit(state.copyWith(phase: FleetSecretPhase.closed));
            _notifyHandled();
            return;
          case FleetSecretSendFailure.forbidden:
            _fail(FleetSecretBlock.forbidden);
            return;
          case FleetSecretSendFailure.notDelivered ||
              FleetSecretSendFailure.rejected:
            _fail(FleetSecretBlock.notDelivered);
            return;
          case FleetSecretSendFailure.unavailable:
            final deadline = secret.expiresAtTime.subtract(_answerCutoff);
            final delay = _retryDelay(attempt);
            if (_ended) return;
            if (_now().add(delay).isAfter(deadline)) {
              _fail(FleetSecretBlock.failed);
              return;
            }
            emit(
              state.copyWith(phase: FleetSecretPhase.sealing, retrying: true),
            );
            await Future<void>.delayed(delay);
        }
      }
    }
  }

  void _onSnapshot(FleetSnapshot? next) {
    if (next == null || isClosed) return;
    snapshot = next;
    final resolved = next.resolved
        .where((r) => r.id == decision.id)
        .firstOrNull;
    final open = next.decisions.any((d) => d.id == decision.id);
    final receipt = next.answers[decision.id];
    final pickedUp =
        receipt != null &&
        receipt.action == FleetAnswerAction.secret &&
        receipt.pickedUp;
    switch (state.phase) {
      case FleetSecretPhase.sent || FleetSecretPhase.pickedUp:
        if (resolved?.secretOutcome case final outcome?) {
          unawaited(_settle(outcome));
        } else if ((pickedUp || !open) &&
            state.phase == FleetSecretPhase.sent) {
          emit(state.copyWith(phase: FleetSecretPhase.pickedUp));
        }
      case FleetSecretPhase.verifying ||
          FleetSecretPhase.blocked ||
          FleetSecretPhase.needsPairing ||
          FleetSecretPhase.stepUp ||
          FleetSecretPhase.input:
        if (state.phase == FleetSecretPhase.stepUp && state.resend) return;
        if (resolved != null || !open) {
          _pending = null;
          emit(state.copyWith(phase: FleetSecretPhase.closed));
          _notifyHandled();
        }
      case FleetSecretPhase.sealing ||
          FleetSecretPhase.outcome ||
          FleetSecretPhase.closed:
        break;
    }
  }

  /// Checks the machine's signed outcome against the pinned key.
  Future<void> _settle(FleetSecretOutcome outcome) async {
    final secret = this.secret;
    final verified = await _crypto.verifyEd25519(
      publicKey: _bytes(secret.signerKey, 32),
      message: FleetSecretBinding.outcome(
        decision.id,
        outcome.outcome.name,
        outcome.answerDigest,
      ),
      signature: _bytes(outcome.sig, 64),
    );
    var mine = false;
    FleetSecretPin? pin;
    if (secret is FleetSecretPairing) {
      mine =
          verified &&
          outcome.outcome == FleetSecretOutcomeKind.paired &&
          outcome.answerDigest == _keyId;
      if (mine && !_ended) {
        pin = await _pins.activate(
          machineId: secret.machineId,
          pairingId: secret.pairingId,
          signerKey: secret.signerKey,
          account: _account,
        );
      }
    } else {
      mine = verified && _digest != null && outcome.answerDigest == _digest;
    }
    if (_ended) return;
    emit(
      state.copyWith(
        phase: FleetSecretPhase.outcome,
        pin: pin,
        settled: FleetSecretSettled(
          outcome: outcome.outcome,
          verified: verified,
          mine: mine,
        ),
      ),
    );
    _notifyHandled();
  }

  /// Activates pending pins whose pairing the machine settled for this
  /// phone's key in [snapshot]'s resolved list.
  Future<void> _activatePending(FleetSnapshot snapshot) async {
    for (final pin in (await _pins.read()).values) {
      final pairingId = pin.pairingId;
      if (pin.active || pairingId == null) continue;
      final outcome = snapshot.resolved
          .where((r) => r.id == pairingId)
          .firstOrNull
          ?.secretOutcome;
      if (outcome == null ||
          outcome.outcome != FleetSecretOutcomeKind.paired ||
          outcome.answerDigest != _keyId) {
        continue;
      }
      final verified = await _crypto.verifyEd25519(
        publicKey: _bytes(pin.signerKey, 32),
        message: FleetSecretBinding.outcome(
          pairingId,
          'paired',
          outcome.answerDigest,
        ),
        signature: _bytes(outcome.sig, 64),
      );
      if (verified && !_ended) {
        await _pins.activate(
          machineId: pin.machineId,
          pairingId: pairingId,
          signerKey: pin.signerKey,
          account: _account,
        );
      }
    }
  }

  /// "Forget this machine": removes its pin; the next request needs a new
  /// pairing.
  Future<void> forgetMachine() async {
    if (_ended) return;
    await _pins.forget(secret.machineId, account: _account);
    if (!isClosed) emit(state.copyWith(phase: FleetSecretPhase.closed));
    _notifyHandled();
  }

  @override
  Future<void> close() async {
    fleetSecretErasures.removeListener(_onErased);
    _cutoff?.cancel();
    _pending = null;
    await _snapshotSub?.cancel();
    await super.close();
  }
}
