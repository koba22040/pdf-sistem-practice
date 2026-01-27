import { state } from './state.js';
import { drawCanvasWithBoxes, getCanvasCoords } from './canvas.js';
import { handleGroupInputChange, handleCharSplitInputChange, handlePhoneSplitInputChange, handleDuplicateInputChange, runAutoFillEngine, setTodayDateToFields } from './actions.js';

// HTML要素を保持するオブジェクト
const DOMElements = {};

export function initUI() {
    console.log("initUI called");
    // 主要なDOM要素をキャッシュ
    const ids = [
        'placementContainer-B', 'inputModeContainer-B', 'goToInputModeBtn-B', 'goToPlacementModeBtn-B',
        'valueInputForm-B', 'questions-list', 'groupingModal',
        'groupNameInput', 'groupFieldsList', 'saveGroupBtn', 'autoFillModal',
        'af-source-select', 'af-rules-container', 'af-add-rule-btn', 'af-save-btn', 'af-target-name',
        'floating-controls', 'floating-font-size', 'quick-duplicate-controls', 'status-B',
        'setupModal', 'closeSetupModal'
    ];
    const toCamelCase = s => s.replace(/-./g, x => x[1].toUpperCase());
    ids.forEach(id => {
        DOMElements[toCamelCase(id)] = document.getElementById(id);
    });
    DOMElements.addQuestionBtn = document.getElementById('add-question-btn');
    console.log("Add Question Button Element (explicit check):", DOMElements.addQuestionBtn);
    if (DOMElements.autoFillModal) {
        DOMElements.autoFillCloseBtn = DOMElements.autoFillModal.querySelector('.autofill-close');
    }
    if (DOMElements.groupingModal) {
        DOMElements.closeModalBtn = DOMElements.groupingModal.querySelector('.close-button');
    }

    // イベントリスナーの設定
    DOMElements.goToInputModeBtnB?.addEventListener('click', () => switchMode('input'));
    DOMElements.goToPlacementModeBtnB?.addEventListener('click', () => switchMode('placement'));
    DOMElements.addQuestionBtn?.addEventListener('click', addQuestion);
    DOMElements.closeModalBtn?.addEventListener('click', () => {
        if(DOMElements.groupingModal) DOMElements.groupingModal.style.display = 'none';
        cancelGroupingMode();
    });
    DOMElements.autoFillCloseBtn?.addEventListener('click', () => { if(DOMElements.autoFillModal) DOMElements.autoFillModal.style.display = 'none'; });
    DOMElements.afAddRuleBtn?.addEventListener('click', () => { addAutoFillRuleRow('', ''); });
    DOMElements.afSaveBtn?.addEventListener('click', saveAutoFillSettings);
    DOMElements.floatingFontSize?.addEventListener('change', handleFontSizeChange);
    
    // Setup Wizard
    DOMElements.closeSetupModal?.addEventListener('click', () => { if(DOMElements.setupModal) DOMElements.setupModal.style.display = 'none'; });
}

function switchMode(mode) {
    state.ui.currentMode = mode;
    if (mode === 'input') {
        DOMElements.placementContainerB.style.display = 'none';
        DOMElements.inputModeContainerB.style.display = 'block';
        setTodayDateToFields();
        updateValueInputForm();
    } else {
        DOMElements.placementContainerB.style.display = 'block';
        DOMElements.inputModeContainerB.style.display = 'none';
    }
    drawCanvasWithBoxes();
}

function handleFontSizeChange(e) {
    if (state.ui.selectedFieldId && state.fieldPositions[state.ui.selectedFieldId]) {
        state.fieldPositions[state.ui.selectedFieldId].size = parseFloat(e.target.value);
        drawCanvasWithBoxes(); 
    }
}

export function updateValueInputForm() {
    const form = DOMElements.valueInputFormB;
    if (!form) return;
    form.innerHTML = '';
    const dataSources = {}; const formItems = [];
    const assignedFieldIds = new Set();
    state.questions.forEach(q => q.choices.forEach(c => { if (c.fieldId) assignedFieldIds.add(c.fieldId); }));

    Object.values(state.fieldPositions).forEach(field => {
        if (field.dataSource && (!field.dataPart || !field.dataPart.startsWith('today-'))) {
            if (!dataSources[field.dataSource]) dataSources[field.dataSource] = { name: field.dataSource, y: field.y, fields: [], dataSourceType: field.dataSourceType };
            dataSources[field.dataSource].fields.push(field);
            dataSources[field.dataSource].y = Math.min(dataSources[field.dataSource].y, field.y);
        } else if (field.type === 'text' && !assignedFieldIds.has(field.id)) {
            formItems.push({ type: 'textfield', data: field, y: field.y });
        }
    });

    for (const dsName in dataSources) formItems.push({ type: 'group', data: dataSources[dsName], y: dataSources[dsName].y });
    state.questions.forEach(q => {
        if (q.title && q.choices.length > 0) {
            const firstChoice = q.choices.find(c => c.fieldId && state.fieldPositions[c.fieldId]);
            const yPos = firstChoice ? state.fieldPositions[firstChoice.fieldId].y : Infinity;
            formItems.push({ type: 'question', data: q, y: yPos });
        }
    });
    formItems.sort((a, b) => a.y - b.y);

    formItems.forEach(item => {
        const itemDiv = document.createElement('div'); itemDiv.className = 'value-input-item';
        if (item.type === 'group') {
            const groupData = item.data;
            const label = document.createElement('label'); label.textContent = `${groupData.name}:`;
            const input = document.createElement('input'); input.type = 'text';
            itemDiv.appendChild(label); itemDiv.appendChild(input);

            if (groupData.dataSourceType === 'datetime') {
                input.placeholder = 'カレンダーから日時を選択...'; input.readOnly = true;
                input.addEventListener('change', (e) => handleGroupInputChange(groupData.name, e.target.value));
                flatpickr(input, { enableTime: true, dateFormat: "Y/m/d H:i", locale: 'ja' });
            } else if (groupData.dataSourceType === 'char-split') {
                input.placeholder = 'テキストを入力...';
                input.addEventListener('input', (e) => handleCharSplitInputChange(groupData.name, e.target.value));
            } else if (groupData.dataSourceType === 'phone-split') {
                input.placeholder = '09012345678';
                input.addEventListener('input', (e) => handlePhoneSplitInputChange(groupData.name, e.target.value));
            } else if (groupData.dataSourceType === 'duplicate') {
                input.placeholder = '共通入力...';
                input.addEventListener('input', (e) => handleDuplicateInputChange(groupData.name, e.target.value));
            }
        } else if (item.type === 'textfield') {
            const fieldData = item.data;
            const label = document.createElement('label'); label.htmlFor = `input-${fieldData.id}`; label.textContent = `${fieldData.label}:`;
            let input;
            if (fieldData.type === 'textarea') {
                input = document.createElement('textarea'); input.rows = 5; input.style.width = "100%"; input.style.resize = "vertical";
            } else { input = document.createElement('input'); input.type = 'text'; }
            input.id = `input-${fieldData.id}`; input.value = fieldData.value || '';
            input.addEventListener('input', (e) => { 
                fieldData.value = e.target.value; 
                runAutoFillEngine(fieldData.id, e.target.value); 
                drawCanvasWithBoxes(); 
            });
            itemDiv.appendChild(label); itemDiv.appendChild(input);
        } else if (item.type === 'question') {
            const q = item.data; const label = document.createElement('label'); label.textContent = q.title; itemDiv.appendChild(label);
            const optionsContainer = document.createElement('div'); optionsContainer.className = 'radio-group-container';
            q.choices.forEach(c => {
                if (!c.fieldId || !c.name) return;
                const fieldData = state.fieldPositions[c.fieldId]; if (!fieldData) return;
                const wrapper = document.createElement('div');
                const input = document.createElement('input'); input.type = q.type; input.id = `input-${fieldData.id}`; input.name = q.id; input.checked = fieldData.value || false;
                input.addEventListener('change', (e) => {
                    if (q.type === 'radio') q.choices.forEach(choice => { if (state.fieldPositions[choice.fieldId]) state.fieldPositions[choice.fieldId].value = false; });
                    fieldData.value = e.target.checked; drawCanvasWithBoxes();
                });
                const optionLabel = document.createElement('label'); optionLabel.htmlFor = `input-${fieldData.id}`; optionLabel.textContent = c.name;
                wrapper.appendChild(input); wrapper.appendChild(optionLabel); optionsContainer.appendChild(wrapper);
            });
            itemDiv.appendChild(optionsContainer);
        }
        form.appendChild(itemDiv);
    });
}

function addQuestion() {
    console.log("addQuestion called");
    const questionId = `q_${Date.now()}`;
    const newQuestion = { id: questionId, title: '', type: 'radio', choices: [] };
    state.questions.push(newQuestion);
    renderQuestionBlock(newQuestion);
}

export function renderQuestionBlock(question) {
    console.log("renderQuestionBlock called. questionsList element:", DOMElements.questionsList);
    const block = document.createElement('div'); block.className = 'question-block'; block.dataset.questionId = question.id;
    block.innerHTML = `<button class="delete-question-btn">×</button><div class="form-group"><label>質問文</label><input type="text" class="question-title" value="${question.title}"></div><div class="form-group"><label>入力形式</label><select class="question-type"><option value="radio" ${question.type === 'radio' ? 'selected' : ''}>ラジオボタン</option><option value="checkbox" ${question.type === 'checkbox' ? 'selected' : ''}>チェックボックス</option></select></div><div class="form-group"><label>選択肢</label><div class="choices-list"></div><button class="add-choice-btn">＋ 選択肢を追加</button></div>`;
    
    if (DOMElements.questionsList) {
        DOMElements.questionsList.appendChild(block);
    } else {
        console.error("questionsList element not found in DOMElements!");
    }

    block.querySelector('.delete-question-btn').addEventListener('click', () => { state.questions = state.questions.filter(q => q.id !== question.id); block.remove(); updateAllUnassignedSelectors(); updateValueInputForm(); });
    block.querySelector('.question-title').addEventListener('input', (e) => { question.title = e.target.value; updateValueInputForm(); });
    block.querySelector('.question-type').addEventListener('change', (e) => { question.type = e.target.value; updateValueInputForm(); });
    block.querySelector('.add-choice-btn').addEventListener('click', () => { const newChoice = { name: '', fieldId: null }; question.choices.push(newChoice); renderChoiceItem(block.querySelector('.choices-list'), question, newChoice); });
    question.choices.forEach(choice => renderChoiceItem(block.querySelector('.choices-list'), question, choice));
}

function renderChoiceItem(listContainer, question, choice) {
    const item = document.createElement('div');
    item.className = 'choice-item';
    item.style.display = "flex";
    item.style.flexDirection = "column"; 
    item.style.gap = "0";
    item.style.marginBottom = "10px"; 
    item.style.padding = "10px";
    item.style.border = "1px solid #ddd"; 
    item.style.borderRadius = "4px";
    item.style.backgroundColor = "#fff";

    const mainRow = document.createElement('div');
    mainRow.style.display = "flex";
    mainRow.style.alignItems = "center";
    mainRow.style.gap = "8px";
    mainRow.style.width = "100%";

    const markSelector = createUnassignedSelector(choice.fieldId);
    markSelector.style.flex = "0 0 35%";
    markSelector.style.minWidth = "0";
    markSelector.title = "マークする場所を選択";

    const nameInput = document.createElement('input');
    nameInput.type = "text";
    nameInput.className = "choice-name";
    nameInput.placeholder = "選択肢名";
    nameInput.value = choice.name;
    nameInput.style.flex = "1";
    nameInput.style.minWidth = "0";
    nameInput.style.boxSizing = "border-box";
    nameInput.style.height = "38px"; 
    nameInput.style.padding = "5px";

    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.display = "flex";
    checkboxContainer.style.alignItems = "center";
    checkboxContainer.style.whiteSpace = "nowrap";

    const hasTextCheckbox = document.createElement('input');
    hasTextCheckbox.type = "checkbox";
    hasTextCheckbox.id = `check_${Date.now()}_${Math.random()}`; 
    hasTextCheckbox.checked = choice.hasText || false;
    hasTextCheckbox.style.margin = "0 4px 0 0";
    hasTextCheckbox.style.cursor = "pointer";

    const hasTextLabel = document.createElement('label');
    hasTextLabel.htmlFor = hasTextCheckbox.id;
    hasTextLabel.textContent = "記入枠";
    hasTextLabel.style.cursor = "pointer";
    hasTextLabel.style.fontSize = "0.85em";
    hasTextLabel.style.userSelect = "none";
    hasTextLabel.title = "テキスト入力を伴う場合はチェック";

    checkboxContainer.appendChild(hasTextCheckbox);
    checkboxContainer.appendChild(hasTextLabel);
    mainRow.appendChild(markSelector);
    mainRow.appendChild(nameInput);
    mainRow.appendChild(checkboxContainer);

    const selectorRow = document.createElement('div');
    selectorRow.style.display = choice.hasText ? "flex" : "none"; 
    selectorRow.style.alignItems = "center";
    selectorRow.style.marginTop = "8px";
    selectorRow.style.padding = "5px";
    selectorRow.style.backgroundColor = "#f9f9f9";
    selectorRow.style.borderRadius = "4px";

    const selectorLabel = document.createElement('div');
    selectorLabel.textContent = "↳ 記入用枠:";
    selectorLabel.style.fontSize = "0.8em";
    selectorLabel.style.color = "#666";
    selectorLabel.style.marginRight = "10px";
    selectorLabel.style.whiteSpace = "nowrap";

    const textSelector = createUnassignedSelector(choice.textFieldId);
    textSelector.style.flex = "1";

    selectorRow.appendChild(selectorLabel);
    selectorRow.appendChild(textSelector);

    nameInput.addEventListener('input', (e) => { choice.name = e.target.value; updateValueInputForm(); });
    markSelector.addEventListener('change', (e) => { 
        const oldFieldId = choice.fieldId; 
        choice.fieldId = e.target.value || null; 
        updateAllUnassignedSelectors(oldFieldId); 
        updateValueInputForm(); 
    });
    textSelector.addEventListener('change', (e) => {
        const oldId = choice.textFieldId;
        choice.textFieldId = e.target.value || null;
        updateAllUnassignedSelectors(oldId); 
        updateValueInputForm();
    });
    hasTextCheckbox.addEventListener('change', (e) => {
        choice.hasText = e.target.checked;
        selectorRow.style.display = choice.hasText ? "flex" : "none";
        if (!choice.hasText) {
            choice.textFieldId = null;
            textSelector.value = "";
        }
        updateValueInputForm();
    });

    item.appendChild(mainRow);
    item.appendChild(selectorRow);
    listContainer.appendChild(item);
}

function createUnassignedSelector(selectedFieldId) {
    const select = document.createElement('select'); select.innerHTML = '<option value="">-- 要素を選択 --</option>';
    const assignedFieldIds = new Set(); state.questions.forEach(q => q.choices.forEach(c => { if (c.fieldId && c.fieldId !== selectedFieldId) assignedFieldIds.add(c.fieldId); }));
    Object.values(state.fieldPositions).forEach(field => {
        if (!assignedFieldIds.has(field.id)) {
            const option = document.createElement('option'); option.value = field.id; option.textContent = field.label;
            if (field.id === selectedFieldId) option.selected = true;
            select.appendChild(option);
        }
    });
    return select;
}

export function updateAllUnassignedSelectors() {
    document.querySelectorAll('#screen-B .question-block').forEach(block => {
        const questionId = block.dataset.questionId; const question = state.questions.find(q => q.id === questionId);
        if (question) { const listContainer = block.querySelector('.choices-list'); listContainer.innerHTML = ''; question.choices.forEach(choice => renderChoiceItem(listContainer, question, choice)); }
    });
}

export function openGroupingModal() {
    const list = DOMElements.groupFieldsList;
    if (!list) return;

    list.innerHTML = ''; 
    DOMElements.groupNameInput.value = '';
    
    if (state.ui.groupingModeType === 'datetime') {
        state.ui.selectedFieldIds.forEach(id => {
            const field = state.fieldPositions[id];
            const listItem = document.createElement('div');
            listItem.innerHTML = `
            <label style="margin-right: 10px;">${field.label}</label>
            <select data-field-id="${id}">
                <option value="">役割を選択...</option>
                <optgroup label="通常入力 (1つの枠)">
                    <option value="year-ad">年（西暦）</option><option value="year-wareki">年（和暦）</option><option value="month">月</option><option value="day">日</option><option value="hour-24">時 (0-23)</option><option value="hour-am">時 (午前)</option><option value="hour-pm">時 (午後)</option><option value="minute">分 (0-59)</option>
                </optgroup>
                <optgroup label="マス目入力 (左から順に埋まる)">
                    <option value="year-ad-split">年（西暦）[1文字ずつ]</option><option value="year-wareki-split">年（和暦）[1文字ずつ]</option><option value="month-split">月 [1文字ずつ]</option><option value="day-split">日 [1文字ずつ]</option>
                </optgroup>
                <optgroup label="年号の丸囲み (自動判定)">
                    <option value="circle-taisyou">大正に丸</option><option value="circle-showa">昭和に丸</option><option value="circle-heisei">平成に丸</option><option value="circle-reiwa">令和に丸</option>
                </optgroup>
                <optgroup label="自動入力">
                    <option value="today-year-ad">【自動】今日の年（西暦）</option><option value="today-year-wareki">【自動】今日の年（和暦）</option><option value="today-month">【自動】今日の月</option><option value="today-day">【自動】今日の日</option>
                </optgroup>
            </select>`;
            list.appendChild(listItem);
        });
        list.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => {
                const fieldId = e.target.dataset.fieldId;
                if (fieldId && e.target.value) { state.fieldPositions[fieldId].label = e.target.options[e.target.selectedIndex].text; drawCanvasWithBoxes(); }
            });
        });
    } else if (state.ui.groupingModeType === 'char-split') {
        list.innerHTML = `<p>選択された ${state.ui.selectedFieldIds.length} 個のフィールドが、左から右の順に自動で割り当てられます。</p>`;
    }
    DOMElements.groupingModal.style.display = 'block';
}

export function cancelGroupingMode() {
    state.ui.groupingModeType = null;
    state.ui.isAutoFillMode = false; 
    document.getElementById('toolbar-autofill-btn')?.classList.remove('active');
    document.getElementById('toolbar-date-group-btn')?.classList.remove('active');
    document.getElementById('toolbar-charsplit-group-btn')?.classList.remove('active');
    document.getElementById('toolbar-phone-group-btn')?.classList.remove('active');
    document.getElementById('toolbar-duplicate-group-btn')?.classList.remove('active');
    state.ui.selectedFieldIds = []; 
    const canvas = document.getElementById('pdfCanvas-B');
    if(canvas) canvas.style.cursor = 'default';
    if(DOMElements.statusB) DOMElements.statusB.textContent = "キャンセルしました。"; 
    drawCanvasWithBoxes();
}

export function openAutoFillModal(targetId) {
    const targetField = state.fieldPositions[targetId]; if (!targetField) return;
    DOMElements.afTargetName.textContent = targetField.label;
    DOMElements.afSourceSelect.innerHTML = '<option value="">-- 判断元の項目を選択 --</option>';
    DOMElements.afRulesContainer.innerHTML = ''; 
    Object.values(state.fieldPositions).forEach(f => {
        if (f.id !== targetId && f.type !== 'label') {
            const option = document.createElement('option'); option.value = f.id; option.textContent = f.label; DOMElements.afSourceSelect.appendChild(option);
        }
    });
    if (targetField.autoFill) {
        DOMElements.afSourceSelect.value = targetField.autoFill.sourceId || '';
        if (targetField.autoFill.rules) targetField.autoFill.rules.forEach(rule => addAutoFillRuleRow(rule.key, rule.value));
    } else { addAutoFillRuleRow('', ''); }
    DOMElements.autoFillModal.style.display = 'block';
}

function addAutoFillRuleRow(keyVal, valueVal) {
    const row = document.createElement('div'); row.className = 'rule-row';
    row.innerHTML = `<input type="text" class="af-key" placeholder="もし(例:1)" value="${keyVal || ''}"><span>→</span><input type="text" class="af-val" placeholder="これ(例:工学部)" value="${valueVal || ''}"><span class="rule-delete">×</span>`;
    row.querySelector('.rule-delete').addEventListener('click', () => row.remove());
    DOMElements.afRulesContainer.appendChild(row);
}

function saveAutoFillSettings() {
    if (!state.ui.selectedFieldIds || state.ui.selectedFieldIds.length !== 1) return;
    const targetId = state.ui.selectedFieldIds[0]; const sourceId = DOMElements.afSourceSelect.value;
    if (!sourceId) { alert("判断元となる項目を選択してください。"); return; }
    const rules = [];
    DOMElements.afRulesContainer.querySelectorAll('.rule-row').forEach(row => {
        const k = row.querySelector('.af-key').value.trim(); const v = row.querySelector('.af-val').value.trim();
        if (k !== '') rules.push({ key: k, value: v });
    });
    state.fieldPositions[targetId].autoFill = { sourceId, rules, type: 'prefix' };
    alert(`設定を保存しました。`); DOMElements.autoFillModal.style.display = 'none';
}


export function updateFloatingControls() {
    if (!state.ui.selectedFieldId || !state.fieldPositions[state.ui.selectedFieldId]) {
        if(DOMElements.floatingControls) DOMElements.floatingControls.style.display = 'none';
        if(DOMElements.quickDuplicateControls) DOMElements.quickDuplicateControls.style.display = 'none';
        return;
    }
    const pos = state.fieldPositions[state.ui.selectedFieldId];
    const canvas = document.getElementById('pdfCanvas-B');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / state.pdfPage.originalWidth;
    const scaleY = canvas.height / state.pdfPage.originalHeight;
    const fieldScreenX = rect.left + (pos.x * scaleX) + window.scrollX;
    const fieldScreenY = rect.top + (pos.y * scaleY) + window.scrollY;
    
    if (pos.type === 'textarea' || pos.type === 'text') {
        if(DOMElements.floatingControls) {
            DOMElements.floatingControls.style.display = 'block';
            DOMElements.floatingControls.style.left = `${fieldScreenX + pos.width * scaleX}px`;
            DOMElements.floatingControls.style.top = `${fieldScreenY - 30}px`;
        }
        if(DOMElements.floatingFontSize) DOMElements.floatingFontSize.value = pos.size || 10.5;
    } else { 
        if(DOMElements.floatingControls) DOMElements.floatingControls.style.display = 'none'; 
    }

    if (DOMElements.quickDuplicateControls) {
        DOMElements.quickDuplicateControls.style.display = 'block';
        DOMElements.quickDuplicateControls.style.width = `${pos.width * scaleX}px`;
        DOMElements.quickDuplicateControls.style.height = `${pos.height * scaleY}px`;
        DOMElements.quickDuplicateControls.style.left = `${fieldScreenX}px`;
        DOMElements.quickDuplicateControls.style.top = `${fieldScreenY}px`;
    }
}