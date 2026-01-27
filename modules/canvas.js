import { state, SNAP_THRESHOLD, SNAP_SEARCH_RANGE } from './state.js';

let ctx;
let canvas;

export function initCanvas(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    return ctx;
}

export function drawCanvasWithBoxes() {
    if (!state.pdfImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.pdfImage, 0, 0, canvas.width, canvas.height);

    for (const fieldId in state.fieldPositions) {
        const pos = state.fieldPositions[fieldId];
        const { x, y, width, height } = getCanvasCoords(pos);
        drawFixedBox(x, y, fieldId, width, height, pos);
    }

    if (state.rendering.snapGuideLines.length > 0) {
        const scaleX = canvas.width / state.pdfPage.originalWidth;
        const scaleY = canvas.height / state.pdfPage.originalHeight;
        ctx.beginPath(); ctx.strokeStyle = "red"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        state.rendering.snapGuideLines.forEach(line => {
            if (line.type === 'vertical') {
                ctx.moveTo(line.start * scaleX, line.end1 * scaleY - 20); 
                ctx.lineTo(line.start * scaleX, line.end2 * scaleY + 20);
            } else {
                ctx.moveTo(line.start * scaleX - 20, line.end1 * scaleY); 
                ctx.lineTo(line.end2 * scaleX + 20, line.end1 * scaleY);
            }
        });
        ctx.stroke(); ctx.setLineDash([]);
    }

    if (state.ui.selectedFieldForPlacement && state.ui.currentMode === 'placement') {
        drawFloatingBox(state.ui.currentMouseX, state.ui.currentMouseY, state.ui.selectedFieldForPlacement);
    }

    if (state.ui.isSelecting) {
        ctx.save();
        ctx.strokeStyle = "#00a8ff"; // 鮮やかな青
        ctx.lineWidth = 1;
        ctx.fillStyle = "rgba(0, 168, 255, 0.2)"; // 半透明の青
        
        ctx.beginPath();
        ctx.rect(state.ui.selectionRect.x, state.ui.selectionRect.y, state.ui.selectionRect.width, state.ui.selectionRect.height);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

function drawFixedBox(x, y, fieldId, width, height, pos) {
    const isSelected = state.ui.selectedFieldIds.includes(fieldId) || state.ui.selectedFieldId === fieldId;
    const isHovered = (fieldId === state.ui.hoveredFieldId);
    const strokeColor = isSelected ? "blue" : "green";

    if (state.ui.currentMode === 'input') {
        if (pos.value) {
            if (pos.type === 'textarea') {
                const fontSize = (pos.size || 10.5) * (canvas.width / state.pdfPage.originalWidth);
                ctx.fillStyle = 'black'; ctx.font = `${fontSize}px sans-serif`;
                ctx.textBaseline = "top"; ctx.textAlign = "left"; 
                
                const text = pos.value.toString();
                const maxWidth = width - 10 * (canvas.width / state.pdfPage.originalWidth); 
                const paragraphs = text.split('\n');
                let lineY = y + 5;

                for (const paragraph of paragraphs) {
                    const lines = getWrappedLines(ctx, paragraph, maxWidth);
                    for (const line of lines) {
                        if (lineY + fontSize > y + height) break; 
                        ctx.fillText(line, x + 5, lineY);
                        lineY += fontSize * 1.2; 
                    }
                }
            } else if (pos.type === 'text') {
                let fontSize = (pos.size || 10.5) * (canvas.width / state.pdfPage.originalWidth);
                ctx.font = `${fontSize}px sans-serif`;
                const text = pos.value.toString();
                const totalTextWidth = ctx.measureText(text).width;
                const singleCharWidth = ctx.measureText("あ").width;
                let isExtremelyNarrow = false;
                if (width < singleCharWidth) {
                    isExtremelyNarrow = true;
                    fontSize *= width / singleCharWidth;
                    ctx.font = `${fontSize}px sans-serif`;
                }
                ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
                ctx.fillStyle = 'black'; ctx.textBaseline = "middle";
                if (isExtremelyNarrow || totalTextWidth > width) {
                    ctx.textAlign = "left"; ctx.fillText(text, x, y + height / 2);
                } else {
                    ctx.textAlign = "center"; ctx.fillText(text, x + width / 2, y + height / 2);
                }
                ctx.restore();
            } else if (pos.type === 'check') {
                const symbol = "✓"; 
                const fontSize = height * 0.9 * (canvas.width / state.pdfPage.originalWidth);
                ctx.fillStyle = 'black'; ctx.font = `${fontSize}px sans-serif`;
                ctx.textBaseline = "middle"; ctx.textAlign = "center"; 
                ctx.fillText(symbol, x + width / 2, y + height / 2 + fontSize * 0.05);
            } else {
                drawMarker(ctx, x, y, width, height, pos.type);
            }
        }
        return;
    }

    const textToDisplay = pos.label;
    if (pos.type === 'circle' || pos.type === 'check') {
        if (isSelected || isHovered) {
            ctx.fillStyle = isSelected ? "rgba(0, 0, 255, 0.1)" : "rgba(0, 128, 0, 0.1)";
            ctx.fillRect(x, y, width, height);
        }
        drawMarker(ctx, x, y, width, height, pos.type, strokeColor);
    } else {
        ctx.fillStyle = isSelected ? "rgba(0, 0, 255, 0.3)" : "rgba(0, 128, 0, 0.3)";
        ctx.fillRect(x, y, width, height);
        let fontSize = (pos.size || 10.5) * (canvas.width / state.pdfPage.originalWidth);
        ctx.fillStyle = 'black'; ctx.font = `${fontSize}px sans-serif`;

        if (pos.type === 'textarea') {
            ctx.textBaseline = "top"; ctx.textAlign = "left";
            const previewText = pos.value || "文章欄サンプル";
            const maxWidth = width - 10;
            const lines = getWrappedLines(ctx, previewText, maxWidth);
            let lineY = y + 5;
            for (const line of lines) {
                if (lineY + fontSize > y + height) break;
                ctx.fillText(line, x + 5, lineY);
                lineY += fontSize * 1.2;
            }
        } else if (pos.type === 'text') {
            const previewText = pos.value || "あいうえお";
            const totalTextWidth = ctx.measureText(previewText).width;
            const singleCharWidth = ctx.measureText("あ").width;
            if (width < singleCharWidth) {
                fontSize *= width / singleCharWidth;
                ctx.font = `${fontSize}px sans-serif`;
            }
            ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
            ctx.textBaseline = "middle";
            if (width < singleCharWidth || totalTextWidth > width) {
                ctx.textAlign = "left"; ctx.fillText(previewText, x, y + height / 2);
            } else {
                ctx.textAlign = "center"; ctx.fillText(previewText, x + width / 2, y + height / 2);
            }
            ctx.restore();
        }
        ctx.strokeStyle = strokeColor; ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
    }

    const labelFontSize = 12 * (canvas.width / state.pdfPage.originalWidth);
    ctx.fillStyle = strokeColor; ctx.font = `${labelFontSize}px sans-serif`;
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; 
    ctx.fillText(textToDisplay, x, y - 5);

    if ((isSelected && state.ui.selectedFieldId === fieldId) || isHovered) {
        ctx.fillStyle = isSelected ? "blue" : "green";
        const resizeHandleSize = 6;
        const handleDrawSize = resizeHandleSize / 1.5;
        const handles = getHandlesForField(fieldId);
        for(const handleName in handles) {
            const handle = handles[handleName];
            ctx.fillRect(handle.x - handleDrawSize / 2, handle.y - handleDrawSize / 2, handleDrawSize, handleDrawSize);
        }
    }
}

function drawFloatingBox(x, y, elementType) {
    if (!state.pdfPage.originalWidth) return;
    const scaleX = canvas.width / state.pdfPage.originalWidth;
    let boxWidth, boxHeight;

    if (state.data.lastSizes[elementType]) {
        boxWidth = state.data.lastSizes[elementType].width;
        boxHeight = state.data.lastSizes[elementType].height;
    } else {
        boxWidth = 100; boxHeight = 30;
    }
    
    const canvasWidth = boxWidth * scaleX;
    const canvasHeight = boxHeight * scaleX;
    const drawX = x - canvasWidth / 2;
    const drawY = y - canvasHeight / 2;
    
    ctx.strokeStyle = "blue"; ctx.lineWidth = 2;
    if(elementType === 'circle') {
        ctx.beginPath(); ctx.ellipse(x, y, canvasWidth / 2, canvasHeight / 2, 0, 0, 2 * Math.PI); ctx.stroke(); 
    } else if(elementType === 'check') { 
        const fontSize = canvasHeight * 0.9;
        ctx.font = `${fontSize}px sans-serif`; ctx.fillStyle = "blue"; 
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✓", x, y + fontSize * 0.1);
    } else { 
        ctx.strokeRect(drawX, drawY, canvasWidth, canvasHeight); 
        if (elementType === 'textarea') {
            ctx.fillStyle = "rgba(0, 0, 255, 0.1)"; ctx.fillRect(drawX, drawY, canvasWidth, canvasHeight);
            ctx.fillStyle = "blue"; ctx.font = "12px sans-serif"; ctx.textAlign = "center"; ctx.fillText("文章欄", x, y);
        }
    }
}

function drawMarker(ctx, x, y, width, height, type, color = 'red') {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    if (type === 'circle') {
        ctx.beginPath(); ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, 2 * Math.PI); ctx.stroke(); 
    } else if (type === 'check') { 
        const fontSize = height * 0.9 * (canvas.width / state.pdfPage.originalWidth);
        ctx.fillStyle = color; ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("✓", centerX, centerY + fontSize * 0.1);
        ctx.strokeRect(x, y, width, height);
    }
}

export function getCanvasCoords(pos) {
    if (!state.pdfPage.originalWidth) return { x:0, y:0, width:0, height:0 };
    const scaleX = canvas.width / state.pdfPage.originalWidth;
    const scaleY = canvas.height / state.pdfPage.originalHeight;
    return { x: pos.x * scaleX, y: pos.y * scaleY, width: pos.width * scaleX, height: pos.height * scaleY };
}

export function getHandlesForField(fieldId) {
    const pos = state.fieldPositions[fieldId];
    const { x, y, width, height } = getCanvasCoords(pos);
    return { tl: { x: x, y: y }, t: { x: x + width / 2, y: y }, tr: { x: x + width, y: y }, l: { x: x, y: y + height / 2 }, r: { x: x + width, y: y + height / 2 }, bl: { x: x, y: y + height }, b: { x: x + width / 2, y: y + height }, br: { x: x + width, y: y + height } };
}

export function getWrappedLines(ctx, text, maxWidth) {
    const words = text.split(''); const lines = []; let currentLine = words[0] || '';
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + word).width;
        if (width < maxWidth) {
            currentLine += word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine); return lines;
}

// PDF生成用のテキストラップ関数 (PDF-Libのフォントを使用)
export function wrapTextPdf(text, maxWidth, font, fontSize) {
    const lines = [];
    const paragraphs = text.split('\n');
    
    for (const paragraph of paragraphs) {
        let currentLine = '';
        for (let i = 0; i < paragraph.length; i++) {
            const char = paragraph[i];
            const testLine = currentLine + char;
            const width = font.widthOfTextAtSize(testLine, fontSize);
            if (width > maxWidth) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
    }
    return lines;
}

export function addSnapLine(start, end1, end2, type) {
    state.rendering.snapGuideLines.push({ start, end1, end2, type });
}
