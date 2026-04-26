function byId(id) {
    return document.getElementById(id);
}

export function createDom() {
    const eqSliders = Array.from(document.querySelectorAll('.eq-slider'));
    const eqSliderInputs = Array.from(document.querySelectorAll('.eq-slider-input'));
    const eqSliderWrappers = Array.from(document.querySelectorAll('.eq-slider-wrapper'));

    return {
        connectCard: byId('connectCard'),
        page: document.querySelector('.page'),
        pageHeader: document.querySelector('.page-header'),
        headerTitle: byId('headerTitle'),
        headerMeta: byId('headerMeta'),
        controls: Array.from(document.querySelectorAll('.controls')),
        batteryIcon: byId('batteryIcon'),
        batteryHeader: byId('batteryHeader'),
        connectBtn: byId('connectBtn'),
        connectBtnLabel: byId('connectBtnLabel'),
        mockConnectBtn: byId('mockConnectBtn'),
        mockProfileSelect: byId('mockProfileSelect'),
        errorPanel: byId('errorPanel'),
        errorTitle: byId('errorTitle'),
        errorBody: byId('errorBody'),
        volume: byId('volume'),
        volLabel: byId('volLabel'),
        dynamicSettingsContainer: byId('dynamicSettingsContainer'),
        dynamicInputs: {}, // Populated dynamically by UI
        applySettingsBtn: byId('applySettingsBtn'),
        eqPreset: byId('eqPreset'),
        saveCustomPresetBtn: byId('saveCustomPresetBtn'),
        renameCustomPresetBtn: byId('renameCustomPresetBtn'),
        deleteCustomPresetBtn: byId('deleteCustomPresetBtn'),
        eqContainer: byId('eqContainer'),
        eqCurveLayer: byId('eqCurveLayer'),
        eqCurveFill: byId('eqCurveFill'),
        eqCurveGlow: byId('eqCurveGlow'),
        eqCurvePath: byId('eqCurvePath'),
        eqSliders,
        eqSliderInputs,
        eqSliderWrappers,
        activateEqBtn: byId('activateEqBtn'),
        flattenEqBtn: byId('flattenEqBtn'),
        mockView: byId('mockView'),
        mockCloseBtn: byId('mockCloseBtn'),
        browserModal: byId('browserModal'),
        browserModalClose: byId('browserModalClose'),
        diagnosticView: byId('diagnosticView'),
        diagnosticStatus: byId('diagnosticStatus'),
        diagnosticProgressWrap: byId('diagnosticProgressWrap'),
        diagnosticProgressBar: byId('diagnosticProgressBar'),
        diagnosticControls: byId('diagnosticControls'),
        diagnosticHexInput: byId('diagnosticHexInput'),
        diagnosticSendBtn: byId('diagnosticSendBtn'),
        diagnosticConnectBtn: byId('diagnosticConnectBtn'),
        diagnosticCloseBtn: byId('diagnosticCloseBtn'),
        pageFooter: byId('pageFooter'),
        firmwareVersion: byId('firmwareVersion')
    };
}
