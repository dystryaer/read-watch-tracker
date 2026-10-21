plugins {
    // AGP 9 compiles Kotlin itself (built-in Kotlin), so no separate Kotlin Android plugin.
    alias(libs.plugins.android.application)
}

android {
    namespace = "app.rwt.shield"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.rwt.shield"
        minSdk = 30
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Sideloaded with adb (SPEC §8.2), never published: the debug key is enough to install it.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(project(":logic"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.work.runtime)
    implementation(libs.zxing.core)
}
