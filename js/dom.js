function byId(id) {
    return document.getElementById(id);
}

export function createDom() {
    const eqSliders = Array.from(document.querySelectorAll('.eq-slider'));
    const eqSliderWrappers = Array.from(document.querySelectorAll('.eq-slider-wrapper'));
    const promptCheckboxes = {
        p: byId('prompt-p'),
        b: byId('prompt-b'),
        l: byId('prompt-l'),
        m: byId('prompt-m'),
        t: byId('prompt-t')
    };

    return {
        pageHeader: document.querySelector('.page-header'),
        headerTitle: byId('headerTitle'),
        headerMeta: byId('headerMeta'),
        controls: Array.from(document.querySelectorAll('.controls')),
        batteryIcon: byId('batteryIcon'),
        batteryHeader: byId('batteryHeader'),
        connectBtn: byId('connectBtn'),
        connectBtnLabel: byId('connectBtnLabel'),
        errorPanel: byId('errorPanel'),
        errorTitle: byId('errorTitle'),
        errorBody: byId('errorBody'),
        volume: byId('volume'),
        volLabel: byId('volLabel'),
        shutdownSelect: byId('shutdownSelect'),
        btn0Select: byId('btn0Select'),
        btn1Select: byId('btn1Select'),
        btn2Select: byId('btn2Select'),
        promptCheckboxes,
        applySettingsBtn: byId('applySettingsBtn'),
        eqPreset: byId('eqPreset'),
        saveCustomPresetBtn: byId('saveCustomPresetBtn'),
        deleteCustomPresetBtn: byId('deleteCustomPresetBtn'),
        eqContainer: byId('eqContainer'),
        eqCurveLayer: byId('eqCurveLayer'),
        eqCurveFill: byId('eqCurveFill'),
        eqCurveGlow: byId('eqCurveGlow'),
        eqCurvePath: byId('eqCurvePath'),
        eqSliders,
        eqSliderWrappers,
        activateEqBtn: byId('activateEqBtn'),
        flattenEqBtn: byId('flattenEqBtn'),
        browserModal: byId('browserModal'),
        browserModalClose: byId('browserModalClose')
    };
}
