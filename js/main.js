import { createBluetoothClient } from './bluetooth.js';
import { createDom } from './dom.js';
import { createPresetStore } from './presets.js';
import { createAppState, getSelectedEqState, resetEqSlotsForProfile } from './state.js';
import { createUi } from './ui.js';
import {
    getBluetoothFilters,
    getBluetoothOptionalServices,
    getDefaultSpeakerProfile,
    matchSpeakerProfile
} from './speakers/index.js';

const APP_TITLE = 'Tribit Web Control';
const CUSTOM_EQ_STORAGE_KEY = 'tribit.customEqPresets.v1';
let profile = getDefaultSpeakerProfile();

function log(message, type = '') {
    const prefix = type ? `[${type.toUpperCase()}] ` : '';
    console.log(`${prefix}${message}`);
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
        await navigator.serviceWorker.register('./sw.js');
        log('Service worker registered');
    } catch (error) {
        log(`Service worker registration failed: ${error.message}`, 'err');
    }
}

const dom = createDom();
const state = createAppState(profile);
const presets = createPresetStore({
    storageKey: CUSTOM_EQ_STORAGE_KEY,
    bandCount: profile.capabilities.eq.bandCount,
    log
});
state.customEqPresets = presets.getAll();

const ui = createUi({
    appTitle: APP_TITLE,
    dom,
    getProfile: () => profile,
    state,
    presets
});
const bluetooth = createBluetoothClient({
    log,
    onDisconnected: handleDisconnected,
    onNotification: handleNotification
});

function refreshPresetCache() {
    state.customEqPresets = presets.getAll();
}

function getCustomPresetSelection(eqState) {
    if (eqState.id !== profile.capabilities.eq.customPresetId) {
        return String(eqState.id);
    }
    return presets.findByBands(eqState.bands)?.id || String(profile.capabilities.eq.customPresetId);
}

function applyDecodedUpdate(update) {
    if (!update) return;

    if (Number.isFinite(update.batteryPercentage)) {
        ui.updateBatteryStatus(update.batteryPercentage);
    }

    if (Number.isFinite(update.volumePercent)) {
        ui.updateVolumeSlider(update.volumePercent);
    }

    if (update.shutdownMode != null || update.prompts) {
        ui.renderSettings(update);
    }

    if (Array.isArray(update.eqUpdates) && update.eqUpdates.length > 0) {
        update.eqUpdates.forEach((eqUpdate) => {
            const slot = state.eqSlots[eqUpdate.target];
            if (!slot) return;
            slot.id = eqUpdate.id;
            if (eqUpdate.bands) {
                slot.bands = eqUpdate.bands.slice();
            }
        });
        ui.syncActiveTargetSelection();
    }
}

function handleNotification(value) {
    applyDecodedUpdate(profile.decodeNotification(value, state));
}

function handleDisconnected() {
    state.connection.connected = false;
    state.connection.device = null;
    state.connection.commandCharacteristic = null;
    state.connection.server = null;
    ui.renderDisconnectedState();
    ui.setControlsVisible(false);
}

async function runInitialSync() {
    ui.setEqInputsDisabled(true);
    log('Syncing initial state...');
    for (const command of profile.getInitialSyncCommands()) {
        await bluetooth.write(state.connection.commandCharacteristic, profile.buildCommand(command));
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    ui.setEqInputsDisabled(false);
    ui.renderEqSection();
}

async function connectToSpeaker() {
    if (!navigator.bluetooth) {
        ui.showBrowserModal();
        return;
    }

    ui.hideErrorPanel();
    ui.setConnectLoading(true, 'Connecting...');

    try {
        const device = await bluetooth.requestDevice(
            getBluetoothFilters(),
            getBluetoothOptionalServices()
        );
        const matchedProfile = matchSpeakerProfile(device);
        if (!matchedProfile) {
            throw new Error(`Unsupported speaker selected: ${device.name || 'Unknown device'}`);
        }
        if (matchedProfile !== profile) {
            profile = matchedProfile;
            resetEqSlotsForProfile(state, profile);
            state.customEqPresets = presets.getAll();
        }
        const connection = await bluetooth.connect(device, profile);
        state.connection = {
            ...state.connection,
            ...connection,
            connected: true
        };

        ui.renderConnectedState(profile.getDeviceDisplayName(connection.device));
        await runInitialSync();
    } catch (error) {
        log(error.message, 'err');
        const friendlyError = profile.getFriendlyConnectError(error);
        if (friendlyError) {
            ui.showErrorPanel(friendlyError.title, friendlyError.message);
        }
        ui.setConnectLoading(false);
    }
}

async function applySettings() {
    if (!state.connection.commandCharacteristic) return;
    const settings = {
        shutdownMode: dom.shutdownSelect.value,
        prompts: Object.fromEntries(
            profile.capabilities.prompts.map((prompt) => [prompt, !!dom.promptCheckboxes[prompt].checked])
        )
    };

    const commands = profile.createSettingsCommands(settings);

    // Add hardware button mapping commands
    const btnSelects = [dom.btn0Select, dom.btn1Select, dom.btn2Select];
    for (let i = 0; i < btnSelects.length; i++) {
        const value = btnSelects[i].value;
        let id, bands;
        if (presets.isCustomPresetValue(value)) {
            const preset = presets.getById(value);
            id = profile.capabilities.eq.customPresetId;
            bands = preset.bands;
        } else {
            id = parseInt(value, 10);
            bands = new Array(profile.capabilities.eq.bandCount).fill(0);
        }
        commands.push(profile.createSaveEqCommand(`btn${i}`, { id, bands }));
    }

    for (const [index, command] of commands.entries()) {
        await bluetooth.write(state.connection.commandCharacteristic, command);
        if (index < commands.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    log('TX: Settings applied', 'tx');
}

async function applyLiveEq() {
    if (!state.connection.commandCharacteristic) return;
    await bluetooth.write(
        state.connection.commandCharacteristic,
        profile.createApplyEqCommand(getSelectedEqState(state, profile))
    );
    log('TX: Applied to Live Sound', 'tx');
}

function flattenEq() {
    const selectedEqState = getSelectedEqState(state, profile);
    selectedEqState.id = profile.capabilities.eq.customPresetId;
    selectedEqState.bands.fill(0);
    ui.renderEqSection();
    log('UI: Flattened active curve to 0dB');
}

function handleEqSliderInput(event) {
    const selectedEqState = getSelectedEqState(state, profile);
    const bandIndex = parseInt(event.target.dataset.band, 10);
    const value = parseInt(event.target.value, 10);
    selectedEqState.bands[bandIndex] = value;
    if (selectedEqState.id === profile.capabilities.eq.customPresetId) {
        dom.eqPreset.value = getCustomPresetSelection(selectedEqState);
    }
    ui.renderEqSection();
}

function handleEqPresetChange(event) {
    const selectedEqState = getSelectedEqState(state, profile);
    const presetValue = event.target.value;
    if (presets.isCustomPresetValue(presetValue)) {
        const preset = presets.getById(presetValue);
        if (!preset) {
            ui.renderEqSection();
            return;
        }
        selectedEqState.id = profile.capabilities.eq.customPresetId;
        selectedEqState.bands = preset.bands.slice();
    } else {
        selectedEqState.id = parseInt(presetValue, 10);
    }
    ui.renderEqSection();
}

function saveCustomPreset() {
    const selectedEqState = getSelectedEqState(state, profile);
    if (selectedEqState.id !== profile.capabilities.eq.customPresetId) {
        window.alert('Switch to a custom EQ curve before saving a custom preset.');
        return;
    }

    const existingMatch = presets.findByBands(selectedEqState.bands);
    const suggestedName = existingMatch ? existingMatch.name : '';
    const input = window.prompt('Name this custom preset:', suggestedName);
    if (input === null) return;

    const name = input.trim();
    if (!name) {
        window.alert('Preset name cannot be empty.');
        return;
    }

    const existingByName = presets.getByName(name);
    let presetId = existingMatch ? existingMatch.id : presets.createId();

    if (existingByName && existingByName.id !== presetId) {
        const shouldOverwrite = window.confirm(`Overwrite the existing preset "${name}"?`);
        if (!shouldOverwrite) return;
        presetId = existingByName.id;
        if (existingMatch && existingMatch.id !== presetId) {
            presets.remove(existingMatch.id);
        }
    }

    presets.save({
        id: presetId,
        name,
        bands: selectedEqState.bands.slice()
    });
    refreshPresetCache();
    dom.eqPreset.value = presetId;
    ui.syncActiveTargetSelection();
    log(`UI: Saved custom preset "${name}"`);
}

function deleteCustomPreset() {
    const preset = presets.getById(dom.eqPreset.value);
    if (!preset) return;

    const shouldDelete = window.confirm(`Delete custom preset "${preset.name}"?`);
    if (!shouldDelete) return;

    presets.remove(preset.id);
    refreshPresetCache();
    ui.syncActiveTargetSelection();
    log(`UI: Deleted custom preset "${preset.name}"`);
}

function bindEvents() {
    dom.connectBtn.addEventListener('click', connectToSpeaker);
    dom.browserModalClose.addEventListener('click', ui.hideBrowserModal);
    dom.flattenEqBtn.addEventListener('click', flattenEq);
    dom.activateEqBtn.addEventListener('click', applyLiveEq);
    dom.applySettingsBtn.addEventListener('click', applySettings);

    dom.volume.addEventListener('input', (event) => {
        ui.updateVolumeSlider(parseInt(event.target.value, 10));
    });

    dom.volume.addEventListener('change', async (event) => {
        if (!state.connection.commandCharacteristic) return;
        await bluetooth.write(
            state.connection.commandCharacteristic,
            profile.createVolumeCommand(parseInt(event.target.value, 10))
        );
    });

    dom.eqSliders.forEach((slider) => {
        slider.addEventListener('input', handleEqSliderInput);
    });

    dom.eqPreset.addEventListener('change', handleEqPresetChange);
    dom.saveCustomPresetBtn.addEventListener('click', saveCustomPreset);
    dom.deleteCustomPresetBtn.addEventListener('click', deleteCustomPreset);

    window.addEventListener('beforeunload', () => {
        bluetooth.disconnect(state.connection);
    });
}

registerServiceWorker();
ui.renderInitial();
ui.setControlsVisible(false);
bindEvents();
