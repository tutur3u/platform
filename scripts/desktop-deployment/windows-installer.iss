#ifndef AppVersion
  #error AppVersion must be supplied by CI
#endif
#ifndef BuildRoot
  #error BuildRoot must be supplied by CI
#endif
#ifndef OutputRoot
  #error OutputRoot must be supplied by CI
#endif

[Setup]
AppId={{BBA9E03B-D1D8-43C6-96D9-865107D53E7E}
AppName=Tuturuuu Beta
AppVersion={#AppVersion}
AppPublisher=Tuturuuu
AppPublisherURL=https://tuturuuu.com
AppSupportURL=https://tuturuuu.com/contact
DefaultDirName={localappdata}\Programs\Tuturuuu
DefaultGroupName=Tuturuuu
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#OutputRoot}
OutputBaseFilename=Tuturuuu-windows-x64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\tuturuuu.exe
CloseApplications=yes
ChangesAssociations=yes

[Files]
Source: "{#BuildRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb,*.lib,*.exp,*.ilk,*.env,*.p12,*.pfx,*.pem,*.key"

[Icons]
Name: "{autoprograms}\Tuturuuu Beta"; Filename: "{app}\tuturuuu.exe"

[Registry]
Root: HKCU; Subkey: "Software\Classes\com.tuturuuu.app.mobile"; ValueType: string; ValueName: ""; ValueData: "URL:Tuturuuu"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\com.tuturuuu.app.mobile"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\com.tuturuuu.app.mobile\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\tuturuuu.exe"" ""%1"""

[Run]
Filename: "{app}\tuturuuu.exe"; Description: "Launch Tuturuuu Beta"; Flags: nowait postinstall skipifsilent
