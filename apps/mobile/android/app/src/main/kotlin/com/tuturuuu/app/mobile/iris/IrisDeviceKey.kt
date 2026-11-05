package com.tuturuuu.app.mobile.iris

import android.app.Activity
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.security.keystore.UserNotAuthenticatedException
import android.util.Base64
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The Iris device key: a non-exportable P-256 Keystore key (StrongBox when the
 * device has one, otherwise the TEE), usable only within five minutes of a
 * strong (class 3) biometric. A write (per [IrisSignPolicy], read from the
 * signed bytes) always shows BiometricPrompt first. See lib/features/mastermind/iris/device/SECURITY.md.
 *
 * Nothing here logs key material, signed bytes or signatures.
 */
class IrisDeviceKeyPlugin : FlutterPlugin, ActivityAware, MethodChannel.MethodCallHandler {
    private var channel: MethodChannel? = null
    private var activity: Activity? = null
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, CHANNEL).also { it.setMethodCallHandler(this) }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null)
        channel = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivityForConfigChanges() {
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivity() {
        activity = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "ensureKey" -> background(result) { ensureKey() }
            "deleteKey" -> background(result) { keyStore().deleteEntry(ALIAS); null }
            // The session lives in the Keystore's auth window; nothing to drop.
            "lock" -> result.success(null)
            "sign" -> {
                val data = call.argument<ByteArray>("data")
                val sensitive = call.argument<Boolean>("sensitive")
                val reason = call.argument<String>("reason")
                val cancel = call.argument<String>("cancel")
                if (data == null || data.isEmpty() || sensitive == null ||
                    reason.isNullOrEmpty() || reason.length > 200 || cancel.isNullOrEmpty()
                ) {
                    result.error("bad_arguments", MESSAGE, null)
                    return
                }
                // The signed bytes decide: a write always prompts, whatever
                // the caller's flag says, and only a v3 string is signed.
                val prompt = IrisSignPolicy.mustPrompt(data, sensitive)
                if (prompt == null) {
                    result.error("bad_arguments", MESSAGE, null)
                    return
                }
                sign(data, prompt, reason, cancel, result)
            }
            else -> result.notImplemented()
        }
    }

    private fun ensureKey(): Map<String, String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw KeyError("unsupported")
        val store = keyStore()
        val existing = store.getCertificate(ALIAS)?.publicKey
        val publicKey = existing ?: run {
            val context = activity ?: throw KeyError("unavailable")
            val biometrics = context.getSystemService(BiometricManager::class.java)
            when (biometrics?.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
                BiometricManager.BIOMETRIC_SUCCESS -> Unit
                else -> throw KeyError("biometry_unavailable")
            }
            val strongBox = context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
            try {
                generate(strongBox)
            } catch (_: StrongBoxUnavailableException) {
                generate(false)
            }
            store.getCertificate(ALIAS)?.publicKey ?: throw KeyError("failed")
        }
        val hardware = hardware(store.getKey(ALIAS, null) as? PrivateKey ?: throw KeyError("no_key"))
        if (hardware == null) {
            // Never sign with a software key: drop it and refuse.
            store.deleteEntry(ALIAS)
            throw KeyError("unsupported")
        }
        val spki = publicKey.encoded
        val fingerprint = MessageDigest.getInstance("SHA-256").digest(spki)
            .joinToString("") { "%02x".format(it) }
        return mapOf(
            "publicKey" to Base64.encodeToString(spki, Base64.NO_WRAP),
            "fingerprint" to fingerprint,
            "hardware" to hardware,
        )
    }

    private fun generate(strongBox: Boolean) {
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(SESSION_SECONDS, KeyProperties.AUTH_BIOMETRIC_STRONG)
            .setInvalidatedByBiometricEnrollment(true)
            .setUnlockedDeviceRequired(true)
            .setIsStrongBoxBacked(strongBox)
            .build()
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE).run {
            initialize(spec)
            generateKeyPair()
        }
    }

    /** "strongbox" or "tee", or null for a key outside secure hardware. */
    private fun hardware(key: PrivateKey): String? {
        val info = KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return when (info.securityLevel) {
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
                else -> null
            }
        }
        @Suppress("DEPRECATION")
        return if (info.isInsideSecureHardware) "tee" else null
    }

    private fun sign(
        data: ByteArray,
        sensitive: Boolean,
        reason: String,
        cancel: String,
        result: MethodChannel.Result,
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            result.error("unsupported", MESSAGE, null)
            return
        }
        val afterPrompt = {
            prompt(reason, cancel, sensitive) { error ->
                if (error != null) result.error(error, MESSAGE, null)
                else background(result) { signNow(data) }
            }
        }
        if (sensitive) {
            afterPrompt()
            return
        }
        worker.execute {
            try {
                val signature = signNow(data)
                main.post { result.success(signature) }
            } catch (_: UserNotAuthenticatedException) {
                main.post { afterPrompt() }
            } catch (error: Exception) {
                main.post { result.error(code(error), MESSAGE, null) }
            }
        }
    }

    private fun signNow(data: ByteArray): ByteArray {
        val key = keyStore().getKey(ALIAS, null) as? PrivateKey ?: throw KeyError("no_key")
        return Signature.getInstance("SHA256withECDSA").run {
            initSign(key)
            update(data)
            sign()
        }
    }

    private fun prompt(reason: String, cancel: String, sensitive: Boolean, done: (String?) -> Unit) {
        val context = activity ?: return done("unavailable")
        val once = AtomicBoolean(false)
        val finish = { error: String? -> if (once.compareAndSet(false, true)) done(error) }
        val prompt = BiometricPrompt.Builder(context)
            .setTitle(reason)
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setConfirmationRequired(sensitive)
            .setNegativeButton(cancel, context.mainExecutor) { _, _ -> finish("cancelled") }
            .build()
        prompt.authenticate(
            CancellationSignal(),
            context.mainExecutor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    finish(null)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    finish(
                        when (errorCode) {
                            BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED,
                            BiometricPrompt.BIOMETRIC_ERROR_CANCELED,
                            BiometricPrompt.BIOMETRIC_ERROR_TIMEOUT,
                            -> "cancelled"
                            BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT,
                            BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT,
                            -> "lockout"
                            BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS,
                            BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT,
                            BiometricPrompt.BIOMETRIC_ERROR_HW_UNAVAILABLE,
                            -> "biometry_unavailable"
                            else -> "failed"
                        },
                    )
                }
            },
        )
    }

    private fun <T> background(result: MethodChannel.Result, body: () -> T) {
        worker.execute {
            try {
                val value = body()
                main.post { result.success(value) }
            } catch (error: Exception) {
                main.post { result.error(code(error), MESSAGE, null) }
            }
        }
    }

    private fun code(error: Exception): String = when (error) {
        is KeyError -> error.code
        is KeyPermanentlyInvalidatedException -> "key_invalidated"
        is UserNotAuthenticatedException -> "cancelled"
        else -> "failed"
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

    private class KeyError(val code: String) : Exception(code)

    private companion object {
        const val CHANNEL = "mobile/iris_device_key"
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "com.tuturuuu.mobile.iris.device-key.v1"
        const val SESSION_SECONDS = 300
        const val MESSAGE = "Iris device key unavailable"
    }
}
