<#
    .SYNOPSIS
    Reads this Windows machine over CIM/WMI and emits a ScanPayload v1 JSON document
    (docs/milestones/M0-seed.md §4), optionally POSTing it to the pc-parts-inventory API.

    .DESCRIPTION
    Zero dependencies, Windows PowerShell 5.1 compatible (no modules, no NuGet, no external
    binaries — ADR-0001). Captures cpu, gpu, memory, storage, motherboard and monitor
    components. A missing/inaccessible CIM class (e.g. WmiMonitorID on a headless box) warns
    and skips just that category instead of aborting the whole scan.

    .PARAMETER OutFile
    Path to write the ScanPayload JSON to (UTF-8, no BOM). If omitted, the JSON is written to
    stdout.

    .PARAMETER ApiUrl
    Base URL of the pc-parts-inventory API (e.g. http://localhost:3000). When given, the
    payload is POSTed to "<ApiUrl>/api/v1/imports/scans". A non-2xx response exits 1.

    .PARAMETER Token
    Bearer token sent as "Authorization: Bearer <Token>" when -ApiUrl is given.

    .PARAMETER RedactSerials
    Replaces every non-null component `serial` (and any `specs` value whose key name contains
    "serial") with the first 12 hex characters of sha256(value) before writing or posting.

    .PARAMETER Pretty
    Emit indented JSON. Without it, JSON is compact (single line).

    .PARAMETER SelfTest
    Runs the inline ScanLib assertions and exits 0 (all passed) or 1 (any failed). Touches
    neither CIM nor the network — safe to run on any box, including CI.

    .EXAMPLE
    powershell -NoProfile -File tools/scanner/scan.ps1 -SelfTest

    .EXAMPLE
    powershell -NoProfile -File tools/scanner/scan.ps1 -RedactSerials -Pretty -OutFile tools/scanner/fixtures/MOONPC.redacted.json

    .EXAMPLE
    powershell -NoProfile -File tools/scanner/scan.ps1 -ApiUrl http://localhost:3000 -Token dev-token
#>
[CmdletBinding()]
param(
    [string]$OutFile,
    [string]$ApiUrl,
    [string]$Token,
    [switch]$RedactSerials,
    [switch]$Pretty,
    [switch]$SelfTest
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:ScannerVersion = '1.0.0'

. (Join-Path $PSScriptRoot 'ScanLib.ps1')

function Write-ScanWarning {
    <#
        .SYNOPSIS
        Writes a "WARNING: <message>" line to the real OS stderr, never stdout.

        Write-Warning is deliberately NOT used for this: Windows PowerShell's console host
        renders the Warning stream to the process's stdout handle when the host is
        non-interactive (e.g. `powershell -File scan.ps1 > out.json`), which would corrupt the
        JSON this script writes to stdout when no -OutFile is given. [Console]::Error always
        targets the real stderr handle regardless of how the host renders other streams.
    #>
    param([Parameter(Mandatory = $true)][string]$Message)
    [Console]::Error.WriteLine("WARNING: $Message")
}

# ---------------------------------------------------------------------------
# -SelfTest: inline assertions, no CIM, no network. This is the path that
# always works (5.1 ships no Pester by default) — see ScanLib.Tests.ps1 for
# the Pester-backed version of (most of) the same coverage.
# ---------------------------------------------------------------------------
function Invoke-SelfTest {
    $script:assertTotal = 0
    $script:assertFailed = 0

    function Test-True {
        param([bool]$Condition, [string]$Message)
        $script:assertTotal++
        if (-not $Condition) {
            $script:assertFailed++
            Write-Host "FAIL: $Message"
        } else {
            Write-Host "ok:   $Message"
        }
    }

    function Test-Eq {
        param($Actual, $Expected, [string]$Message)
        Test-True -Condition ([object]::Equals($Actual, $Expected)) -Message "$Message (expected [$Expected], got [$Actual])"
    }

    # 1. Trailing-whitespace trim + internal-run collapse.
    Test-Eq (Clean-String "AMD Ryzen 7 9800X3D 8-Core Processor           ") 'AMD Ryzen 7 9800X3D 8-Core Processor' 'Clean-String trims trailing whitespace'
    Test-Eq (Clean-String "Foo    Bar") 'Foo Bar' 'Clean-String collapses internal whitespace runs'
    Test-Eq (Clean-String "F5-6000J3036G32G              ") 'F5-6000J3036G32G' 'Clean-String trims PartNumber padding'

    # 2. Placeholder serials -> $null; a real serial with separators survives untouched.
    Test-Eq (Clean-Serial 'Default string') $null 'Clean-Serial: "Default string" -> null'
    Test-Eq (Clean-Serial 'To Be Filled By O.E.M.') $null 'Clean-Serial: "To Be Filled By O.E.M." -> null'
    Test-Eq (Clean-Serial 'None') $null 'Clean-Serial: "None" -> null'
    Test-Eq (Clean-Serial 'System Serial Number') $null 'Clean-Serial: "System Serial Number" -> null'
    Test-Eq (Clean-Serial 'Unknown') $null 'Clean-Serial: "Unknown" -> null'
    Test-Eq (Clean-Serial '0') $null 'Clean-Serial: "0" -> null'
    Test-Eq (Clean-Serial '') $null 'Clean-Serial: empty string -> null'
    Test-Eq (Clean-Serial $null) $null 'Clean-Serial: $null -> null'
    Test-Eq (Clean-Serial '00000000') $null 'Clean-Serial: all-zero string -> null'
    Test-Eq (Clean-Serial '055D00F7') '055D00F7' 'Clean-Serial: real serial survives'
    Test-Eq (Clean-Serial '0000_0000_0000_0001_00A0_7523_E87F_6C0C.') '0000_0000_0000_0001_00A0_7523_E87F_6C0C' 'Clean-Serial: real serial with trailing dot has the dot stripped (not all-zero)'
    Test-Eq (Clean-Serial '0000_0000_0000_0001_00A0_7523_E87F_6C0C,') '0000_0000_0000_0001_00A0_7523_E87F_6C0C' 'Clean-Serial: real serial with trailing comma has the comma stripped'
    Test-Eq (Clean-Serial '0000_0000_0000_0001_00A0_7523_E87F_6C0C;') '0000_0000_0000_0001_00A0_7523_E87F_6C0C' 'Clean-Serial: real serial with trailing semicolon has the semicolon stripped'
    Test-Eq (Clean-Serial '.') $null 'Clean-Serial: "." only -> null (trailing punctuation strip leaves nothing)'

    # 3. Manufacturer cleanup: (R)/(TM)/Corporation/Ltd. stripping.
    Test-Eq (Clean-Manufacturer 'Gigabyte Technology Co., Ltd.') 'Gigabyte' 'Clean-Manufacturer strips "Technology Co., Ltd."'
    Test-Eq (Clean-Manufacturer 'American Megatrends International, LLC.') 'American Megatrends' 'Clean-Manufacturer strips "International, LLC."'
    Test-Eq (Clean-Manufacturer 'Acme Corporation') 'Acme' 'Clean-Manufacturer strips "Corporation"'
    Test-Eq (Clean-Manufacturer 'Acme Corp.') 'Acme' 'Clean-Manufacturer strips "Corp."'
    Test-Eq (Clean-Manufacturer 'Acme Inc.') 'Acme' 'Clean-Manufacturer strips "Inc."'
    Test-Eq (Remove-ManufacturerPrefix -Manufacturer 'BenQ' -Model 'BenQ XL2430T') 'XL2430T' 'Remove-ManufacturerPrefix strips a matching prefix (BenQ)'
    Test-Eq (Remove-ManufacturerPrefix -Manufacturer 'Acer' -Model 'ED323QUR A') 'ED323QUR A' 'Remove-ManufacturerPrefix leaves a non-matching model untouched (Acer)'
    Test-Eq (Remove-ManufacturerPrefix -Manufacturer 'GIGABYTE' -Model 'Gigabyte B650 EAGLE AX') 'B650 EAGLE AX' 'Remove-ManufacturerPrefix matches case-insensitively (GIGABYTE vs Gigabyte)'
    Test-Eq (Remove-ManufacturerPrefix -Manufacturer 'Crucial' -Model 'Crucial') 'Crucial' 'Remove-ManufacturerPrefix never returns an empty model'
    Test-Eq (Remove-CpuMarketingSuffix -Model 'Ryzen 7 9800X3D 8-Core Processor') 'Ryzen 7 9800X3D' 'Remove-CpuMarketingSuffix strips "<n>-Core Processor"'
    Test-Eq (Remove-CpuMarketingSuffix -Model 'Ryzen 7 9800X3D') 'Ryzen 7 9800X3D' 'Remove-CpuMarketingSuffix leaves a model with no suffix untouched'
    $cpuPipelineModel = Remove-ManufacturerPrefix -Manufacturer 'AMD' -Model 'AMD Ryzen 7 9800X3D 8-Core Processor'
    $cpuPipelineModel = Remove-CpuMarketingSuffix -Model $cpuPipelineModel
    Test-Eq $cpuPipelineModel 'Ryzen 7 9800X3D' 'CPU model pipeline reduces the real MOONPC CPU name to PCPartPicker-style naming'

    $splitAmd = Split-VideoName 'AMD Radeon(TM) Graphics'
    Test-Eq $splitAmd.Manufacturer 'AMD' 'Split-VideoName strips "(TM)" and identifies manufacturer'
    Test-Eq $splitAmd.Model 'Radeon Graphics' 'Split-VideoName strips "(TM)" from model'
    $splitNvidia = Split-VideoName 'NVIDIA GeForce RTX 4070 Ti SUPER'
    Test-Eq $splitNvidia.Manufacturer 'NVIDIA' 'Split-VideoName identifies NVIDIA'
    Test-Eq $splitNvidia.Model 'GeForce RTX 4070 Ti SUPER' 'Split-VideoName model for NVIDIA card'

    # 4. uint16[] decode, zero-terminated.
    Test-Eq (ConvertFrom-Uint16Array @(65, 67, 82, 0, 0, 0, 0, 0)) 'ACR' 'ConvertFrom-Uint16Array decodes and stops at the zero terminator'
    Test-Eq (ConvertFrom-Uint16Array @(57, 75, 56, 72, 50, 83, 51, 0)) '9K8H2S3' 'ConvertFrom-Uint16Array decodes a serial-shaped array'
    Test-Eq (ConvertFrom-Uint16Array @(0)) '' 'ConvertFrom-Uint16Array: leading zero -> empty string'
    Test-Eq (ConvertFrom-Uint16Array @()) '' 'ConvertFrom-Uint16Array: empty array -> empty string'

    # 5. JEDEC id lookup.
    Test-Eq (Get-JedecManufacturer 9) 'Intel' 'Get-JedecManufacturer: id 9 -> Intel'
    Test-Eq (Get-JedecManufacturer 44) 'Micron Technology' 'Get-JedecManufacturer: id 44 -> Micron Technology'
    Test-Eq (Get-JedecManufacturer 99999) 'JEDEC 0x1869F' 'Get-JedecManufacturer: unknown id falls back to a labeled placeholder'

    # 6. PNP vendor lookup.
    Test-Eq (Get-PnpVendorName 'ACR') 'Acer' 'Get-PnpVendorName: ACR -> Acer'
    Test-Eq (Get-PnpVendorName 'DEL') 'Dell' 'Get-PnpVendorName: DEL -> Dell'
    Test-Eq (Get-PnpVendorName 'BNQ') 'BenQ' 'Get-PnpVendorName: BNQ -> BenQ'
    Test-Eq (Get-PnpVendorName 'ZZZ') 'ZZZ' 'Get-PnpVendorName: unknown code falls back to the raw code'

    # 7. Enum-int mappings.
    Test-Eq (Get-BusTypeName 17) 'NVMe' 'Get-BusTypeName: 17 -> NVMe'
    Test-Eq (Get-BusTypeName 11) 'SATA' 'Get-BusTypeName: 11 -> SATA'
    Test-Eq (Get-BusTypeName 7) 'USB' 'Get-BusTypeName: 7 -> USB'
    Test-Eq (Get-MediaTypeName 3) 'HDD' 'Get-MediaTypeName: 3 -> HDD'
    Test-Eq (Get-MediaTypeName 4) 'SSD' 'Get-MediaTypeName: 4 -> SSD'
    Test-Eq (Get-MediaTypeName 0) 'Unspecified' 'Get-MediaTypeName: 0 -> Unspecified'
    Test-Eq (Get-FormFactorName 8) 'DIMM' 'Get-FormFactorName: 8 -> DIMM'
    Test-Eq (Get-FormFactorName 12) 'SODIMM' 'Get-FormFactorName: 12 -> SODIMM'
    Test-Eq (Get-MemoryTypeName 26) 'DDR4' 'Get-MemoryTypeName: 26 -> DDR4'
    Test-Eq (Get-MemoryTypeName 34) 'DDR5' 'Get-MemoryTypeName: 34 -> DDR5'
    Test-Eq (Get-MemoryTypeName 24) 'DDR3' 'Get-MemoryTypeName: 24 -> DDR3'

    # Storage manufacturer heuristic (used only when CIM Manufacturer is blank).
    Test-Eq (Get-StorageManufacturerFromModel 'CT2000T700SSD5') 'Crucial' 'Get-StorageManufacturerFromModel: CT prefix -> Crucial'
    Test-Eq (Get-StorageManufacturerFromModel 'totally-unknown-model') 'Unknown' 'Get-StorageManufacturerFromModel: no match -> Unknown (never a guess)'

    # 8. Get-SerialHash: deterministic, 12 hex chars, never equal to the input.
    $hashA = Get-SerialHash '055D00F7'
    $hashA2 = Get-SerialHash '055D00F7'
    $hashB = Get-SerialHash '4859BDFA'
    Test-Eq $hashA $hashA2 'Get-SerialHash is deterministic for the same input'
    Test-Eq $hashA.Length 12 'Get-SerialHash returns 12 characters'
    Test-True -Condition ($hashA -match '^[0-9a-f]{12}$') -Message 'Get-SerialHash returns lowercase hex'
    Test-True -Condition ($hashA -ne '055D00F7') -Message 'Get-SerialHash never equals its input'
    Test-True -Condition ($hashA -ne $hashB) -Message 'Get-SerialHash differs for different inputs'

    Write-Host ''
    Write-Host "Self-test: $script:assertTotal assertions, $script:assertFailed failed."
    if ($script:assertFailed -gt 0) { return 1 }
    return 0
}

if ($SelfTest) {
    exit (Invoke-SelfTest)
}

# ---------------------------------------------------------------------------
# CIM-backed component builders. Each is wrapped so a missing/inaccessible
# class warns and skips just that category instead of aborting the scan.
# ---------------------------------------------------------------------------

function Get-ScanHostname {
    try {
        $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
        $name = Clean-String $cs.Name
        if ($name) { return $name }
    } catch {
        Write-ScanWarning "Win32_ComputerSystem unavailable, falling back to `$env:COMPUTERNAME: $($_.Exception.Message)"
    }
    return $env:COMPUTERNAME
}

function Get-CpuComponentList {
    $result = @()
    try {
        $cpus = @(Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop)
    } catch {
        Write-ScanWarning "Skipping cpu: Win32_Processor unavailable ($($_.Exception.Message))"
        return $result
    }
    foreach ($cpu in $cpus) {
        $manufacturer = $null
        if ($cpu.Manufacturer -eq 'AuthenticAMD') { $manufacturer = 'AMD' }
        elseif ($cpu.Manufacturer -eq 'GenuineIntel') { $manufacturer = 'Intel' }
        else { $manufacturer = Clean-Manufacturer $cpu.Manufacturer }

        $specs = [ordered]@{}
        if ($null -ne $cpu.NumberOfCores) { $specs['cores'] = [int]$cpu.NumberOfCores }
        if ($null -ne $cpu.NumberOfLogicalProcessors) { $specs['threads'] = [int]$cpu.NumberOfLogicalProcessors }
        if ($null -ne $cpu.MaxClockSpeed) { $specs['maxClockMHz'] = [int]$cpu.MaxClockSpeed }
        $socket = Clean-String $cpu.SocketDesignation
        if ($socket) { $specs['socket'] = $socket }

        # PCPartPicker-style naming (intake pillar 3): "AMD Ryzen 7 9800X3D 8-Core Processor"
        # -> drop the leading manufacturer, then the trailing "<n>-Core Processor" marketing
        # noise -> "Ryzen 7 9800X3D".
        $model = Remove-ManufacturerPrefix -Manufacturer $manufacturer -Model (Clean-String $cpu.Name)
        $model = Remove-CpuMarketingSuffix -Model $model

        $result += [ordered]@{
            category     = 'cpu'
            manufacturer = $manufacturer
            model        = $model
            serial       = Clean-Serial $cpu.SerialNumber
            quantity     = 1
            specs        = $specs
        }
    }
    return $result
}

function Get-GpuVramMB {
    param($Controller)

    $classKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}'
    # -ErrorAction SilentlyContinue (not Stop) is deliberate here: this class GUID key has
    # sibling subkeys with restrictive ACLs (e.g. non-numeric config subkeys) that raise
    # "Requested registry access is not allowed" on enumeration even though the numbered
    # per-adapter subkeys (0000, 0001, ...) we actually want ARE readable; with the script's
    # global $ErrorActionPreference = 'Stop', a single inaccessible sibling would otherwise
    # abort the whole lookup and force omitting vramMB even when the real value is reachable.
    $candidates = @(Get-ChildItem -Path $classKey -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^[0-9]{4}$' })
    if ($candidates.Count -eq 0) {
        Write-ScanWarning "GPU VRAM lookup: no readable adapter subkeys under $classKey for '$($Controller.Name)' - omitting vramMB"
        return $null
    }

    $matchedSizes = @()
    foreach ($candidate in $candidates) {
        $props = Get-ItemProperty -Path $candidate.PSPath -ErrorAction SilentlyContinue
        if ($null -eq $props) { continue }
        $memSize = $props.'HardwareInformation.qwMemorySize'
        if (-not $memSize) { continue }

        $isMatch = $false
        if ($props.DriverDesc -and $props.DriverDesc -eq $Controller.Name) {
            $isMatch = $true
        } elseif ($props.MatchingDeviceId -and $Controller.PNPDeviceID) {
            if ($Controller.PNPDeviceID.ToLowerInvariant().StartsWith($props.MatchingDeviceId.ToLowerInvariant())) {
                $isMatch = $true
            }
        }
        if ($isMatch) { $matchedSizes += $memSize }
    }

    if ($matchedSizes.Count -eq 1) {
        return [int][math]::Round([double]$matchedSizes[0] / 1MB)
    }

    Write-ScanWarning "Could not uniquely match '$($Controller.Name)' to a registry VRAM entry ($($matchedSizes.Count) candidates) - omitting vramMB rather than publish AdapterRAM's wrapped uint32 value"
    return $null
}

function Get-GpuComponentList {
    $result = @()
    try {
        $controllers = @(Get-CimInstance -ClassName Win32_VideoController -ErrorAction Stop)
    } catch {
        Write-ScanWarning "Skipping gpu: Win32_VideoController unavailable ($($_.Exception.Message))"
        return $result
    }
    foreach ($ctrl in $controllers) {
        $split = Split-VideoName $ctrl.Name

        $specs = [ordered]@{}
        $driverVersion = Clean-String $ctrl.DriverVersion
        if ($driverVersion) { $specs['driverVersion'] = $driverVersion }
        $vram = Get-GpuVramMB -Controller $ctrl
        if ($null -ne $vram) { $specs['vramMB'] = $vram }

        $result += [ordered]@{
            category     = 'gpu'
            manufacturer = $split.Manufacturer
            model        = $split.Model
            serial       = $null
            quantity     = 1
            specs        = $specs
        }
    }
    return $result
}

function Get-MemoryComponentList {
    $result = @()
    try {
        $sticks = @(Get-CimInstance -ClassName Win32_PhysicalMemory -ErrorAction Stop)
    } catch {
        Write-ScanWarning "Skipping memory: Win32_PhysicalMemory unavailable ($($_.Exception.Message))"
        return $result
    }
    foreach ($stick in $sticks) {
        $rawManufacturer = [string]$stick.Manufacturer
        if ($rawManufacturer -match '^\s*[0-9]+\s*$') {
            $manufacturer = Get-JedecManufacturer ([int]$rawManufacturer.Trim())
        } else {
            $manufacturer = Clean-Manufacturer $rawManufacturer
        }

        $partNumber = Clean-String $stick.PartNumber

        $specs = [ordered]@{}
        if ($null -ne $stick.Capacity) { $specs['capacityMB'] = [int]([int64]$stick.Capacity / 1MB) }
        if ($null -ne $stick.Speed) { $specs['speedMT'] = [int]$stick.Speed }
        if ($null -ne $stick.FormFactor) { $specs['formFactor'] = Get-FormFactorName ([int]$stick.FormFactor) }
        if ($null -ne $stick.SMBIOSMemoryType) { $specs['memoryType'] = Get-MemoryTypeName ([int]$stick.SMBIOSMemoryType) }
        # DeviceLocator is NOT a reliable disambiguator (two sticks can both report "DIMM 1" —
        # gotcha 3) — BankLabel is included so a human can still tell the sticks apart; serial
        # carries real identity (D8).
        $bankLabel = Clean-String $stick.BankLabel
        if ($bankLabel) { $specs['bankLabel'] = $bankLabel }

        $result += [ordered]@{
            category     = 'memory'
            manufacturer = $manufacturer
            model        = $partNumber
            partNumber   = $partNumber
            serial       = Clean-Serial $stick.SerialNumber
            quantity     = 1
            slot         = Clean-String $stick.DeviceLocator
            specs        = $specs
        }
    }
    return $result
}

function Get-StorageComponentList {
    $result = @()
    try {
        $disks = @(Get-CimInstance -Namespace 'root/Microsoft/Windows/Storage' -ClassName MSFT_PhysicalDisk -ErrorAction Stop)
    } catch {
        Write-ScanWarning "Skipping storage: MSFT_PhysicalDisk unavailable ($($_.Exception.Message))"
        return $result
    }
    foreach ($disk in $disks) {
        $manufacturer = Clean-Manufacturer $disk.Manufacturer
        if ([string]::IsNullOrWhiteSpace($manufacturer)) {
            $manufacturer = Get-StorageManufacturerFromModel $disk.Model
            Write-ScanWarning "MSFT_PhysicalDisk.Manufacturer blank for model '$($disk.Model)' - used a model-prefix heuristic ('$manufacturer'); see ScanLib.ps1 Get-StorageManufacturerFromModel"
        }

        $model = Clean-String $disk.Model
        if ([string]::IsNullOrWhiteSpace($model)) { $model = Clean-String $disk.FriendlyName }
        $model = Remove-ManufacturerPrefix -Manufacturer $manufacturer -Model $model

        $specs = [ordered]@{}
        if ($null -ne $disk.Size) { $specs['capacityBytes'] = [int64]$disk.Size }
        if ($null -ne $disk.BusType) { $specs['bus'] = Get-BusTypeName ([int]$disk.BusType) }
        if ($null -ne $disk.MediaType) { $specs['mediaType'] = Get-MediaTypeName ([int]$disk.MediaType) }
        $firmware = Clean-String $disk.FirmwareVersion
        if ($firmware) { $specs['firmware'] = $firmware }

        $result += [ordered]@{
            category     = 'storage'
            manufacturer = $manufacturer
            model        = $model
            serial       = Clean-Serial $disk.SerialNumber
            quantity     = 1
            specs        = $specs
        }
    }
    return $result
}

function Get-MotherboardComponentList {
    $result = @()
    $baseboard = $null
    try {
        $baseboard = Get-CimInstance -ClassName Win32_BaseBoard -ErrorAction Stop | Select-Object -First 1
    } catch {
        Write-ScanWarning "Skipping motherboard: Win32_BaseBoard unavailable ($($_.Exception.Message))"
        return $result
    }
    if ($null -eq $baseboard) {
        Write-ScanWarning 'Skipping motherboard: Win32_BaseBoard returned no instance'
        return $result
    }

    $bios = $null
    try {
        $bios = Get-CimInstance -ClassName Win32_BIOS -ErrorAction Stop | Select-Object -First 1
    } catch {
        Write-ScanWarning "Win32_BIOS unavailable, motherboard specs.biosVersion will be omitted: $($_.Exception.Message)"
    }

    $specs = [ordered]@{}
    if ($bios) {
        $biosVersion = Clean-String $bios.SMBIOSBIOSVersion
        if ($biosVersion) { $specs['biosVersion'] = $biosVersion }
    }

    $motherboardManufacturer = Clean-Manufacturer $baseboard.Manufacturer
    $motherboardModel = Remove-ManufacturerPrefix -Manufacturer $motherboardManufacturer -Model (Clean-String $baseboard.Product)

    $result += [ordered]@{
        category     = 'motherboard'
        manufacturer = $motherboardManufacturer
        model        = $motherboardModel
        serial       = Clean-Serial $baseboard.SerialNumber
        quantity     = 1
        specs        = $specs
    }
    return $result
}

function Get-MonitorComponentList {
    $result = @()
    try {
        $monitors = @(Get-CimInstance -Namespace 'root/wmi' -ClassName WmiMonitorID -ErrorAction Stop)
    } catch {
        Write-ScanWarning "Skipping monitor: WmiMonitorID unavailable ($($_.Exception.Message))"
        return $result
    }
    foreach ($mon in $monitors) {
        $pnpRaw = ConvertFrom-Uint16Array $mon.ManufacturerName
        $manufacturer = Get-PnpVendorName $pnpRaw

        $model = Clean-String (ConvertFrom-Uint16Array $mon.UserFriendlyName)
        if ([string]::IsNullOrWhiteSpace($model)) {
            $model = Clean-String (ConvertFrom-Uint16Array $mon.ProductCodeID)
        }
        $model = Remove-ManufacturerPrefix -Manufacturer $manufacturer -Model $model

        $serial = Clean-Serial (ConvertFrom-Uint16Array $mon.SerialNumberID)

        $specs = [ordered]@{}
        if ($null -ne $mon.YearOfManufacture -and [int]$mon.YearOfManufacture -gt 0) {
            $specs['manufactureYear'] = [int]$mon.YearOfManufacture
        }
        # widthPx/heightPx intentionally omitted: WMI only exposes physical size in centimeters
        # (WmiMonitorBasicDisplayParams) or the *current* video mode, neither of which is a
        # reliable per-monitor pixel resolution without guessing (multi-monitor/hotplug make
        # matching unsound) — gotcha 7 explicitly allows omitting rather than guessing here.

        $result += [ordered]@{
            category     = 'monitor'
            manufacturer = $manufacturer
            model        = $model
            serial       = $serial
            quantity     = 1
            specs        = $specs
        }
    }
    return $result
}

function Protect-ScanSerials {
    <#
        .SYNOPSIS
        In-place -RedactSerials transform: replaces every non-null component `serial` and any
        `specs` value whose key name contains "serial" with Get-SerialHash of that value.
    #>
    param([Parameter(Mandatory = $true)][array]$Components)
    foreach ($component in $Components) {
        if ($null -ne $component.serial -and $component.serial -ne '') {
            $component.serial = Get-SerialHash ([string]$component.serial)
        }
        if ($component.specs) {
            foreach ($key in @($component.specs.Keys)) {
                if ($key -match 'serial') {
                    $value = $component.specs[$key]
                    if ($null -ne $value -and [string]$value -ne '') {
                        $component.specs[$key] = Get-SerialHash ([string]$value)
                    }
                }
            }
        }
    }
}

# ---------------------------------------------------------------------------
# Build the payload.
# ---------------------------------------------------------------------------

$components = @()
$components += @(Get-CpuComponentList)
$components += @(Get-GpuComponentList)
$components += @(Get-MemoryComponentList)
$components += @(Get-StorageComponentList)
$components += @(Get-MotherboardComponentList)
$components += @(Get-MonitorComponentList)

if ($RedactSerials) {
    Protect-ScanSerials -Components $components
}

$payload = [ordered]@{
    schemaVersion = 1
    scanner       = [ordered]@{
        name    = 'scan.ps1'
        version = $script:ScannerVersion
        os      = 'windows'
    }
    host          = [ordered]@{
        hostname   = Get-ScanHostname
        scannedAt  = (Get-Date).ToUniversalTime().ToString('o')
    }
    components    = @($components)
}

$jsonDepth = 6
if ($Pretty) {
    $json = $payload | ConvertTo-Json -Depth $jsonDepth
} else {
    $json = $payload | ConvertTo-Json -Depth $jsonDepth -Compress
}

if ($OutFile) {
    $resolvedDir = Split-Path -Parent $OutFile
    if ($resolvedDir -and -not (Test-Path $resolvedDir)) {
        New-Item -ItemType Directory -Path $resolvedDir -Force | Out-Null
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($OutFile, $json, $utf8NoBom)
    Write-Host "Wrote $($components.Count) components to $OutFile"
} else {
    Write-Output $json
}

if ($ApiUrl) {
    $uri = "$($ApiUrl.TrimEnd('/'))/api/v1/imports/scans"
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }

    try {
        $response = Invoke-WebRequest -Uri $uri -Method Post -ContentType 'application/json; charset=utf-8' -Body $json -Headers $headers -UseBasicParsing
        $status = [int]$response.StatusCode
        Write-Host "POST $uri -> $status"
        try {
            $parsed = $response.Content | ConvertFrom-Json
            if ($parsed.summary) {
                Write-Host ('summary: ' + ($parsed.summary | ConvertTo-Json -Compress))
            }
        } catch {
            Write-Host "(response body was not JSON)"
        }
        if ($status -lt 200 -or $status -ge 300) {
            exit 1
        }
    } catch {
        $webResponse = $_.Exception.Response
        if ($webResponse) {
            $status = [int]$webResponse.StatusCode
            Write-Host "POST $uri -> $status"
            try {
                $stream = $webResponse.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                Write-Host $reader.ReadToEnd()
            } catch {
                # best-effort only; fall through to exit 1 regardless
            }
        } else {
            Write-Host "POST $uri failed: $($_.Exception.Message)"
        }
        exit 1
    }
}
