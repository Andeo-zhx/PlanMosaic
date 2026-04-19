# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ==================== Kotlin Serialization ====================
-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature, Exceptions
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *; }
-keepclassmembers class kotlin.Metadata { *; }

# Keep all serializable classes
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
    @kotlinx.serialization.Serializable <fields>;
}
-keep @kotlinx.serialization.Serializable class *

# ==================== Supabase & Ktor ====================
-keep class io.github.jan.supabase.** { *; }
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# ==================== DataStore ====================
-keep class androidx.datastore.** { *; }

# ==================== Jetpack Compose ====================
-keep class androidx.compose.** { *; }
-keep class androidx.compose.ui.** { *; }
-keep class androidx.compose.runtime.** { *; }

# ==================== Application Classes ====================
-keep class com.example.planmosaic_android.** { *; }
-keep class com.example.planmosaic_android.data.model.** { *; }
-keep class com.example.planmosaic_android.ui.screens.** { *; }
-keep class com.example.planmosaic_android.util.** { *; }

# Keep Application class
-keep class com.example.planmosaic_android.PlanMosaicApplication { *; }

# Keep MainActivity
-keep class com.example.planmosaic_android.MainActivity { *; }

# ==================== Coroutines ====================
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# ==================== Remove Logging in Release ====================
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
}

# ==================== General ====================
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# Keep R class
-keepclassmembers class **.R$* {
    public static <fields>;
}

# Keep enum classes
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable classes
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
