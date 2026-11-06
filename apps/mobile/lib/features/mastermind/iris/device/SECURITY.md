# Iris device key: security properties

For Selene/Tess review. Code: `ios/Runner/IrisDeviceKey.swift`,
`android/app/src/main/kotlin/com/tuturuuu/app/mobile/iris/IrisDeviceKey.kt`
and this folder. Channel: `mobile/iris_device_key`.

## Key

| | iOS | Android |
| --- | --- | --- |
| Store | Secure Enclave (`kSecAttrTokenIDSecureEnclave`) | Keystore: StrongBox when present, else TEE. A key outside secure hardware is deleted and refused |
| Algorithm | P-256, ECDSA-SHA256 | P-256 (`secp256r1`), `SHA256withECDSA` |
| Access | `.privateKeyUsage` + `.biometryCurrentSet`, `WhenUnlockedThisDeviceOnly` | `setUserAuthenticationRequired`, `AUTH_BIOMETRIC_STRONG` only, `setInvalidatedByBiometricEnrollment`, `setUnlockedDeviceRequired` |
| Export / backup | Not exportable; not in backups or iCloud Keychain | Not exportable; Keystore keys are not backed up |
| Minimum OS | Any device with a Secure Enclave (simulator: unsupported) | Android 11 (API 30); older versions report `unsupported` |

A change to the enrolled biometrics makes the key unusable. The app then
deletes the key and its enrolment record, and the owner enrols again.

## Biometric use

- **Writes** (any method other than GET/HEAD) are *sensitive*. Each one shows
  a biometric prompt immediately before signing. The native signer enforces
  this from the bytes it signs, not from the caller: it refuses anything but a
  v3 canonical string, reads the method from line 2, and prompts for every
  method but GET/HEAD whatever the Dart `sensitive` flag says
  (`IrisSignPolicy` in Swift and Kotlin; `irisNativeMustPrompt` mirrors it in
  Dart).
  - iOS: a fresh `LAContext` per write, evaluated with biometrics only (no
    passcode fallback). The Secure Enclave checks that context.
  - Android: `BiometricPrompt` with `BIOMETRIC_STRONG`, then the sign. The
    Keystore enforces that a strong biometric happened within the window.
- **Reads** share one session of at most 5 minutes from the unlock.
  - iOS: one evaluated `LAContext`, dropped after 5 minutes, after a failure,
    or on `lock`. The app calls `lock` when it is hidden or paused and lets
    reads prompt again on resume. Not on `inactive`: the Face ID sheet itself
    makes the app inactive, and a lock queued behind that sign would drop the
    session it just opened, so every poll would prompt.
  - Android: the Keystore's 300-second auth window (`lock` has nothing to
    drop). **Platform difference:** iOS can end the read session early (hide,
    pause, `lock`); on Android `lock` is a no-op, so after any strong
    biometric the key stays usable for up to 300 s even if the app is hidden.
    A write's prompt also opens this window, so reads and writes inside it
    need no new prompt on Android. This is accepted while writes stay
    disabled. The window is not shortened and writes do not use per-use auth
    here: with one key every signed read would then prompt on each poll. The
    fix is the write-only second key in the M1 gate below.
- If the owner cancels a read prompt, reads fail as `deviceLocked` for 5
  minutes instead of prompting on every poll. Writes still prompt.
- When the key reports "locked" (on iOS this includes `errSecAuthFailed`
  after a biometric change), the chat offers "Enrol again", which makes a new
  hardware key. The app never falls back to a weaker key: there is no
  passcode, software or non-biometric key path.

### Decision: the Android window (Selene)

The 5-minute Android window may open only from a fresh strong-biometric
prompt that the user triggers with a write, and reads never depend on it.

Current code does not meet this yet. With one Keystore key, a signed read
needs an open window, so a read prompt (`unlock`) also opens it. Meeting the
decision needs the second key in the M1 gate below.

**M1 gate:** before any binding action (answers, approvals), the relay must
accept a second, write-only key per device that uses a per-operation
`CryptoObject` (Android) or per-operation biometry (iOS).

## What is signed

The relay's canonical string v3, the only format: eight lines joined by LF
with no trailing LF.

1. `tuturuuu-iris-device-v3`
2. METHOD
3. path?query
4. sha256hex(body)
5. ts
6. nonce
7. device id
8. Idempotency-Key for a write, or the empty string for GET/HEAD. A GET
   string therefore ends with LF after the device id.

- `ts`: Unix seconds.
- `nonce`: 128 random bits as 32 hex characters.
- device id: the first 16 bytes of the SPKI sha256 as a lowercase v8 UUID, so
  a new key is a new device.
- Idempotency-Key: a lowercase v4 UUID, now signed. A write without one is
  refused before signing, and so is any field with LF or CR. There is no
  version header.

Headers: `X-Device-Id`, `X-Iris-Ts`, `X-Iris-Nonce`, `X-Iris-Sig`, plus
`Idempotency-Key` on a write. The signature is raw r||s (64 bytes) in
unpadded base64url, converted from strict DER after the native sign.

Enrolment (`POST /v1/iris/enrol`) and revoke are owner-JWT routes and carry
no device signature. The enrol body is exactly `public_key` (base64url SPKI
DER), `fingerprint` (sha256 hex of those DER bytes, which the relay
recomputes) and `code` (6 app-chosen digits). The headers are `X-Device-Id`
and an Idempotency-Key.

There is no key attestation. Trust rests on the owner's passkey confirmation
on the enrol page.

## Relay errors

- 401 `device_revoked` or `unknown_device` on a confirmed device: the app
  clears the key and enrolment record and offers "Enrol again". A pending
  device also gets `unknown_device` until it is confirmed, so a pending
  record is kept until it expires.
- 401 `clock_skew`: "Check your device clock". There is no automatic
  correction, so `server_time` is never read.
- 401 `unauthorized` (for example a bad signature): a generic error, with no
  clearing.
- Enrol 401 `assertion_required` (relay killed): "Relay stopped; ask the
  owner to restore it", with no retry.
- These 401s are not about the token, so none of them triggers the silent
  token refresh.
- 503 `killed` (or the older `iris_killed`): read-only.

## Fail-closed wiring

- Non-fixture builds sign only with this key. With no hardware key (desktop,
  tests, unsupported device), the relay is `UnconfiguredIrisRelay(notEnrolled)`.
- `EnrolledIrisRelay` refuses every device call until a pending or confirmed
  enrolment is recorded, so an unenrolled phone sends nothing and never
  prompts.
- Logout and account switch call `forget()`: the key and the enrolment record
  go with the account.
- The sha256 fake signer exists only under `test/`. The synthetic fixture
  identity exists only behind `MASTERMIND_FIXTURE` on the development flavor,
  whose asset is flavor-gated.

## Writes stay disabled

Iris writes (POST /v1/iris/send and any future binding action) stay DISABLED
until Selene re-verifies the native write-enforcement (C1) at an exact head
and signs off. Enforcement: the relay keeps capabilities `iris:false`, and the
app shows the composer disabled unless the capability is true.

The composer is also off, with a short reason, while the device is not
enrolled.

## Logging and storage

- Native code and Dart never log a key, signed string, signature, token or
  body. Errors cross the channel as fixed codes with a generic message.
- Shared preferences hold only the enrolment state, the device id, the public
  fingerprint and the pending expiry. They are not an authority: the relay
  decides.

## Before Iris writes are enabled

Open:

1. C1 follow-up, with Forge: native method-line enforcement against the
   relay's final vectors, plus the domain prefix. The v3 string carries the
   prefix and the native gate checks it. Forge's signed GET and POST test
   vectors are still to land in `iris_daemon_contract_test.dart`.
2. M2: enrol while the relay is killed needs an owner passkey `authorization`.
   The app sends none and shows "Relay stopped".
3. The Android window decision and the M1 second-key gate above.
