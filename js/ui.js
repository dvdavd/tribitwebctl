import { getSelectedEqState } from './state.js';

function setSliderFill(slider, value) {
    const min = parseInt(slider.min, 10);
    const max = parseInt(slider.max, 10);
    const fill = ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--slider-fill', `${fill}%`);
}

function formatEqValue(value) {
    return `${value >= 0 ? '+' : ''}${value}`;
}

function buildSmoothPath(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
        const previous = points[index - 1] || points[index];
        const current = points[index];
        const next = points[index + 1];
        const afterNext = points[index + 2] || next;

        const controlPoint1 = {
            x: current.x + ((next.x - previous.x) / 6),
            y: current.y + ((next.y - previous.y) / 6)
        };
        const controlPoint2 = {
            x: next.x - ((afterNext.x - current.x) / 6),
            y: next.y - ((afterNext.y - current.y) / 6)
        };

        path += ` C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${next.x} ${next.y}`;
    }
    return path;
}

export function createUi({ appTitle, dom, getProfile, state, presets }) {
    function updateEqCurve() {
        if (!dom.eqCurvePath || !dom.eqCurveGlow || !dom.eqCurveFill || !dom.eqContainer || dom.eqSliderWrappers.length === 0) {
            return;
        }

        const containerRect = dom.eqContainer.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0) return;

        dom.eqCurveLayer.setAttribute('viewBox', `0 0 ${containerRect.width} ${containerRect.height}`);
        const thumbSize = 20;

        const points = dom.eqSliderWrappers.map((wrapper, index) => {
            const sliderRect = dom.eqSliders[index].getBoundingClientRect();
            const value = parseInt(dom.eqSliders[index].value, 10);
            const min = parseInt(dom.eqSliders[index].min, 10);
            const max = parseInt(dom.eqSliders[index].max, 10);
            const normalized = (value - min) / (max - min);
            const usableHeight = Math.max(sliderRect.height - thumbSize, 1);

            return {
                x: sliderRect.left - containerRect.left + (sliderRect.width / 2),
                y: (sliderRect.top - containerRect.top) + (thumbSize / 2) + ((1 - normalized) * usableHeight)
            };
        });

        const firstSliderRect = dom.eqSliders[0].getBoundingClientRect();
        const sliderTop = firstSliderRect.top - containerRect.top + (thumbSize / 2);
        const sliderBottom = sliderTop + Math.max(firstSliderRect.height - thumbSize, 1);
        const gradient = dom.eqCurveLayer.querySelector('#eqCurveFillGradient');
        if (gradient) {
            gradient.setAttribute('y1', String(sliderBottom));
            gradient.setAttribute('y2', String(sliderTop));
        }

        const path = buildSmoothPath(points);
        const fillPath = `${path} L ${points[points.length - 1].x} ${containerRect.height} L ${points[0].x} ${containerRect.height} Z`;
        dom.eqCurveFill.setAttribute('d', fillPath);
        dom.eqCurvePath.setAttribute('d', path);
        dom.eqCurveGlow.setAttribute('d', path);
    }

    function bindEqCurveResize() {
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => updateEqCurve());
            observer.observe(dom.eqContainer);
            dom.eqSliderWrappers.forEach((wrapper) => observer.observe(wrapper));
        } else {
            window.addEventListener('resize', updateEqCurve);
        }
    }

    bindEqCurveResize();

    function profile() {
        return getProfile();
    }

    function renderButtonMappingOptions() {
        const options = [
            ...profile().capabilities.eq.presets,
            ...presets.getAll().map((preset) => ({ value: preset.id, label: preset.name }))
        ];

        [dom.btn0Select, dom.btn1Select, dom.btn2Select].forEach((select, index) => {
            const currentVal = select.value;
            select.innerHTML = '';
            options.forEach((optionData) => {
                const option = document.createElement('option');
                option.value = optionData.value;
                option.textContent = optionData.label;
                select.append(option);
            });
            
            const slot = state.eqSlots[`btn${index}`];
            const selection = slot.id !== profile().capabilities.eq.customPresetId
                ? String(slot.id)
                : presets.findByBands(slot.bands)?.id || String(profile().capabilities.eq.customPresetId);
            
            select.value = options.some((opt) => opt.value === selection) ? selection : options[0].value;
        });
    }

    function renderShutdownOptions() {
        dom.shutdownSelect.innerHTML = '';
        profile().capabilities.shutdownOptions.forEach((optionData) => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.label;
            dom.shutdownSelect.append(option);
        });
    }

    function updateBatteryStatus(percentage = null) {
        const iconKey = profile().getBatteryIconKey(percentage);
        const hasKnownLevel = Number.isFinite(percentage);
        dom.batteryHeader.textContent = hasKnownLevel ? `${percentage}%` : '--%';
        dom.batteryIcon.src = profile().batteryIcons[iconKey];
        dom.batteryIcon.alt = hasKnownLevel ? `Battery level ${percentage}%` : 'Battery level unknown';
    }

    function updateVolumeSlider(value) {
        dom.volLabel.textContent = value;
        dom.volume.value = value;
        setSliderFill(dom.volume, value);
    }

    function setConnectLoading(isLoading, label = 'Connect to Speaker') {
        dom.connectBtnLabel.textContent = label;
        dom.connectBtn.disabled = isLoading;
        dom.connectBtn.classList.toggle('is-loading', isLoading);
    }

    function setControlsVisible(visible) {
        dom.controls.forEach((control) => control.classList.toggle('active', visible));
        dom.headerMeta.classList.toggle('active', visible);
    }

    function showErrorPanel(title, message) {
        dom.errorTitle.textContent = title;
        dom.errorBody.textContent = message;
        dom.errorPanel.classList.add('active');
    }

    function hideErrorPanel() {
        dom.errorPanel.classList.remove('active');
    }

    function showBrowserModal() {
        dom.browserModal.style.display = 'flex';
    }

    function hideBrowserModal() {
        dom.browserModal.style.display = 'none';
    }

    function renderEqPresetOptions(selectedValue) {
        const options = [
            ...profile().capabilities.eq.presets,
            ...presets.getAll().map((preset) => ({ value: preset.id, label: preset.name }))
        ];
        dom.eqPreset.innerHTML = '';
        options.forEach((optionData) => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.label;
            dom.eqPreset.append(option);
        });
        dom.eqPreset.value = options.some((option) => option.value === selectedValue)
            ? selectedValue
            : String(profile().capabilities.eq.customPresetId);
    }

    function updateCustomPresetControls() {
        const selectedEqState = getSelectedEqState(state, profile());
        const presetValue = dom.eqPreset.value;
        dom.saveCustomPresetBtn.disabled = selectedEqState.id !== profile().capabilities.eq.customPresetId;
        dom.deleteCustomPresetBtn.disabled = !presets.isCustomPresetValue(presetValue);
    }

    function renderEqSliders(selectedEqState) {
        dom.eqSliders.forEach((slider, index) => {
            const value = selectedEqState.bands[index];
            slider.value = value;
            slider.disabled = selectedEqState.id !== profile().capabilities.eq.customPresetId;
            setSliderFill(slider, value);
            const readout = document.getElementById(`bandValue${index}`);
            if (readout) readout.textContent = formatEqValue(value);
        });
        dom.eqContainer.style.opacity = selectedEqState.id !== profile().capabilities.eq.customPresetId ? '0.5' : '1';
        updateEqCurve();
    }

    function renderSettings(settings) {
        if (settings.shutdownMode != null) {
            dom.shutdownSelect.value = String(settings.shutdownMode);
        }
        if (settings.prompts) {
            Object.entries(settings.prompts).forEach(([key, checked]) => {
                if (dom.promptCheckboxes[key]) {
                    dom.promptCheckboxes[key].checked = checked;
                }
            });
        }
    }

    function renderEqSection() {
        const selectedEqState = getSelectedEqState(state, profile());
        const selection = selectedEqState.id !== profile().capabilities.eq.customPresetId
            ? String(selectedEqState.id)
            : presets.findByBands(selectedEqState.bands)?.id || String(profile().capabilities.eq.customPresetId);
        renderEqPresetOptions(selection);
        renderEqSliders(selectedEqState);
        updateCustomPresetControls();
    }

    function renderConnectionName(deviceName) {
        dom.headerTitle.textContent = deviceName || appTitle;
    }

    function renderConnectedState(deviceName) {
        renderConnectionName(deviceName);
        dom.pageHeader.classList.add('is-connected');
        dom.connectBtn.style.display = 'none';
        setControlsVisible(true);
        renderButtonMappingOptions();
    }

    function renderDisconnectedState() {
        renderConnectionName(appTitle);
        dom.pageHeader.classList.remove('is-connected');
        dom.connectBtn.style.display = '';
        setConnectLoading(false);
    }

    function syncActiveTargetSelection() {
        renderEqSection();
        renderButtonMappingOptions();
    }

    function renderInitial() {
        renderConnectionName(appTitle);
        dom.pageHeader.classList.remove('is-connected');
        renderButtonMappingOptions();
        renderShutdownOptions();
        updateBatteryStatus();
        updateVolumeSlider(parseInt(dom.volume.value, 10));
        renderEqSection();
    }

    function setEqInputsDisabled(disabled) {
        [
            dom.btn0Select,
            dom.btn1Select,
            dom.btn2Select,
            dom.eqPreset,
            dom.activateEqBtn,
            dom.flattenEqBtn,
            dom.saveCustomPresetBtn,
            dom.deleteCustomPresetBtn
        ].forEach((element) => {
            element.disabled = disabled;
        });
        if (disabled) {
            dom.eqSliders.forEach((slider) => {
                slider.disabled = true;
            });
            dom.eqContainer.style.opacity = '0.5';
            return;
        }
        renderEqSection();
    }

    return {
        hideBrowserModal,
        hideErrorPanel,
        renderConnectedState,
        renderDisconnectedState,
        renderEqSection,
        renderInitial,
        renderSettings,
        setConnectLoading,
        setControlsVisible,
        setEqInputsDisabled,
        showBrowserModal,
        showErrorPanel,
        syncActiveTargetSelection,
        updateBatteryStatus,
        updateCustomPresetControls,
        updateVolumeSlider
    };
}
