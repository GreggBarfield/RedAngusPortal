$Base = 'C:\raaaa'
$Site = 'redangus.blocktrustnetwork.com'
$ZipPath = ''
$Scheme = 'https'
$Port = 443
$ApiUrl = 'http://localhost:4200'
& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
function Step([string]$m) { Write-Host ''; Write-Host ('== ' + $m) }
function Fail([string]$m) { Write-Host ('STOP: ' + $m); throw $m }
function Sep([string]$p) { return $p.Replace('/', [string][System.IO.Path]::DirectorySeparatorChar) }
function Hash([string]$p) { return (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower() }

$expected = @{
    'BackEnd/migrations/001_users.sql' = 'dc335c9c0a2dd86876ab75defd4a27f2098181929d93c901f837616270fc5b5d'
    'BackEnd/migrations/002_barn_settings.sql' = '2c7cc24d8e88101806bc3e27dce64c364f69866ffe57c43be0e93a7d16f7343f'
    'BackEnd/package.json' = '123f1a8a5e95bbedf2289bab919bc039733d0dd346bcf73aeff5eb02c42f7597'
    'BackEnd/src/app.js' = 'c03bc14ce8b2c95c9b0130e1034da772159f37c68ab5c43e6808d0c31e9c9496'
    'BackEnd/src/auth.js' = 'ae68ac2c44deb6478ebda23837fa1b100a267d71acf25c14e7987da471301e16'
    'BackEnd/src/barns.js' = '984611ccb48c086f41e90e36faea58e39bc5165f696ab8d391c15402f60984b5'
    'BackEnd/src/btn.js' = 'dd21bb89cc0649174bd29b3a2ba6c9f03f0f57eea89e446f31733b4a00197946'
    'BackEnd/src/config.js' = '61252fcb67a0127083aa0dc41e5807e70af5241b1c2607cbe0a63c10d5d461eb'
    'BackEnd/src/db.js' = '79c193be60911b3d0cb588562b9b55675247d27054892f8a640d1e22614aaa6e'
    'BackEnd/src/migrate.js' = '6ad2bf16c13b84bf3ea4001e87b729b91526ed89a0632b944e290d528c3d53d7'
    'BackEnd/src/rateLimit.js' = 'af42fafe40896e802849afef7abf6905e69ecb0e4c49834191b2c44092a66281'
    'BackEnd/src/routes/auth.js' = '86c9e896f6f3144522a1659fa87a264bb3e157c4ce2d14a6db6f772508056aba'
    'BackEnd/src/routes/barns.js' = '19d8ec02bc86c6bf77d22ddc99ada5acc6b333de827cfa9cb430e41fa8e032a8'
    'BackEnd/src/server.js' = '82d0ddfdd626337d4e44126c0e0d0aa74acbcdf86666e2635f3efa5561355f14'
    'BackEnd/src/users.js' = '2261c35e4d4bfa2753b6812dc01aa669d583962e1e51c7e0afc6fa286073f11e'
    'BackEnd/tests/auth.test.js' = '7faf2de0208dadc32a5562928ef763e67682ef5d1b123b22c236c0d6b560d38b'
    'BackEnd/tests/barns.integration.test.js' = '7b27e50ff4deeef3c44caef189abfd1be5824b6c6676a0cf7051d92b4f2d665c'
    'BackEnd/tests/barns.test.js' = '7717d67dd8f96623d9b858ee593e8ffb21381be3ff7b268d04fddec90f571ffc'
    'BackEnd/tests/database.integration.test.js' = '8ccde937e024e1957b7b4272c1a6beae86df81cad47edc245e1279da4b1a555b'
    'BackEnd/tests/health.test.js' = 'b717c66cbd12459defa3700c72af3b3deed5c76d437282c8b11956770c805458'
    'FrontEnd/index.html' = '8df44bf254398e12ea63fc05d2088c139cc3694264173f7928fbfd8427f6602e'
    'FrontEnd/package.json' = 'c9a15df0acd57023fea86db25d71088207f220d36fc7264d1dbd7fa654371026'
    'FrontEnd/src/App.test.tsx' = '4ef0e462a80e2400bac34a637c91431f1729b04b411f0ad21060b60f67f30a81'
    'FrontEnd/src/App.tsx' = 'da451a64e3b2543c021b52921571264c64715152cb37afc16767c84a0c785190'
    'FrontEnd/src/auth.test.tsx' = '0c716b9487cdf015983ae2894e90d14c72d76b0c53e1c9197d760b2a9943e464'
    'FrontEnd/src/barns.test.tsx' = '594e398591e9222c1acf4bc87f6db98cb65f18919548a99309f57337c668b5d3'
    'FrontEnd/src/components/FormField.tsx' = 'b07fe0cc95fee9373dd5a86030e778823f2e8ff5c050202c6125bd64308c371e'
    'FrontEnd/src/components/Layout.tsx' = '5253f1c1ccfdc34ab8cb31c232ed2ef64548620469480d531ad56a4bde88ca6a'
    'FrontEnd/src/components/RequireAuth.tsx' = '752c4f97a62f1a74261517235fc137d72fdbc2dea774514953c95996602cc9b2'
    'FrontEnd/src/components/ui/badge.tsx' = '8e9799870b405eae565e4e3e887794be2297170792bb7c46a56c699a362f1e8b'
    'FrontEnd/src/components/ui/button.tsx' = '6403ff9067b8aca2273ffca34e1fa65f81e04bbdfe2dfe624c29e76cdcd7384e'
    'FrontEnd/src/components/ui/card.tsx' = '6fa523fd312a9188fb519adc4df8048238430972306508e5748a77098649a870'
    'FrontEnd/src/components/ui/input.tsx' = 'ad6078839c5e48597acb492edf6e3f9d0ec82de7b60263eb66b03062e0816189'
    'FrontEnd/src/components/ui/label.tsx' = '56f27bec35bf7371bf0dd90d87d4c8cb27c0ddd78883ac12106126fcab0fa071'
    'FrontEnd/src/components/ui/select.tsx' = '7c34a9f72f4ba4ea64a9f43a86b392e9edcdceef8f6c4399a01c91bed4c5ccd7'
    'FrontEnd/src/index.css' = '5c33eced847c2ade0b1da80db259d785892689ff6a8b2f5a35b136a88a0ab4c5'
    'FrontEnd/src/lib/api.ts' = '41320b3529899db87e92883174c784188f4ca56d5376282e805a7c763f933491'
    'FrontEnd/src/lib/auth.tsx' = '3147c7621f63a1aa19bb2825ce27c3c8b0d8cfbe7cef2f03042d75a413ef8fb7'
    'FrontEnd/src/lib/utils.ts' = 'e46429536f43f5910f5b2b0c50bb2769b510a4558bb4b5d20a3b0a9091dbf7c3'
    'FrontEnd/src/main.tsx' = '5ebc610f9d9b54885755587ac0d9fc83e751b25393994431e9ce3c596e033552'
    'FrontEnd/src/pages/Account.tsx' = 'aa982dc067886d28262ab05118edbd86a1e5eac98c3e885daec142e608ace30f'
    'FrontEnd/src/pages/BarnDetail.tsx' = 'a70a2bcfdeafb4b0a5a57461d94be72728676241f000ef0f6fef27acda371733'
    'FrontEnd/src/pages/Barns.tsx' = '1249f56fa545ff0d9493972a8d1dbd9f53c642012c4f51e8b336f63d29d993b0'
    'FrontEnd/src/pages/Home.tsx' = '6abfe8c6a561a0217aea8d276834a91672249d40c72fd165842aa0254398a8c4'
    'FrontEnd/src/pages/Login.tsx' = '091a400a47a3ee124c80c74bc07a0aac433f18693c7eba2cfd9350e1d64c2dcd'
    'FrontEnd/src/pages/NotFound.tsx' = 'c1fb7abb05e1a32060143f79219da1f809225b2ebf015bc465d2879de7e299d3'
    'FrontEnd/src/pages/Register.tsx' = 'a706facbcf96cc85b1f922ad8c996656b1a2cd9cb02f6ad731b26b9836f3c9cd'
    'FrontEnd/src/test/setup.ts' = '977afde26bba6a51325908cd7713cbfdc87d18f06b78b237c8f364c44864b7de'
    'FrontEnd/tsconfig.app.json' = 'd6ab44801b3b49225066086a30e36b9943a3ea919646975e734e8ccec6a8d4f4'
    'FrontEnd/tsconfig.json' = '770b4140bbb581e2dfd9ea9946ffc9c75a1d86ba7d2db5f77c83e37cbdf9d808'
    'FrontEnd/tsconfig.node.json' = '402c5c574255ad51ad11f30608d956b311828b9b0ee265627598dda5e52cc9b3'
    'FrontEnd/vite.config.ts' = 'bfcd8b47eb328ecca735cae5a64d8237d873bc8e008bf1defb2cd64e6747b827'
}

Step 'Checks (nothing is changed)'
$liveBack = Join-Path $Base 'backend'
$liveFront = Join-Path $Base 'frontend'
if (-not (Test-Path (Join-Path $liveBack 'src\server.js'))) { Fail 'live backend not found' }
if (-not (Test-Path (Join-Path $liveFront 'web.config'))) { Fail 'live frontend / web.config not found' }
$envText = Get-Content -LiteralPath (Join-Path $Base '.env') -Raw
foreach ($k in @('DATABASE_URL=', 'JWT_SECRET=', 'BARNS_DATABASE_URL=', 'BARNS_WRITE_DATABASE_URL=')) {
    if ($envText -notmatch [regex]::Escape($k)) { Fail ('.env is missing ' + $k) }
}
$nv = (& node -v)
Write-Host ('node ' + $nv)
if ($nv -notmatch '^v22\.') { Fail 'Node 22 is required' }
$res = ($Site + ':' + $Port + ':127.0.0.1')
$portPart = ''
if (($Scheme -eq 'https' -and $Port -ne 443) -or ($Scheme -eq 'http' -and $Port -ne 80)) { $portPart = ':' + [string]$Port }
$siteUrl = ($Scheme + '://' + $Site + $portPart)
$h0 = (& curl.exe -s -w '|%{http_code}' --resolve $res ($siteUrl + '/api/health')) -join ''
Write-Host ('site /api/health now: ' + $h0)
if (-not $h0.EndsWith('|200')) { Fail 'the site is not healthy right now' }

Step 'Get the code'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$work = Join-Path $Base ('src_deploy_' + $stamp)
New-Item -ItemType Directory -Path $work | Out-Null
$zip = Join-Path $work 'src.zip'
$sha = 'local-zip'
if ($ZipPath -ne '') {
    Copy-Item -LiteralPath $ZipPath -Destination $zip
}
if ($ZipPath -eq '') {
    $headers = @{ 'User-Agent' = 'raaaa-deploy' }
    $info = Invoke-RestMethod 'https://api.github.com/repos/GreggBarfield/RedAngusPortal/commits/main' -Headers $headers
    $sha = $info.sha
    Write-Host ('GitHub main is ' + $sha)
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri ('https://api.github.com/repos/GreggBarfield/RedAngusPortal/zipball/' + $sha) -OutFile $zip
}
Write-Host ('zip bytes: ' + (Get-Item $zip).Length)
$ex = Join-Path $work 'x'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $ex)
$src = (Get-ChildItem $ex -Directory | Select-Object -First 1).FullName

Step 'Check every file against the tested hashes'
$bad = 0
foreach ($k in $expected.Keys) {
    $p = Join-Path $src (Sep $k)
    if (-not (Test-Path $p)) { $bad++; Write-Host ('  MISSING:   ' + $k); continue }
    if ((Hash $p) -ne $expected[$k]) { $bad++; Write-Host ('  DIFFERENT: ' + $k) }
}
if ($bad -gt 0) { Fail ([string]$bad + ' file(s) do not match the tested versions') }
Write-Host ('all ' + $expected.Count + ' files match')

Step 'Build the front end (scratch folder)'
$newFe = Join-Path $src 'FrontEnd'
Push-Location $newFe
& npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'front end npm ci failed' }
& npm test
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'front end tests failed' }
& npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'front end build failed' }
Pop-Location
$dist = Join-Path $newFe 'dist'
if (-not (Test-Path (Join-Path $dist 'index.html'))) { Fail 'dist/index.html was not produced' }

Step 'Install the back end (scratch folder, production packages only)'
$newBe = Join-Path $src 'BackEnd'
Push-Location $newBe
& npm ci --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'back end npm ci failed' }
foreach ($f in @('src/app.js', 'src/config.js', 'src/btn.js', 'src/barns.js', 'src/routes/barns.js', 'src/server.js')) {
    & node --check (Sep $f)
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail ('node --check failed: ' + $f) }
}
Pop-Location
if (-not (Test-Path (Join-Path $newBe 'migrations\002_barn_settings.sql'))) { Fail 'migration 002 missing' }
Write-Host 'front end built and tested, back end installed and checked'

# helper programs for database steps
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('raaaa_' + $stamp)
New-Item -ItemType Directory -Path $tmp | Out-Null
$rollbackJs = Join-Path $tmp 'rollback.js'
$cleanJs = Join-Path $tmp 'cleansmoke.js'
$promoteJs = Join-Path $tmp 'promote.js'
$rwJs = Join-Path $tmp 'rwcheck.js'
Set-Content -LiteralPath $rollbackJs -Encoding ASCII -Value @'
const { Client } = require('pg');
const cfg = require(process.argv[2]);
(async () => {
  const c = new Client({ connectionString: cfg.databaseUrl });
  await c.connect();
  const a = (await c.query('select count(*)::int as n from barn_contact_log')).rows[0].n;
  const b = (await c.query('select count(*)::int as n from barn_settings')).rows[0].n;
  if (a === 0 && b === 0) {
    await c.query('drop table barn_contact_log');
    await c.query('drop table barn_settings');
    await c.query("delete from schema_migrations where name = '002_barn_settings.sql'");
    console.log('database rolled back (empty barn tables dropped)');
  } else {
    console.log('barn tables have data - database left alone');
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
Set-Content -LiteralPath $cleanJs -Encoding ASCII -Value @'
const { Client } = require('pg');
const cfg = require(process.argv[2]);
(async () => {
  const c = new Client({ connectionString: cfg.databaseUrl });
  await c.connect();
  const r = await c.query('delete from users where lower(email) = lower($1)', [process.argv[3]]);
  console.log('smoke test account removed (' + r.rowCount + ' row)');
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
Set-Content -LiteralPath $promoteJs -Encoding ASCII -Value @'
const { Client } = require('pg');
const cfg = require(process.argv[2]);
(async () => {
  const c = new Client({ connectionString: cfg.databaseUrl });
  await c.connect();
  const r = await c.query("update users set role = 'staff' where lower(email) = lower($1)", [process.argv[3]]);
  console.log('smoke test account made staff (' + r.rowCount + ' row)');
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
'@
Set-Content -LiteralPath $rwJs -Encoding ASCII -Value @'
const { Client } = require('pg');
const cfg = require(process.argv[2]);
(async () => {
  const c = new Client({ connectionString: cfg.barnsWriteDatabaseUrl });
  await c.connect();
  await c.query('BEGIN');
  const r = await c.query('UPDATE public.auction_barns SET auc_fax = auc_fax, auc_email = auc_email, auc_phone = auc_phone, contact_name = contact_name WHERE auction_no = $1', [Number(process.argv[3])]);
  await c.query('ROLLBACK');
  console.log('write login can update barn ' + process.argv[3] + ' (' + r.rowCount + ' row, rolled back - nothing changed)');
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
'@

$prevBack = Join-Path $Base ('backend_prev_' + $stamp)
$prevFront = Join-Path $Base ('frontend_prev_' + $stamp)
$prevBackName = Split-Path $prevBack -Leaf
if ((Test-Path $prevBack) -or (Test-Path $prevFront)) { Fail 'rollback folder already exists' }
$wcHash = Hash (Join-Path $liveFront 'web.config')
$state = @{ stopped = $false; swapped = $false; migrated = $false; frontSwitched = $false; smokeEmail = '' }
$env:NODE_PATH = (Join-Path $newBe 'node_modules')

try {
    Step 'Stop the API'
    & pm2 stop raaaa-api | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'pm2 stop failed' }
    $state.stopped = $true
    Start-Sleep -Seconds 2

    Step 'Swap in the new back end (old one kept as a rollback folder)'
    Rename-Item -LiteralPath $liveBack -NewName $prevBackName
    $state.swapped = $true
    Copy-Item -LiteralPath $newBe -Destination $liveBack -Recurse
    $t = Join-Path $liveBack 'tests'
    if (Test-Path $t) { Remove-Item -LiteralPath $t -Recurse -Force }
    if (-not (Test-Path (Join-Path $liveBack 'src\server.js'))) { throw 'new backend copy incomplete' }
    Write-Host ('old back end kept at ' + $prevBack)

    Step 'Run the database migration'
    Push-Location $liveBack
    $mout = (& node src/migrate.js 2>&1 | Out-String)
    $mcode = $LASTEXITCODE
    Pop-Location
    Write-Host $mout.Trim()
    if ($mout -match 'applying 002_barn_settings.sql') { $state.migrated = $true }
    if ($mcode -ne 0) { throw 'migration failed' }

    Step 'Start the API'
    & pm2 restart raaaa-api | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'pm2 restart failed' }
    Start-Sleep -Seconds 4
    $h = Invoke-RestMethod ($ApiUrl + '/api/health')
    if ($h.status -ne 'ok') { throw 'health not ok' }
    $d = Invoke-RestMethod ($ApiUrl + '/api/health/db')
    if ($d.database -ne 'up') { throw 'database not up' }
    Write-Host 'api health and database: ok'

    Step 'Smoke test: barn list as a visitor'
    $list = Invoke-RestMethod ($ApiUrl + '/api/barns?pageSize=3')
    Write-Host ('barns in BTN list: ' + $list.total)
    if ($list.total -lt 100) { throw 'barn list is unexpectedly small' }
    $first = $list.barns[0]
    $visitorProps = @($first.PSObject.Properties.Name)
    foreach ($bp in @('email', 'fax', 'phone', 'contactName', 'address')) {
        if ($visitorProps -contains $bp) { throw ('visitor can see ' + $bp + ' - stopping') }
    }
    Write-Host ('visitor sees only name and place, e.g. ' + $first.name + ' (barn ' + $first.auctionNo + ')')
    $st = Invoke-RestMethod ($ApiUrl + '/api/barns/states')
    Write-Host ('states: ' + $st.states.Count)
    $r401 = (& curl.exe -s -w '|%{http_code}' -X PATCH -H 'Content-Type: application/json' --data '{}' ($ApiUrl + '/api/barns/' + $first.auctionNo + '/contact')) -join ''
    if (-not $r401.EndsWith('|401')) { throw ('edit without login did not return 401: ' + $r401) }
    Write-Host 'edit without login: 401'

    Step 'Smoke test: member and staff behavior (temporary account, removed after)'
    $mail = 'smoke' + $stamp + '@example.com'
    $pw = 'Smoke-' + [guid]::NewGuid().ToString('N')
    $state.smokeEmail = $mail
    $body = (@{ email = $mail; password = $pw; displayName = 'Smoke Test'; membershipNumber = 'SMOKE-1' } | ConvertTo-Json)
    $reg = Invoke-RestMethod -Method Post -Uri ($ApiUrl + '/api/auth/register') -ContentType 'application/json' -Body $body
    $hdr = @{ Authorization = ('Bearer ' + $reg.token) }
    $one = Invoke-RestMethod -Uri ($ApiUrl + '/api/barns/' + $first.auctionNo) -Headers $hdr
    if ($null -eq $one.barn.PSObject.Properties['fax']) { throw 'signed-in member cannot see contact fields' }
    Write-Host 'member sees contact fields: ok'
    $badFile = Join-Path $tmp 'patch.json'
    Set-Content -LiteralPath $badFile -Value '{"changes":{"fax":null}}' -Encoding ASCII
    $r403 = (& curl.exe -s -w '|%{http_code}' -X PATCH -H 'Content-Type: application/json' -H ('Authorization: Bearer ' + $reg.token) --data-binary ('@' + $badFile) ($ApiUrl + '/api/barns/' + $first.auctionNo + '/contact')) -join ''
    if (-not $r403.EndsWith('|403')) { throw ('member edit did not return 403: ' + $r403) }
    Write-Host 'member edit: 403'

    & node $promoteJs (Join-Path $liveBack 'src\config.js') $mail
    if ($LASTEXITCODE -ne 0) { throw 'could not promote the smoke account' }
    $cur = (Invoke-RestMethod -Uri ($ApiUrl + '/api/barns/' + $first.auctionNo) -Headers $hdr).barn
    $same = @{ changes = @{ fax = $cur.fax; email = $cur.email }; expected = @{ fax = $cur.fax; email = $cur.email } }
    $sameJson = ($same | ConvertTo-Json -Depth 4 -Compress)
    $resp = Invoke-RestMethod -Method Patch -Uri ($ApiUrl + '/api/barns/' + $first.auctionNo + '/contact') -Headers $hdr -ContentType 'application/json' -Body $sameJson
    if (@($resp.changed).Count -ne 0) { throw 'a no-change edit reported changes' }
    Write-Host 'staff edit with no real change: ok (nothing written)'
    $lg = Invoke-RestMethod -Uri ($ApiUrl + '/api/barns/' + $first.auctionNo + '/log') -Headers $hdr
    Write-Host ('staff can read the change log (' + @($lg.log).Count + ' entries)')

    & node $rwJs (Join-Path $liveBack 'src\config.js') $first.auctionNo
    if ($LASTEXITCODE -ne 0) { throw 'the write login could not update the barn table' }

    & node $cleanJs (Join-Path $liveBack 'src\config.js') $mail
    if ($LASTEXITCODE -ne 0) { throw 'could not remove the smoke test account' }
    $state.smokeEmail = ''

    Step 'Switch the front end (backup first, web.config untouched)'
    & robocopy $liveFront $prevFront /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'front end backup copy failed' }
    $state.frontSwitched = $true
    & robocopy $dist $liveFront /MIR /XF web.config /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'copy into the live front end failed' }
    if ((Hash (Join-Path $liveFront 'web.config')) -ne $wcHash) { throw 'web.config changed' }
    if ((Hash (Join-Path $liveFront 'index.html')) -ne (Hash (Join-Path $dist 'index.html'))) { throw 'live index.html is not the new one' }

    Step 'Test the live site over HTTPS'
    $r1 = (& curl.exe -s -w '|%{http_code}' --resolve $res ($siteUrl + '/')) -join ''
    if (-not $r1.EndsWith('|200')) { throw ('home page did not return 200: ' + $r1) }
    $m = [regex]::Match($r1, '/assets/index-[A-Za-z0-9_-]+\.js')
    if (-not $m.Success) { throw 'home page does not reference the built script' }
    $r2 = (& curl.exe -s -o NUL -w '%{http_code}' --resolve $res ($siteUrl + $m.Value)) -join ''
    if ($r2 -ne '200') { throw ('script file did not return 200: ' + $r2) }
    Write-Host ('home page 200, script ' + $m.Value + ' 200')
    $barnPage = ('/barns/' + [string]$first.auctionNo)
    foreach ($pg in @('/barns', $barnPage, '/login', '/account')) {
        $r3 = (& curl.exe -s -w '|%{http_code}' --resolve $res ($siteUrl + $pg)) -join ''
        if (-not $r3.EndsWith('|200')) { throw ($pg + ' did not return 200') }
        if ($r3 -notmatch [regex]::Escape($m.Value)) { throw ($pg + ' did not serve the app page') }
        Write-Host ($pg + ': 200 (app page)')
    }
    $r4 = (& curl.exe -s -w '|%{http_code}' --resolve $res ($siteUrl + '/api/barns?pageSize=1')) -join ''
    if (-not $r4.EndsWith('|200')) { throw ('barn list through IIS did not return 200: ' + $r4) }
    Write-Host 'barn list through IIS: 200'
    $r5 = (& curl.exe -s -w '|%{http_code}' --resolve $res ($siteUrl + '/api/auth/me')) -join ''
    if (-not $r5.EndsWith('|401')) { throw 'auth route did not return 401 without a token' }

    & pm2 save | Out-Null
    Write-Host ''
    Write-Host 'PHASE 3 DEPLOY COMPLETE.'
    Write-Host ('commit: ' + $sha)
    Write-Host ('back end backup:  ' + $prevBack)
    Write-Host ('front end backup: ' + $prevFront)
}
catch {
    Write-Host ''
    Write-Host ('FAILED: ' + $_.Exception.Message)
    Write-Host 'Rolling back...'
    try {
        if ($state.stopped) {
            & pm2 stop raaaa-api | Out-Null
            Start-Sleep -Seconds 2
        }
        if ($state.smokeEmail -ne '') {
            & node $cleanJs (Join-Path $liveBack 'src\config.js') $state.smokeEmail
        }
        if ($state.migrated) {
            & node $rollbackJs (Join-Path $liveBack 'src\config.js')
        }
        if ($state.swapped) {
            if (Test-Path $liveBack) { Remove-Item -LiteralPath $liveBack -Recurse -Force }
            Rename-Item -LiteralPath $prevBack -NewName 'backend'
            Write-Host 'old back end restored'
        }
        if ($state.frontSwitched) {
            & robocopy $prevFront $liveFront /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
            Write-Host 'old front end restored'
        }
        if ($state.stopped) {
            & pm2 restart raaaa-api | Out-Null
            Start-Sleep -Seconds 4
            $hr = Invoke-RestMethod ($ApiUrl + '/api/health')
            Write-Host ('after rollback /api/health: ' + $hr.status)
        }
    }
    catch { Write-Host ('ROLLBACK PROBLEM: ' + $_.Exception.Message) }
    throw
}
finally { Remove-Item Env:\NODE_PATH -ErrorAction SilentlyContinue }
}
