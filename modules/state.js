// アプリケーション全体の状態を管理するオブジェクト

// 定数
export const SNAP_THRESHOLD = 5;
export const SNAP_SEARCH_RANGE = 70;
const MAX_HISTORY = 50;

// 状態オブジェクト
export const state = {
    selectedFile: null,
    pdfPage: { originalWidth: 0, originalHeight: 0 },
    fieldPositions: {},
    questions: [],
    pdfImage: null,
    
    // UIの状態
    ui: {
        currentMode: 'placement', // 'placement' or 'input'
        selectedFieldId: null,
        selectedFieldIds: [],
        hoveredFieldId: null,
        selectedFieldForPlacement: null, // 'text', 'textarea', etc.
        
        // ドラッグ、リサイズ、移動に関する状態
        isDragging: false,
        resizingField: null,
        resizingHandle: null,
        
        isMoving: false,
        movingField: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        
        // 範囲選択
        isSelecting: false,
        selectionStart: { x: 0, y: 0 },
        selectionRect: { x: 0, y: 0, width: 0, height: 0 },

        // マウス位置
        mouseDownPos: { x: 0, y: 0 },
        currentMouseX: 0,
        currentMouseY: 0,

        // グループ化
        groupingModeType: null, // 'datetime', 'char-split', etc.
        isAutoFillMode: false,
    },
    
    // 描画関連
    rendering: {
        isRendering: false,
        snapGuideLines: [],
    },

    // データと履歴
    data: {
        elementCounter: 1,
        lastSizes: {
            text: { width: 100, height: 30, size: 21 },
            textarea: { width: 300, height: 150, size: 10.5 },
            circle: { width: 30, height: 30, size: 0 },
            check: { width: 30, height: 30, size: 0 }
        },
        undoStack: [],
        MAX_HISTORY: 50,
    }
};

// 状態を直接変更するためのヘルパー関数（必要に応じて）
export function updateState(newState) {
    Object.assign(state, newState);
}

export function updateUiState(newState) {
    Object.assign(state.ui, newState);
}
