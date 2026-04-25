import { getSelectedEqState } from './state.js';

const BATTERY_ICONS = {
    unknown: 'assets/material-symbols--battery-android-frame-question-sharp.svg',
    level1: 'assets/material-symbols--battery-android-frame-1-sharp.svg',
    level2: 'assets/material-symbols--battery-android-frame-2-sharp.svg',
    level3: 'assets/material-symbols--battery-android-frame-3-sharp.svg',
    level4: 'assets/material-symbols--battery-android-frame-4-sharp.svg',
    level5: 'assets/material-symbols--battery-android-frame-5-sharp.svg',
    level6: 'assets/material-symbols--battery-android-frame-6-sharp.svg',
    full: 'assets/material-symbols--battery-android-frame-full-sharp.svg'
};

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
    function bandsMatch(left = [], right = []) {
        return left.length === right.length && left.every((value, index) => value === right[index]);
    }

    function findSoftwarePresetByBands(bands) {
        return profile().capabilities.eq.presets.find(
            (preset) => preset.software && Array.isArray(preset.bands) && bandsMatch(preset.bands, bands)
        ) || null;
    }

    function getRecognizedPresetValue(slot) {
        if (!slot) return null;
        if (slot.id !== profile().capabilities.eq.customPresetId) {
            return String(slot.id);
        }

        const softwarePreset = findSoftwarePresetByBands(slot.bands);
        if (softwarePreset) {
            return softwarePreset.value;
        }

        const savedPreset = presets.findByBands(slot.bands);
        return savedPreset ? savedPreset.id : null;
    }

    function getDeviceEqFallbackLabel(targetKey) {
        const target = profile().capabilities.eq.targets.find((item) => item.value === targetKey);
        return target?.label || 'Device EQ';
    }

    function getPresetBandsForValue(presetValue) {
        const softwarePreset = profile().capabilities.eq.presets.find(
            (preset) => preset.value === presetValue && Array.isArray(preset.bands)
        );
        if (softwarePreset) {
            return softwarePreset.bands;
        }

        if (presets.isCustomPresetValue(presetValue)) {
            const savedPreset = presets.getById(presetValue);
            return savedPreset?.bands ?? null;
        }

        return null;
    }

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

    function renderDeviceFeatures() {
        const features = profile().capabilities.features;
        if (!features || features.length === 0) {
            dom.dynamicSettingsContainer.style.display = 'none';
            return;
        }

        dom.dynamicSettingsContainer.innerHTML = '';
        dom.dynamicInputs = {};

        let currentSection = document.createElement('div');
        currentSection.className = 'settings-section default';
        dom.dynamicSettingsContainer.appendChild(currentSection);

        features.forEach((feature) => {
            if (feature.type === 'divider') {
                currentSection = document.createElement('div');
                currentSection.className = `settings-section ${feature.style || 'original'}`;

                const divider = document.createElement('div');
                divider.className = 'setting-divider';
                divider.textContent = feature.label;
                currentSection.appendChild(divider);

                dom.dynamicSettingsContainer.appendChild(currentSection);
                return;
            }

            if (feature.type === 'select') {
                const row = document.createElement('div');
                row.className = 'setting-row';

                const span = document.createElement('span');
                span.textContent = feature.label;

                const wrap = document.createElement('div');
                wrap.className = 'setting-input-wrap';

                const select = document.createElement('select');
                select.id = `${feature.id}Select`;

                feature.options.forEach((optionData) => {
                    const option = document.createElement('option');
                    option.value = optionData.value;
                    option.textContent = optionData.label;
                    select.append(option);
                });

                wrap.appendChild(select);
                row.appendChild(span);
                row.appendChild(wrap);
                currentSection.appendChild(row);
                dom.dynamicInputs[feature.id] = select;
            }

            if (feature.type === 'toggles') {
                const container = document.createElement('div');
                container.className = 'setting-row toggles';

                const grid = document.createElement('div');
                grid.className = 'prompt-grid';

                const inputs = {};
                feature.items.forEach((item) => {
                    const label = document.createElement('label');
                    label.className = 'prompt-item';

                    const input = document.createElement('input');
                    input.type = 'checkbox';
                    input.id = `${feature.id}-${item.key}`;

                    label.appendChild(input);
                    label.appendChild(document.createTextNode(` ${item.label}`));
                    grid.appendChild(label);
                    inputs[item.key] = input;
                });

                container.appendChild(grid);
                currentSection.appendChild(container);
                dom.dynamicInputs[feature.id] = inputs;
            }

            if (feature.type === 'sleep-timer') {
                // Hidden data inputs — used by applySettings / renderSettings unchanged
                const hoursInput = document.createElement('input');
                hoursInput.type = 'number'; hoursInput.min = 0; hoursInput.max = 23; hoursInput.value = 0;
                hoursInput.id = `${feature.id}-hours`; hoursInput.hidden = true;

                const minutesInput = document.createElement('input');
                minutesInput.type = 'number'; minutesInput.min = 0; minutesInput.max = 59; minutesInput.value = 0;
                minutesInput.id = `${feature.id}-minutes`; minutesInput.hidden = true;

                // [Set] button — shows current time, opens picker modal
                function formatTimerLabel() {
                    const h = parseInt(hoursInput.value, 10) || 0;
                    const m = parseInt(minutesInput.value, 10) || 0;
                    return (h === 0 && m === 0) ? 'Set' : `${h}h ${String(m).padStart(2, '0')}m`;
                }
                const setBtn = document.createElement('button');
                setBtn.className = 'sleep-timer-set-btn';
                setBtn.textContent = formatTimerLabel();
                [hoursInput, minutesInput].forEach((inp) =>
                    inp.addEventListener('input', () => { setBtn.textContent = formatTimerLabel(); })
                );

                // Toggle
                const enabledInput = document.createElement('input');
                enabledInput.type = 'checkbox';
                enabledInput.id = `${feature.id}-enabled`;

                setBtn.style.display = 'none';
                enabledInput.addEventListener('change', () => {
                    setBtn.style.display = enabledInput.checked ? '' : 'none';
                });

                // Use a div (not label) as the row. Click anywhere except setBtn toggles the checkbox.
                const rightGroup = document.createElement('div');
                rightGroup.className = 'sleep-timer-toggle-group';
                rightGroup.append(setBtn, enabledInput);

                // row-reverse → visual: [label text (left)] [setBtn + toggle (right)]
                const toggleLabel = document.createElement('div');
                toggleLabel.className = 'prompt-item';
                toggleLabel.append(rightGroup, document.createTextNode(` ${feature.label}`));

                toggleLabel.addEventListener('click', (e) => {
                    if (setBtn.contains(e.target)) return;
                    enabledInput.checked = !enabledInput.checked;
                    enabledInput.dispatchEvent(new Event('change'));
                });

                const grid = document.createElement('div');
                grid.className = 'prompt-grid';
                grid.appendChild(toggleLabel);

                const container = document.createElement('div');
                container.className = 'setting-row toggles';
                container.appendChild(grid);
                currentSection.appendChild(container);

                // Drum-roll picker modal
                function makeDrum(count) {
                    const ITEM_H = 44;
                    const VISIBLE = 5;

                    const wrapper = document.createElement('div');
                    wrapper.className = 'drum-roll';

                    const viewport = document.createElement('div');
                    viewport.className = 'drum-roll-viewport';
                    viewport.style.height = `${ITEM_H * VISIBLE}px`;

                    const padTop = document.createElement('div');
                    padTop.className = 'drum-roll-pad';
                    padTop.style.height = `${ITEM_H * Math.floor(VISIBLE / 2)}px`;
                    viewport.appendChild(padTop);

                    for (let i = 0; i < count; i++) {
                        const item = document.createElement('div');
                        item.className = 'drum-roll-item';
                        item.textContent = String(i).padStart(2, '0');
                        item.addEventListener('click', () => {
                            viewport.scrollTo({ top: i * ITEM_H, behavior: 'smooth' });
                        });
                        viewport.appendChild(item);
                    }

                    const padBot = document.createElement('div');
                    padBot.className = 'drum-roll-pad';
                    padBot.style.height = `${ITEM_H * Math.floor(VISIBLE / 2)}px`;
                    viewport.appendChild(padBot);

                    const highlight = document.createElement('div');
                    highlight.className = 'drum-roll-highlight';

                    wrapper.appendChild(viewport);
                    wrapper.appendChild(highlight);

                    function getValue() {
                        return Math.round(viewport.scrollTop / ITEM_H);
                    }
                    function setValue(v) {
                        viewport.scrollTo({ top: v * ITEM_H, behavior: 'instant' });
                    }

                    viewport.addEventListener('scrollend', () => {
                        if (viewport.classList.contains('dragging')) return;
                        viewport.scrollTop = getValue() * ITEM_H;
                    });

                    viewport.addEventListener('mousedown', (e) => {
                        const startY = e.clientY;
                        const startScrollTop = viewport.scrollTop;
                        viewport.classList.add('dragging');
                        dragging = true;
                        e.preventDefault();

                        function onMove(e) {
                            viewport.scrollTop = startScrollTop + (startY - e.clientY);
                        }
                        function onUp() {
                            viewport.classList.remove('dragging');
                            viewport.scrollTop = getValue() * ITEM_H;
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            // defer clearing dragging so the click event fired after mouseup doesn't close the modal
                            requestAnimationFrame(() => { dragging = false; });
                        }
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });

                    return { wrapper, getValue, setValue };
                }

                const hoursDrum = makeDrum(24);
                const minutesDrum = makeDrum(60);

                const modal = document.createElement('div');
                modal.className = 'modal sleep-timer-modal';

                const modalContent = document.createElement('div');
                modalContent.className = 'modal-content';

                const drumsRow = document.createElement('div');
                drumsRow.className = 'sleep-timer-drums';

                const hLabel = document.createElement('span');
                hLabel.className = 'drum-roll-unit';
                hLabel.textContent = 'h';

                const mLabel = document.createElement('span');
                mLabel.className = 'drum-roll-unit';
                mLabel.textContent = 'm';

                drumsRow.append(hoursDrum.wrapper, hLabel, minutesDrum.wrapper, mLabel);

                const actions = document.createElement('div');
                actions.className = 'sleep-timer-modal-actions';

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'secondary-btn';
                cancelBtn.textContent = 'Cancel';

                const okBtn = document.createElement('button');
                okBtn.className = 'primary-btn';
                okBtn.textContent = 'OK';

                const modalTitle = document.createElement('p');
                modalTitle.className = 'sleep-timer-modal-title';
                modalTitle.textContent = 'Sleep Timer';

                actions.append(cancelBtn, okBtn);
                modalContent.append(modalTitle, drumsRow, actions);
                modal.appendChild(modalContent);
                document.body.appendChild(modal);

                let dragging = false;

                function openModal() {
                    modal.style.display = 'flex';
                    hoursDrum.setValue(parseInt(hoursInput.value, 10) || 0);
                    minutesDrum.setValue(parseInt(minutesInput.value, 10) || 0);
                }
                function closeModal() {
                    modal.style.display = 'none';
                }

                setBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
                cancelBtn.addEventListener('click', closeModal);
                modal.addEventListener('click', (e) => {
                    if (!dragging && e.target === modal) closeModal();
                });

                okBtn.addEventListener('click', () => {
                    const h = hoursDrum.getValue();
                    const m = minutesDrum.getValue();
                    hoursInput.value = h;
                    minutesInput.value = m;
                    hoursInput.dispatchEvent(new Event('input'));
                    if (h === 0 && m === 0) {
                        enabledInput.checked = false;
                        enabledInput.dispatchEvent(new Event('change'));
                    }
                    closeModal();
                });

                dom.dynamicInputs[feature.id] = { enabled: enabledInput, hours: hoursInput, minutes: minutesInput };
            }

            if (feature.type === 'eq-mappings') {
                const grid = document.createElement('div');
                grid.className = 'setting-mapping-grid';

                const customId = String(profile().capabilities.eq.customPresetId);
                const baseOptions = [
                    ...profile().capabilities.eq.presets.filter((p) => p.value !== customId),
                    ...presets.getAll().map((preset) => ({ value: preset.id, label: preset.name }))
                ];

                const mappingSelects = {};
                feature.targets.forEach((target) => {
                    const row = document.createElement('div');
                    row.className = 'setting-row';

                    const span = document.createElement('span');
                    span.textContent = target.label;

                    const wrap = document.createElement('div');
                    wrap.className = 'setting-input-wrap';

                    const select = document.createElement('select');
                    select.id = `${target.value}Select`;

                    const slot = state.eqSlots[target.value];
                    let options = baseOptions;
                    let selection = baseOptions[0]?.value;

                    if (slot) {
                        const recognizedValue = getRecognizedPresetValue(slot);
                        if (recognizedValue) {
                            selection = recognizedValue;
                        } else {
                            selection = customId;
                            options = [{ value: customId, label: getDeviceEqFallbackLabel(target.value) }, ...baseOptions];
                        }
                    }

                    options.forEach((optionData) => {
                        const option = document.createElement('option');
                        option.value = optionData.value;
                        option.textContent = optionData.label;
                        select.append(option);
                    });

                    select.value = selection;

                    wrap.appendChild(select);
                    row.appendChild(span);
                    row.appendChild(wrap);
                    grid.appendChild(row);
                    mappingSelects[target.value] = select;
                });

                currentSection.appendChild(grid);
                dom.dynamicInputs['eq-mappings'] = mappingSelects;
            }
        });

        dom.dynamicSettingsContainer.style.display = 'flex';
    }

    function updateBatteryStatus(percentage = null) {
        const iconKey = profile().getBatteryIconKey(percentage);
        const hasKnownLevel = Number.isFinite(percentage);
        dom.batteryHeader.textContent = hasKnownLevel ? `${percentage}%` : '--%';
        dom.batteryIcon.src = BATTERY_ICONS[iconKey];
        dom.batteryIcon.alt = hasKnownLevel ? `Battery level ${percentage}%` : 'Battery level unknown';
    }

    function updateFirmwareVersion(version) {
        dom.firmwareVersion.textContent = `Firmware ${version}`;
        dom.pageFooter.style.display = '';
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

    function showDiagnosticView() {
        dom.diagnosticView.style.display = 'flex';
        dom.diagnosticStatus.textContent = 'Ready to connect...';
    }

    function hideDiagnosticView() {
        dom.diagnosticView.style.display = 'none';
    }

    function updateDiagnosticStatus(message, append = false) {
        if (append) {
            dom.diagnosticStatus.textContent += `\n${message}`;
            dom.diagnosticStatus.scrollTop = dom.diagnosticStatus.scrollHeight;
        } else {
            dom.diagnosticStatus.textContent = message;
        }
    }

    function setDiagnosticProgress(percentage) {
        if (percentage === null) {
            dom.diagnosticProgressWrap.style.display = 'none';
            dom.diagnosticProgressBar.style.width = '0%';
            return;
        }
        dom.diagnosticProgressWrap.style.display = 'block';
        dom.diagnosticProgressBar.style.width = `${percentage}%`;
    }

    function setDiagnosticControlsVisible(visible) {
        dom.diagnosticControls.style.display = visible ? 'block' : 'none';
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
        const isNamedPreset = presets.isCustomPresetValue(presetValue);
        const presetBands = getPresetBandsForValue(presetValue);
        const hasChanges = !presetBands || !bandsMatch(selectedEqState.bands, presetBands);
        dom.saveCustomPresetBtn.disabled = selectedEqState.id !== profile().capabilities.eq.customPresetId || !hasChanges;
        dom.renameCustomPresetBtn.disabled = !isNamedPreset;
        dom.deleteCustomPresetBtn.disabled = !isNamedPreset;
    }

    function setEqCurveColor(color) {
        if (color) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            dom.eqCurvePath.style.stroke = `rgba(${r}, ${g}, ${b}, 0.6)`;
            dom.eqCurveGlow.style.stroke = `rgba(${r}, ${g}, ${b}, 0.12)`;
            dom.eqCurveLayer.querySelectorAll('stop').forEach((stop) => {
                stop.style.stopColor = color;
            });
        } else {
            dom.eqCurvePath.style.stroke = '';
            dom.eqCurveGlow.style.stroke = '';
            dom.eqCurveLayer.querySelectorAll('stop').forEach((stop) => {
                stop.style.stopColor = '';
            });
        }
    }

    function renderEqSliders(selectedEqState) {
        const isCustom = selectedEqState.id === profile().capabilities.eq.customPresetId;
        const presetValue = dom.eqPreset.value;
        const presetDef = isCustom
            ? profile().capabilities.eq.presets.find((p) => p.value === presetValue && p.software)
            : profile().capabilities.eq.presets.find((p) => p.value === String(selectedEqState.id));
        const overlayBands = presetDef?.bands;
        const hasData = isCustom || !!overlayBands;

        // For built-in presets without known bands, show flat (zero) positions
        const displayBands = isCustom ? selectedEqState.bands
            : (overlayBands ?? new Array(profile().capabilities.eq.bandCount).fill(0));

        dom.eqSliders.forEach((slider, index) => {
            const value = displayBands[index] ?? 0;
            slider.value = value;
            slider.disabled = false;
            const readout = document.getElementById(`bandValue${index}`);
            if (hasData) {
                slider.classList.remove('no-data');
                setSliderFill(slider, value);
                if (readout) readout.textContent = formatEqValue(value);
            } else {
                slider.classList.add('no-data');
                slider.style.setProperty('--slider-fill', '0%');
                if (readout) readout.textContent = '–';
            }
        });
        dom.eqContainer.style.opacity = hasData ? '1' : '0.5';
        setEqCurveColor(hasData ? (presetDef?.color ?? null) : null);

        if (hasData) {
            updateEqCurve();
        } else {
            dom.eqCurvePath.setAttribute('d', '');
            dom.eqCurveGlow.setAttribute('d', '');
            dom.eqCurveFill.setAttribute('d', '');
        }
    }

    function renderSettings(settings) {
        Object.entries(settings).forEach(([featureId, value]) => {
            const input = dom.dynamicInputs[featureId];
            if (!input) return;

            if (input instanceof HTMLSelectElement) {
                input.value = String(value);
            } else if (typeof input === 'object' && value != null) {
                // Toggles or EQ mappings
                Object.entries(value).forEach(([key, subValue]) => {
                    const subInput = input[key];
                    if (!subInput) return;
                    if (subInput instanceof HTMLInputElement && subInput.type === 'checkbox') {
                        subInput.checked = !!subValue;
                        subInput.dispatchEvent(new Event('change'));
                    } else if (subInput instanceof HTMLInputElement && subInput.type === 'number') {
                        subInput.value = String(subValue ?? 0);
                        subInput.dispatchEvent(new Event('input'));
                    } else if (subInput instanceof HTMLSelectElement) {
                        subInput.value = String(subValue);
                    }
                });
            }
        });
    }

    function renderEqSection(selectedValue = null) {
        const selectedEqState = getSelectedEqState(state, profile());
        // For built-in presets use the preset id; for custom bands preserve the
        // current dropdown selection so slider adjustments never auto-switch presets.
        const selection = selectedEqState.id !== profile().capabilities.eq.customPresetId
            ? String(selectedEqState.id)
            : (selectedValue ?? dom.eqPreset.value);
        renderEqPresetOptions(selection);
        renderEqSliders(selectedEqState);
        updateCustomPresetControls();
    }

    function renderConnectionName(deviceName) {
        dom.headerTitle.textContent = deviceName || appTitle;
    }

    function renderConnectedState(deviceName) {
        renderConnectionName(deviceName);
        dom.connectCard.style.display = 'none';
        dom.page.style.display = 'flex';
        setControlsVisible(true);
        renderDeviceFeatures();
    }

    function renderDisconnectedState() {
        dom.connectCard.style.display = '';
        dom.page.style.display = 'none';
        setConnectLoading(false);
    }

    function refreshEqMappingOptions() {
        const mappingInputs = dom.dynamicInputs['eq-mappings'];
        if (!mappingInputs) return;
        const customId = String(profile().capabilities.eq.customPresetId);
        const baseOptions = [
            ...profile().capabilities.eq.presets.filter((p) => p.value !== customId),
            ...presets.getAll().map((preset) => ({ value: preset.id, label: preset.name }))
        ];
        Object.entries(mappingInputs).forEach(([targetKey, select]) => {
            const slot = state.eqSlots[targetKey];
            let options = baseOptions;
            let selection = baseOptions[0]?.value;

            if (slot) {
                const recognizedValue = getRecognizedPresetValue(slot);
                if (recognizedValue) {
                    selection = recognizedValue;
                } else {
                    selection = customId;
                    options = [{ value: customId, label: getDeviceEqFallbackLabel(targetKey) }, ...baseOptions];
                }
            }

            select.innerHTML = '';
            options.forEach((optionData) => {
                const option = document.createElement('option');
                option.value = optionData.value;
                option.textContent = optionData.label;
                select.appendChild(option);
            });
            select.value = selection;
        });
    }

    function syncActiveTargetSelection({ matchPreset = true } = {}) {
        if (matchPreset) {
            // Device-driven update: match bands to a named preset if one exists
            const selectedEqState = getSelectedEqState(state, profile());
            if (selectedEqState.id === profile().capabilities.eq.customPresetId) {
                const softwarePreset = findSoftwarePresetByBands(selectedEqState.bands);
                const savedPreset = presets.findByBands(selectedEqState.bands);
                dom.eqPreset.value = softwarePreset?.value
                    || savedPreset?.id
                    || String(profile().capabilities.eq.customPresetId);
            }
        }
        renderEqSection();
        refreshEqMappingOptions();
    }

    function renderInitial() {
        renderConnectionName(appTitle);
        renderDeviceFeatures();
        updateBatteryStatus();
        updateVolumeSlider(parseInt(dom.volume.value, 10));
        renderEqSection();
    }

    function setEqInputsDisabled(disabled) {
        const toDisable = [
            dom.eqPreset,
            dom.activateEqBtn,
            dom.flattenEqBtn,
            dom.saveCustomPresetBtn,
            dom.deleteCustomPresetBtn
        ];
        
        Object.values(dom.dynamicInputs).forEach(input => {
            if (input instanceof HTMLElement) {
                toDisable.push(input);
            } else if (typeof input === 'object') {
                Object.values(input).forEach(subInput => toDisable.push(subInput));
            }
        });

        toDisable.forEach((element) => {
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
        showDiagnosticView,
        hideDiagnosticView,
        updateDiagnosticStatus,
        setDiagnosticProgress,
        setDiagnosticControlsVisible,
        showErrorPanel,
        syncActiveTargetSelection,
        updateBatteryStatus,
        updateCustomPresetControls,
        updateFirmwareVersion,
        updateVolumeSlider
    };
}
