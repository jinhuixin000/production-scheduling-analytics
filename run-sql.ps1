param([string]$Psql = "psql")
$ErrorActionPreference = "Stop"
Push-Location -LiteralPath $PSScriptRoot
try {
    New-Item -ItemType Directory -Force outputs | Out-Null
    & $Psql -X -v ON_ERROR_STOP=1 -f sql/schema.sql -f sql/views.sql -f sql/import.sql -f sql/analysis.sql -f sql/export.sql
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL execution failed ($LASTEXITCODE)." }
} finally {
    Pop-Location
}
