# Diagnostic Mode

Diagnostic Mode is a built-in tool for capturing raw BLE data from unsupported speakers. It is useful when adding support for a new device.

## Accessing diagnostic mode

Use the **Diagnostic Mode** link in the app footer on the connect screen.

## How it works

1. Click **Connect & Dump** - a Bluetooth device picker opens filtering for devices with names starting `LE_` or `Tribit`.
2. Once connected, the app subscribes to the speaker's standard GATT notification characteristic and performs the initial handshake.
3. A 15-second capture window opens. Press buttons on the speaker (volume, EQ, power, etc.) during this time to record the notifications each action produces.
4. While connected you can also send arbitrary raw hex commands to the speaker using the **Send** input field (e.g. `02 01`). Responses are logged in real time.
5. After 15 seconds the app downloads a `tribit-diagnostic-<device>-<timestamp>.json` file containing the device name, full GATT service/characteristic inventory, and every notification received during the session.

## Using the dump

Share the downloaded JSON when opening an issue or pull request to add a new speaker profile. The dump gives enough information to identify the service and characteristic UUIDs, decode command/response packet structure, and wire up a new profile in `js/speakers/`.

## Supported Speaker Profiles

Currently implemented:

- `LE_Tribit XSound Plus 2`

Speaker-specific behavior lives in `js/speakers/`. Adding support for more devices should mainly involve introducing another profile that defines:

- Bluetooth filters and GATT UUIDs
- supported EQ/settings capabilities
- command builders
- notification decoding
- friendly connection error handling
