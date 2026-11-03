package com.tuturuuu.app.mobile.iris

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class IrisSignPolicyTest {
    private val device = "0f1e2d3c-4b5a-8978-8695-a4b3c2d1e0f0"
    private val key = "11111111-2222-4333-8444-555555555555"
    private val digest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    private fun canonical(method: String, idempotencyKey: String) = listOf(
        IrisSignPolicy.DOMAIN, method, "/v1/iris/send", digest, "1700000000",
        "00112233445566778899aabbccddeeff", device, idempotencyKey,
    ).joinToString("\n").toByteArray()

    @Test
    fun aWriteAlwaysPromptsWhateverTheFlagSays() {
        assertEquals(true, IrisSignPolicy.mustPrompt(canonical("POST", key), sensitive = false))
        assertEquals(true, IrisSignPolicy.mustPrompt(canonical("DELETE", key), sensitive = false))
    }

    @Test
    fun aReadMayUseTheSession() {
        assertEquals(false, IrisSignPolicy.mustPrompt(canonical("GET", ""), sensitive = false))
        assertEquals(false, IrisSignPolicy.mustPrompt(canonical("HEAD", ""), sensitive = false))
        assertEquals(true, IrisSignPolicy.mustPrompt(canonical("GET", ""), sensitive = true))
    }

    @Test
    fun anythingButAV3StringIsRefused() {
        val legacy = listOf("POST", "/v1/iris/send", digest, "1700000000", "nonce", device)
            .joinToString("\n").toByteArray()
        assertNull(IrisSignPolicy.mustPrompt(legacy, sensitive = false))
        assertNull(IrisSignPolicy.mustPrompt(canonical("post", key), sensitive = false))
        assertNull(IrisSignPolicy.mustPrompt(canonical("GET", "") + "\n".toByteArray(), sensitive = false))
        assertNull(IrisSignPolicy.mustPrompt(byteArrayOf(0xC3.toByte(), 0x28), sensitive = false))
        val other = canonical("GET", "").toString(Charsets.UTF_8).replaceFirst("v3", "v2")
        assertNull(IrisSignPolicy.mustPrompt(other.toByteArray(), sensitive = false))
    }
}
