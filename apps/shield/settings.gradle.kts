pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "rwt-shield"

// logic: plain Kotlin/JVM, testable without Android (plan A9). app: the thin Android TV shell.
include(":logic", ":app")
