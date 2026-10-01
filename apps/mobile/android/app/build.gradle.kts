import java.util.Properties
import java.io.FileInputStream
import com.google.firebase.crashlytics.buildtools.gradle.CrashlyticsExtension
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

val productionReleaseRequested = gradle.startParameter.taskNames.any {
    it.contains("ProductionRelease", ignoreCase = true)
}

android {
    namespace = "com.tuturuuu.app.mobile"
    // flutter_pcm_sound pulls AndroidX artifacts that require compileSdk 34+.
    compileSdk = maxOf(flutter.compileSdkVersion, 34)
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        // Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.tuturuuu.app.mobile"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (System.getenv("ANDROID_KEYSTORE_PATH") != null) {
                storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH"))
                keyAlias = System.getenv("ANDROID_KEYSTORE_ALIAS")
                keyPassword = System.getenv("ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD")
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")

            } else {
                keyAlias = keystoreProperties["keyAlias"] as String?
                keyPassword = keystoreProperties["keyPassword"] as String?
                storeFile = keystoreProperties["storeFile"]?.let { file(it) }
                storePassword = keystoreProperties["storePassword"] as String?
            }
        }
    }

    flavorDimensions += "default"
    productFlavors {
        create("production") {
            dimension = "default"
            applicationIdSuffix = ""
            manifestPlaceholders["appName"] = "Tuturuuu"
        }
        create("staging") {
            dimension = "default"
            applicationIdSuffix = ".stg"
            manifestPlaceholders["appName"] = "[STG] Tuturuuu"
        }
        create("development") {
            dimension = "default"
            applicationIdSuffix = ".dev"
            manifestPlaceholders["appName"] = "[DEV] Tuturuuu"
            // Use debug signing for dev flavor release builds.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildTypes {
        getByName("release") {
            // Disable Crashlytics mapping uploads for dev/CI builds
            configure<CrashlyticsExtension> {
                mappingFileUploadEnabled = false
            }
            // Only apply release signing if a valid keystore is configured;
            // otherwise let flavor-level signingConfig (e.g. debug for dev) take effect.
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile?.exists() == true) {
                signingConfig = releaseSigning
            } else if (productionReleaseRequested) {
                throw GradleException(
                    "Production release signing is required. Configure the protected Android upload keystore before building."
                )
            }
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android.txt"),
                "proguard-rules.pro"
            )
        }
        getByName("debug") {
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_11)
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation(platform("com.google.firebase:firebase-bom:34.9.0"))
    implementation("com.google.firebase:firebase-analytics")
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.3.10")
    implementation("com.squareup.okhttp3:okhttp:5.3.2")
}

// The installed WebRTC capturer drops Android's OS revoke/lock callback. Replace
// exactly one pinned source in generated build storage, never mutate pub-cache.
val webRtcProject = project(":flutter_webrtc")
webRtcProject.plugins.withId("com.android.library") {
    webRtcProject.extensions.configure<com.android.build.gradle.LibraryExtension> {
        val mainJava = sourceSets.getByName("main").java
        val originalRoots = mainJava.srcDirs.toList()
        val relativeCapturer = "com/cloudwebrtc/webrtc/OrientationAwareScreenCapturer.java"
        val upstreamCapturer = webRtcProject.file("src/main/java/$relativeCapturer")
        val upstreamPubspec = webRtcProject.file("../pubspec.yaml")
        val generatedJava = webRtcProject.layout.buildDirectory.dir("generated/meet-webrtc/java")
        val overlayRoot = rootProject.file("overlays/flutter_webrtc")
        val prepareMeetWebRtc = webRtcProject.tasks.register<Sync>("prepareMeetWebRtcSources") {
            inputs.file(upstreamCapturer)
            inputs.file(upstreamPubspec)
            from(originalRoots) { exclude(relativeCapturer) }
            from(overlayRoot) { include(relativeCapturer) }
            into(generatedJava)
            doFirst {
                val version = Regex("(?m)^version: *([^\r\n]+)")
                    .find(upstreamPubspec.readText())?.groupValues?.get(1)?.trim()
                val hash = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(upstreamCapturer.readBytes())
                    .joinToString("") { "%02x".format(it.toInt() and 0xff) }
                check(version == "1.6.2+hotfix.3" &&
                    hash == "347ae60171cd831eb0fb28df7deeb6e81205881dac085eb3980e33edbe97a070") {
                    "Meet WebRTC overlay requires reviewed flutter_webrtc 1.6.2+hotfix.3 source; review the overlay before upgrading."
                }
                check(overlayRoot.resolve(relativeCapturer).isFile) {
                    "Meet WebRTC capturer overlay is missing."
                }
            }
        }
        mainJava.setSrcDirs(listOf(generatedJava))
        webRtcProject.tasks.configureEach {
            if (name.startsWith("compile") || name.startsWith("lint")) {
                dependsOn(prepareMeetWebRtc)
            }
        }
    }
}
