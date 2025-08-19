@echo off
setlocal enabledelayedexpansion

REM Windows batch file for updating all packages in the project

REM Update root dependencies
call bun update

REM Update apps
pushd apps
for /d %%i in (*) do (
    echo Updating apps/%%i...
    pushd "%%i"
    call bun update
    popd
)
popd

REM Update packages
pushd packages
for /d %%i in (*) do (
    echo Updating packages/%%i...
    pushd "%%i"
    call bun update
    popd
)
popd