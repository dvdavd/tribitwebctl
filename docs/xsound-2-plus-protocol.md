# Tribit XSound Plus 2 BLE Protocol Notes

Reverse-engineered BLE control protocol for the Tribit XSound Plus 2.

## Device

- Speaker: Tribit XSound Plus 2
- BLE advertisement: `LE_Tribit XSound Plus 2`
- BLE control is separate from the Bluetooth audio connection

## GATT Characteristics

| UUID | Direction | Purpose |
|------|-----------|---------|
| `00007777-0000-1000-8000-00805f9b34fb` | write-without-response | commands (host → speaker) |
| `00008888-0000-1000-8000-00805f9b34fb` | notify | responses (speaker → host) |

## Packet Formats

### Host → speaker (`08 EE`)

```text
[08] [EE] [00 00 00] [type] [cmd] [len_lo] [len_hi] [payload...] [cksum]
```

- `type = 0x01` for XSound Plus 2
- `len_lo = 10 + payload_length`
- `len_hi = 0`
- `cksum = sum(all previous bytes) & 0xFF`

Examples:
- no payload query: total length `0x0A`
- single-byte payload: total length `0x0B`

### Speaker → host (`09 FF`)

```text
[09] [FF] [00 00 01] [01] [cmd] [len_lo] [len_hi] [payload...] [cksum]
```

- notifications arrive on characteristic `8888`
- payload starts at byte 9 and runs to the byte before checksum
- this format should not be used for writes

## Command Map

### Host → speaker

| cmd | payload | meaning |
|-----|---------|---------|
| `0x88` | `[step]` | SET volume; step = 0–31 |
| `0x8C` | `[mode]` | SET auto-shutdown; 0=off 1=on |
| `0x0B` | `[hours, minutes]` | SET sleep timer; `[0xFF, 0xFF]` = off |
| `0x90` | `[p,b,l,m,t]` | SET voice prompts; 5 booleans |
| `0x82` | `[preset_id, b0..b8]` | SET active EQ; `0xFE` means custom |
| `0x18` | `[3, btn, type, b0..b8]` | SET EQ button memory; `btn=0/1/2`, `type=0xFE` for custom |
| `0x09` | — | GET volume |
| `0x08` | — | GET play state |
| `0x06` | — | GET firmware version |
| `0x91` | — | GET voice prompts |
| `0x11` | — | GET auto-shutdown / sleep timer state |
| `0x05` | — | GET active EQ |
| `0x19` | — | GET EQ button config |

### Speaker → host notifications

| cmd | payload | meaning |
|-----|---------|---------|
| `0x09` | `[step]` | volume; step = 0–31 |
| `0x02` | `[pct]` | battery percent |
| `0x06` | `[day, month, year, major, minor, patch]` | firmware version and build date; e.g. `[24, 11, 22, 0, 3, 1]` = v0.3.1 built 2024-11-22 |
| `0x08` | `[0/1]` | play state; `1`=playing `0`=paused; sent unsolicited on change |
| `0x91` | `[p,b,l,m,t]` | voice prompts state |
| `0x11` | `[sleep_h, sleep_m, shutdown]` | sleep timer (bytes 0–1) and auto-shutdown mode (byte 2); `sleep_h=0xFF, sleep_m=0xFF` means off |
| `0x05` | `[preset_id, b0..b8]` | active EQ |
| `0x19` | `[3, btn, type, b0..b8]` | EQ button config; one packet per button |

## EQ Details

### Firmware presets

| ID | Name |
|----|------|
| 0 | XBass Off |
| 1 | XBass |
| 2 | Audiobook |
| 3 | MaxSound traditional |
| 4 | Rock |
| 5 | Jazz |
| 254 (`0xFE`) | Custom |

### Band encoding

`wire_byte = dB_value + 8`

- `-8 dB -> 0x00`
- `0 dB -> 0x08`
- `+8 dB -> 0x10`

Bands:
- 80 Hz
- 150 Hz
- 300 Hz
- 600 Hz
- 1.2 kHz
- 2.5 kHz
- 5 kHz
- 9 kHz
- 13 kHz

### EQ slots

There are four independent EQ locations:

- active EQ buffer
- off-LED button slot
- white-LED button slot
- blue-LED button slot

Pressing a hardware EQ button overwrites the active EQ with that slot’s stored setting.

A slot can also be activated by reading the stored slot config and sending it back as a live `0x82` EQ packet.

## Volume

Volume uses 0–31 internal steps.

Conversion:

```text
step = round(percent * 31 / 100)
```

## Notes On Other Models

The `08 EE` framing and several command ids appear to be shared across the Tribit `Bts11/12/13/31/35` family.

To adapt this work to another model:

- verify the packet `type` byte
- confirm which commands are actually supported
- verify whether the model uses BLE control or classic Bluetooth / SPP instead
