param([switch]$RebuildExecutable)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $root '.cache\desktop'
$bin = Join-Path $cache 'bin'
$sdkVersion = '1.0.4314.35'
$sdkPackage = Join-Path $cache "webview2-$sdkVersion.nupkg"
$exe = Join-Path $root 'Choke.exe'
$icon = Join-Path $root 'apps\desktop\Choke.ico'
$logo = Join-Path $root 'public\brand\choke-icon.svg'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

function Build-Client {
    New-Item -ItemType Directory -Path $bin -Force | Out-Null
    if (!(Test-Path -LiteralPath $sdkPackage)) {
        $base = 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2'
        $download = "$sdkPackage.download"
        Invoke-WebRequest -UseBasicParsing -Uri "$base/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $download
        Move-Item -LiteralPath $download -Destination $sdkPackage
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($sdkPackage)
    try {
        foreach ($path in @(
            'lib/net462/Microsoft.Web.WebView2.Core.dll',
            'lib/net462/Microsoft.Web.WebView2.WinForms.dll',
            'runtimes/win-x64/native/WebView2Loader.dll'
        )) {
            $entry = $zip.GetEntry($path)
            $destination = Join-Path $bin $entry.Name
            if (!(Test-Path -LiteralPath $destination)) {
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination)
            }
        }
    } finally { $zip.Dispose() }

    $sources = Get-ChildItem -LiteralPath (Join-Path $root 'apps\desktop') -Filter '*.cs' -File
    $references = @(
        '/reference:System.Windows.Forms.dll',
        '/reference:System.Drawing.dll',
        "/reference:$bin\Microsoft.Web.WebView2.Core.dll",
        "/reference:$bin\Microsoft.Web.WebView2.WinForms.dll"
    )
    $installed = Test-Path -LiteralPath $exe -PathType Leaf
    if ($RebuildExecutable -or !$installed) {
        $certificate = $null
        if ($installed) {
            $signer = (Get-AuthenticodeSignature -LiteralPath $exe).SignerCertificate
            if ($signer) {
                $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($signer.Thumbprint)" -ErrorAction SilentlyContinue
                if (!$certificate -or !$certificate.HasPrivateKey) {
                    throw "找不到当前 Choke.exe 的签名私钥（$($signer.Thumbprint)）。"
                }
            }
        }

        $staging = Join-Path $cache ('build-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $staging | Out-Null
        $candidate = Join-Path $staging 'Choke.exe'
        $files = @($sources.FullName)
        try {
            & $compiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/win32icon:$icon" "/resource:$logo,Choke.StartupLogo" "/out:$candidate" @references @files
            if ($LASTEXITCODE -ne 0) { throw 'Choke.exe 编译失败。' }

            if ($certificate) {
                $signature = Set-AuthenticodeSignature -LiteralPath $candidate -Certificate $certificate -HashAlgorithm SHA256
                if ($signature.Status -ne 'Valid') { throw "Choke.exe 签名验证失败。$($signature.StatusMessage)" }
            }

            if ($installed) { [IO.File]::Replace($candidate, $exe, [NullString]::Value) }
            else { [IO.File]::Move($candidate, $exe) }
        } finally {
            if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate }
            [IO.Directory]::Delete($staging)
        }
    }
    Copy-Item -LiteralPath (Join-Path $root 'apps\desktop\Choke.exe.config') -Destination "$exe.config"
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
Push-Location -LiteralPath $root
try {
    if (!(Test-Path -LiteralPath 'node_modules/vite/bin/vite.js') -or
        !(Test-Path -LiteralPath 'apps/api/node_modules/tsx/package.json')) {
        & pnpm.cmd install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw '安装依赖失败。' }
    }

    Build-Client
    & $node node_modules/vite/bin/vite.js build
    if ($LASTEXITCODE -ne 0) { throw '构建游戏界面失败。' }
    Write-Output $exe
} finally {
    Pop-Location
}
