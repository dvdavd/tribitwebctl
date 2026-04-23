/**
 * Default implementations for optional profile methods.
 * Override any of these in your profile definition.
 */

const BATTERY_LEVEL_THRESHOLDS = [
    [100, 'full'],
    [84, 'level6'],
    [67, 'level5'],
    [50, 'level4'],
    [34, 'level3'],
    [17, 'level2'],
    [0, 'level1']
];

const BASE_PROFILE = {
    getDeviceDisplayName(device) {
        return device?.name || 'Unknown speaker';
    },
    getFriendlyConnectError(error) {
        if (!error) return null;
        if (error.name === 'NotFoundError' || error.message === 'User cancelled the requestDevice() chooser.') {
            return null;
        }
        if (error.name === 'NotAllowedError') {
            return {
                title: 'Bluetooth access was blocked',
                message: 'Please allow Bluetooth access in your browser and try connecting again.'
            };
        }
        if (error.name === 'NetworkError' || error.name === 'InvalidStateError') {
            return {
                title: 'The speaker did not finish connecting',
                message: 'Please check that the speaker is on, nearby, and not currently connected to the official app. A quick retry often helps.'
            };
        }
        return {
            title: 'Unable to connect right now',
            message: 'Please make sure the speaker is powered on, nearby, and not already connected to the official app. Sometimes a retry or two is needed to establish a stable link.'
        };
    },
    getBatteryIconKey(percentage) {
        if (!Number.isFinite(percentage)) return 'unknown';
        for (const [threshold, key] of BATTERY_LEVEL_THRESHOLDS) {
            if (percentage >= threshold) return key;
        }
        return 'level1';
    }
};

/**
 * Wrap a raw profile definition with default implementations for optional methods.
 * Definitions spread over the base, so any method you provide takes precedence.
 */
export function createProfile(definition) {
    return { ...BASE_PROFILE, ...definition };
}
