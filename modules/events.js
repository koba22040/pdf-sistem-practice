import { state, SNAP_THRESHOLD, SNAP_SEARCH_RANGE } from './state.js';
import { drawCanvasWithBoxes, getCanvasCoords, getHandlesForField, addSnapLine } from './canvas.js';
import { openAutoFillModal, updateFloatingControls, cancelGroupingMode, openGroupingModal, updateAllUnassignedSelectors, updateValueInputForm, saveToLocalStorage } from './ui.js';
import { saveStateToHistory, undo } from './history.js';

let canvas;

export function initEventHandlers(canvasElement) {
    canvas = canvasElement;
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('keydown', handleKeyDown);

    // グループ化ボタンのイベントリスナー
    document.getElementById('toolbar-date-group-btn')?.addEventListener('click', () => startGroupingMode('datetime'));
    document.getElementById('toolbar-charsplit-group-btn')?.addEventListener('click', () => startGroupingMode('char-split'));
    document.getElementById('toolbar-phone-group-btn')?.addEventListener('click', () => startGroupingMode('phone-split'));
    document.getElementById('toolbar-duplicate-group-btn')?.addEventListener('click', () => startGroupingMode('duplicate'));
    document.getElementById('saveGroupBtn')?.addEventListener('click', saveGroup);

    // 自動入力ボタン
    document.getElementById('toolbar-autofill-btn')?.addEventListener('click', toggleAutoFillMode);
    
    // ツールバー
    document.getElementById('toolbar-undo-btn')?.addEventListener('click', undo);
    document.getElementById('toolbar-text-btn')?.addEventListener('click', () => startPlacingElement('text'));
    document.getElementById('toolbar-textarea-btn')?.addEventListener('click', () => startPlacingElement('textarea'));
    const choiceDropdown = document.getElementById('choice-dropdown');
    document.getElementById('toolbar-choice-btn')?.addEventListener('click', (event) => { 
        event.stopPropagation(); 
        choiceDropdown.classList.toggle('show'); 
    });
    choiceDropdown?.addEventListener('click', (event) => {
        event.preventDefault();
        if (event.target.tagName === 'A') {
            const choiceType = event.target.dataset.choiceType;
            startPlacingElement(choiceType);
            choiceDropdown.classList.remove('show');
        }
    });
    
    // クイック複製
    document.querySelectorAll('.dup-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            duplicateField(e.target.dataset.dir);
        });
    });

}

function getCanvasMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width; 
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function findClickedFieldId(mouseX, mouseY) {
    const fieldIds = Object.keys(state.fieldPositions).reverse();
    for (const fieldId of fieldIds) {
        const pos = state.fieldPositions[fieldId];
        const { x, y, width, height } = getCanvasCoords(pos);
        if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height) return fieldId;
    }
    return null;
}

function handleMouseDown(e) {
    const floatingControls = document.getElementById('floating-controls');
    if (floatingControls) {
        floatingControls.style.display = 'none';
    }
    const quickDuplicateControls = document.getElementById('quick-duplicate-controls');
    if (quickDuplicateControls) {
        quickDuplicateControls.style.display = 'none';
    }
    if (state.ui.currentMode !== 'placement') return;
    
    const { x: mouseX, y: mouseY } = getCanvasMousePos(e);
    state.ui.mouseDownPos = { x: e.clientX, y: e.clientY };

    if (state.ui.groupingModeType) {
        const clickedFieldId = findClickedFieldId(mouseX, mouseY);
        if (clickedFieldId) {
            const index = state.ui.selectedFieldIds.indexOf(clickedFieldId);
            if (index > -1) { state.ui.selectedFieldIds.splice(index, 1); } 
            else { state.ui.selectedFieldIds.push(clickedFieldId); }
            drawCanvasWithBoxes();
            return;
        }
        // If not clicked on a field, proceed to selection logic
    }
    
    const clickedFieldId = findClickedFieldId(mouseX, mouseY);

    if (state.ui.selectedFieldId) {
        const handles = getHandlesForField(state.ui.selectedFieldId);
        const resizeHandleSize = 6;
        for (const handleName in handles) {
            if (Math.hypot(handles[handleName].x - mouseX, handles[handleName].y - mouseY) < resizeHandleSize) {
                saveStateToHistory();
                state.ui.isDragging = true;
                state.ui.resizingField = state.ui.selectedFieldId;
                state.ui.resizingHandle = handleName;
                canvas.style.cursor = getCursorForHandle(handleName);
                drawCanvasWithBoxes();
                return;
            }
        }
    }

    if (clickedFieldId) {
        if (e.shiftKey) {
            const index = state.ui.selectedFieldIds.indexOf(clickedFieldId);
            if (index > -1) {
                state.ui.selectedFieldIds.splice(index, 1);
            } else {
                state.ui.selectedFieldIds.push(clickedFieldId);
            }
        } else {
           if (!state.ui.selectedFieldIds.includes(clickedFieldId)) {
                state.ui.selectedFieldIds = [clickedFieldId];
           }
        }
        state.ui.selectedFieldId = state.ui.selectedFieldIds.length === 1 ? state.ui.selectedFieldIds[0] : null;

        saveStateToHistory();
        state.ui.isMoving = true;
        state.ui.movingField = clickedFieldId;
        
        const pos = state.fieldPositions[clickedFieldId];
        const scaleX = state.pdfPage.originalWidth / canvas.width;
        const scaleY = state.pdfPage.originalHeight / canvas.height;
        state.ui.dragOffsetX = (mouseX * scaleX) - pos.x;
        state.ui.dragOffsetY = (mouseY * scaleY) - pos.y;
        
        canvas.style.cursor = 'grabbing';
        drawCanvasWithBoxes(); 
        return;
    }

    if (!clickedFieldId && !state.ui.isDragging) {
        state.ui.isSelecting = true;
        state.ui.selectionStart = { x: mouseX, y: mouseY };
        state.ui.selectionRect = { x: mouseX, y: mouseY, width: 0, height: 0 };
        
        if (!e.shiftKey) {
            state.ui.selectedFieldIds = [];
            state.ui.selectedFieldId = null;
        }
        drawCanvasWithBoxes();
    }
}

function handleMouseMove(e) {
    const { x, y } = getCanvasMousePos(e);
    state.ui.currentMouseX = x;
    state.ui.currentMouseY = y;

    if (state.ui.currentMode !== 'placement' || (state.ui.groupingModeType && !state.ui.isSelecting)) {
        drawCanvasWithBoxes(); 
        return;
    }

    if (state.ui.isMoving && state.ui.movingField) {
        handleMove(e);
    } else if (state.ui.isDragging && state.ui.resizingField) {
        handleResize();
    } else if (state.ui.isSelecting) {
        const width = state.ui.currentMouseX - state.ui.selectionStart.x;
        const height = state.ui.currentMouseY - state.ui.selectionStart.y;
        state.ui.selectionRect = {
            x: width > 0 ? state.ui.selectionStart.x : state.ui.currentMouseX,
            y: height > 0 ? state.ui.selectionStart.y : state.ui.currentMouseY,
            width: Math.abs(width),
            height: Math.abs(height)
        };

        const newSelection = [];
        for (const id in state.fieldPositions) {
            const pos = state.fieldPositions[id];
            const canvasPos = getCanvasCoords(pos);
            if (
                state.ui.selectionRect.x <= canvasPos.x + canvasPos.width &&
                state.ui.selectionRect.x + state.ui.selectionRect.width >= canvasPos.x &&
                state.ui.selectionRect.y <= canvasPos.y + canvasPos.height &&
                state.ui.selectionRect.y + state.ui.selectionRect.height >= canvasPos.y
            ) {
                newSelection.push(id);
            }
        }
        state.ui.selectedFieldIds = newSelection;
        state.ui.selectedFieldId = null;
    } else {
        updateCursorStyle(state.ui.currentMouseX, state.ui.currentMouseY);
    }
    drawCanvasWithBoxes();
}

function handleMouseUp(e) {
    if (state.ui.isDragging && state.ui.resizingField && state.fieldPositions[state.ui.resizingField]) {
        const pos = state.fieldPositions[state.ui.resizingField];
        if (state.data.lastSizes[pos.type]) {
            state.data.lastSizes[pos.type] = { width: pos.width, height: pos.height, size: pos.size };
        }
    }

    if (state.ui.isMoving) {
        canvas.classList.remove('cursor-grabbing'); // まだ要素の上にいるはずなので 'grab' に戻す
       
    }

    state.ui.isDragging = false;
    state.ui.resizingField = null;
    state.ui.resizingHandle = null;
    state.ui.isMoving = false;
    state.ui.movingField = null;
    state.rendering.snapGuideLines = [];

    if (state.ui.isSelecting) {
        state.ui.isSelecting = false;
        state.ui.selectionRect = { x: 0, y: 0, width: 0, height: 0 };
        if (state.ui.selectedFieldIds.length === 1) {
            state.ui.selectedFieldId = state.ui.selectedFieldIds[0];
        }
        updateFloatingControls();
        drawCanvasWithBoxes();
        return;
    }

    drawCanvasWithBoxes();
}

function handleMouseLeave() {
    state.ui.isDragging = false;
    state.ui.resizingField = null;
    state.ui.resizingHandle = null;
    state.ui.isMoving = false;
    state.ui.movingField = null;
    state.ui.hoveredFieldId = null;
    drawCanvasWithBoxes();
}

function handleClick(e) {
    if (state.ui.isAutoFillMode) {
        const { x: mouseX, y: mouseY } = getCanvasMousePos(e);
        const clickedFieldId = findClickedFieldId(mouseX, mouseY);
        if (clickedFieldId) {
            openAutoFillModal(clickedFieldId);
            toggleAutoFillMode(); // Turn off mode
        }
        return;
    }
    if (state.ui.groupingModeType) return;

    const mouseUpPos = { x: e.clientX, y: e.clientY };
    const distance = Math.hypot(mouseUpPos.x - state.ui.mouseDownPos.x, mouseUpPos.y - state.ui.mouseDownPos.y);
    if (distance > 5) return; // Not a click, but a drag

    if (state.ui.currentMode !== 'placement') return;

    if (state.ui.selectedFieldForPlacement) {
        saveStateToHistory();
        const { x: mouseX, y: mouseY } = getCanvasMousePos(e);
        const type = state.ui.selectedFieldForPlacement;
        const { width, height, size } = state.data.lastSizes[type] || { width: 100, height: 30, size: 10.5 };
        const label = `${type === 'text' ? 'テキスト' : type === 'textarea' ? '文章欄' : type === 'circle' ? '丸' : 'チェック'}${state.data.elementCounter++}`;
        
        const fieldId = `field_${Date.now()}`;
        const pdfClickX = mouseX * (state.pdfPage.originalWidth / canvas.width);
        const pdfClickY = mouseY * (state.pdfPage.originalHeight / canvas.height);
        const pdfX = pdfClickX - (width / 2);
        const pdfY = pdfClickY - (height / 2);

        state.fieldPositions[fieldId] = { id: fieldId, type, label, value: '', x: pdfX, y: pdfY, width, height, size };
    
        state.ui.selectedFieldForPlacement = null;
        canvas.style.cursor = 'default';
        clearPlacementActiveState();
        drawCanvasWithBoxes();
        updateAllUnassignedSelectors();
        updateValueInputForm();
    }
    setTimeout(() => updateFloatingControls(), 0);
}

function handleDoubleClick(e) {
    if (state.ui.currentMode !== 'placement' || state.ui.groupingModeType) return;
    const { x: mouseX, y: mouseY } = getCanvasMousePos(e);
    const fieldId = findClickedFieldId(mouseX, mouseY);
    if (fieldId) {
        saveStateToHistory();
        const pos = state.fieldPositions[fieldId];
        const newLabel = prompt("新しい項目名を入力してください:", pos.label);
        if (newLabel && newLabel.trim() !== "") {
            pos.label = newLabel.trim();
            drawCanvasWithBoxes();
            updateAllUnassignedSelectors();
            updateValueInputForm();
        }
    }
}

function handleKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo(); 
        return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        if (state.ui.selectedFieldId) {
            duplicateField('bottom');
        }
        return;
    }
    if (e.key === 'Escape' && state.ui.selectedFieldForPlacement) {
        e.preventDefault();
        state.ui.selectedFieldForPlacement = null;
        canvas.style.cursor = 'default';
        clearPlacementActiveState();
        return;
    }
    if (state.ui.groupingModeType) {
        if (e.key === 'Enter') { e.preventDefault(); openModalForGrouping(); }
        else if (e.key === 'Escape') cancelGroupingMode();
        return;
    }
    if (state.ui.selectedFieldId && state.ui.currentMode === 'placement') {
        const key = e.key;
        // 押されたのが矢印キーか確認
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            e.preventDefault(); // 矢印キーでブラウザの画面がスクロールするのを防ぐ

            // 移動前の状態を履歴に保存（Undoできるようにする）
            saveStateToHistory();

            const pos = state.fieldPositions[state.ui.selectedFieldId];
            
            // Shiftキーが押されていたら 10px 移動、そうでなければ 1px 移動
            const step = e.shiftKey ? 10 : 1;

            if (key === 'ArrowUp')    pos.y -= step;
            if (key === 'ArrowDown')  pos.y += step;
            if (key === 'ArrowLeft')  pos.x -= step;
            if (key === 'ArrowRight') pos.x += step;

            // 画面を再描画して、新しい位置を表示
            drawCanvasWithBoxes();
            // 選択枠（青い枠やメニュー）も一緒に動かす
            updateFloatingControls();
            
            return;
        }
    }
    if (state.ui.currentMode === 'placement' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (state.ui.selectedFieldIds.length > 0) {
            saveStateToHistory();
            state.ui.selectedFieldIds.forEach(id => { delete state.fieldPositions[id]; });
            state.ui.selectedFieldId = null;
            state.ui.selectedFieldIds = [];
            drawCanvasWithBoxes();
            updateAllUnassignedSelectors();
            updateValueInputForm();
            saveToLocalStorage();
        }
    }
}

function handleMove(e) {
    if (!state.ui.movingField) return;
    const pos = state.fieldPositions[state.ui.movingField];
    const scaleX = state.pdfPage.originalWidth / canvas.width;
    const scaleY = state.pdfPage.originalHeight / canvas.height;
    let newX = (state.ui.currentMouseX * scaleX) - state.ui.dragOffsetX;
    let newY = (state.ui.currentMouseY * scaleY) - state.ui.dragOffsetY;

    state.rendering.snapGuideLines = []; 
    if (!e.altKey) {
        const myCenterX = newX + pos.width / 2;
        const myCenterY = newY + pos.height / 2;
        let snappedX = false, snappedY = false;

        for (const id in state.fieldPositions) {
            if (id === state.ui.movingField) continue;
            const t = state.fieldPositions[id];
            const tCenterX = t.x + t.width / 2;
            const tCenterY = t.y + t.height / 2;
            
            // X-axis snapping
            if (!snappedX && Math.abs(myCenterY - tCenterY) < SNAP_SEARCH_RANGE) {
                if (Math.abs(newX - t.x) < SNAP_THRESHOLD) { newX = t.x; snappedX = true; addSnapLine(t.x, Math.min(newY, t.y), Math.max(newY + pos.height, t.y + t.height), 'vertical'); }
                else if (Math.abs(myCenterX - tCenterX) < SNAP_THRESHOLD) { newX = tCenterX - pos.width / 2; snappedX = true; addSnapLine(tCenterX, Math.min(newY, t.y), Math.max(newY + pos.height, t.y + t.height), 'vertical'); }
                 else if (Math.abs(newX + pos.width - (t.x + t.width)) < SNAP_THRESHOLD) { newX = t.x + t.width - pos.width; snappedX = true; addSnapLine(t.x + t.width, Math.min(newY, t.y), Math.max(newY + pos.height, t.y + t.height), 'vertical'); }
            }
            // Y-axis snapping
            if (!snappedY && Math.abs(myCenterX - tCenterX) < SNAP_SEARCH_RANGE) {
                if (Math.abs(newY - t.y) < SNAP_THRESHOLD) { newY = t.y; snappedY = true; addSnapLine(Math.min(newX, t.x), t.y, Math.max(newX + pos.width, t.x + t.width), 'horizontal'); }
                else if (Math.abs(myCenterY - tCenterY) < SNAP_THRESHOLD) { newY = tCenterY - pos.height / 2; snappedY = true; addSnapLine(Math.min(newX, t.x), tCenterY, Math.max(newX + pos.width, t.x + t.width), 'horizontal'); }
                else if (Math.abs(newY + pos.height - (t.y + t.height)) < SNAP_THRESHOLD) { newY = t.y + t.height - pos.height; snappedY = true; addSnapLine(Math.min(newX, t.x), t.y + t.height, Math.max(newX + pos.width, t.x + t.width), 'horizontal'); }
            }
        }
    }
    pos.x = newX; 
    pos.y = newY;
}

function handleResize() { 
    const pos = state.fieldPositions[state.ui.resizingField]; 
    const scaleX = state.pdfPage.originalWidth / canvas.width; 
    const scaleY = state.pdfPage.originalHeight / canvas.height; 
    const pdfMouseX = state.ui.currentMouseX * scaleX; 
    const pdfMouseY = state.ui.currentMouseY * scaleY; 
    const oldRight = pos.x + pos.width; 
    const oldBottom = pos.y + pos.height; 
    const minSize = 10; 

    if (state.ui.resizingHandle.includes('r')) pos.width = Math.max(minSize, pdfMouseX - pos.x); 
    if (state.ui.resizingHandle.includes('l')) { const newWidth = oldRight - pdfMouseX; if (newWidth >= minSize) { pos.width = newWidth; pos.x = pdfMouseX; } } 
    if (state.ui.resizingHandle.includes('b')) pos.height = Math.max(minSize, pdfMouseY - pos.y); 
    if (state.ui.resizingHandle.includes('t')) { const newHeight = oldBottom - pdfMouseY; if (newHeight >= minSize) { pos.height = newHeight; pos.y = pdfMouseY; } } 
    
    if (pos.type === 'text' || pos.type === 'textarea') {
        pos.size = pos.height * 0.7; 
        const fontSizeEl = document.getElementById('floating-font-size');
        if (fontSizeEl) fontSizeEl.value = pos.size.toFixed(1);
    }
}

function updateCursorStyle(mouseX, mouseY) {
    let cursor = 'default'; 
    state.ui.hoveredFieldId = null;
    const fieldId = state.ui.selectedFieldId || findClickedFieldId(mouseX, mouseY);
    if (fieldId) {
         const handles = getHandlesForField(fieldId);
         const resizeHandleSize = 6;
         for (const handleName in handles) {
             if (Math.hypot(handles[handleName].x - mouseX, handles[handleName].y - mouseY) < resizeHandleSize) {
                 cursor = getCursorForHandle(handleName); 
                 state.ui.hoveredFieldId = fieldId; 
                 break;
             }
         }
         if (cursor === 'default') {
             const pos = state.fieldPositions[fieldId];
             const { x, y, width, height } = getCanvasCoords(pos);
             if (mouseX >= x && mouseX <= x + width && mouseY >= y && mouseY <= y + height) {
                 cursor = 'grab'; 
                 state.ui.hoveredFieldId = fieldId;
             }
         }
    }
    canvas.style.cursor = cursor;
}

function getCursorForHandle(handleName) {
    switch (handleName) {
        case 't': case 'b': return 'ns-resize';
        case 'l': case 'r': return 'ew-resize';
        case 'tl': case 'br': return 'nwse-resize';
        case 'tr': case 'bl': return 'nesw-resize';
        default: return 'default';
    }
}

export function startPlacingElement(type) {
    if (state.ui.selectedFieldForPlacement === type) {
        state.ui.selectedFieldForPlacement = null;
        canvas.style.cursor = 'default';
        clearPlacementActiveState();
        return;
    }

    if (state.ui.groupingModeType) cancelGroupingMode();
    if (state.ui.isAutoFillMode) toggleAutoFillMode();

    clearPlacementActiveState();
    state.ui.selectedFieldForPlacement = type;
    canvas.style.cursor = 'crosshair';

    const btnMap = {
        'text': 'toolbar-text-btn',
        'textarea': 'toolbar-textarea-btn',
        'circle': 'toolbar-choice-btn',
        'check': 'toolbar-choice-btn'
    };
    if (btnMap[type]) {
        document.getElementById(btnMap[type])?.classList.add('active');
    }
}

function clearPlacementActiveState() {
    ['toolbar-text-btn', 'toolbar-textarea-btn', 'toolbar-choice-btn'].forEach(id => {
        document.getElementById(id)?.classList.remove('active');
    });
}

function startGroupingMode(type) {
    if (state.ui.groupingModeType) cancelGroupingMode();
    state.ui.groupingModeType = type;
    state.ui.selectedFieldIds = [];
    state.ui.selectedFieldId = null;
    canvas.style.cursor = 'pointer';
    document.getElementById('status-B').textContent = "グループ化するフィールドを選択し、Enterキーで確定してください。(Escキーでキャンセル)";
    
    // Bug fix: Use the correct ID for the date grouping button.
    let buttonId = `toolbar-${type}-btn`;
    if (type === 'datetime') {
        buttonId = 'toolbar-date-group-btn';
    } else if (type === 'char-split') {
        buttonId = 'toolbar-charsplit-group-btn';
    }
    document.getElementById(buttonId)?.classList.add('active');
}

function openModalForGrouping() {
    if (state.ui.selectedFieldIds.length < 2 && (state.ui.groupingModeType !== 'datetime')) {
        alert('グループ化するには、フィールドを2つ以上選択してください。');
        return;
    }
    if (state.ui.groupingModeType === 'datetime' && state.ui.selectedFieldIds.length < 1) {
        alert('グループ化するには、フィールドを1つ以上選択してください。');
        return;
    }
    openGroupingModal(); // This function is in ui.js
}

function saveGroup() {
    const groupNameInput = document.getElementById('groupNameInput');
    const groupName = groupNameInput.value.trim();
    if (!groupName) { 
        alert('グループ名を入力してください。'); 
        return; 
    }
    
    saveStateToHistory();

    const sortedFieldIds = [...state.ui.selectedFieldIds].sort((a, b) => {
        const posA = state.fieldPositions[a];
        const posB = state.fieldPositions[b];
        if (Math.abs(posA.y - posB.y) > 10) return posA.y - posB.y;
        return posA.x - posB.x;
    });

    if (state.ui.groupingModeType === 'char-split' || state.ui.groupingModeType === 'phone-split' || state.ui.groupingModeType === 'duplicate') {
        const partPrefix = state.ui.groupingModeType === 'char-split' ? 'char' : 'split';
        sortedFieldIds.forEach((fieldId, index) => {
            const field = state.fieldPositions[fieldId];
            field.dataSource = groupName;
            field.dataSourceType = state.ui.groupingModeType;
            if (state.ui.groupingModeType !== 'duplicate') {
                field.dataPart = `${partPrefix}_${index}`;
            }
            field.label = `${groupName}[${index}]`;
        });
    } else if (state.ui.groupingModeType === 'datetime') {
        const groupFieldsList = document.getElementById('groupFieldsList');
        groupFieldsList.querySelectorAll('select').forEach(select => {
            const fieldId = select.dataset.fieldId;
            const role = select.value;
            if (state.fieldPositions[fieldId] && role) {
                 const field = state.fieldPositions[fieldId];
                 field.dataSource = groupName;
                 field.dataPart = role;
                 field.dataSourceType = 'datetime';
            }
        });
    }
    alert(`グループ「${groupName}」を保存しました。`);
    document.getElementById('groupingModal').style.display = 'none';
    cancelGroupingMode();
}

function toggleAutoFillMode() {
    const autoFillBtn = document.getElementById('toolbar-autofill-btn');
    state.ui.isAutoFillMode = !state.ui.isAutoFillMode;
    if (state.ui.isAutoFillMode) {
        if (state.ui.groupingModeType) cancelGroupingMode();
        autoFillBtn.classList.add('active');
        canvas.style.cursor = 'help';
        document.getElementById('status-B').textContent = "自動入力設定を行う枠をクリックしてください。";
        state.ui.selectedFieldIds = [];
        state.ui.selectedFieldId = null;
    } else {
        autoFillBtn.classList.remove('active');
        canvas.style.cursor = 'default';
        document.getElementById('status-B').textContent = "キャンセルしました。";
    }
    drawCanvasWithBoxes();
}


function duplicateField(direction) {
    if (!state.ui.selectedFieldId || !state.fieldPositions[state.ui.selectedFieldId]) return;
    saveStateToHistory();
    const original = state.fieldPositions[state.ui.selectedFieldId];
    const newId = `field_${Date.now()}`;
    const newField = JSON.parse(JSON.stringify(original));
    newField.id = newId;

    const match = original.label.match(/^(.*?)(\d+)$/);
    if (match) {
        const prefix = match[1]; 
        let maxNum = 0;
        Object.values(state.fieldPositions).forEach(f => { 
            if (f.label.startsWith(prefix)) { 
                const m = f.label.match(/\d+$/); 
                if (m) maxNum = Math.max(maxNum, parseInt(m[0], 10)); 
            } 
        });
        newField.label = `${prefix}${maxNum + 1}`;
    } else { 
        newField.label = `${original.label}_copy`; 
    }

    const margin = 5; // Add a small margin
    if (direction === 'right') newField.x = original.x + original.width + margin;
    else if (direction === 'left') newField.x = original.x - newField.width - margin;
    else if (direction === 'bottom') newField.y = original.y + original.height + margin;
    else if (direction === 'top') newField.y = original.y - newField.height - margin;
    
    state.fieldPositions[newId] = newField;
    state.ui.selectedFieldId = newId;
    state.ui.selectedFieldIds = [newId];
    drawCanvasWithBoxes();
    updateValueInputForm();
    updateFloatingControls();
}


// This space is intentionally left blank. The functions were moved.

// This module contains low-level browser event handlers
// and their direct helper functions for canvas interactions.
// Application-specific logic has been moved to actions.js.