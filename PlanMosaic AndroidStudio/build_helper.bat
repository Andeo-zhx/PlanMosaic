@echo off
set JAVA_HOME=D:\Programs\Android Studio\jbr
cd /d "D:\Trae CN\Projects\PlanMosaic\PlanMosaic AndroidStudio"
call gradlew.bat clean assembleDebug --no-daemon
