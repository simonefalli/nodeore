On Error Resume Next
Dim app, rpt, ctl

Set app = GetObject(, "Access.Application")
If Err.Number <> 0 Then
    WScript.Echo "Error attaching to running Access: " & Err.Description
    WScript.Quit 1
End If

WScript.Echo "Connected to running Access instance!"
WScript.Echo "Current DB: " & app.CurrentDb.Name

' Let's check open reports
WScript.Echo "Open reports count: " & app.Reports.Count
For i = 0 To app.Reports.Count - 1
    WScript.Echo "Open Report: " & app.Reports(i).Name
Next

' Open F-10-R-REPORTFATTURAELETTRONICA in design view
app.DoCmd.OpenReport "F-10-R-REPORTFATTURAELETTRONICA", 1 ' acViewDesign = 1
If Err.Number <> 0 Then
    WScript.Echo "Error opening F-10-R in design: " & Err.Description
    Err.Clear
Else
    Set rpt = app.Reports("F-10-R-REPORTFATTURAELETTRONICA")
    WScript.Echo vbCrLf & "=== REPORT F-10-R-REPORTFATTURAELETTRONICA ==="
    WScript.Echo "RecordSource: " & rpt.RecordSource
    
    WScript.Echo vbCrLf & "--- CONTROLS LIST ---"
    For Each ctl In rpt.Controls
        Dim cs, val
        cs = ""
        On Error Resume Next
        cs = ctl.ControlSource
        On Error GoTo 0
        
        Dim nm
        nm = ctl.Name
        If InStr(UCase(nm), "RAGIONE") > 0 Or InStr(UCase(nm), "AZIEND") Or InStr(UCase(nm), "LOGO") Or InStr(UCase(nm), "TITOLO") Or InStr(UCase(nm), "INTEST") Or InStr(UCase(nm), "PIVA") Or InStr(UCase(nm), "CF") Or InStr(UCase(nm), "INDIRIZZO") Or InStr(UCase(cs), "RAGIONE") > 0 Or InStr(UCase(cs), "DLOOKUP") > 0 Or InStr(UCase(cs), "AZIENDA") > 0 Then
            WScript.Echo "Control: " & ctl.Name & " | Type: " & TypeName(ctl) & " | ControlSource: " & cs
        End If
    Next

    ' Check module
    If rpt.HasModule Then
        WScript.Echo vbCrLf & "--- REPORT VBA CODE ---"
        Dim mdl
        Set mdl = rpt.Module
        If mdl.CountOfLines > 0 Then
            WScript.Echo mdl.Lines(1, mdl.CountOfLines)
        End If
    End If
End If
