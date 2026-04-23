function isCustomPresetValue(value) {
    return typeof value === 'string' && value.startsWith('custom:');
}

function normalizeBands(bands, bandCount) {
    return bands
        .map((value) => parseInt(value, 10))
        .slice(0, bandCount);
}

export function createPresetStore({ storageKey, bandCount, log }) {
    let presets = loadPresets();

    function loadPresets() {
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter((preset) =>
                    preset
                    && isCustomPresetValue(preset.id)
                    && typeof preset.name === 'string'
                    && Array.isArray(preset.bands)
                    && preset.bands.length === bandCount
                )
                .map((preset) => ({
                    id: preset.id,
                    name: preset.name.trim(),
                    bands: normalizeBands(preset.bands, bandCount)
                }))
                .filter((preset) => preset.name);
        } catch (error) {
            log(`Failed to load custom presets: ${error.message}`, 'err');
            return [];
        }
    }

    function persist() {
        localStorage.setItem(storageKey, JSON.stringify(presets));
    }

    return {
        isCustomPresetValue,
        getAll() {
            return presets.slice();
        },
        createId() {
            return `custom:${Date.now()}:${Math.random().toString(16).slice(2, 8)}`;
        },
        getById(id) {
            return presets.find((preset) => preset.id === id) || null;
        },
        getByName(name) {
            return presets.find((preset) => preset.name === name) || null;
        },
        findByBands(bands) {
            return presets.find((preset) =>
                preset.bands.length === bandCount
                && bands.length === bandCount
                && preset.bands.every((value, index) => value === bands[index])
            ) || null;
        },
        save(preset) {
            const index = presets.findIndex((item) => item.id === preset.id);
            if (index >= 0) {
                presets[index] = preset;
            } else {
                presets.push(preset);
            }
            presets.sort((left, right) => left.name.localeCompare(right.name));
            persist();
        },
        remove(id) {
            presets = presets.filter((preset) => preset.id !== id);
            persist();
        }
    };
}
