' Spent launcher. Runs node + next start without a visible console window.
' wscript.exe is a GUI-subsystem host (no console attached), and WshShell.Run
' with intWindowStyle=0 + bWaitOnReturn=True keeps wscript alive as the parent
' so Task Scheduler can manage the lifecycle through its Job Object.
Option Explicit
Dim shell
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "{{repoRoot}}"
shell.Run """{{nodePath}}"" ""{{repoRoot}}\node_modules\next\dist\bin\next"" start -H 127.0.0.1 -p {{port}}", 0, True
Set shell = Nothing
