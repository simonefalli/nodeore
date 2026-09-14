WScript.Echo "1. Avvio dello script..."
On Error Resume Next

Dim objConn
WScript.Echo "2. Tento di inizializzare il componente ADODB.Connection base..."
Set objConn = CreateObject("ADODB.Connection")

If Err.Number <> 0 Then
    WScript.Echo "❌ ERRORE CRITICO DI WINDOWS: Impossibile creare l'oggetto ADODB (" & Err.Description & ")"
    WScript.Quit
End If

WScript.Echo "3. Componente base creato con successo. Tento la connessione al DB (Driver 16.0)..."
objConn.Open "Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\TUTTEBASIDATIATTIVE\BASIDATI\test.accdb;"

If Err.Number = 0 Then
    WScript.Echo "✅ OK! Motore 16.0 funzionante."
    objConn.Close
Else
    WScript.Echo "❌ Errore 16.0: " & Err.Description
End If