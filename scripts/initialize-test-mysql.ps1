param(
    [Parameter(Mandatory = $true)][string]$MySqlBinary,
    [Parameter(Mandatory = $true)][string]$DataDirectory
)

$binaryPath = [System.IO.Path]::GetFullPath($MySqlBinary)
$dataPath = [System.IO.Path]::GetFullPath($DataDirectory)
if (-not (Test-Path -LiteralPath $binaryPath -PathType Leaf)) {
    throw 'No se encontró mysqld.exe en la ruta indicada.'
}
if (Test-Path -LiteralPath $dataPath) {
    $existing = Get-ChildItem -LiteralPath $dataPath -Force
    if ($existing.Count -gt 0) {
        throw 'El directorio de datos ya contiene archivos; no se reutilizará.'
    }
} else {
    New-Item -ItemType Directory -Path $dataPath | Out-Null
}

$baseDirectory = Split-Path -Parent (Split-Path -Parent $binaryPath)
$arguments = @(
    '--no-defaults',
    '--initialize-insecure',
    "--basedir=$baseDirectory",
    "--datadir=$dataPath",
    '--console'
)
& $binaryPath @arguments
if ($LASTEXITCODE -ne 0) {
    throw "La inicialización de la instancia MySQL aislada falló (código $LASTEXITCODE)."
}
Write-Output "Instancia aislada inicializada en: $dataPath"
