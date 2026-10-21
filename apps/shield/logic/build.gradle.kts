import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

// Runs on the installed JDK 21, but emits Java 17 bytecode so the Android app can use it.
java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        allWarningsAsErrors.set(true)
    }
}

dependencies {
    implementation(libs.kotlinx.serialization.json)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    // Contract test: every payload is checked against packages/core/event.schema.json.
    testImplementation(libs.json.schema.validator)
}

tasks.test {
    useJUnitPlatform()
    // Shared with the TypeScript side: the event schema and the episode label fixtures.
    systemProperty("rwt.coreDir", rootProject.file("../../packages/core").absolutePath)
}
