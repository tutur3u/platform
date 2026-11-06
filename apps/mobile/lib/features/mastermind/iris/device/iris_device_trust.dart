import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';
import 'dart:ui' show Locale, PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/iris/data/iris_device_identity.dart';
import 'package:mobile/features/mastermind/iris/data/iris_models.dart';
import 'package:mobile/features/mastermind/iris/data/iris_relay.dart';
import 'package:mobile/features/mastermind/iris/data/request_signer.dart';
import 'package:mobile/features/mastermind/iris/device/iris_device_key.dart';
import 'package:mobile/features/mastermind/iris/device/iris_enrolment_store.dart';
import 'package:mobile/features/mastermind/iris/device/iris_key_codec.dart';
import 'package:mobile/l10n/l10n.dart';

/// Biometric prompt text: `unlock` for a read session, `confirm` for a
/// write, `cancel` for Android's cancel button.
typedef IrisPromptText = ({String unlock, String confirm, String cancel});

/// This device's trust with the Iris relay: the hardware key signs every
/// relay request, and enrolment registers that key.
///
/// A write (anything but GET/HEAD) is sensitive and always prompts for
/// biometrics; the native signer enforces that from the signed bytes too.
/// Reads share a biometric session of at most five minutes. If the owner
/// cancels a read prompt, reads fail as `deviceLocked` for five minutes
/// instead of prompting on every poll.
///
/// Nothing here logs or stores a signature, signed string or key.
final class IrisDeviceTrust implements IrisRequestSigner, IrisDeviceIdentity {
  IrisDeviceTrust({
    IrisDeviceKey key = const IrisDeviceKey(),
    IrisEnrolmentStore store = const PreferencesIrisEnrolmentStore(),
    DateTime Function()? clock,
    Random? random,
    IrisPromptText Function()? prompts,
  }) : _key = key,
       _store = store,
       _clock = clock ?? DateTime.now,
       _random = random,
       _prompts = prompts ?? irisPlatformPromptText;

  /// The app's one device trust on iOS and Android; null anywhere else, so
  /// those builds have no signer and Iris stays off.
  static IrisDeviceTrust? get platform => _platform;
  static final IrisDeviceTrust? _platform = Platform.isIOS || Platform.isAndroid
      ? IrisDeviceTrust()
      : null;

  /// How long a cancelled read prompt holds further read prompts back.
  static const readPause = Duration(minutes: 5);

  final IrisDeviceKey _key;
  final IrisEnrolmentStore _store;
  final DateTime Function() _clock;
  final Random? _random;
  final IrisPromptText Function() _prompts;
  DateTime? _readsPausedUntil;

  /// Whether a relay could accept this device's signature: enrolled, or a
  /// pending enrolment that has not expired.
  Future<bool> canSign() async =>
      (await _store.read())?.activeAt(_clock().toUtc()) ?? false;

  @override
  Future<bool> isEnrolled() async =>
      (await _store.read())?.state == IrisEnrolmentState.enrolled;

  @override
  Future<Map<String, String>> sign(
    String method,
    String path,
    List<int> body, {
    String? idempotencyKey,
  }) async {
    final now = _clock().toUtc();
    final record = await _store.read();
    if (record == null || !record.activeAt(now)) {
      throw const IrisSignerException(IrisFailureKind.notEnrolled);
    }
    final verb = method.toUpperCase();
    final sensitive = !irisIsReadMethod(verb);
    final paused = _readsPausedUntil;
    if (!sensitive && paused != null && now.isBefore(paused)) {
      throw const IrisSignerException(IrisFailureKind.deviceLocked);
    }
    final ts = '${now.millisecondsSinceEpoch ~/ 1000}';
    final nonce = newIrisNonce(_random);
    final String canonical;
    try {
      canonical = irisCanonicalRequest(
        method: verb,
        path: path,
        body: body,
        ts: ts,
        nonce: nonce,
        deviceId: record.deviceId,
        idempotencyKey: sensitive ? idempotencyKey : null,
      );
    } on FormatException {
      throw const IrisSignerException(IrisFailureKind.badRequest);
    }
    final prompts = _prompts();
    final Uint8List der;
    try {
      der = await _key.sign(
        Uint8List.fromList(utf8.encode(canonical)),
        sensitive: sensitive,
        reason: sensitive ? prompts.confirm : prompts.unlock,
        cancel: prompts.cancel,
      );
    } on IrisDeviceKeyException catch (error) {
      throw IrisSignerException(
        await _failure(error.error, sensitive: sensitive, now: now),
      );
    }
    final raw = irisRawSignature(der);
    if (raw == null) {
      throw const IrisSignerException(IrisFailureKind.deviceLocked);
    }
    _readsPausedUntil = null;
    return {
      IrisHeaders.device: record.deviceId,
      IrisHeaders.ts: ts,
      IrisHeaders.nonce: nonce,
      IrisHeaders.sig: irisBase64Url(raw),
    };
  }

  Future<IrisFailureKind> _failure(
    IrisDeviceKeyError error, {
    required bool sensitive,
    required DateTime now,
  }) async {
    switch (error) {
      case IrisDeviceKeyError.noKey || IrisDeviceKeyError.keyInvalidated:
        // The relay knows a key this device no longer has: start over.
        await forget();
        return IrisFailureKind.notEnrolled;
      case IrisDeviceKeyError.unsupported ||
          IrisDeviceKeyError.biometryUnavailable:
        return IrisFailureKind.notEnrolled;
      case IrisDeviceKeyError.cancelled ||
          IrisDeviceKeyError.lockout ||
          IrisDeviceKeyError.interactionNotAllowed ||
          IrisDeviceKeyError.failed:
        if (!sensitive) _readsPausedUntil = now.add(readPause);
        return IrisFailureKind.deviceLocked;
    }
  }

  /// Lets reads prompt again now: on app resume, or after the owner asked to
  /// unlock.
  void resumeReads() => _readsPausedUntil = null;

  /// Ends the read session (the app left the foreground): the next read
  /// prompts again.
  Future<void> lock() async {
    try {
      await _key.lock();
    } on IrisDeviceKeyException {
      // Nothing to end.
    }
  }

  /// The relay answered `device_revoked` or `unknown_device`. A confirmed
  /// enrolment is gone for good, so the key and record are dropped and the
  /// owner enrols again. A pending device also gets `unknown_device` until
  /// the owner confirms it, so a pending record is kept until it expires.
  Future<void> relayForgot() async {
    if (await isEnrolled()) await forget();
  }

  /// Deletes the key and the enrolment record (also on sign-out and account
  /// switch). The relay still lists the device until it is revoked there.
  @override
  Future<void> forget() async {
    _readsPausedUntil = null;
    await _store.clear();
    try {
      await _key.deleteKey();
    } on IrisDeviceKeyException {
      // Already gone.
    }
  }

  /// The key to enrol. A device that is already enrolled gets a new key
  /// (and so a new device id): the relay never re-files a known device.
  @override
  Future<IrisDeviceKeyMaterial?> load() async {
    if (await isEnrolled()) await forget();
    try {
      final info = await _key.ensureKey();
      return (
        deviceId: irisDeviceIdFor(info.fingerprint),
        publicKey: irisBase64Url(info.spki),
        fingerprint: info.fingerprint,
      );
    } on IrisDeviceKeyException {
      return null;
    }
  }

  @override
  Future<void> pending(IrisEnrollment enrolment) async {
    final info = await _key.ensureKey();
    if (irisDeviceIdFor(info.fingerprint) != enrolment.deviceId) {
      throw StateError('enrolment is for another key');
    }
    await _store.write(
      IrisEnrolmentRecord(
        state: IrisEnrolmentState.pending,
        deviceId: enrolment.deviceId,
        fingerprint: info.fingerprint,
        expiresAt: enrolment.expiresAt.toUtc(),
      ),
    );
  }

  /// The relay has no device-status route for a phone: a pending device's
  /// signed read is refused (401) until the owner confirms it, then served.
  @override
  Future<IrisDeviceStatus> check(
    IrisRelay relay,
    IrisEnrollment enrolment,
  ) async {
    final record = await _store.read();
    if (record == null || record.deviceId != enrolment.deviceId) {
      return IrisDeviceStatus.expired;
    }
    if (record.state == IrisEnrolmentState.enrolled) {
      return IrisDeviceStatus.confirmed;
    }
    if (!record.activeAt(_clock().toUtc())) {
      await _store.clear();
      return IrisDeviceStatus.expired;
    }
    switch (await relay.summary()) {
      case IrisOk():
        await _store.write(
          IrisEnrolmentRecord(
            state: IrisEnrolmentState.enrolled,
            deviceId: record.deviceId,
            fingerprint: record.fingerprint,
          ),
        );
        return IrisDeviceStatus.confirmed;
      case IrisErr(:final failure)
          when failure.kind == IrisFailureKind.notEnrolled:
        return IrisDeviceStatus.expired;
      case IrisErr():
        return IrisDeviceStatus.pending;
    }
  }
}

/// Prompt text in the device language, English when it has no bundle.
IrisPromptText irisPlatformPromptText() {
  final device = PlatformDispatcher.instance.locale;
  final l10n = lookupAppLocalizations(
    AppLocalizations.delegate.isSupported(device) ? device : const Locale('en'),
  );
  return (
    unlock: l10n.mastermindIrisUnlockReason,
    confirm: l10n.mastermindIrisConfirmReason,
    cancel: l10n.commonCancel,
  );
}
