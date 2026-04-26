import { buildPacket, parseNotificationPacket } from '../protocol.js';
import { createProfile } from './base.js';

const DEVICE_TYPE = 0x01;
const CUSTOM_PRESET_ID = 3;

// Wire IDs confirmed from EqUtil.preEqIndex (old firmware, isNewVersion33=false, fw ≤ v1.02.00).
// New firmware (> v1.02.00) uses a different preset set — needs hardware validation.
const EQ_PRESETS = [
    { value: String(CUSTOM_PRESET_ID), label: 'Custom' },
    { value: '2',  label: 'Music',     color: '#81c784', bands: null },
    { value: '7',  label: 'Audiobook', color: '#ff8a65', bands: null },
    { value: '8',  label: 'Classical', color: '#9c27b0', bands: null },
    { value: '9',  label: 'Rock',      color: '#f9e31c', bands: null },
    { value: '11', label: 'Jazz',      color: '#a0785a', bands: null }
];

function normalizeBands(payload, startIndex, count) {
    return Array.from(payload.slice(startIndex, startIndex + count)).map((value) => value - 8);
}

export const stormboxMiniPlusProfile = createProfile({
    id: 'stormbox-mini-plus',
    disabled: true,
    // TODO: confirm LE advertised name (assumed LE_ prefix matches classic BT name)
    bluetoothFilters: [{ namePrefix: 'LE_Tribit StormBox Mini+' }],
    uuids: {
        service: '00002000-0000-1000-8000-00805f9b34fb',
        command: '00002003-0000-1000-8000-00805f9b34fb',
        response: '00002002-0000-1000-8000-00805f9b34fb'
    },
    capabilities: {
        features: [
            {
                type: 'toggles',
                id: 'shutdownMode',
                items: [
                    { key: 'enabled', label: 'Auto Shutdown' }
                ]
            },
            {
                type: 'divider',
                style: 'original',
                label: 'Lighting'
            },
            {
                type: 'select',
                id: 'lightMode',
                label: 'Mode',
                // TODO: confirm payload values for each mode (cmd 0x14)
                options: [
                    { value: '0', label: 'Off' },
                    { value: '1', label: 'Mode 1' },
                    { value: '2', label: 'Mode 2' }
                ]
            }
        ],
        eq: {
            bandCount: 9,
            customPresetId: CUSTOM_PRESET_ID,
            liveTarget: 'active',
            targets: [
                { value: 'active', label: 'Current Settings' }
            ],
            presets: EQ_PRESETS
        }
    },
    matchesDevice(device) {
        return device?.name === 'LE_Tribit StormBox Mini+';
    },
    getDeviceDisplayName(device) {
        return (device?.name || 'Tribit speaker').replace(/^LE_/, '');
    },
    buildCommand(command, payload = []) {
        return buildPacket(DEVICE_TYPE, command, payload);
    },
    getInitialSyncCommands() {
        // TODO: verify — 0x02=battery, 0x09=volume, 0x11=shutdown state, 0x05=EQ, 0x06=firmware, 0x15=light mode
        return [0x02, 0x09, 0x11, 0x05, 0x06, 0x15];
    },
    createVolumeCommand(volumePercent) {
        // TODO: confirm volume scale (0x88 cmd + 0-31 range assumed same as XSound Plus 2)
        return this.buildCommand(0x88, [Math.round(volumePercent * 31 / 100)]);
    },
    createApplyEqCommand(eqState) {
        return this.buildCommand(0x82, [eqState.id, ...eqState.bands.map((band) => band + 8)]);
    },
    createSaveEqCommand(_targetKey, _eqState) {
        // Mini+ has no EQ button mappings — this should never be called
        throw new Error('StormBox Mini+ does not support EQ button save targets');
    },
    createSettingsCommands(settings) {
        const commands = [
            this.buildCommand(0x8C, [settings.shutdownMode?.enabled ? 1 : 0])
        ];
        if (settings.lightMode !== undefined) {
            commands.push(this.buildCommand(0x14, [parseInt(settings.lightMode, 10)]));
        }
        return commands;
    },
    decodeNotification(value) {
        const packet = parseNotificationPacket(value);
        if (!packet) return null;

        switch (packet.command) {
            case 0x02:
                return { batteryPercentage: packet.payload[0] };
            case 0x09:
                // TODO: confirm volume scale matches XSound Plus 2 (0-31)
                return { volumePercent: Math.round(packet.payload[0] * 100 / 31) };
            case 0x05:
                if (packet.payload.length >= 10) {
                    return {
                        eqUpdates: [{
                            target: 'active',
                            id: packet.payload[0],
                            bands: packet.payload[0] === CUSTOM_PRESET_ID
                                ? normalizeBands(packet.payload, 1, 9)
                                : null
                        }]
                    };
                }
                return null;
            case 0x11:
                // TODO: confirm payload position for shutdown state
                if (packet.payload.length >= 1) {
                    return { shutdownMode: { enabled: packet.payload[0] !== 0 } };
                }
                return null;
            case 0x06:
                if (packet.payload.length >= 6) {
                    const [, , , major, minor, patch] = packet.payload;
                    return { firmwareVersion: `v${major}.${minor}.${patch}` };
                }
                return null;
            case 0x15:
                // TODO: confirm payload byte position for light mode value
                if (packet.payload.length >= 1) {
                    return { lightMode: String(packet.payload[0]) };
                }
                return null;
            default:
                return null;
        }
    }
});
