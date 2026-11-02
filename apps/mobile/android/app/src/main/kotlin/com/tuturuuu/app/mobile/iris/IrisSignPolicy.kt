package com.tuturuuu.app.mobile.iris

/**
 * What the native signer accepts, read from the bytes it signs rather than
 * from the caller: a v3 canonical string (eight LF-separated lines, the first
 * "tuturuuu-iris-device-v3"), and a fresh biometric prompt for any method but
 * GET/HEAD whatever the `sensitive` flag says. Mirrors `irisNativeMustPrompt`
 * in lib/features/mastermind/iris/data/request_signer.dart.
 */
object IrisSignPolicy {
    const val DOMAIN = "tuturuuu-iris-device-v3"
    private const val LINES = 8

    /** True to prompt, false for the read session, null to refuse to sign. */
    fun mustPrompt(data: ByteArray, sensitive: Boolean): Boolean? {
        val text = try {
            Charsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(data)).toString()
        } catch (_: java.nio.charset.CharacterCodingException) {
            return null
        }
        val lines = text.split('\n')
        if (lines.size != LINES || lines[0] != DOMAIN) return null
        val method = lines[1]
        if (method.isEmpty() || method != method.uppercase()) return null
        return sensitive || (method != "GET" && method != "HEAD")
    }
}
