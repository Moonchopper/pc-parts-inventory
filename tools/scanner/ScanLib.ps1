# ScanLib.ps1 — pure helper functions for tools/scanner/scan.ps1.
#
# Everything in this file is a pure function: no Get-CimInstance, no registry access, no network,
# no file I/O. That is what makes it testable without hardware (see ScanLib.Tests.ps1 and
# scan.ps1 -SelfTest). scan.ps1 dot-sources this file and does all the CIM/registry work itself.
#
# Windows PowerShell 5.1 target: no ternary operator, no null-coalescing, no classes needed.

Set-StrictMode -Version 2.0

function Clean-String {
    <#
        .SYNOPSIS
        Trims a string and collapses internal runs of whitespace to a single space.
        Returns $null for $null input, '' for whitespace-only input.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [string]$Value
    )
    if ($null -eq $Value) { return $null }
    $trimmed = $Value.Trim()
    if ($trimmed -eq '') { return '' }
    return [regex]::Replace($trimmed, '\s+', ' ')
}

# Serial values the platform emits when there is no real serial burned in. Compared
# case-insensitively after trimming. This list is a superset of everything seen in the M0
# recon on MOONPC (Win32_BaseBoard/Win32_BIOS "Default string", Win32_Processor "Unknown",
# a decoded monitor serial of "0") plus the well-known placeholders vendors commonly ship.
$script:PlaceholderSerials = @(
    'default string',
    'to be filled by o.e.m.',
    'to be filled by o.e.m',
    'none',
    'system serial number',
    'not specified',
    'not applicable',
    'n/a',
    'na',
    'unknown',
    'serial number',
    '0',
    '00000000',
    '000000000000'
)

function Clean-Serial {
    <#
        .SYNOPSIS
        Normalizes a raw CIM serial-ish value: trims it, and returns $null for placeholder
        values (vendor defaults, "Unknown", "0", all-zero strings) instead of the placeholder.
        Never fabricates a value — a real, non-placeholder string is returned trimmed but
        otherwise unmodified (embedded separators like the storage disk's trailing dot and
        underscores are left alone; they are real serial characters, not noise).
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [string]$Value
    )
    if ($null -eq $Value) { return $null }
    $trimmed = $Value.Trim()
    if ($trimmed -eq '') { return $null }

    $normalized = $trimmed.ToLowerInvariant()
    if ($script:PlaceholderSerials -contains $normalized) { return $null }

    # All-zero once separators are stripped (e.g. "0000-0000", "0000_0000") is still a
    # placeholder. A real serial like "0000_0000_0000_0001_00A0_7523_E87F_6C0C." contains
    # non-zero hex digits after stripping and survives this check untouched.
    $alnumOnly = $trimmed -replace '[^0-9A-Za-z]', ''
    if ($alnumOnly -ne '' -and ($alnumOnly -replace '0', '') -eq '') { return $null }

    return $trimmed
}

function Clean-Manufacturer {
    <#
        .SYNOPSIS
        Trims a manufacturer string, strips (R)/(TM)/(TM)/™/® marks, and repeatedly strips
        trailing corporate-form words (Ltd., LLC, Inc., Corporation, Corp., Co., Technology,
        Technologies, International, Group, Holdings) and their separating commas, so
        "Gigabyte Technology Co., Ltd." -> "Gigabyte" and
        "American Megatrends International, LLC." -> "American Megatrends".
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [string]$Value
    )
    if ($null -eq $Value) { return $null }
    $s = Clean-String $Value
    if ($s -eq '') { return $s }

    $s = $s -replace '\(R\)', '' -replace '\(TM\)', '' -replace '[™®]', ''
    $s = Clean-String $s
    $s = $s.TrimEnd(',', '.', ' ')

    $suffixWords = @(
        'ltd', 'llc', 'l.l.c', 'inc', 'incorporated', 'corporation', 'corp',
        'co', 'company', 'technology', 'technologies', 'international', 'group', 'holdings'
    )

    while ($true) {
        $normalized = $s -replace ',', ' '
        $normalized = Clean-String $normalized
        if ($normalized -eq '') { break }
        $words = $normalized -split ' '
        if ($words.Count -le 1) { break }
        $lastWord = $words[$words.Count - 1].TrimEnd('.').ToLowerInvariant()
        if ($suffixWords -contains $lastWord) {
            $s = ($words[0..($words.Count - 2)] -join ' ')
            $s = $s.TrimEnd(',', '.', ' ')
        } else {
            break
        }
    }

    return $s
}

# Known vendor prefixes for Win32_VideoController.Name. Order matters: longer/more specific
# tokens first where there could be ambiguity.
$script:VideoVendorPrefixes = @('NVIDIA', 'AMD', 'Intel', 'ATI', 'Matrox')

function Split-VideoName {
    <#
        .SYNOPSIS
        Splits a Win32_VideoController.Name (e.g. "AMD Radeon(TM) Graphics",
        "NVIDIA GeForce RTX 4070 Ti SUPER") into { Manufacturer, Model }.
        Strips (R)/(TM)/™/® marks first. Falls back to the first word as manufacturer when
        no known vendor prefix matches.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [string]$Name
    )
    $clean = Clean-String ($Name -replace '\(R\)', '' -replace '\(TM\)', '' -replace '[™®]', '')
    if ($null -eq $clean -or $clean -eq '') {
        return [PSCustomObject]@{ Manufacturer = $clean; Model = $clean }
    }

    foreach ($vendor in $script:VideoVendorPrefixes) {
        if ($clean -match ('^' + [regex]::Escape($vendor) + '\b')) {
            $rest = Clean-String $clean.Substring($vendor.Length)
            if ($rest -eq '') { $rest = $vendor }
            return [PSCustomObject]@{ Manufacturer = $vendor; Model = $rest }
        }
    }

    $parts = $clean -split ' ', 2
    if ($parts.Count -eq 2) {
        return [PSCustomObject]@{ Manufacturer = $parts[0]; Model = $parts[1] }
    }
    return [PSCustomObject]@{ Manufacturer = $clean; Model = $clean }
}

# JEDEC JEP106 "Bank 1" (single-byte, no continuation) manufacturer id table. This is a
# best-effort, partial table covering the commonly-republished historical Bank-1 assignments;
# it does NOT cover higher banks (most modern DRAM die vendors — Samsung, SK hynix, Micron —
# are commonly identified in later banks with continuation bytes, which this table does not
# attempt to decode). Every machine in this milestone's recon reports memory Manufacturer as
# a string ("G.SKILL"), not a number, so this path is untested against real hardware; unknown
# ids fall back to a labeled placeholder rather than a guess.
$script:JedecBank1 = @{
    1 = 'AMD'; 2 = 'AMI'; 3 = 'Fairchild'; 4 = 'Fujitsu'; 5 = 'GTE'; 6 = 'Harris'; 7 = 'Hitachi';
    8 = 'Inmos'; 9 = 'Intel'; 10 = 'I.T.T.'; 11 = 'Intersil'; 12 = 'Monolithic Memories';
    13 = 'Mostek'; 14 = 'Freescale (Motorola)'; 15 = 'National Semiconductor'; 16 = 'NEC';
    17 = 'RCA'; 18 = 'Raytheon'; 19 = 'Rockwell'; 20 = 'Seeq'; 21 = 'NXP (Philips)';
    22 = 'Synertek'; 23 = 'Texas Instruments'; 24 = 'Toshiba'; 25 = 'Xicor'; 26 = 'Zilog';
    27 = 'Eurotechnique'; 28 = 'Mitsubishi'; 29 = 'Lucent (AT&T)'; 30 = 'Exel'; 31 = 'Atmel';
    32 = 'SGS/Thomson'; 33 = 'Lattice Semi.'; 34 = 'NCR'; 35 = 'Wafer Scale Integration';
    36 = 'IBM'; 37 = 'Tristar'; 38 = 'Visic'; 39 = 'Intl. CMOS Technology'; 40 = 'SSSI';
    41 = 'Microchip Technology'; 42 = 'Ricoh Ltd.'; 43 = 'VLSI'; 44 = 'Micron Technology';
    45 = 'Hyundai Electronics (SK hynix)'; 46 = 'OKI Semiconductor'; 47 = 'ACTEL'; 48 = 'Sharp';
    49 = 'Catalyst'; 50 = 'Panasonic'
}

function Get-JedecManufacturer {
    <#
        .SYNOPSIS
        Maps a numeric JEDEC Bank-1 manufacturer id to a name. Some boards report
        Win32_PhysicalMemory.Manufacturer as a bare number instead of a string like "G.SKILL";
        this is the fallback for those. Unknown/unmapped ids return "JEDEC 0x{id}" rather than
        guessing a vendor name — see the table's header comment for coverage limits.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [int]$Id
    )
    if ($script:JedecBank1.ContainsKey($Id)) {
        return $script:JedecBank1[$Id]
    }
    return ('JEDEC 0x{0:X}' -f $Id)
}

function ConvertFrom-Uint16Array {
    <#
        .SYNOPSIS
        Decodes a WMI monitor uint16[]/byte[] character array (WmiMonitorID's
        ManufacturerName / UserFriendlyName / SerialNumberID / ProductCodeID) into a string,
        stopping at the first zero element (these fields are zero-terminated and padded).
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        $Values
    )
    if ($null -eq $Values) { return '' }
    $chars = New-Object System.Collections.Generic.List[char]
    foreach ($v in $Values) {
        $n = [int]$v
        if ($n -eq 0) { break }
        $chars.Add([char]$n)
    }
    $joined = -join $chars
    return $joined
}

# PNP 3-letter vendor ids (WmiMonitorID.ManufacturerName once decoded) -> display name.
$script:PnpVendorTable = @{
    'ACR' = 'Acer'; 'DEL' = 'Dell'; 'BNQ' = 'BenQ'; 'SAM' = 'Samsung'; 'GSM' = 'LG';
    'AUS' = 'ASUS'; 'MSI' = 'MSI'; 'HWP' = 'HP'; 'LEN' = 'Lenovo'; 'VSC' = 'ViewSonic';
    'AOC' = 'AOC'; 'GBT' = 'Gigabyte'; 'ACI' = 'Asus'
}

function Get-PnpVendorName {
    <#
        .SYNOPSIS
        Maps a 3-letter PNP vendor id to a display name, falling back to the raw code
        (upper-cased) when the id is not in the table.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [string]$PnpId
    )
    if ([string]::IsNullOrWhiteSpace($PnpId)) { return $PnpId }
    $key = $PnpId.Trim().ToUpperInvariant()
    if ($script:PnpVendorTable.ContainsKey($key)) {
        return $script:PnpVendorTable[$key]
    }
    return $key
}

# MSFT_PhysicalDisk.BusType — Microsoft's STORAGE_BUS_TYPE enumeration.
$script:BusTypeTable = @{
    0 = 'Unknown'; 1 = 'SCSI'; 2 = 'ATAPI'; 3 = 'ATA'; 4 = 'IEEE1394'; 5 = 'SSA';
    6 = 'Fibre Channel'; 7 = 'USB'; 8 = 'RAID'; 9 = 'iSCSI'; 10 = 'SAS'; 11 = 'SATA';
    12 = 'SD'; 13 = 'MMC'; 14 = 'MAX'; 15 = 'File-Backed Virtual'; 16 = 'Storage Spaces';
    17 = 'NVMe'; 18 = 'Microsoft Reserved'
}

function Get-BusTypeName {
    param([Parameter(Mandatory = $true)][int]$BusType)
    if ($script:BusTypeTable.ContainsKey($BusType)) { return $script:BusTypeTable[$BusType] }
    return "Unknown ($BusType)"
}

# MSFT_PhysicalDisk.MediaType, per the M0 brief's recon.
$script:MediaTypeTable = @{ 0 = 'Unspecified'; 1 = 'Unspecified'; 3 = 'HDD'; 4 = 'SSD'; 5 = 'SCM' }

function Get-MediaTypeName {
    param([Parameter(Mandatory = $true)][int]$MediaType)
    if ($script:MediaTypeTable.ContainsKey($MediaType)) { return $script:MediaTypeTable[$MediaType] }
    return "Unknown ($MediaType)"
}

# Win32_PhysicalMemory.FormFactor — SMBIOS "Memory Device — Form Factor" table.
$script:FormFactorTable = @{
    0 = 'Unknown'; 1 = 'Other'; 2 = 'SIP'; 3 = 'DIP'; 4 = 'ZIP'; 5 = 'SOJ'; 6 = 'Proprietary';
    7 = 'SIMM'; 8 = 'DIMM'; 9 = 'TSOP'; 10 = 'PGA'; 11 = 'RIMM'; 12 = 'SODIMM'; 13 = 'SRIMM';
    14 = 'SMD'; 15 = 'SSMP'; 16 = 'QFP'; 17 = 'TQFP'; 18 = 'SOIC'; 19 = 'LCC'; 20 = 'PLCC';
    21 = 'BGA'; 22 = 'FPBGA'; 23 = 'LGA'
}

function Get-FormFactorName {
    param([Parameter(Mandatory = $true)][int]$FormFactor)
    if ($script:FormFactorTable.ContainsKey($FormFactor)) { return $script:FormFactorTable[$FormFactor] }
    return "Unknown ($FormFactor)"
}

# Win32_PhysicalMemory.SMBIOSMemoryType — SMBIOS "Memory Device — Type" table (subset).
$script:MemoryTypeTable = @{
    0 = 'Unknown'; 1 = 'Other'; 18 = 'SDRAM'; 19 = 'RDRAM'; 20 = 'DDR'; 21 = 'DDR2';
    22 = 'DDR2 FB-DIMM'; 24 = 'DDR3'; 25 = 'FBD2'; 26 = 'DDR4'; 27 = 'LPDDR'; 28 = 'LPDDR2';
    29 = 'LPDDR3'; 30 = 'LPDDR4'; 34 = 'DDR5'; 35 = 'LPDDR5'
}

function Get-MemoryTypeName {
    param([Parameter(Mandatory = $true)][int]$MemoryType)
    if ($script:MemoryTypeTable.ContainsKey($MemoryType)) { return $script:MemoryTypeTable[$MemoryType] }
    return "Unknown ($MemoryType)"
}

# Storage manufacturer heuristic from a drive model number. MSFT_PhysicalDisk.Manufacturer is
# frequently blank for NVMe drives (seen on MOONPC's Crucial CT2000T700SSD5); this is a
# best-effort fallback so `manufacturer` is never empty, not an attempt at a complete vendor
# database. Prefer the real CIM Manufacturer field whenever it is non-blank; only fall back to
# this when it is empty.
$script:StorageModelPrefixes = @(
    @{ Prefix = 'CT'; Name = 'Crucial' },
    @{ Prefix = 'MX'; Name = 'Crucial' },
    @{ Prefix = 'WD'; Name = 'Western Digital' },
    @{ Prefix = 'ST'; Name = 'Seagate' },
    @{ Prefix = 'MZ'; Name = 'Samsung' },
    @{ Prefix = 'MTFD'; Name = 'Micron' },
    @{ Prefix = 'HFS'; Name = 'SK hynix' },
    @{ Prefix = 'SSDSC'; Name = 'Intel' },
    @{ Prefix = 'SSDPE'; Name = 'Intel' },
    @{ Prefix = 'SA400'; Name = 'Kingston' },
    @{ Prefix = 'SKC'; Name = 'Kingston' },
    @{ Prefix = 'SDSS'; Name = 'SanDisk' },
    @{ Prefix = 'SDSA'; Name = 'SanDisk' }
)

function Get-StorageManufacturerFromModel {
    <#
        .SYNOPSIS
        Best-effort manufacturer guess from a storage device's model number prefix, used only
        when CIM reports no manufacturer at all. Returns 'Unknown' when no prefix matches —
        never a fabricated brand name.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [AllowNull()]
        [string]$Model
    )
    if ([string]::IsNullOrWhiteSpace($Model)) { return 'Unknown' }
    $m = $Model.Trim().ToUpperInvariant()
    foreach ($entry in $script:StorageModelPrefixes) {
        if ($m.StartsWith($entry.Prefix)) { return $entry.Name }
    }
    return 'Unknown'
}

function Get-SerialHash {
    <#
        .SYNOPSIS
        Returns the first 12 hex characters of sha256(serial), for -RedactSerials. Deterministic
        (same input -> same output) and never equal to the input for any non-empty input, since
        it is a hash rendered as lowercase hex, not a copy.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
        $hashBytes = $sha256.ComputeHash($bytes)
        $hex = -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
        return $hex.Substring(0, 12)
    } finally {
        $sha256.Dispose()
    }
}
