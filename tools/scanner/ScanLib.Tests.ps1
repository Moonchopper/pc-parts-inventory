# Pester tests for ScanLib.ps1. Targets Pester 3.4.0 (the version that ships with Windows
# PowerShell 5.1 by default — `Should Be` / `Should BeExactly`, not the Pester 4/5
# `Should -Be` dash-parameter syntax). Run with:
#   Invoke-Pester tools/scanner/ScanLib.Tests.ps1
# scan.ps1 -SelfTest covers most of the same ground and always works even where Pester is
# missing/older/newer than expected — see that switch for the environment-independent path.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $here 'ScanLib.ps1')

Describe 'Clean-String' {
    It 'trims trailing whitespace' {
        (Clean-String "AMD Ryzen 7 9800X3D 8-Core Processor           ") | Should Be 'AMD Ryzen 7 9800X3D 8-Core Processor'
    }
    It 'collapses internal whitespace runs' {
        (Clean-String "Foo    Bar   Baz") | Should Be 'Foo Bar Baz'
    }
    It 'returns $null for $null' {
        # Pester 3.4's `Should Be $null` mishandles a literal $null comparison; BeNullOrEmpty
        # is the idiomatic way to assert this on that version.
        (Clean-String $null) | Should BeNullOrEmpty
    }
    It 'returns empty string for whitespace-only input' {
        (Clean-String '   ') | Should Be ''
    }
}

Describe 'Clean-Serial' {
    $placeholders = @(
        'Default string',
        'To Be Filled By O.E.M.',
        'None',
        'System Serial Number',
        'Unknown',
        '0',
        '',
        '00000000'
    )
    foreach ($p in $placeholders) {
        It "maps placeholder '$p' to `$null" {
            (Clean-Serial $p) | Should Be $null
        }
    }

    It 'maps $null to $null' {
        (Clean-Serial $null) | Should Be $null
    }

    It 'leaves a real serial untouched' {
        (Clean-Serial '055D00F7') | Should Be '055D00F7'
    }

    It 'leaves a real serial with underscores and a trailing dot untouched (not all-zero)' {
        (Clean-Serial '0000_0000_0000_0001_00A0_7523_E87F_6C0C.') | Should Be '0000_0000_0000_0001_00A0_7523_E87F_6C0C.'
    }
}

Describe 'Clean-Manufacturer' {
    It 'strips "Technology Co., Ltd." down to the brand' {
        (Clean-Manufacturer 'Gigabyte Technology Co., Ltd.') | Should Be 'Gigabyte'
    }
    It 'strips "International, LLC." down to the brand' {
        (Clean-Manufacturer 'American Megatrends International, LLC.') | Should Be 'American Megatrends'
    }
    It 'strips "Corporation"' {
        (Clean-Manufacturer 'Acme Corporation') | Should Be 'Acme'
    }
    It 'strips "Corp."' {
        (Clean-Manufacturer 'Acme Corp.') | Should Be 'Acme'
    }
    It 'strips "Inc."' {
        (Clean-Manufacturer 'Acme Inc.') | Should Be 'Acme'
    }
    It 'strips (R) and (TM) marks' {
        (Clean-Manufacturer 'Acme(R) Devices(TM)') | Should Be 'Acme Devices'
    }
}

Describe 'Remove-ManufacturerPrefix' {
    It 'strips a matching prefix (BenQ)' {
        (Remove-ManufacturerPrefix -Manufacturer 'BenQ' -Model 'BenQ XL2430T') | Should Be 'XL2430T'
    }
    It 'leaves a non-matching model untouched (Acer)' {
        (Remove-ManufacturerPrefix -Manufacturer 'Acer' -Model 'ED323QUR A') | Should Be 'ED323QUR A'
    }
    It 'matches case-insensitively (GIGABYTE vs Gigabyte)' {
        (Remove-ManufacturerPrefix -Manufacturer 'GIGABYTE' -Model 'Gigabyte B650 EAGLE AX') | Should Be 'B650 EAGLE AX'
    }
    It 'never returns an empty model when manufacturer equals model' {
        (Remove-ManufacturerPrefix -Manufacturer 'Crucial' -Model 'Crucial') | Should Be 'Crucial'
    }
}

Describe 'Remove-CpuMarketingSuffix' {
    It 'strips a "<n>-Core Processor" suffix' {
        (Remove-CpuMarketingSuffix -Model 'Ryzen 7 9800X3D 8-Core Processor') | Should Be 'Ryzen 7 9800X3D'
    }
    It 'strips a bare "Processor" suffix' {
        (Remove-CpuMarketingSuffix -Model 'Core i9-14900K Processor') | Should Be 'Core i9-14900K'
    }
    It 'leaves a model with no marketing suffix untouched' {
        (Remove-CpuMarketingSuffix -Model 'Ryzen 7 9800X3D') | Should Be 'Ryzen 7 9800X3D'
    }
}

Describe 'CPU model pipeline (Remove-ManufacturerPrefix + Remove-CpuMarketingSuffix)' {
    It 'reduces the real MOONPC CPU name to PCPartPicker-style naming' {
        $model = Remove-ManufacturerPrefix -Manufacturer 'AMD' -Model 'AMD Ryzen 7 9800X3D 8-Core Processor'
        $model = Remove-CpuMarketingSuffix -Model $model
        $model | Should Be 'Ryzen 7 9800X3D'
    }
}

Describe 'Split-VideoName' {
    It 'splits an AMD iGPU name and strips (TM)' {
        $r = Split-VideoName 'AMD Radeon(TM) Graphics'
        $r.Manufacturer | Should Be 'AMD'
        $r.Model | Should Be 'Radeon Graphics'
    }
    It 'splits an NVIDIA discrete GPU name' {
        $r = Split-VideoName 'NVIDIA GeForce RTX 4070 Ti SUPER'
        $r.Manufacturer | Should Be 'NVIDIA'
        $r.Model | Should Be 'GeForce RTX 4070 Ti SUPER'
    }
}

Describe 'ConvertFrom-Uint16Array' {
    It 'decodes a manufacturer code and stops at the zero terminator' {
        (ConvertFrom-Uint16Array @(65, 67, 82, 0, 0, 0, 0, 0)) | Should Be 'ACR'
    }
    It 'decodes a serial-shaped array' {
        (ConvertFrom-Uint16Array @(57, 75, 56, 72, 50, 83, 51, 0)) | Should Be '9K8H2S3'
    }
    It 'decodes a friendly-name-shaped array with an embedded space' {
        (ConvertFrom-Uint16Array @(69, 68, 51, 50, 51, 81, 85, 82, 32, 65, 32, 32, 0)) | Should Be 'ED323QUR A  '
    }
    It 'returns empty string when the first element is the terminator' {
        (ConvertFrom-Uint16Array @(0, 65, 66)) | Should Be ''
    }
    It 'returns empty string for an empty array' {
        (ConvertFrom-Uint16Array @()) | Should Be ''
    }
}

Describe 'Get-JedecManufacturer' {
    It 'maps id 9 to Intel' {
        (Get-JedecManufacturer 9) | Should Be 'Intel'
    }
    It 'maps id 44 to Micron Technology' {
        (Get-JedecManufacturer 44) | Should Be 'Micron Technology'
    }
    It 'falls back to a labeled placeholder for an unknown id' {
        (Get-JedecManufacturer 99999) | Should Be 'JEDEC 0x1869F'
    }
}

Describe 'Get-PnpVendorName' {
    It 'maps ACR to Acer' { (Get-PnpVendorName 'ACR') | Should Be 'Acer' }
    It 'maps DEL to Dell' { (Get-PnpVendorName 'DEL') | Should Be 'Dell' }
    It 'maps BNQ to BenQ' { (Get-PnpVendorName 'BNQ') | Should Be 'BenQ' }
    It 'maps SAM to Samsung' { (Get-PnpVendorName 'SAM') | Should Be 'Samsung' }
    It 'falls back to the raw code for an unknown vendor' {
        (Get-PnpVendorName 'ZZZ') | Should Be 'ZZZ'
    }
}

Describe 'Get-BusTypeName' {
    It 'maps 17 to NVMe' { (Get-BusTypeName 17) | Should Be 'NVMe' }
    It 'maps 11 to SATA' { (Get-BusTypeName 11) | Should Be 'SATA' }
    It 'maps 7 to USB' { (Get-BusTypeName 7) | Should Be 'USB' }
    It 'maps 8 to RAID' { (Get-BusTypeName 8) | Should Be 'RAID' }
    It 'maps 10 to SAS' { (Get-BusTypeName 10) | Should Be 'SAS' }
}

Describe 'Get-MediaTypeName' {
    It 'maps 3 to HDD' { (Get-MediaTypeName 3) | Should Be 'HDD' }
    It 'maps 4 to SSD' { (Get-MediaTypeName 4) | Should Be 'SSD' }
    It 'maps 5 to SCM' { (Get-MediaTypeName 5) | Should Be 'SCM' }
    It 'maps 0 to Unspecified' { (Get-MediaTypeName 0) | Should Be 'Unspecified' }
}

Describe 'Get-FormFactorName' {
    It 'maps 8 to DIMM' { (Get-FormFactorName 8) | Should Be 'DIMM' }
    It 'maps 12 to SODIMM' { (Get-FormFactorName 12) | Should Be 'SODIMM' }
}

Describe 'Get-MemoryTypeName' {
    It 'maps 26 to DDR4' { (Get-MemoryTypeName 26) | Should Be 'DDR4' }
    It 'maps 34 to DDR5' { (Get-MemoryTypeName 34) | Should Be 'DDR5' }
    It 'maps 24 to DDR3' { (Get-MemoryTypeName 24) | Should Be 'DDR3' }
}

Describe 'Get-StorageManufacturerFromModel' {
    It 'maps a Crucial CT-prefixed model' {
        (Get-StorageManufacturerFromModel 'CT2000T700SSD5') | Should Be 'Crucial'
    }
    It 'falls back to Unknown rather than guessing' {
        (Get-StorageManufacturerFromModel 'totally-unrecognized-model') | Should Be 'Unknown'
    }
}

Describe 'Get-SerialHash' {
    It 'is deterministic for the same input' {
        (Get-SerialHash '055D00F7') | Should Be (Get-SerialHash '055D00F7')
    }
    It 'returns exactly 12 characters' {
        (Get-SerialHash '055D00F7').Length | Should Be 12
    }
    It 'returns lowercase hex' {
        (Get-SerialHash '055D00F7') | Should Match '^[0-9a-f]{12}$'
    }
    It 'never equals its input' {
        (Get-SerialHash '055D00F7') | Should Not Be '055D00F7'
    }
    It 'differs for different inputs' {
        (Get-SerialHash '055D00F7') | Should Not Be (Get-SerialHash '4859BDFA')
    }
}
