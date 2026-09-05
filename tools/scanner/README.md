# tools/scanner — Windows hardware scanner

`scan.ps1` reads the local machine over CIM/WMI and emits a **ScanPayload v1** JSON document
(`docs/milestones/M0-seed.md` §4) — the same contract `POST /api/v1/imports/scans` accepts.
Zero dependencies: no PowerShell modules, no `Install-Module`, no NuGet, no external binaries
(ADR-0001). Targets **Windows PowerShell 5.1** (the only PowerShell on Austin's machine); it
also runs on PowerShell 7 (`pwsh`) if present.

## Files

- `scan.ps1` — the CLI entry point (params below). Talks to CIM/the registry/the network; has
  no unit tests of its own beyond `-SelfTest`.
- `ScanLib.ps1` — pure helper functions (string/serial/manufacturer cleanup, enum-int decoding,
  uint16-array decoding, hashing). No CIM calls, no I/O — dot-sourced by `scan.ps1` and by the
  Pester tests, and directly testable in isolation.
- `ScanLib.Tests.ps1` — Pester tests for `ScanLib.ps1` (targets Pester 3.4.0, the version that
  ships with Windows PowerShell 5.1 by default: `Should Be`, not the newer `Should -Be`).
- `fixtures/MOONPC.redacted.json` — a real, `-RedactSerials` scan of Austin's desktop (host
  `MOONPC`). This is the fixture the M0 harness and integration gate import (D15: real hardware
  is the evidence).

## Usage

```powershell
# Write JSON to a file (UTF-8, no BOM), compact by default:
powershell -NoProfile -File tools/scanner/scan.ps1 -OutFile scan.json

# Human-readable (indented) JSON, with serials redacted before they ever touch disk:
powershell -NoProfile -File tools/scanner/scan.ps1 -RedactSerials -Pretty -OutFile scan.json

# No -OutFile: JSON goes to stdout.
powershell -NoProfile -File tools/scanner/scan.ps1

# POST straight to a running API instead of / as well as writing a file:
powershell -NoProfile -File tools/scanner/scan.ps1 -ApiUrl http://localhost:3000 -Token dev-token

# Run the built-in assertions (no CIM, no network — safe anywhere, including CI):
powershell -NoProfile -File tools/scanner/scan.ps1 -SelfTest
```

### Parameters

| Param | Meaning |
|---|---|
| `-OutFile <path>` | Write the ScanPayload JSON here (UTF-8, no BOM). Omit to write to stdout. |
| `-ApiUrl <url>` | POST the payload to `<ApiUrl>/api/v1/imports/scans`. A non-2xx response prints the status/body and exits 1. |
| `-Token <string>` | Sent as `Authorization: Bearer <Token>` when `-ApiUrl` is given. |
| `-RedactSerials` | Replace every non-null component `serial` (and any `specs` value whose key name contains "serial") with the first 12 hex characters of `sha256(value)`, **before** the payload is written or posted. |
| `-Pretty` | Indented JSON. Without it, JSON is compact (single line). |
| `-SelfTest` | Run the inline assertions and exit 0/1. Touches neither CIM nor the network. |

## What gets captured, and what is redacted

Components captured (all CIM/WMI, `docs/milestones/M0-seed.md` §4 categories): `cpu`
(`Win32_Processor`), `gpu` (`Win32_VideoController`, one component per adapter — **including
integrated GPUs**, they are hardware you own), `memory` (`Win32_PhysicalMemory`, one component
per physical stick), `storage` (`MSFT_PhysicalDisk`), `motherboard` (`Win32_BaseBoard` +
`Win32_BIOS`), `monitor` (`WmiMonitorID`, `root/wmi`).

A missing or inaccessible CIM class (e.g. `WmiMonitorID` on a headless box, or a namespace not
present on an older OS build) prints a warning and **skips just that category** — the scan still
completes for everything else.

Cleanup applied to every value (see `ScanLib.ps1` for the exact rules and their tests):
- Strings are trimmed and internal whitespace runs collapsed (`Clean-String`).
- Manufacturer names have `(R)`/`(TM)`/`™`/`®` and trailing corporate-form words (`Ltd.`, `LLC`,
  `Inc.`, `Corporation`, `Corp.`, `Co.`, `Technology`, `International`, …) stripped
  (`Clean-Manufacturer`) — e.g. `"Gigabyte Technology Co., Ltd."` → `Gigabyte`.
- Placeholder serials (`"Default string"`, `"To Be Filled By O.E.M."`, `"None"`,
  `"System Serial Number"`, `"Unknown"`, `"0"`, all-zero strings, empty) become `null`, never the
  placeholder text (`Clean-Serial`). Trailing punctuation (`.`, `,`, `;`) that CIM sometimes
  appends — like this machine's NVMe drive, which reports a stray trailing dot — is stripped;
  a real serial is otherwise left exactly as reported (internal separators like underscores are
  untouched, and leading punctuation is never stripped).
- `Win32_VideoController.AdapterRAM` is a **uint32 that wraps** above ~4 GB — `scan.ps1` never
  publishes it. Instead it reads the true size from
  `HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\<NNNN>\HardwareInformation.qwMemorySize`,
  matched to the adapter by `DriverDesc` (exact match) or `MatchingDeviceId` vs. the adapter's
  `PNPDeviceID` (prefix match). If it can't uniquely match an adapter to a registry entry, it
  **omits `vramMB`** for that adapter rather than publish a wrong (or wrapped) number.
- Monitor fields (`ManufacturerName`, `UserFriendlyName`, `SerialNumberID`, `ProductCodeID`) are
  `uint16[]`/byte arrays, zero-terminated — decoded with `ConvertFrom-Uint16Array`. The 3-letter
  PNP vendor code is mapped to a display name (`Get-PnpVendorName`; unknown codes fall back to
  the raw code). `widthPx`/`heightPx` are intentionally never emitted: WMI only exposes physical
  size in centimeters or the *current* video mode, and matching that reliably to a specific
  monitor (multi-monitor, docking, hotplug) isn't sound without guessing.
- `DeviceLocator` (memory slot) is **not a unique identifier** — two sticks can both report
  `"DIMM 1"`. It is still emitted as `slot` (informational), and `BankLabel` is included in
  `specs` so a human can tell the sticks apart; the (redacted) serial is what actually
  disambiguates them.
- Enum ints are decoded to strings in `specs`: `MSFT_PhysicalDisk.BusType` (`Get-BusTypeName`),
  `.MediaType` (`Get-MediaTypeName`), `Win32_PhysicalMemory.FormFactor` (`Get-FormFactorName`),
  `.SMBIOSMemoryType` (`Get-MemoryTypeName`).
- `MSFT_PhysicalDisk.Manufacturer` is frequently blank for NVMe drives (seen on this machine's
  Crucial `CT2000T700SSD5`). When blank, `Get-StorageManufacturerFromModel` falls back to a small
  model-prefix heuristic (documented as best-effort in `ScanLib.ps1`); it returns `"Unknown"`
  rather than a fabricated brand when nothing matches.
- `Get-JedecManufacturer` maps a **numeric** JEDEC id to a manufacturer name, for boards that
  report memory `Manufacturer` as a number instead of a string. It is a partial table (JEDEC
  Bank-1 ids only) and is **not exercised by real hardware in this milestone** — every machine
  scanned so far reports a manufacturer string (e.g. `"G.SKILL"`). Unknown ids fall back to a
  labeled `"JEDEC 0x.."` string, never a guess.

`-RedactSerials` runs **before** the JSON is written or posted, so a raw serial never touches
disk or the network when the flag is given.

## Testing

Two independent paths cover `ScanLib.ps1`, so coverage doesn't depend on Pester being present:

```powershell
# Always works — no CIM, no network, no external module:
powershell -NoProfile -File tools/scanner/scan.ps1 -SelfTest

# If Pester is installed (Windows ships Pester 3.4.0 by default under
# "Windows PowerShell Modules"; check with Get-Module -ListAvailable Pester):
Invoke-Pester tools/scanner/ScanLib.Tests.ps1
```

`scan.ps1` itself (the CIM/registry/network-facing part) has no automated test — it is exercised
by actually running it on real hardware and by the M0 harness/integration gate importing the
fixture below.

## Running on a second machine (manual test guide input)

1. Copy `tools/scanner/scan.ps1` and `tools/scanner/ScanLib.ps1` to the target machine (same
   directory, `ScanLib.ps1` is dot-sourced by relative path) — no other files are required.
2. Open Windows PowerShell (5.1 is fine) and run:
   ```powershell
   powershell -NoProfile -File scan.ps1 -RedactSerials -Pretty -OutFile scan.json
   ```
3. Eyeball `scan.json`: `schemaVersion` is `1`, `host.hostname` is the machine's real name, and
   `components` has one entry per cpu/gpu/memory stick/drive/motherboard/monitor the OS reports.
4. To import straight into a running API instead of (or in addition to) writing a file:
   ```powershell
   powershell -NoProfile -File scan.ps1 -RedactSerials -ApiUrl http://<api-host>:3000 -Token <token>
   ```
   A 2xx response prints the import's `summary`; anything else prints the response and exits 1.
5. To contribute the scan as a new milestone fixture, save it as
   `tools/scanner/fixtures/<hostname>.redacted.json` (always with `-RedactSerials`) and grep the
   result for the machine's real serial numbers to confirm none survived.
