; Graham Bridge — per-user Windows installer (no admin)
; Built in CI with Inno Setup 6. Version is patched by the workflow.

#define MyAppName "Graham Bridge"
#define MyAppVersion "dev"
#define MyAppPublisher "Graham The TVI"
#define MyAppURL "https://grahambrailleeditor.com/"
#define MyAppExeName "graham-bridge.exe"

[Setup]
AppId={{A8F3C2E1-9B47-4D6A-8E21-7C4B91F0A203}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\GrahamBridge
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=graham-bridge-windows-setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}
CloseApplications=force
SetupIconFile=

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "startupicon"; Description: "Start {#MyAppName} when I log in"; Flags: checkedonce

[Files]
Source: "..\graham-bridge-windows.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
