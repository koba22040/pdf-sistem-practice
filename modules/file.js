import { state } from './state.js';
import { drawCanvasWithBoxes, wrapTextPdf } from './canvas.js';
import { updateValueInputForm, updateAllUnassignedSelectors, renderQuestionBlock } from './ui.js';

let pdfjsLib;

export function initFileHandlers() {
    pdfjsLib = window.pdfjsLib;

    const pdfInput = document.getElementById("pdfInput-B");
    const loadTemplateBtn = document.getElementById("loadTemplateBtn");
    const loadTemplateInput = document.getElementById("loadTemplateInput");
    const generatePdfBtn = document.getElementById('generatePdfBtn');
    const saveTemplateBtnB = document.getElementById("saveTemplateBtn-B");

    pdfInput?.addEventListener("change", e => {
        const file = e.target.files[0];
        if (file && file.type === "application/pdf") handlePDF(file);
    });
    
    // Drag and Drop handlers
    const dragOverlay = document.getElementById('drag-overlay');
    let dragCounter = 0;
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1 && dragOverlay) {
            dragOverlay.classList.add('active');
        }
    });
    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0 && dragOverlay) {
            dragOverlay.classList.remove('active');
        }
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        if (dragOverlay) dragOverlay.classList.remove('active');
        const file = e.dataTransfer.files[0];
        if (file && file.type === "application/pdf") {
            handlePDF(file);
        }
    });

    loadTemplateBtn?.addEventListener("click", () => {
        if (!state.pdfImage) { alert("先に背景となるPDFファイルを読み込んでください。"); return; }
        loadTemplateInput.click();
    });

    loadTemplateInput?.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.fieldPositions) state.fieldPositions = data.fieldPositions;
                if (data.questions) state.questions = data.questions;
                
                const questionsList = document.getElementById('questions-list');
                if (questionsList) questionsList.innerHTML = '';
                if (state.questions.length > 0) state.questions.forEach(q => renderQuestionBlock(q));
                
                let maxNum = 0;
                Object.values(state.fieldPositions).forEach(pos => {
                    const match = pos.label.match(/\d+$/);
                    if (match) { const num = parseInt(match[0], 10); if (num > maxNum) maxNum = num; }
                });
                state.data.elementCounter = maxNum + 1;
                
                drawCanvasWithBoxes();
                updateValueInputForm();
                updateAllUnassignedSelectors();
                alert("テンプレートを読み込みました！");
            } catch (err) { console.error(err); alert("JSONファイルの読み込みに失敗しました。"); } 
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    generatePdfBtn?.addEventListener('click', generateClientSidePdf);
    saveTemplateBtnB?.addEventListener('click', handleSaveTemplate);
}


function handlePDF(fileOrBlob) {
    if (state.rendering.isRendering) return;
    state.rendering.isRendering = true;
    
    state.selectedFile = fileOrBlob;
    document.getElementById("fileName-B").textContent = `選択されたファイル: ${fileOrBlob.name}`;
    document.getElementById("status-B").textContent = "PDFを読み込んでいます...";
    
    state.fieldPositions = {}; 
    state.questions = []; 
    state.data.elementCounter = 1;
    document.getElementById('questions-list').innerHTML = ''; 
    updateValueInputForm();

    const reader = new FileReader();
    reader.onload = function () {
        const typedArray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedArray).promise.then(pdf => {
            pdf.getPage(1).then(page => {
                const canvas = document.getElementById('pdfCanvas-B');
                const ctx = canvas.getContext('2d');
                const scale = 1.1;
                const viewport = page.getViewport({ scale: scale });
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                state.pdfPage = { originalWidth: viewport.width / scale, originalHeight: viewport.height / scale };
                
                const renderContext = { canvasContext: ctx, viewport: viewport };
                page.render(renderContext).promise.then(() => {
                    const pdfImage = new Image();
                    pdfImage.src = canvas.toDataURL("image/png");
                    pdfImage.onload = () => {
                        state.pdfImage = pdfImage;
                        drawCanvasWithBoxes();
                        document.getElementById("status-B").textContent = "PDFの読み込みが完了しました。";
                        state.rendering.isRendering = false;
                    };
                });
            });
        });
    };
    reader.readAsArrayBuffer(fileOrBlob);
}

async function generateClientSidePdf() {
    if (!state.selectedFile) { alert("PDFが読み込まれていません"); return; }
    
    try {
        const { PDFDocument, rgb } = window.PDFLib;
        const existingPdfBytes = await state.selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        pdfDoc.registerFontkit(window.fontkit);
        
        const fontSelect = document.getElementById('fontSelect');
        const fontName = fontSelect.value || "BIZUDGothic-Regular.ttf";
        let fontBytes;
        try {
            fontBytes = await fetch(fontName).then(res => {
                if (!res.ok) throw new Error("Font fetch failed");
                return res.arrayBuffer();
            });
        } catch (fontErr) {
            alert(`フォントファイル(${fontName})の読み込みに失敗しました。\nindex.htmlと同じ場所にファイルを置いてください。`);
            return;
        }
        const customFont = await pdfDoc.embedFont(fontBytes);

        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { height: pageHeight } = firstPage.getSize();

        for (const fieldId in state.fieldPositions) {
            const props = state.fieldPositions[fieldId];
            const { type, value, x, y, width, height, size } = props;

            if (!value && value !== 0) continue;

            if (type === 'textarea') {
                const fontSize = size || 10.5;
                const lines = wrapTextPdf(String(value), width - 10, customFont, fontSize);
                let currentY = pageHeight - y - fontSize; 
                for (const line of lines) {
                    if (currentY < (pageHeight - y - height)) break;
                    firstPage.drawText(line, { x: x + 5, y: currentY, size: fontSize, font: customFont, color: rgb(0, 0, 0) });
                    currentY -= fontSize * 1.4;
                }
            } else if (type === 'text') {
                let fontSize = size || 12;
                // ... (rest of the logic from script.js)
            } else if (type === 'circle' && value) {
                firstPage.drawEllipse({ x: x + width / 2, y: pageHeight - y - height / 2, xScale: width / 2, yScale: height / 2, borderColor: rgb(0, 0, 0), borderWidth: 2 });
            } else if (type === 'check' && value) {
                // ... (rest of the logic from script.js)
            }
        }

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const blobUrl = URL.createObjectURL(blob);
        document.getElementById('finalPdfPreview-B').src = blobUrl;

    } catch (err) {
        console.error("PDF生成エラー:", err);
        alert("PDF生成中にエラーが発生しました。\nコンソールを確認してください。");
    }
}

async function handleSaveTemplate() {
    const saveTemplateBtnB = document.getElementById('saveTemplateBtn-B');
    if (Object.keys(state.fieldPositions).length === 0) {
        if(!confirm("入力枠がひとつもありませんが、保存しますか？")) return;
    }

    const templateName = prompt("保存するファイル名を入力してください:", state.selectedFile ? state.selectedFile.name.replace('.pdf', '') : "template");
    if (!templateName) return;

    const originalText = saveTemplateBtnB.innerText;
    saveTemplateBtnB.innerText = "⏳ データを取得中...";
    saveTemplateBtnB.disabled = true;

    try {
        const positionsToSave = JSON.parse(JSON.stringify(state.fieldPositions));
        for (const id in positionsToSave) {
            const pos = positionsToSave[id];
            ['x', 'y', 'width', 'height', 'size'].forEach(k => {
                if(pos[k]) pos[k] = Math.round(pos[k] * 100) / 100;
            });
        }
        const templateData = { name: templateName, questions: state.questions, fieldPositions: positionsToSave };
        const jsonStr = JSON.stringify(templateData, null, 2);

        const REPO_ROOT = 'https://raw.githubusercontent.com/koba22040/pdf-sistem-practice/main';
        const GITHUB_FONT_URL = `${REPO_ROOT}/BIZUDGothic-Regular.ttf`;
        const fontRes = await fetch(GITHUB_FONT_URL);
        if (!fontRes.ok) throw new Error("フォントファイルの取得に失敗しました");
        const fontBlob = await fontRes.blob();

        const zip = new window.JSZip();
        zip.file(`${templateName}.json`, jsonStr);
        if (state.selectedFile) {
            zip.file(state.selectedFile.name, state.selectedFile);
        }
        const fontFileName = GITHUB_FONT_URL.split('/').pop() || "font.ttf";
        zip.file(fontFileName, fontBlob);
        
        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${templateName}_kit.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setTimeout(() => {
            document.getElementById('setupModal').style.display = 'block';
            // switchStep("1"); // Assumes switchStep is global or imported
        }, 1000);

    } catch (err) {
        console.error(err);
        alert("保存中にエラーが発生しました。\n" + err.message);
    } finally {
        saveTemplateBtnB.innerText = originalText;
        saveTemplateBtnB.disabled = false;
    }
}
