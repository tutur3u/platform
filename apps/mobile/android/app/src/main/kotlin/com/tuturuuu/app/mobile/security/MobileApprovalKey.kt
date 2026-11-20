package com.tuturuuu.app.mobile.security

import android.app.Activity
import android.content.pm.PackageManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
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
        if (call.method != "ensureKey" && call.method != "sign") {
            result.notImplemented()
            return
        }
        val owner = activity
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || owner == null) {
            fail(result, "unsupported")
            return
        }
        val accountId = call.argument<String>("accountId")
        if (accountId == null || !ACCOUNT_ID.matches(accountId)) {
            fail(result, "bad_arguments")
            return
        }
        val alias = "com.tuturuuu.mobile.approval-key.v2.${UUID.fromString(accountId)}"
        if (call.method == "ensureKey") {
            worker.execute {
                respond(owner, result) { ensureKey(owner, alias) }
            }
            return
        }

        val bytes = call.argument<ByteArray>("data")
        val reason = call.argument<String>("reason")
        if (bytes == null || !isApprovalMessage(bytes) || reason.isNullOrBlank() || reason.length > 200) {
            fail(result, "bad_arguments")
            return
        }
        sign(owner, alias, bytes, reason, result)
    }

    private fun ensureKey(owner: Activity, alias: String): ByteArray {
        val store = keyStore()
        if (!store.containsAlias(alias)) {
            val manager = owner.getSystemService(BiometricManager::class.java)
            if (manager?.canAuthenticate(AUTHENTICATORS) != BiometricManager.BIOMETRIC_SUCCESS) {
                throw KeyError("unsupported")
            }
            val strongBox = owner.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
            try {
                generate(alias, strongBox)
            } catch (_: StrongBoxUnavailableException) {
                generate(alias, false)
            }
        }
        approvalPrivateKey(store, alias)
        return store.getCertificate(alias)?.publicKey?.encoded ?: throw KeyError("no_key")
    }

    private fun generate(alias: String, strongBox: Boolean) {
        val parameters = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationParameters(
                0, KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL,
            )
            .setIsStrongBoxBacked(strongBox)
            .build()
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE).run {
            initialize(parameters)
            generateKeyPair()
        }
    }

    @Suppress("DEPRECATION")
    private fun approvalPrivateKey(store: KeyStore, alias: String): PrivateKey {
        val key = store.getKey(alias, null) as? PrivateKey ?: throw KeyError("no_key")
        val info = KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java)
        val hardware = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            info.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
                info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX
        } else {
            info.isInsideSecureHardware
        }
        if (!hardware || !info.isUserAuthenticationRequired ||
            !info.isUserAuthenticationRequirementEnforcedBySecureHardware ||
            info.userAuthenticationValidityDurationSeconds != -1
        ) {
            throw KeyError("unsupported")
        }
        return key
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
                    initSign(approvalPrivateKey(keyStore(), alias))
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

    private fun respond(owner: Activity, result: MethodChannel.Result, operation: () -> ByteArray) {
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

        private fun isApprovalMessage(bytes: ByteArray): Boolean {
            if (bytes.size > 512) return false
            return runCatching {
                val fields = JSONArray(bytes.decodeToString(throwOnInvalidSequence = true))
                fields.length() == 8 && fields.opt(0) == "tuturuuu.mobile-approval.v2" &&
                    (1..7).all { fields.opt(it) is String } &&
                    (1..4).all { (fields.opt(it) as String).isNotEmpty() }
            }.getOrDefault(false)
        }
    }
}
