import { xsoundPlus2Profile } from './xsound-plus-2.js';
import { stormboxMiniPlusProfile } from './stormbox-mini-plus.js';
export { createProfile } from './base.js';

/**
 * Speaker profile interface.
 *
 * Required:
 *   id: string                         Unique identifier (e.g. 'xsound-plus-2')
 *   bluetoothFilters: object[]         Web Bluetooth requestDevice filters
 *   uuids: { service, command, response }  BLE service/characteristic UUIDs
 *   capabilities: {
 *     shutdownOptions: { value, label }[]
 *     prompts: string[]                   Prompt toggle keys (order matters for commands)
 *     eq: {
 *       bandCount: number
 *       customPresetId: number
 *       liveTarget: string              Key in eqSlots for the "active/live" EQ (e.g. 'active')
 *       targets: { value, label }[]     EQ save targets (must include liveTarget)
 *       presets: { value, label }[]     Built-in EQ presets
 *     }
 *   }
 *   matchesDevice(device): boolean
 *   buildCommand(command, payload?): Uint8Array
 *   getInitialSyncCommands(): number[]
 *   createVolumeCommand(volumePercent): Uint8Array
 *   createApplyEqCommand(eqState): Uint8Array
 *   createSaveEqCommand(targetKey, eqState): Uint8Array
 *   createSettingsCommands(settings): Uint8Array[]
 *   decodeNotification(value): object | null
 *
 * Optional (defaults provided by createProfile):
 *   getDeviceDisplayName(device): string
 *   getFriendlyConnectError(error): { title, message } | null
 *   getBatteryIconKey(percentage): string
 */

const profiles = [xsoundPlus2Profile, stormboxMiniPlusProfile];

export function getDefaultSpeakerProfile() {
    return profiles[0];
}

export function getSpeakerProfiles() {
    return profiles.slice();
}

export function getBluetoothFilters() {
    return profiles.filter((p) => !p.disabled).flatMap((profile) => profile.bluetoothFilters || []);
}

export function getBluetoothOptionalServices() {
    return Array.from(new Set(profiles.filter((p) => !p.disabled).map((profile) => profile.uuids?.service).filter(Boolean)));
}

export function matchSpeakerProfile(device) {
    return profiles.find((profile) => !profile.disabled && profile.matchesDevice?.(device)) || null;
}
