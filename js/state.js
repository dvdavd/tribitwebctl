export function createEqSlotState(bandCount, customPresetId) {
    return {
        id: customPresetId,
        bands: new Array(bandCount).fill(0)
    };
}

export function createAppState(profile) {
    const eqSlots = Object.fromEntries(
        profile.capabilities.eq.targets.map((target) => [
            target.value,
            createEqSlotState(profile.capabilities.eq.bandCount, profile.capabilities.eq.customPresetId)
        ])
    );

    return {
        connection: {
            device: null,
            server: null,
            commandCharacteristic: null,
            connected: false
        },
        customEqPresets: [],
        eqSlots,
        ui: {}
    };
}

export function getSelectedEqState(state, profile) {
    const target = profile?.capabilities?.eq?.liveTarget || 'active';
    return state.eqSlots[target];
}

export function resetEqSlotsForProfile(state, profile) {
    state.eqSlots = Object.fromEntries(
        profile.capabilities.eq.targets.map((target) => [
            target.value,
            createEqSlotState(profile.capabilities.eq.bandCount, profile.capabilities.eq.customPresetId)
        ])
    );
}

export function eqBandsMatch(expected, actual, bandCount) {
    return expected.length === bandCount
        && actual.length === bandCount
        && expected.every((value, index) => value === actual[index]);
}

export function eqStateMatches(left, right, customPresetId, bandCount) {
    if (left.id !== right.id) return false;
    if (left.id !== customPresetId) return true;
    return eqBandsMatch(left.bands, right.bands, bandCount);
}
