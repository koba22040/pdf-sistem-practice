import { state } from './state.js';
import { drawCanvasWithBoxes } from './canvas.js';
import { parseDateTime } from './datetime.js';

// These functions are called by UI form inputs when their values change.

export function handleGroupInputChange(dataSourceName, inputValue) {
    const parsedData = parseDateTime(inputValue);
    if (!parsedData) {
        Object.values(state.fieldPositions).forEach(field => { if (field.dataSource === dataSourceName) field.value = ''; });
        drawCanvasWithBoxes(); 
        return;
    }

    const ymd = parseInt(parsedData['year-ad'] + parsedData['month'].padStart(2, '0') + parsedData['day'].padStart(2, '0'));
    let currentEra = '';
    if (ymd >= 20190501) currentEra = 'circle-reiwa';
    else if (ymd >= 19890108) currentEra = 'circle-heisei';
    else if (ymd >= 19261225) currentEra = 'circle-showa';
    else if (ymd >= 19120730) currentEra = 'circle-taisho';


    Object.values(state.fieldPositions).forEach(field => {
        if (field.dataSource === dataSourceName && field.dataPart) {
            if (field.dataPart.includes('-split_')) {
                const [baseRole, indexStr] = field.dataPart.split('_');
                const index = parseInt(indexStr, 10);
                let baseValue = parsedData[baseRole.replace('-split', '')];
                if ((baseRole.includes('month') || baseRole.includes('day')) && baseValue) {
                    baseValue = baseValue.toString().padStart(2, ' ');
                }
                field.value = (baseValue && baseValue.length > index) ? baseValue[index] : '';
            } else if (field.dataPart.startsWith('circle-')) {
                 field.value = (field.dataPart === currentEra);
            } else {
                field.value = parsedData[field.dataPart] || '';
            }
        }
    });
    drawCanvasWithBoxes();
}

export function handleCharSplitInputChange(dataSourceName, inputValue) {
    const chars = inputValue.split('');
    const groupFields = Object.values(state.fieldPositions).filter(f => f.dataSource === dataSourceName);
    groupFields.forEach(field => field.value = ''); // Clear all first
    chars.forEach((char, index) => {
        const targetField = groupFields.find(f => f.dataPart === `char_${index}`);
        if (targetField) targetField.value = char;
    });
    drawCanvasWithBoxes();
}

export function handlePhoneSplitInputChange(dataSourceName, inputValue) {
    let val = inputValue.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[ー−]/g, '-');
    let parts = [];
    if (val.includes('-')) {
        parts = val.split('-');
    } else {
        const d = val.replace(/\D/g, '');
        const len = d.length;
        if (len === 11) {
            parts = [d.slice(0, 3), d.slice(3, 7), d.slice(7)];
        } else if (len === 10) {
            parts = (d.startsWith('03') || d.startsWith('06')) ? [d.slice(0, 2), d.slice(2, 6), d.slice(6)] : [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
        } else {
            parts = [d];
        }
    }
    const groupFields = Object.values(state.fieldPositions).filter(f => f.dataSource === dataSourceName);
    groupFields.forEach(field => field.value = '');
    parts.forEach((part, index) => {
        const targetField = groupFields.find(f => f.dataPart === `split_${index}`);
        if (targetField) targetField.value = part;
    });
    drawCanvasWithBoxes();
}

export function handleDuplicateInputChange(dataSourceName, inputValue) {
    Object.values(state.fieldPositions).filter(f => f.dataSource === dataSourceName).forEach(field => {
        field.value = inputValue;
    });
    drawCanvasWithBoxes();
}

export function runAutoFillEngine(changedFieldId, newValue) {
    // 1. Direct Field Source Logic
    Object.values(state.fieldPositions).forEach(targetField => {
        if (targetField.autoFill && targetField.autoFill.sourceId === changedFieldId) {
            const config = targetField.autoFill;
            const valStr = String(newValue);
            for (const rule of config.rules) {
                if (valStr.startsWith(rule.key)) {
                    targetField.value = rule.value;
                    break;
                }
            }
        }
    });

    // 2. Question Group Source Logic
    const parentQuestion = state.questions.find(q => q.choices.some(c => c.fieldId === changedFieldId));
    if (parentQuestion) {
        const questionId = parentQuestion.id;
        // Determine the "value" of the question (name of the selected choice)
        const selectedChoice = parentQuestion.choices.find(c => state.fieldPositions[c.fieldId]?.value === true);
        const valToMatch = selectedChoice ? selectedChoice.name : '';

        Object.values(state.fieldPositions).forEach(targetField => {
            if (targetField.autoFill && targetField.autoFill.sourceId === questionId) {
                const config = targetField.autoFill;
                let matched = false;
                for (const rule of config.rules) {
                    if (valToMatch === rule.key) { // Exact match for choice names
                        targetField.value = rule.value;
                        matched = true;
                        break;
                    }
                }
                // If no match found and we want to clear? (Optional)
            }
        });
    }
}

export function setTodayDateToFields() {
    const today = new Date();
    const parsed = parseDateTime(today.toString());
    if(!parsed) return;
    
    const todayParts = { 
        'today-year-ad': parsed['year-ad'], 
        'today-year-wareki': parsed['year-wareki'], 
        'today-month': parsed['month'], 
        'today-day': parsed['day'],
        'today-hour': parsed['hour-24'],
        'today-minute': parsed['minute']
    };
    Object.values(state.fieldPositions).forEach(field => {
        if (field.dataPart && todayParts.hasOwnProperty(field.dataPart)) {
            field.value = todayParts[field.dataPart];
        }
    });
}
