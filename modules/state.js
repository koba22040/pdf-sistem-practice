export const state = {
    selectedFile: null,
    pdfPage: { originalWidth: 0, originalHeight: 0 },
    fieldPositions: {},
    questions: [],
    pdfImage: null,
    
    ui: {
        currentMode: 'placement', 
        selectedFieldForPlacement: null,
        resizingField: null,
        resizingHandle: null,
        isDragging: false,
        isMoving: false,
        movingField: null,
        dragOffsetX: 0,
        dragOffsetY: 0,
        mouseDownPos: { x: 0, y: 0 },
        currentMouseX: 0,
        currentMouseY: 0,
        selectedFieldId: null,
        selectedFieldIds: [],
        hoveredFieldId: null,
        groupingModeType: null,
        isAutoFillMode: false,
        isSelecting: false,
        selectionStart: { x: 0, y: 0 },
        selectionRect: { x: 0, y: 0, width: 0, height: 0 }
    },
    
    data: {
        elementCounter: 1,
        undoStack: [],
        MAX_HISTORY: 50,
        lastSizes: {
            text: { width: 100, height: 30, size: 21 },
            textarea: { width: 300, height: 150, size: 10.5 },
            circle: { width: 30, height: 30, size: 0 },
            check: { width: 30, height: 30, size: 0 }
        }
    },
    
    rendering: {
        isRendering: false,
        snapGuideLines: []
    }
};

export const SNAP_THRESHOLD = 5;
export const SNAP_SEARCH_RANGE = 70;
