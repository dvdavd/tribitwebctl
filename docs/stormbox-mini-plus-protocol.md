# Tribit StormBox Mini+ BLE Protocol Notes

Work in pgoress BLE control protocol for the Tribit StormBox Mini+.

## Device

- Speaker: Tribit StormBox Mini+
- Classic BT advertisement: `Tribit StormBox Mini+`
- BLE advertisement: assumed `LE_Tribit StormBox Mini+` (unconfirmed)
- BLE control is separate from the Bluetooth audio connection

## GATT Characteristics

**Unconfirmed** — currently using XSound Plus 2 values as a hypothesis. Verify via BLE scan on first connection.

| UUID | Direction | Purpose |
|------|-----------|---------|
| `00007777-0000-1000-8000-00805f9b34fb` | write-without-response | commands (host → speaker) |
| `00008888-0000-1000-8000-00805f9b34fb` | notify | responses (speaker → host) |

Service UUID also unconfirmed.

## Packet Format

Same `08 EE` framing as XSound Plus 2:

```text
[08] [EE] [00 00 00] [type] [cmd] [len_lo] [len_hi] [payload...] [cksum]
```

- `type` byte: **unconfirmed** (XSound Plus 2 uses `0x01`)
- `len_lo = 10 + payload_length`, `len_hi = 0`
- `cksum = sum(all previous bytes) & 0xFF`

Notification format (speaker → host) matches XSound Plus 2.

## Command Map

### Host → speaker

| cmd | payload | meaning |
|-----|---------|---------|
| `0x82` | `[preset_id, b0..b8]` | SET EQ preset/bands |
| `0x87` | `[state]` | SET play state |
| `0x8C` | `[mode]` | SET auto-shutdown; `0`=off `1`=on |
| `0x0B` | `[hours, minutes]` | SET sleep timer; `[0xFF, 0xFF]` = off |
| `0x14` | `[mode]` | SET light mode; values unconfirmed |
| `0x18` | — | SET EQ button config |
| `0x19` | — | GET EQ button config |
| `0x21` | `[r, g, b]` | SET light bar colour (RGB) ? |
| `0x26` | — | Light reset ? |
| `0x27` | `[0/1]` | SET game mode ? |
| `0x40` | — | OTA ready |
| `0x7C` | — | Factory reset |
| `0x90` | — | SET voice prompts ? |
| `0x91` | — | GET voice prompts ? |
| `0x02` | — | (battery notification — sent unsolicited) |
| `0x05` | — | GET EQ state |
| `0x06` | — | GET firmware version |
| `0x08` | — | GET play state |
| `0x09` | — | GET volume |
| `0x11` | — | GET auto-shutdown state |
| `0x15` | — | GET light mode |
| `0x17` | — | Disconnect |
| `0x20` | — | GET charge state |
| `0x28` | — | GET game mode ? |

### Speaker → host notifications

| cmd | payload | meaning |
|-----|---------|---------|
| `0x02` | `[pct]` | battery percent |
| `0x05` | `[preset_id, b0..b8]` | active EQ state |
| `0x06` | `[?, ?, ?, major, minor, patch]` | firmware version |
| `0x09` | `[step]` | volume (scale unconfirmed) |
| `0x11` | `[shutdown]` | auto-shutdown state (payload layout unconfirmed) |
| `0x15` | `[mode]` | light mode (payload position unconfirmed) |

## EQ Details

### Presets

Wire IDs from `Bts33Constant` — **not yet confirmed**:

| ID (assumed) | Name |
|---|---|
| ? | Music |
| ? | Audiobook |
| ? | Classical |
| ? | Rock |
| ? | Jazz |
| `0xFE` (254) | Custom (assumed, same as XSound Plus 2) ? |

### Band encoding

Assumed same as XSound Plus 2: `wire_byte = dB_value + 8`

### Bands

Same 9-band layout as XSound Plus 2: 80 Hz, 150 Hz, 300 Hz, 600 Hz, 1.2 kHz, 2.5 kHz, 5 kHz, 9 kHz, 13 kHz.

## Lighting

Three states exposed in the official app: Off, Mode 1, Mode 2.

Commands `0x14` (SET) and `0x15` (GET). Payload values for each mode unconfirmed.

## Volume

Scale unconfirmed. Assumed 0–31 steps matching XSound Plus 2.

## What Needs Hardware Verification

- BLE advertised name
- Service UUID and characteristic UUIDs
- `type` byte in packet header
- EQ preset wire IDs
- `CUSTOM_PRESET_ID` value
- Volume scale
- `0x11` response payload layout (auto-shutdown byte position)
- `0x15` response payload layout (light mode byte position)
- Light mode payload values for `0x14`
