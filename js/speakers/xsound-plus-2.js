import { buildPacket, parseNotificationPacket } from '../protocol.js';
import { createProfile } from './base.js';

const DEVICE_TYPE = 0x01;
const CUSTOM_PRESET_ID = 254;

function normalizeBands(payload, startIndex, count) {
    return Array.from(payload.slice(startIndex, startIndex + count)).map((value) => value - 8);
}

export const xsoundPlus2Profile = createProfile({
    id: 'xsound-plus-2',
    bluetoothFilters: [{ namePrefix: 'LE_Tribit XSound Plus 2'}],
    uuids: {
        service: '21963523-0000-1000-8000-00805f9b34fb',
        command: '00007777-0000-1000-8000-00805f9b34fb',
        response: '00008888-0000-1000-8000-00805f9b34fb'
    },
    capabilities: {
        features: [
            {
                type: 'select',
                id: 'shutdownMode',
                label: 'Auto Off',
                options: [
                    { value: '0', label: 'Never' },
                    { value: '1', label: '15 Minutes' },
                    { value: '2', label: '30 Minutes' },
                    { value: '3', label: '45 Minutes' },
                    { value: '4', label: '60 Minutes' }
                ]
            },
            {
                type: 'divider',
                style: 'alternate',
                label: 'EQ Button Mappings'
            },
            {
                type: 'eq-mappings',
                targets: [
                    { value: 'btn0', label: 'LED Off' },
                    { value: 'btn1', label: 'White LED' },
                    { value: 'btn2', label: 'Blue LED' }
                ]
            },
            {
                type: 'divider',
                style: 'original',
                label: 'Voice & Beep Prompts'
            },
            {
                type: 'toggles',
                id: 'prompts',
                items: [
                    { key: 'p', label: 'Power On/Off Beep' },
                    { key: 'b', label: 'Bluetooth Pairing Beep' },
                    { key: 'l', label: 'Low Battery Beep' },
                    { key: 'm', label: 'Maximum Volume Beep' },
                    { key: 't', label: 'TWS Pairing Beep' }
                ]
            }
        ],
        eq: {
            bandCount: 9,
            customPresetId: CUSTOM_PRESET_ID,
            liveTarget: 'active',
            targets: [
                { value: 'active', label: 'Current Settings' },
                { value: 'btn0', label: 'LED Off' },
                { value: 'btn1', label: 'White LED' },
                { value: 'btn2', label: 'Blue LED' }
            ],
            // bands: nine values in dB (-8 to +8) matching the Tribit app display
            // color: hex color matching the Tribit app curve colour for that preset
            presets: [
                { value: '254', label: 'Custom' },
                { value: 'sw:balanced', label: 'Balanced', software: true, color: '#81c784', bands: [1, 0, 1, 2, 2, 0, 1, -2, -6] },
                { value: '0', label: 'XBass Off',            color: '#e65100', bands: null },
                { value: '1', label: 'XBass',                color: '#00bcd4', bands: null },
                { value: '2', label: 'Audiobook',            color: '#ff8a65', bands: null },
                { value: '3', label: 'MaxSound traditional', color: '#f9e31c', bands: [-6, -3, 0, 0, 0, 0, -3, -5, -5] },
                { value: '4', label: 'Rock',                 color: '#9c27b0', bands: [0, 0, 0, 0, 0, 0, 3, 4, 4] },
                { value: '5', label: 'Jazz',                 color: '#a0785a', bands: [4, 0, 4, 4, 0, 0, 0, 0, 0] }
            ]
        }
    },
    matchesDevice(device) {
        return device?.name === 'LE_Tribit XSound Plus 2';
    },
    getDeviceDisplayName(device) {
        return (device?.name || 'Tribit speaker').replace(/^LE_/, '');
    },
    buildCommand(command, payload = []) {
        return buildPacket(DEVICE_TYPE, command, payload);
    },
    getInitialSyncCommands() {
        return [0x02, 0x09, 0x11, 0x91, 0x05, 0x19];
    },
    createVolumeCommand(volumePercent) {
        return this.buildCommand(0x88, [Math.round(volumePercent * 31 / 100)]);
    },
    createApplyEqCommand(eqState) {
        return this.buildCommand(0x82, [eqState.id, ...eqState.bands.map((band) => band + 8)]);
    },
    createSaveEqCommand(targetKey, eqState) {
        const buttonIndex = parseInt(targetKey.replace('btn', ''), 10);
        return this.buildCommand(0x18, [3, buttonIndex, eqState.id, ...eqState.bands.map((band) => band + 8)]);
    },
    createSettingsCommands(settings) {
        const promptsFeature = this.capabilities.features.find((f) => f.id === 'prompts');
        return [
            this.buildCommand(0x8C, [parseInt(settings.shutdownMode, 10)]),
            this.buildCommand(0x90, promptsFeature.items.map((p) => settings.prompts[p.key] ? 1 : 0))
        ];
    },
    decodeNotification(value) {
        const packet = parseNotificationPacket(value);
        if (!packet) return null;

        switch (packet.command) {
            case 0x02:
                return { batteryPercentage: packet.payload[0] };
            case 0x09:
                return { volumePercent: Math.round(packet.payload[0] * 100 / 31) };
            case 0x05:
                if (packet.payload.length >= 10) {
                    return {
                        eqUpdates: [
                            {
                                target: 'active',
                                id: packet.payload[0],
                                bands: packet.payload[0] === CUSTOM_PRESET_ID
                                    ? normalizeBands(packet.payload, 1, 9)
                                    : null
                            }
                        ]
                    };
                }
                return null;
            case 0x19:
                if (packet.payload.length >= 12) {
                    return {
                        eqUpdates: [
                            {
                                target: `btn${packet.payload[1]}`,
                                id: packet.payload[2],
                                bands: packet.payload[2] === CUSTOM_PRESET_ID
                                    ? normalizeBands(packet.payload, 3, 9)
                                    : null
                            }
                        ]
                    };
                }
                return null;
            case 0x11:
                if (packet.payload.length >= 3) {
                    return { shutdownMode: String(packet.payload[2]) };
                }
                return null;
            case 0x91:
                if (packet.payload.length >= 5) {
                    return {
                        prompts: {
                            p: !!packet.payload[0],
                            b: !!packet.payload[1],
                            l: !!packet.payload[2],
                            m: !!packet.payload[3],
                            t: !!packet.payload[4]
                        }
                    };
                }
                return null;
            default:
                return null;
        }
    }
});
