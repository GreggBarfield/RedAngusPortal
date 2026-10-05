# apply_phase7b.ps1 - Small fix to the account menu (front end only; run after apply_phase7.ps1).
# Run from the F:\raaaa folder (the one that holds BackEnd and FrontEnd).
# It only replaces a file when that file is still exactly the last committed version.
$ErrorActionPreference = 'Stop'
& {
  $Root = (Get-Location).Path
  if (-not (Test-Path (Join-Path (Join-Path $Root 'BackEnd') 'package.json'))) { throw 'Run this from the folder that holds BackEnd (F:\raaaa).' }

  function Get-NormHash([byte[]]$bytes) {
    $text = [System.Text.Encoding]::UTF8.GetString($bytes).Replace("`r`n", "`n")
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))
    return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLower()
  }

  $files = New-Object System.Collections.ArrayList
  function Add-File([string]$path, [string]$old, [string]$new, [string]$b64) {
    [void]$files.Add(@{ Path = $path; Old = $old; New = $new; B64 = ($b64 -replace '\s', '') })
  }
  Add-File 'FrontEnd/src/components/Layout.tsx' 'e24765e760ad7bf38341146dcac8fbe92370805916480b7d9df2153ee874a35d' '9c07abd274915105f593634179516d6cecf1d5c134da092a64912c8806ad375d' @'
aW1wb3J0IHsgdXNlRWZmZWN0LCB1c2VSZWYsIHVzZVN0YXRlIH0gZnJvbSAncmVhY3QnCmltcG9ydCB0eXBlIHsgUmVhY3ROb2Rl
IH0gZnJvbSAncmVhY3QnCmltcG9ydCB7IExpbmssIE5hdkxpbmssIE91dGxldCwgdXNlTG9jYXRpb24sIHVzZU5hdmlnYXRlIH0g
ZnJvbSAncmVhY3Qtcm91dGVyLWRvbScKaW1wb3J0IHsgQ2hldnJvbkRvd24gfSBmcm9tICdsdWNpZGUtcmVhY3QnCmltcG9ydCB7
IGdldENhdHRsZVBlbmRpbmdDb3VudCB9IGZyb20gJ0AvbGliL2FwaScKaW1wb3J0IHsgdXNlQXV0aCB9IGZyb20gJ0AvbGliL2F1
dGgnCmltcG9ydCB7IGNuIH0gZnJvbSAnQC9saWIvdXRpbHMnCgovLyBBIGJ1dHRvbiB0aGF0IG9wZW5zIGEgc21hbGwgbWVudS4g
Q2xvc2VzIG9uIG91dHNpZGUgY2xpY2ssIEVzY2FwZSwgb3Igd2hlbiBhIGNob2ljZSBpcyBtYWRlLgpmdW5jdGlvbiBNZW51KHsg
bGFiZWwsIGNoaWxkcmVuIH06IHsgbGFiZWw6IHN0cmluZzsgY2hpbGRyZW46IFJlYWN0Tm9kZSB9KSB7CiAgY29uc3QgW29wZW4s
IHNldE9wZW5dID0gdXNlU3RhdGUoZmFsc2UpCiAgY29uc3QgYm94ID0gdXNlUmVmPEhUTUxEaXZFbGVtZW50PihudWxsKQogIGNv
bnN0IGxvY2F0aW9uID0gdXNlTG9jYXRpb24oKQoKICAvLyBDbG9zZSB3aGVuIHRoZSBwYWdlIGNoYW5nZXMgKG5vdCBvbiBmaXJz
dCBhcHBlYXJhbmNlLCB3aGljaCBjb3VsZCB1bmRvIGEgcXVpY2sgZmlyc3QgY2xpY2spLgogIGNvbnN0IGxhc3RQYXRoID0gdXNl
UmVmKGxvY2F0aW9uLnBhdGhuYW1lKQogIHVzZUVmZmVjdCgoKSA9PiB7CiAgICBpZiAobGFzdFBhdGguY3VycmVudCA9PT0gbG9j
YXRpb24ucGF0aG5hbWUpIHJldHVybgogICAgbGFzdFBhdGguY3VycmVudCA9IGxvY2F0aW9uLnBhdGhuYW1lCiAgICBzZXRPcGVu
KGZhbHNlKQogIH0sIFtsb2NhdGlvbi5wYXRobmFtZV0pCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGlmICghb3BlbikgcmV0dXJu
CiAgICBjb25zdCBhd2F5ID0gKGU6IE1vdXNlRXZlbnQpID0+IHsKICAgICAgaWYgKGJveC5jdXJyZW50ICYmICFib3guY3VycmVu
dC5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSkgc2V0T3BlbihmYWxzZSkKICAgIH0KICAgIGNvbnN0IGVzYyA9IChlOiBLZXli
b2FyZEV2ZW50KSA9PiB7CiAgICAgIGlmIChlLmtleSA9PT0gJ0VzY2FwZScpIHNldE9wZW4oZmFsc2UpCiAgICB9CiAgICBkb2N1
bWVudC5hZGRFdmVudExpc3RlbmVyKCdtb3VzZWRvd24nLCBhd2F5KQogICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigna2V5
ZG93bicsIGVzYykKICAgIHJldHVybiAoKSA9PiB7CiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNlZG93
bicsIGF3YXkpCiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBlc2MpCiAgICB9CiAgfSwgW29w
ZW5dKQoKICByZXR1cm4gKAogICAgPGRpdiByZWY9e2JveH0gY2xhc3NOYW1lPSJyZWxhdGl2ZSI+CiAgICAgIDxidXR0b24gdHlw
ZT0iYnV0dG9uIiBhcmlhLWhhc3BvcHVwPSJtZW51IiBhcmlhLWV4cGFuZGVkPXtvcGVufSBvbkNsaWNrPXsoKSA9PiBzZXRPcGVu
KChvKSA9PiAhbyl9IGNsYXNzTmFtZT0iaW5saW5lLWZsZXggaXRlbXMtY2VudGVyIGdhcC0xIHJvdW5kZWQtbWQgcHgtMyBweS0y
IHRleHQtc20gZm9udC1tZWRpdW0gaG92ZXI6YmctYWNjZW50Ij4KICAgICAgICB7bGFiZWx9CiAgICAgICAgPENoZXZyb25Eb3du
IGNsYXNzTmFtZT0ic2l6ZS00IiBhcmlhLWhpZGRlbj0idHJ1ZSIgLz4KICAgICAgPC9idXR0b24+CiAgICAgIHtvcGVuICYmICgK
ICAgICAgICA8ZGl2IHJvbGU9Im1lbnUiIGNsYXNzTmFtZT0iYWJzb2x1dGUgcmlnaHQtMCB6LTIwIG10LTEgbWluLXctNDggcm91
bmRlZC1tZCBib3JkZXIgYmctY2FyZCBwLTEgc2hhZG93LW1kIj4KICAgICAgICAgIHtjaGlsZHJlbn0KICAgICAgICA8L2Rpdj4K
ICAgICAgKX0KICAgIDwvZGl2PgogICkKfQoKZnVuY3Rpb24gTWVudUxpbmsoeyB0bywgY2hpbGRyZW4gfTogeyB0bzogc3RyaW5n
OyBjaGlsZHJlbjogUmVhY3ROb2RlIH0pIHsKICByZXR1cm4gKAogICAgPExpbmsgcm9sZT0ibWVudWl0ZW0iIHRvPXt0b30gY2xh
c3NOYW1lPSJibG9jayByb3VuZGVkLXNtIHB4LTMgcHktMiB0ZXh0LXNtIGhvdmVyOmJnLWFjY2VudCI+CiAgICAgIHtjaGlsZHJl
bn0KICAgIDwvTGluaz4KICApCn0KCmNvbnN0IHRvcExpbmsgPSAoeyBpc0FjdGl2ZSB9OiB7IGlzQWN0aXZlOiBib29sZWFuIH0p
ID0+CiAgY24oJ3JvdW5kZWQtbWQgcHgtMyBweS0yIHRleHQtc20gZm9udC1tZWRpdW0gaG92ZXI6YmctYWNjZW50JywgaXNBY3Rp
dmUgPyAndGV4dC1wcmltYXJ5JyA6ICd0ZXh0LWZvcmVncm91bmQnKQoKZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gTGF5b3V0KCkg
ewogIGNvbnN0IHsgdXNlciwgdG9rZW4sIGxvYWRpbmcsIGxvZ291dCB9ID0gdXNlQXV0aCgpCiAgY29uc3QgbmF2aWdhdGUgPSB1
c2VOYXZpZ2F0ZSgpCiAgY29uc3QgbG9jYXRpb24gPSB1c2VMb2NhdGlvbigpCiAgY29uc3QgW3BlbmRpbmcsIHNldFBlbmRpbmdd
ID0gdXNlU3RhdGUoMCkKICBjb25zdCBpc1N0YWZmID0gdXNlcj8ucm9sZSA9PT0gJ3N0YWZmJwoKICB1c2VFZmZlY3QoKCkgPT4g
ewogICAgaWYgKCFpc1N0YWZmIHx8ICF0b2tlbikgewogICAgICBzZXRQZW5kaW5nKDApCiAgICAgIHJldHVybgogICAgfQogICAg
bGV0IGNhbmNlbGxlZCA9IGZhbHNlCiAgICBQcm9taXNlLmFsbChbZ2V0Q2F0dGxlUGVuZGluZ0NvdW50KCdmZWVkZXInLCB0b2tl
biksIGdldENhdHRsZVBlbmRpbmdDb3VudCgnYnJlZWRpbmcnLCB0b2tlbildKQogICAgICAudGhlbigoW2EsIGJdKSA9PiB7CiAg
ICAgICAgaWYgKCFjYW5jZWxsZWQpIHNldFBlbmRpbmcoYS5wZW5kaW5nICsgYi5wZW5kaW5nKQogICAgICB9KQogICAgICAuY2F0
Y2goKCkgPT4ge30pCiAgICByZXR1cm4gKCkgPT4gewogICAgICBjYW5jZWxsZWQgPSB0cnVlCiAgICB9CiAgfSwgW2lzU3RhZmYs
IHRva2VuLCBsb2NhdGlvbi5wYXRobmFtZV0pCgogIHJldHVybiAoCiAgICA8ZGl2IGNsYXNzTmFtZT0iZmxleCBtaW4taC1zY3Jl
ZW4gZmxleC1jb2wiPgogICAgICA8aGVhZGVyIGNsYXNzTmFtZT0iYm9yZGVyLWIgYmctY2FyZCI+CiAgICAgICAgPGRpdiBjbGFz
c05hbWU9Im14LWF1dG8gZmxleCBtaW4taC0xNCB3LWZ1bGwgbWF4LXctWzE2MDBweF0gZmxleC13cmFwIGl0ZW1zLWNlbnRlciBq
dXN0aWZ5LWJldHdlZW4gZ2FwLTIgcHgtNCBzbTpweC02Ij4KICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPSJmbGV4IGZsZXgtd3Jh
cCBpdGVtcy1jZW50ZXIgZ2FwLTEiPgogICAgICAgICAgICA8TGluayB0bz0iLyIgY2xhc3NOYW1lPSJtci00IGZvbnQtc2VtaWJv
bGQgdHJhY2tpbmctdGlnaHQiPgogICAgICAgICAgICAgIFJlZCBBbmd1cyBQb3J0YWwKICAgICAgICAgICAgPC9MaW5rPgogICAg
ICAgICAgICA8TmF2TGluayB0bz0iL3NlYXJjaC9mZWVkZXIiIGNsYXNzTmFtZT17KCkgPT4gdG9wTGluayh7IGlzQWN0aXZlOiBs
b2NhdGlvbi5wYXRobmFtZS5zdGFydHNXaXRoKCcvc2VhcmNoJykgfSl9PgogICAgICAgICAgICAgIFNlYXJjaCBGb3IgQ2F0dGxl
CiAgICAgICAgICAgIDwvTmF2TGluaz4KICAgICAgICAgICAgPE5hdkxpbmsgdG89Ii9saXN0L2ZlZWRlciIgY2xhc3NOYW1lPXso
KSA9PiB0b3BMaW5rKHsgaXNBY3RpdmU6IGxvY2F0aW9uLnBhdGhuYW1lLnN0YXJ0c1dpdGgoJy9saXN0JykgfSl9PgogICAgICAg
ICAgICAgIExpc3QgWW91ciBDYXR0bGUKICAgICAgICAgICAgPC9OYXZMaW5rPgogICAgICAgICAgPC9kaXY+CiAgICAgICAgICA8
bmF2IGNsYXNzTmFtZT0iZmxleCBpdGVtcy1jZW50ZXIgZ2FwLTEiIGFyaWEtbGFiZWw9IkFjY291bnQiPgogICAgICAgICAgICB7
aXNTdGFmZiAmJiAoCiAgICAgICAgICAgICAgPE1lbnUgbGFiZWw9e3BlbmRpbmcgPiAwID8gYFN0YWZmIFRvb2xzICgke3BlbmRp
bmd9KWAgOiAnU3RhZmYgVG9vbHMnfT4KICAgICAgICAgICAgICAgIDxNZW51TGluayB0bz0iL3N0YWZmL3JldmlldyI+UmV2aWV3
IGxpc3Rpbmdze3BlbmRpbmcgPiAwID8gYCAoJHtwZW5kaW5nfSlgIDogJyd9PC9NZW51TGluaz4KICAgICAgICAgICAgICAgIDxN
ZW51TGluayB0bz0iL2Jhcm5zIj5TYWxlIGJhcm5zPC9NZW51TGluaz4KICAgICAgICAgICAgICA8L01lbnU+CiAgICAgICAgICAg
ICl9CiAgICAgICAgICAgIHtsb2FkaW5nID8gbnVsbCA6IHVzZXIgPyAoCiAgICAgICAgICAgICAgPE1lbnUgbGFiZWw9e3VzZXIu
ZGlzcGxheU5hbWV9PgogICAgICAgICAgICAgICAgPE1lbnVMaW5rIHRvPSIvbXktbGlzdGluZ3MiPk15IGxpc3RpbmdzPC9NZW51
TGluaz4KICAgICAgICAgICAgICAgIDxNZW51TGluayB0bz0iL2FjY291bnQiPkFjY291bnQ8L01lbnVMaW5rPgogICAgICAgICAg
ICAgICAgPGJ1dHRvbgogICAgICAgICAgICAgICAgICB0eXBlPSJidXR0b24iCiAgICAgICAgICAgICAgICAgIHJvbGU9Im1lbnVp
dGVtIgogICAgICAgICAgICAgICAgICBjbGFzc05hbWU9ImJsb2NrIHctZnVsbCByb3VuZGVkLXNtIHB4LTMgcHktMiB0ZXh0LWxl
ZnQgdGV4dC1zbSBob3ZlcjpiZy1hY2NlbnQiCiAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHsKICAgICAgICAgICAg
ICAgICAgICBsb2dvdXQoKQogICAgICAgICAgICAgICAgICAgIG5hdmlnYXRlKCcvJykKICAgICAgICAgICAgICAgICAgfX0KICAg
ICAgICAgICAgICAgID4KICAgICAgICAgICAgICAgICAgU2lnbiBvdXQKICAgICAgICAgICAgICAgIDwvYnV0dG9uPgogICAgICAg
ICAgICAgIDwvTWVudT4KICAgICAgICAgICAgKSA6ICgKICAgICAgICAgICAgICA8PgogICAgICAgICAgICAgICAgPExpbmsgdG89
Ii9sb2dpbiIgY2xhc3NOYW1lPSJyb3VuZGVkLW1kIHB4LTMgcHktMiB0ZXh0LXNtIGZvbnQtbWVkaXVtIGhvdmVyOmJnLWFjY2Vu
dCI+CiAgICAgICAgICAgICAgICAgIFNpZ24gaW4KICAgICAgICAgICAgICAgIDwvTGluaz4KICAgICAgICAgICAgICAgIDxMaW5r
IHRvPSIvcmVnaXN0ZXIiIGNsYXNzTmFtZT0icm91bmRlZC1tZCBiZy1wcmltYXJ5IHB4LTMgcHktMiB0ZXh0LXNtIGZvbnQtbWVk
aXVtIHRleHQtcHJpbWFyeS1mb3JlZ3JvdW5kIGhvdmVyOmJnLXByaW1hcnkvOTAiPgogICAgICAgICAgICAgICAgICBDcmVhdGUg
YWNjb3VudAogICAgICAgICAgICAgICAgPC9MaW5rPgogICAgICAgICAgICAgIDwvPgogICAgICAgICAgICApfQogICAgICAgICAg
PC9uYXY+CiAgICAgICAgPC9kaXY+CiAgICAgIDwvaGVhZGVyPgogICAgICA8ZGl2IGNsYXNzTmFtZT0iZmxleC0xIj4KICAgICAg
ICA8T3V0bGV0IC8+CiAgICAgIDwvZGl2PgogICAgICA8Zm9vdGVyIGNsYXNzTmFtZT0iYm9yZGVyLXQgYmctY2FyZCI+CiAgICAg
ICAgPGRpdiBjbGFzc05hbWU9Im14LWF1dG8gZmxleCB3LWZ1bGwgbWF4LXctWzE2MDBweF0gZmxleC13cmFwIGl0ZW1zLWNlbnRl
ciBqdXN0aWZ5LWJldHdlZW4gZ2FwLTIgcHgtNCBweS00IHRleHQtc20gdGV4dC1tdXRlZC1mb3JlZ3JvdW5kIHNtOnB4LTYiPgog
ICAgICAgICAgPHNwYW4+UmVkIEFuZ3VzIEFzc29jaWF0aW9uIE1hcmtldGluZyBQb3J0YWw8L3NwYW4+CiAgICAgICAgICA8TGlu
ayB0bz0iL2Jhcm5zIiBjbGFzc05hbWU9ImhvdmVyOnRleHQtZm9yZWdyb3VuZCBob3Zlcjp1bmRlcmxpbmUiPgogICAgICAgICAg
ICBTYWxlIGJhcm5zCiAgICAgICAgICA8L0xpbms+CiAgICAgICAgPC9kaXY+CiAgICAgIDwvZm9vdGVyPgogICAgPC9kaXY+CiAg
KQp9Cg==
'@

  # Check everything first; change nothing unless every file is as expected.
  $problems = @()
  $todo = @()
  foreach ($f in $files) {
    $target = Join-Path $Root ($f.Path.Replace('/', [string][System.IO.Path]::DirectorySeparatorChar))
    if ($f.New -eq 'DELETE') {
      if (-not (Test-Path $target)) { Write-Host ('  already removed     ' + $f.Path); continue }
      $cur = Get-NormHash ([System.IO.File]::ReadAllBytes($target))
      if ($cur -eq $f.Old) { $todo += $f } else { $problems += ('  ' + $f.Path + ' is not the committed version (someone changed it)') }
      continue
    }
    if (Test-Path $target) {
      $cur = Get-NormHash ([System.IO.File]::ReadAllBytes($target))
      if ($cur -eq $f.New) { Write-Host ('  already up to date  ' + $f.Path); continue }
      if ($f.Old -ne '' -and $cur -eq $f.Old) { $todo += $f; continue }
      $problems += ('  ' + $f.Path + ' is not the committed version (someone changed it)')
    } else {
      if ($f.Old -ne '') { $problems += ('  ' + $f.Path + ' is missing') } else { $todo += $f }
    }
  }
  if ($problems.Count -gt 0) {
    Write-Host 'Nothing was changed. Problems found:' -ForegroundColor Red
    $problems | ForEach-Object { Write-Host $_ -ForegroundColor Red }
    throw 'Stopped. Send me this output.'
  }
  foreach ($f in $todo) {
    $target = Join-Path $Root ($f.Path.Replace('/', [string][System.IO.Path]::DirectorySeparatorChar))
    if ($f.New -eq 'DELETE') { Remove-Item -Path $target -Force; Write-Host ('  removed  ' + $f.Path); continue }
    $dir = Split-Path $target -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    [System.IO.File]::WriteAllBytes($target, [System.Convert]::FromBase64String($f.B64))
    $verb = 'updated'
    if ($f.Old -eq '') { $verb = 'added  ' }
    Write-Host ('  ' + $verb + '  ' + $f.Path)
  }
  Write-Host ''
  Write-Host ('Done. ' + $todo.Count + ' file(s) written.') -ForegroundColor Green
}
