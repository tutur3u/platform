package com.tuturuuu.app.mobile.telemetry

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TelemetryConsentDecisionTest {
    private val choice = TelemetryConsentDecision.CHOICE_KEY
    private val version = TelemetryConsentDecision.NOTICE_VERSION_KEY
    private val current = TelemetryConsentDecision.CURRENT_NOTICE_VERSION

    @Test
    fun explicitAllowUnderTheCurrentNoticeIsTheOnlyYes() {
        assertTrue(TelemetryConsentDecision.allowsCollection(mapOf(choice to true, version to current,
            TelemetryConsentDecision.COPY_VERSION_KEY to TelemetryConsentDecision.CURRENT_COPY_VERSION)))
    }

    @Test
    fun noStoredAnswerMeansNo() {
        assertFalse(TelemetryConsentDecision.allowsCollection(emptyMap<String, Any>()))
    }

    @Test
    fun denyMeansNo() {
        assertFalse(TelemetryConsentDecision.allowsCollection(mapOf(choice to false, version to current)))
    }

    @Test
    fun anAnswerFromAnotherNoticeVersionIsVoid() {
        assertFalse(TelemetryConsentDecision.allowsCollection(mapOf(choice to true, version to "telemetry-consent-v0")))
        assertFalse(TelemetryConsentDecision.allowsCollection(mapOf(choice to true)))
    }

    @Test
    fun malformedValuesAreNeverConsent() {
        assertFalse(TelemetryConsentDecision.allowsCollection(mapOf(choice to "true", version to current)))
        assertFalse(TelemetryConsentDecision.allowsCollection(mapOf(choice to 1, version to current)))
        assertFalse(TelemetryConsentDecision.allowsCollection(mapOf(choice to null, version to current)))
    }

    @Test
    fun theLegacyRegionalKeyIsNeverConsent() {
        assertFalse(
            TelemetryConsentDecision.allowsCollection(
                mapOf("flutter.share-analytics-and-crash-reports" to true),
            ),
        )
    }
}
