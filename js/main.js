import { createBluetoothClient } from './bluetooth.js';
import { createDom } from './dom.js';
import { createPresetStore } from './presets.js';
import { createAppState, getSelectedEqState, resetEqSlotsForProfile } from './state.js';
import { createUi } from './ui.js';
import {
    getBluetoothFilters,
    getBluetoothOptionalServices,
    getDefaultSpeakerProfile,
    getSpeakerProfiles,
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
state.deviceSleepTimer = null;
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

let diagnosticBuffer = null;
let customEqBandsBuffer = null;
let editedPresetLabel = null; // label of built-in preset last used as an editing base

function refreshPresetCache() {
    state.customEqPresets = presets.getAll();
}

function bandsMatch(left = [], right = []) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findSoftwarePresetByBands(bands) {
    return profile.capabilities.eq.presets.find(
        (preset) => preset.software && Array.isArray(preset.bands) && bandsMatch(preset.bands, bands)
    ) || null;
}

function applyDecodedUpdate(update) {
    if (!update) return;

    if (Number.isFinite(update.batteryPercentage)) {
        ui.updateBatteryStatus(update.batteryPercentage);
    }

    if (update.firmwareVersion) {
        ui.updateFirmwareVersion(update.firmwareVersion);
    }

    if (Number.isFinite(update.volumePercent)) {
        ui.updateVolumeSlider(update.volumePercent);
    }

    if (update.sleepTimer != null || update.shutdownMode != null || update.prompts) {
        if (update.sleepTimer != null) state.deviceSleepTimer = update.sleepTimer;
        ui.renderSettings(update);
    }

    if (Array.isArray(update.eqUpdates) && update.eqUpdates.length > 0) {
        let presetsChanged = false;
        update.eqUpdates.forEach((eqUpdate) => {
            const slot = state.eqSlots[eqUpdate.target];
            if (!slot) return;
            slot.id = eqUpdate.id;
            if (eqUpdate.bands) {
                slot.bands = eqUpdate.bands.slice();
            }
            // Auto-seed a named preset for button slots with custom EQ that have no local match
            if (eqUpdate.target !== profile.capabilities.eq.liveTarget
                && slot.id === profile.capabilities.eq.customPresetId
                && eqUpdate.bands
                && !findSoftwarePresetByBands(slot.bands)
                && !presets.findByBands(slot.bands)) {
                const targetDef = profile.capabilities.eq.targets.find((t) => t.value === eqUpdate.target);
                if (targetDef) {
                    const name = targetDef.label;
                    const existing = presets.getByName(name);
                    const presetId = existing ? existing.id : presets.createId();
                    presets.save({ id: presetId, name, bands: slot.bands.slice() });
                    presetsChanged = true;
                }
            }
        });
        if (presetsChanged) refreshPresetCache();
        ui.syncActiveTargetSelection();
    }
}

function handleNotification(value) {
    if (diagnosticBuffer) {
        diagnosticBuffer.notifications.push({
            time: new Date().toISOString(),
            hex: Array.from(value).map((b) => b.toString(16).padStart(2, '0')).join(' ')
        });
    }
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
        dom.browserModalClose.focus();
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

function mockConnect() {
    const selectedId = dom.mockProfileSelect.value;
    const selectedProfile = getSpeakerProfiles().find((p) => p.id === selectedId) || profile;
    if (selectedProfile !== profile) {
        profile = selectedProfile;
        resetEqSlotsForProfile(state, profile);
        state.customEqPresets = presets.getAll();
    }
    ui.renderConnectedState(`${profile.getDeviceDisplayName({ name: `LE_${profile.id}` })} (preview)`);
    ui.updateBatteryStatus(75);
    ui.updateVolumeSlider(50);
    requestAnimationFrame(() => ui.renderEqSection());
}

async function applySettings() {
    if (!state.connection.commandCharacteristic) return;
    
    const settings = {};
    const commands = [];

    profile.capabilities.features.forEach((feature) => {
        if (feature.type === 'select') {
            settings[feature.id] = dom.dynamicInputs[feature.id].value;
        } else if (feature.type === 'toggles') {
            settings[feature.id] = Object.fromEntries(
                Object.entries(dom.dynamicInputs[feature.id]).map(([key, input]) => [key, !!input.checked])
            );
        } else if (feature.type === 'sleep-timer') {
            const inputs = dom.dynamicInputs[feature.id];
            settings[feature.id] = {
                enabled: !!inputs.enabled.checked,
                hours:   Math.max(0, Math.min(23, parseInt(inputs.hours.value, 10) || 0)),
                minutes: Math.max(0, Math.min(59, parseInt(inputs.minutes.value, 10) || 0))
            };
        } else if (feature.type === 'eq-mappings') {
            const mappingSelects = dom.dynamicInputs['eq-mappings'];
            for (const [targetKey, select] of Object.entries(mappingSelects)) {
                const value = select.value;
                let id, bands;
                const softwarePreset = profile.capabilities.eq.presets.find(
                    (p) => p.value === value && p.software && p.bands
                );
                if (softwarePreset) {
                    id = profile.capabilities.eq.customPresetId;
                    bands = softwarePreset.bands.slice();
                } else if (presets.isCustomPresetValue(value)) {
                    const preset = presets.getById(value);
                    id = profile.capabilities.eq.customPresetId;
                    bands = preset.bands;
                } else {
                    id = parseInt(value, 10);
                    if (id === profile.capabilities.eq.customPresetId) {
                        // "Device EQ" placeholder — preserve the bands already on the slot
                        bands = state.eqSlots[targetKey].bands.slice();
                    } else {
                        bands = new Array(profile.capabilities.eq.bandCount).fill(0);
                    }
                }
                state.eqSlots[targetKey] = { id, bands: bands.slice() };
                commands.push(profile.createSaveEqCommand(targetKey, { id, bands }));
            }
        }
    });

    const uiTimer = settings.sleepTimer;
    const known = state.deviceSleepTimer;
    const skipSleepTimer = known != null && uiTimer != null
        && uiTimer.enabled === known.enabled
        && uiTimer.hours === known.hours
        && uiTimer.minutes === known.minutes;
    const settingsCommands = profile.createSettingsCommands(settings, { skipSleepTimer });
    commands.unshift(...settingsCommands);

    dom.applySettingsBtn.disabled = true;
    try {
        for (const [index, command] of commands.entries()) {
            await bluetooth.write(state.connection.commandCharacteristic, command);
            if (index < commands.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
        log('TX: Settings applied', 'tx');
    } finally {
        dom.applySettingsBtn.disabled = false;
    }
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
    const currentValue = dom.eqPreset.value;
    const selectedSoftwarePreset = profile.capabilities.eq.presets.find(
        (preset) => preset.value === currentValue && preset.software && Array.isArray(preset.bands)
    );
    const selectedBuiltInPreset = profile.capabilities.eq.presets.find(
        (preset) => preset.value === currentValue && Array.isArray(preset.bands)
    );
    const selectedCustomPreset = presets.isCustomPresetValue(currentValue)
        ? presets.getById(currentValue)
        : null;

    selectedEqState.id = profile.capabilities.eq.customPresetId;
    selectedEqState.bands.fill(0);

    if (selectedCustomPreset) {
        dom.eqPreset.value = selectedCustomPreset.id;
        editedPresetLabel = null;
    } else if (selectedSoftwarePreset) {
        dom.eqPreset.value = selectedSoftwarePreset.value;
        editedPresetLabel = selectedSoftwarePreset.label;
    } else if (selectedBuiltInPreset) {
        dom.eqPreset.value = selectedBuiltInPreset.value;
        editedPresetLabel = selectedBuiltInPreset.label;
    } else {
        dom.eqPreset.value = String(profile.capabilities.eq.customPresetId);
        editedPresetLabel = null;
    }

    ui.renderEqSection(dom.eqPreset.value);
    log('UI: Flattened active curve to 0dB');
}

function updateEqSliderFromPosition(slider, clientY) {
    if (slider.getAttribute('aria-disabled') === 'true') return;

    const bandIndex = parseInt(slider.dataset.band, 10);
    const input = dom.eqSliderInputs[bandIndex];
    if (!input) return;

    const rect = slider.getBoundingClientRect();
    const relY = Math.max(0, Math.min(clientY - rect.top, rect.height));
    const normalized = 1 - (relY / rect.height);
    const min = parseInt(input.min, 10);
    const max = parseInt(input.max, 10);
    input.value = String(Math.round(min + normalized * (max - min)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function adjustEqSliderValue(slider, delta) {
    if (slider.getAttribute('aria-disabled') === 'true') return;

    const bandIndex = parseInt(slider.dataset.band, 10);
    const input = dom.eqSliderInputs[bandIndex];
    if (!input) return;

    const min = parseInt(input.min, 10);
    const max = parseInt(input.max, 10);
    const nextValue = Math.max(min, Math.min(max, parseInt(input.value, 10) + delta));
    if (nextValue === parseInt(input.value, 10)) return;
    input.value = String(nextValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setEqSliderValue(slider, nextValue) {
    if (slider.getAttribute('aria-disabled') === 'true') return;

    const bandIndex = parseInt(slider.dataset.band, 10);
    const input = dom.eqSliderInputs[bandIndex];
    if (!input) return;

    const min = parseInt(input.min, 10);
    const max = parseInt(input.max, 10);
    const clampedValue = Math.max(min, Math.min(max, nextValue));
    if (clampedValue === parseInt(input.value, 10)) return;
    input.value = String(clampedValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function handleEqSliderInput(event) {
    const selectedEqState = getSelectedEqState(state, profile);
    const bandIndex = parseInt(event.target.dataset.band, 10);
    const presetValue = dom.eqPreset.value;
    const selectedSoftwarePreset = profile.capabilities.eq.presets.find(
        (preset) => preset.value === presetValue && preset.software
    );

    if (selectedEqState.id !== profile.capabilities.eq.customPresetId) {
        // Editing from a built-in preset — seed bands from overlay and switch to Custom
        const presetDef = profile.capabilities.eq.presets.find(
            (p) => p.value === String(selectedEqState.id)
        );
        editedPresetLabel = presetDef?.label ?? null;
        selectedEqState.bands = presetDef?.bands
            ? presetDef.bands.slice()
            : new Array(profile.capabilities.eq.bandCount).fill(0);
        selectedEqState.id = profile.capabilities.eq.customPresetId;
        dom.eqPreset.value = String(profile.capabilities.eq.customPresetId);
    } else if (selectedSoftwarePreset) {
        editedPresetLabel = selectedSoftwarePreset.label;
    }

    selectedEqState.bands[bandIndex] = parseInt(event.target.value, 10);
    ui.refreshEqEditor();
}

function handleEqPresetChange(event) {
    const selectedEqState = getSelectedEqState(state, profile);
    const presetValue = event.target.value;
    const customId = profile.capabilities.eq.customPresetId;
    const softwarePreset = profile.capabilities.eq.presets.find(
        (p) => p.value === presetValue && p.software
    );

    if (softwarePreset?.bands) {
        // Software preset: load bands into custom slot, keep dropdown on this preset
        if (selectedEqState.id === customId) {
            customEqBandsBuffer = selectedEqState.bands.slice();
        }
        editedPresetLabel = softwarePreset.label;
        selectedEqState.id = customId;
        selectedEqState.bands = softwarePreset.bands.slice();
    } else if (parseInt(presetValue, 10) === customId && !presets.isCustomPresetValue(presetValue)) {
        // Returning to unnamed Custom — restore buffered bands if available
        selectedEqState.id = customId;
        editedPresetLabel = null;
        if (customEqBandsBuffer) {
            selectedEqState.bands = customEqBandsBuffer.slice();
        }
    } else {
        // Leaving Custom (or loading a named preset) — save current bands first
        if (selectedEqState.id === customId) {
            customEqBandsBuffer = selectedEqState.bands.slice();
            editedPresetLabel = null;
        }
        if (presets.isCustomPresetValue(presetValue)) {
            const preset = presets.getById(presetValue);
            if (!preset) { ui.renderEqSection(); return; }
            selectedEqState.id = customId;
            selectedEqState.bands = preset.bands.slice();
        } else {
            selectedEqState.id = parseInt(presetValue, 10);
        }
    }
    ui.renderEqSection();
}

function saveCustomPreset() {
    const selectedEqState = getSelectedEqState(state, profile);
    if (selectedEqState.id !== profile.capabilities.eq.customPresetId) {
        window.alert('Switch to a custom EQ curve before saving a custom preset.');
        return;
    }

    const currentValue = dom.eqPreset.value;
    const existing = presets.isCustomPresetValue(currentValue) ? presets.getById(currentValue) : null;
    const builtInNames = profile.capabilities.eq.presets.map((p) => p.label.toLowerCase());
    const needsDifferentName = existing && !bandsMatch(existing.bands, selectedEqState.bands);

    const defaultName = needsDifferentName ? `${existing.name} (edited)`
        : existing ? existing.name
        : editedPresetLabel ? `${editedPresetLabel} (edited)`
        : '';
    const input = window.prompt('Name this custom preset:', defaultName);
    if (input === null) return;
    const name = input.trim();
    if (!name) {
        window.alert('Preset name cannot be empty.');
        return;
    }
    if (name.toLowerCase() === 'custom' || builtInNames.includes(name.toLowerCase())) {
        window.alert(`"${name}" is a reserved preset name. Please choose a different name.`);
        return;
    }

    let presetId;
    if (existing && existing.name === name) {
        // Same name — overwrite the current preset
        presetId = existing.id;
    } else {
        const existingByName = presets.getByName(name);
        if (existingByName) {
            const shouldOverwrite = window.confirm(`Overwrite the existing preset "${name}"?`);
            if (!shouldOverwrite) return;
            presetId = existingByName.id;
        } else {
            presetId = presets.createId();
        }
    }

    presets.save({ id: presetId, name, bands: selectedEqState.bands.slice() });
    editedPresetLabel = null;
    refreshPresetCache();
    ui.renderEqSection(presetId);
    ui.syncActiveTargetSelection({ matchPreset: false });
    log(`UI: Saved custom preset "${name}"`);
}

function renameCustomPreset() {
    const presetId = dom.eqPreset.value;
    const preset = presets.getById(presetId);
    if (!preset) return;

    const input = window.prompt('Rename preset:', preset.name);
    if (input === null) return;
    const name = input.trim();
    if (!name) { window.alert('Preset name cannot be empty.'); return; }
    if (name.toLowerCase() === 'custom') { window.alert('"Custom" is reserved. Please choose a different name.'); return; }
    if (name === preset.name) return;

    const existingByName = presets.getByName(name);
    if (existingByName && existingByName.id !== preset.id) {
        const shouldOverwrite = window.confirm(`A preset named "${name}" already exists. Replace it?`);
        if (!shouldOverwrite) return;
        presets.remove(existingByName.id);
    }

    presets.save({ id: preset.id, name, bands: preset.bands.slice() });
    refreshPresetCache();
    dom.eqPreset.value = presetId;
    ui.syncActiveTargetSelection({ matchPreset: false });
    log(`UI: Renamed preset to "${name}"`);
}

function deleteCustomPreset() {
    const preset = presets.getById(dom.eqPreset.value);
    if (!preset) return;

    const shouldDelete = window.confirm(`Delete custom preset "${preset.name}"?`);
    if (!shouldDelete) return;

    presets.remove(preset.id);
    refreshPresetCache();
    ui.syncActiveTargetSelection({ matchPreset: false });
    log(`UI: Deleted custom preset "${preset.name}"`);
}

async function connectForDiagnostic() {
    ui.updateDiagnosticStatus('Opening Bluetooth selector...');
    try {
        const device = await bluetooth.requestDevice(
            [{ namePrefix: 'LE_' }, { namePrefix: 'Tribit' }],
            getBluetoothOptionalServices()
        );

        ui.updateDiagnosticStatus(`Connected to ${device.name || 'Unknown'}. Reading GATT...`);
        
        // We use a dummy profile just to establish the connection and subscribe to notifications
        const dummyProfile = {
            uuids: {
                service: '21963523-0000-1000-8000-00805f9b34fb', // Common Tribit service
                command: '00007777-0000-1000-8000-00805f9b34fb',
                response: '00008888-0000-1000-8000-00805f9b34fb'
            }
        };

        const connection = await bluetooth.connect(device, dummyProfile);
        state.connection = { ...state.connection, ...connection, connected: true };

        ui.updateDiagnosticStatus('Handshake active. Please press speaker buttons now!');
        ui.updateDiagnosticStatus('Sniffing data for 15 seconds...', true);
        ui.setDiagnosticControlsVisible(true);

        diagnosticBuffer = {
            timestamp: new Date().toISOString(),
            deviceName: device.name,
            notifications: []
        };

        const deviceInfo = await bluetooth.dumpDeviceInfo(device);
        diagnosticBuffer.deviceInfo = deviceInfo;

        let countdown = 15;
        ui.setDiagnosticProgress(100);
        const interval = setInterval(() => {
            countdown -= 1;
            ui.setDiagnosticProgress((countdown / 15) * 100);
            if (countdown <= 0) clearInterval(interval);
        }, 1000);

        await new Promise((resolve) => setTimeout(resolve, 15000));
        ui.setDiagnosticProgress(null);

        const blob = new Blob([JSON.stringify(diagnosticBuffer, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tribit-diagnostic-${device.name || 'unknown'}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        ui.updateDiagnosticStatus('DUMP COMPLETE! File downloaded.', true);
        window.alert('Diagnostic dump complete and downloaded.');
    } catch (error) {
        log(`Diagnostic failed: ${error.message}`, 'err');
        ui.updateDiagnosticStatus(`Error: ${error.message}`, true);
    } finally {
        diagnosticBuffer = null;
        if (state.connection.connected) {
            bluetooth.disconnect(state.connection);
        }
    }
}

async function sendRawDiagnosticHex() {
    if (!state.connection.connected || !state.connection.commandCharacteristic) {
        ui.updateDiagnosticStatus('Cannot send: Not connected to command characteristic.', true);
        return;
    }

    const hexString = dom.diagnosticHexInput.value.replace(/\s+/g, '');
    if (!/^[0-9A-Fa-f]+$/.test(hexString) || hexString.length % 2 !== 0) {
        ui.updateDiagnosticStatus('Error: Invalid hex string. Use pairs like "09 FF".', true);
        return;
    }

    const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    try {
        await bluetooth.write(state.connection.commandCharacteristic, bytes);
        ui.updateDiagnosticStatus(`TX -> ${dom.diagnosticHexInput.value}`, true);
    } catch (error) {
        ui.updateDiagnosticStatus(`Write Error: ${error.message}`, true);
    }
}

function handleHashChange() {
    if (window.location.hash === '#dump' || window.location.hash === '#debug') {
        ui.hideMockView();
        ui.showDiagnosticView();
        dom.diagnosticConnectBtn.focus();
    } else if (window.location.hash === '#mock') {
        ui.hideDiagnosticView();
        ui.setDiagnosticControlsVisible(false);
        ui.showMockView();
        dom.mockConnectBtn.focus();
    } else {
        const wasDiagOpen = dom.diagnosticView.style.display === 'flex';
        ui.hideDiagnosticView();
        ui.setDiagnosticControlsVisible(false);
        ui.hideMockView();
        if (wasDiagOpen) {
            const diagLink = document.querySelector('.diagnostic-link');
            if (diagLink && diagLink.offsetParent !== null) diagLink.focus();
        }
    }
}

function trapFocus(container, event) {
    const focusable = Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
    } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
}

function bindEvents() {
    dom.connectBtn.addEventListener('click', connectToSpeaker);
    dom.mockConnectBtn.addEventListener('click', () => {
        mockConnect();
        window.location.hash = '';
    });
    dom.mockCloseBtn.addEventListener('click', () => {
        window.location.hash = '';
    });
    dom.browserModalClose.addEventListener('click', () => {
        ui.hideBrowserModal();
        dom.connectBtn.focus();
    });
    dom.flattenEqBtn.addEventListener('click', flattenEq);
    dom.activateEqBtn.addEventListener('click', applyLiveEq);
    dom.applySettingsBtn.addEventListener('click', applySettings);

    dom.diagnosticConnectBtn.addEventListener('click', connectForDiagnostic);
    dom.diagnosticSendBtn.addEventListener('click', sendRawDiagnosticHex);
    dom.diagnosticCloseBtn.addEventListener('click', () => {
        window.location.hash = '';
    });

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

    dom.eqSliderInputs.forEach((slider) => {
        slider.addEventListener('input', handleEqSliderInput);
    });

    dom.eqSliders.forEach((slider) => {
        slider.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
            event.preventDefault();
            slider.focus();
            slider.setPointerCapture(event.pointerId);
            updateEqSliderFromPosition(slider, event.clientY);
        });

        slider.addEventListener('pointermove', (event) => {
            if (!slider.hasPointerCapture(event.pointerId)) return;
            event.preventDefault();
            updateEqSliderFromPosition(slider, event.clientY);
        });

        slider.addEventListener('pointerup', (event) => {
            if (slider.hasPointerCapture(event.pointerId)) {
                slider.releasePointerCapture(event.pointerId);
            }
        });

        slider.addEventListener('pointercancel', (event) => {
            if (slider.hasPointerCapture(event.pointerId)) {
                slider.releasePointerCapture(event.pointerId);
            }
        });

        slider.addEventListener('keydown', (event) => {
            switch (event.key) {
            case 'ArrowUp':
            case 'ArrowRight':
                event.preventDefault();
                adjustEqSliderValue(slider, 1);
                break;
            case 'ArrowDown':
            case 'ArrowLeft':
                event.preventDefault();
                adjustEqSliderValue(slider, -1);
                break;
            case 'PageUp':
                event.preventDefault();
                adjustEqSliderValue(slider, 2);
                break;
            case 'PageDown':
                event.preventDefault();
                adjustEqSliderValue(slider, -2);
                break;
            case 'Home':
                event.preventDefault();
                setEqSliderValue(slider, parseInt(dom.eqSliderInputs[parseInt(slider.dataset.band, 10)].min, 10));
                break;
            case 'End':
                event.preventDefault();
                setEqSliderValue(slider, parseInt(dom.eqSliderInputs[parseInt(slider.dataset.band, 10)].max, 10));
                break;
            default:
                break;
            }
        });
    });

    dom.eqPreset.addEventListener('change', handleEqPresetChange);
    dom.saveCustomPresetBtn.addEventListener('click', saveCustomPreset);
    dom.renameCustomPresetBtn.addEventListener('click', renameCustomPreset);
    dom.deleteCustomPresetBtn.addEventListener('click', deleteCustomPreset);

    document.addEventListener('mousedown', () => document.body.classList.add('using-mouse'));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') document.body.classList.remove('using-mouse');
        if (event.key === 'Escape') {
            if (dom.browserModal.style.display === 'flex') {
                ui.hideBrowserModal();
                dom.connectBtn.focus();
            } else if (dom.diagnosticView.style.display === 'flex' || dom.mockView.style.display === 'flex') {
                window.location.hash = '';
            }
        }
        if (event.key === 'Tab') {
            if (dom.browserModal.style.display === 'flex') {
                trapFocus(dom.browserModal, event);
            } else if (dom.diagnosticView.style.display === 'flex') {
                trapFocus(dom.diagnosticView, event);
            } else if (dom.mockView.style.display === 'flex') {
                trapFocus(dom.mockView, event);
            }
        }
    });

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    window.addEventListener('beforeunload', () => {
        bluetooth.disconnect(state.connection);
    });
}

registerServiceWorker();
getSpeakerProfiles().forEach((p) => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.getDeviceDisplayName({ name: `LE_${p.id}` });
    dom.mockProfileSelect.append(option);
});
ui.renderInitial();
ui.setControlsVisible(false);
bindEvents();
