import org.gradle.api.tasks.compile.JavaCompile

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()

rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)

    tasks.withType<JavaCompile>().configureEach {
        // Several third-party Flutter plugins still target Java 8. JDK 21
        // reports that target as obsolete even though Android still supports
        // the resulting bytecode, so keep dependency warnings out of the app's
        // release signal while app-owned code remains on Java 11.
        options.compilerArgs.addAll(
            listOf(
                "-nowarn",
                "-Xlint:-options",
                "-Xlint:-deprecation",
                "-Xlint:-unchecked"
            )
        )
    }
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}

plugins {
  id("com.google.gms.google-services") version "4.4.4" apply false
}
