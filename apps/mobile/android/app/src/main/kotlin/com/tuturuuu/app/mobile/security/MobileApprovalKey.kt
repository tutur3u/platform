package com.tuturuuu.app.mobile.security

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
import android.util.Base64
import com.tuturuuu.app.mobile.R
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.UUID
import java.util.concurrent.Executors

class MobileApprovalKeyPlugin : FlutterPlugin, ActivityAware, MethodChannel.MethodCallHandler {
    private var channel: MethodChannel? = null
    private var activity: Activity? = null
    private var activePrompt: CancellationSignal? = null
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, "mobile/approval_key").also {
            it.setMethodCallHandler(this)
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        onDetachedFromActivity()
        channel?.setMethodCallHandler(null)
        channel = null
        worker.shutdown()
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
    }

    override fun onDetachedFromActivityForConfigChanges() = onDetachedFromActivity()

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) =
        onAttachedToActivity(binding)

    override fun onDetachedFromActivity() {
        activePrompt?.cancel()
        activity = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        val owner = activity
        if (call.method == "deleteKeys") {
            deleteKeys(call.argument<String>("accountId"), result)
            return
        }
        if (call.method != "prepareEnrollment" && call.method != "sign") {
            result.notImplemented()
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || owner == null) {
            fail(result, "unsupported")
            return
        }
        val accountId = call.argument<String>("accountId")
        val keyId = call.argument<String>("keyId")
        if (accountId == null || !ACCOUNT_ID.matches(accountId) ||
            keyId == null || !ACCOUNT_ID.matches(keyId)
        ) {
            fail(result, "bad_arguments")
            return
        }
        val alias = "$ALIAS_PREFIX${UUID.fromString(accountId)}.${UUID.fromString(keyId)}"
        if (call.method == "prepareEnrollment") {
            val challenge = call.argument<ByteArray>("challenge")
            if (challenge == null || challenge.size != 32) {
                fail(result, "bad_arguments")
                return
            }
            worker.execute {
                respond(owner, result) { prepareEnrollment(owner, alias, challenge) }
            }
            return
        }

        val bytes = call.argument<ByteArray>("data")
        val reason = bytes?.let { promptText(owner, it) }
        if (bytes == null || reason == null) {
            fail(result, "bad_arguments")
            return
        }
        sign(owner, alias, bytes, reason, result)
    }

    private fun deleteKeys(accountId: String?, result: MethodChannel.Result) {
        if (accountId != null && !ACCOUNT_ID.matches(accountId)) {
            fail(result, "bad_arguments")
            return
        }
        val prefix = if (accountId == null) ALIAS_PREFIX else "$ALIAS_PREFIX${UUID.fromString(accountId)}."
        activePrompt?.cancel()
        worker.execute {
            val response = runCatching {
                val store = keyStore()
                store.aliases().toList().filter { it.startsWith(prefix) }.forEach(store::deleteEntry)
            }
            main.post {
                response.fold(
                    onSuccess = { result.success(null) },
                    onFailure = { fail(result, errorCode(it)) },
                )
            }
        }
    }

    private fun prepareEnrollment(owner: Activity, alias: String, challenge: ByteArray): Map<String, Any> {
        val store = keyStore()
        if (!store.containsAlias(alias)) {
            val manager = owner.getSystemService(BiometricManager::class.java)
            if (manager?.canAuthenticate(AUTHENTICATORS) != BiometricManager.BIOMETRIC_SUCCESS) {
                throw KeyError("unsupported")
            }
            val strongBox = owner.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
            try {
                generate(alias, strongBox, challenge)
            } catch (_: StrongBoxUnavailableException) {
                generate(alias, false, challenge)
            }
        }
        val (_, securityLevel) = approvalPrivateKey(store, alias)
        val chain = store.getCertificateChain(alias) ?: throw KeyError("no_key")
        if (chain.size !in 2..8) throw KeyError("unsupported")
        return mapOf(
            "publicKey" to Base64.encodeToString(chain.first().publicKey.encoded, Base64.NO_WRAP),
            "securityLevel" to securityLevel,
            "certificateChain" to chain.map { Base64.encodeToString(it.encoded, Base64.NO_WRAP) },
        )
    }

    private fun generate(alias: String, strongBox: Boolean, challenge: ByteArray) {
        val parameters = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(
                0, KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
            )
            .setAttestationChallenge(challenge)
            .setIsStrongBoxBacked(strongBox)
            .build()
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE).run {
            initialize(parameters)
            generateKeyPair()
        }
    }

    @Suppress("DEPRECATION")
    private fun approvalPrivateKey(store: KeyStore, alias: String): Pair<PrivateKey, String> {
        val key = store.getKey(alias, null) as? PrivateKey ?: throw KeyError("no_key")
        val info = KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java)
        val securityLevel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            when (info.securityLevel) {
                KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
                KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
                else -> null
            }
        } else {
            // Android 11 exposes only a hardware boolean. The server uses the
            // actual attested security level from the certificate extension.
            if (info.isInsideSecureHardware) "hardware" else null
        }
        if (securityLevel == null || !info.isUserAuthenticationRequired ||
            !info.isUserAuthenticationRequirementEnforcedBySecureHardware ||
            info.userAuthenticationValidityDurationSeconds != -1
        ) {
            throw KeyError("unsupported")
        }
        return key to securityLevel
    }

    private fun sign(
        owner: Activity,
        alias: String,
        bytes: ByteArray,
        reason: String,
        result: MethodChannel.Result,
    ) {
        if (activePrompt != null) {
            fail(result, "busy")
            return
        }
        val cancellation = CancellationSignal()
        activePrompt = cancellation
        worker.execute {
            val prepared = runCatching {
                Signature.getInstance("SHA256withECDSA").apply {
                    initSign(approvalPrivateKey(keyStore(), alias).first)
                }
            }
            owner.runOnUiThread {
                if (activity !== owner || cancellation.isCanceled) {
                    finish(cancellation, result, "cancelled")
                    return@runOnUiThread
                }
                prepared.fold(
                    onSuccess = { showPrompt(owner, cancellation, it, bytes, reason, result) },
                    onFailure = { finish(cancellation, result, errorCode(it)) },
                )
            }
        }
    }

    private fun showPrompt(
        owner: Activity,
        cancellation: CancellationSignal,
        signature: Signature,
        bytes: ByteArray,
        reason: String,
        result: MethodChannel.Result,
    ) {
        try {
            BiometricPrompt.Builder(owner)
                .setTitle(reason)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .setConfirmationRequired(true)
                .build()
                .authenticate(
                    BiometricPrompt.CryptoObject(signature),
                    cancellation,
                    owner.mainExecutor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationError(code: Int, message: CharSequence) {
                            finish(cancellation, result, "cancelled")
                        }

                        override fun onAuthenticationSucceeded(auth: BiometricPrompt.AuthenticationResult) {
                            val verified = auth.cryptoObject?.signature
                            if (activity !== owner || cancellation.isCanceled || verified !== signature) {
                                finish(cancellation, result, "cancelled")
                                return
                            }
                            val signed = runCatching {
                                signature.update(bytes)
                                signature.sign()
                            }
                            signed.fold(
                                onSuccess = {
                                    activePrompt = null
                                    result.success(it)
                                },
                                onFailure = { finish(cancellation, result, errorCode(it)) },
                            )
                        }
                    },
                )
        } catch (error: Exception) {
            finish(cancellation, result, errorCode(error))
        }
    }

    private fun finish(cancellation: CancellationSignal, result: MethodChannel.Result, code: String) {
        if (activePrompt !== cancellation) return
        activePrompt = null
        fail(result, code)
    }

    private fun respond(owner: Activity, result: MethodChannel.Result, operation: () -> Map<String, Any>) {
        val response = runCatching(operation)
        owner.runOnUiThread {
            if (activity !== owner) {
                fail(result, "cancelled")
            } else {
                response.fold(onSuccess = result::success, onFailure = { fail(result, errorCode(it)) })
            }
        }
    }

    private class KeyError(val code: String) : Exception()

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val ALIAS_PREFIX = "com.tuturuuu.mobile.approval-key.v2."
        private const val AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
        private val ACCOUNT_ID = Regex("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")

        private fun keyStore() = KeyStore.getInstance(KEYSTORE).apply { load(null) }

        private fun fail(result: MethodChannel.Result, code: String) =
            result.error(code, "Mobile approval key unavailable", null)

        private fun errorCode(error: Throwable) = when (error) {
            is KeyError -> error.code
            is KeyPermanentlyInvalidatedException -> "key_invalidated"
            else -> "failed"
        }

        private val MATCHING_NUMBER = Regex("[0-9]{2}")
        private val KEY_HASH = Regex("[0-9a-f]{64}")

        private fun promptText(owner: Activity, bytes: ByteArray): String? {
            if (bytes.size > 512) return null
            return runCatching {
                val fields = JSONArray(bytes.decodeToString(throwOnInvalidSequence = true))
                if (fields.length() != 8 || fields.opt(0) != "tuturuuu.mobile-approval.v2" ||
                    (1..7).any { fields.opt(it) !is String || (fields.opt(it) as String).isEmpty() }
                ) return null
                val value = fields.getString(6)
                when (fields.getString(5)) {
                    "approve" -> if (MATCHING_NUMBER.matches(value)) {
                        owner.getString(R.string.mobile_approval_verify_number, value)
                    } else null
                    "reject" -> if (value == "deny") owner.getString(R.string.mobile_approval_verify_denial) else null
                    "enroll" -> if (KEY_HASH.matches(value)) owner.getString(R.string.mobile_approval_verify_enrollment) else null
                    else -> null
                }
            }.getOrNull()
        }
    }
}
