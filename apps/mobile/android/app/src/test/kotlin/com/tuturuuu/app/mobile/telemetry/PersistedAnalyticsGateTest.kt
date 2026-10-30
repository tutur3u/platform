package com.tuturuuu.app.mobile.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PersistedAnalyticsGateTest {
    @Test
    fun seededUpgradeEnableIsDisabledBeforeSdkInitialization() {
        val disk = mutableMapOf(
            "measurement_enabled" to true,
            "measurement_enabled_from_api" to true,
            "flutter.telemetry-consent-choice" to true,
        )
        PersistedAnalyticsGate.disable { key, value -> disk[key] = value }
        val initializeSdk = {
            assertFalse(disk.getValue("measurement_enabled"))
            assertFalse(disk.getValue("measurement_enabled_from_api"))
        }
        initializeSdk()
        assertTrue(disk.getValue("flutter.telemetry-consent-choice"))
    }

    @Test
    fun onlySignedInAllowCanReenableCollection() {
        for (requested in listOf(false, true))
            for (signedIn in listOf(false, true))
                for (consent in listOf(false, true))
                    assertEquals(requested && signedIn && consent,
                        PersistedAnalyticsGate.mayEnable(requested, signedIn, consent))
    }

    @Test
    fun resetIsIdempotentAndAlsoCoversFreshInstalls() {
        val disk = mutableMapOf<String, Boolean>()
        repeat(2) { PersistedAnalyticsGate.disable { key, value -> disk[key] = value } }
        assertEquals(mapOf("measurement_enabled" to false, "measurement_enabled_from_api" to false), disk)
    }
}
