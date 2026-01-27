import { state } from './state.js';
import { drawCanvasWithBoxes } from './canvas.js';
import { updateAllUnassignedSelectors, updateValueInputForm, updateFloatingControls } from './ui.js';

// 操作を行う「直前」に呼び出して、今の状態を保存する
export function saveStateToHistory() {
    // 現在の fieldPositions と questions をディープコピーして保存
    const currentState = {
        fieldPositions: JSON.parse(JSON.stringify(state.fieldPositions)),
        questions: JSON.parse(JSON.stringify(state.questions))
    };
    
    state.data.undoStack.push(currentState);
    
    // 履歴が多すぎたら古いものを捨てる
    if (state.data.undoStack.length > state.data.MAX_HISTORY) {
        state.data.undoStack.shift();
    }
}

// Ctrl+Z / Cmd+Z で呼び出される
export function undo() {
    if (state.data.undoStack.length === 0) {
        console.log("これ以上戻れません");
        return;
    }

    // 最新の履歴を取り出す
    const prevState = state.data.undoStack.pop();
    
    // 状態を復元
    state.fieldPositions = prevState.fieldPositions;
    state.questions = prevState.questions;
    
    // 画面とUIを更新
    state.ui.selectedFieldId = null;
    state.ui.selectedFieldIds = [];
    
    drawCanvasWithBoxes();
    updateAllUnassignedSelectors();
    updateValueInputForm();
    updateFloatingControls();
}
