import { initCanvas } from './modules/canvas.js';
import { initUI } from './modules/ui.js';
import { initEventHandlers } from './modules/events.js';
import { initFileHandlers } from './modules/file.js';
import { undo } from './modules/history.js';

document.addEventListener("DOMContentLoaded", () => {
    // PDF.jsのワーカー設定
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }

    // キャンバスの初期化
    const canvas = document.getElementById("pdfCanvas-B");
    if (!canvas) {
        console.error("Canvas element #pdfCanvas-B not found!");
        return;
    }
    initCanvas(canvas);

    // モジュールの初期化
    initUI();
    initEventHandlers(canvas);
    initFileHandlers();
    
    // グローバルスコープに関数を公開（必要に応じて）
    // 例: ウィザードのHTMLから呼び出される関数
    window.copyCode = function(id) {
        const el = document.getElementById(id);
        if(el) { 
            el.select(); 
            document.execCommand('copy'); 
            alert("コピーしました！"); 
        }
    };
    
    // undoをグローバルにアクセス可能にする（keydownイベントのため）
    // より良い方法は、イベントハンドラをすべてevents.jsにまとめること
    // ここでは一時的な措置
    window.undo = undo;
    
    // --- セットアップウィザード関連のロジック (script.jsに残す) ---
    const REPO_ROOT = 'https://raw.githubusercontent.com/koba22040/pdf-sistem-practice/main';
    const GITHUB_SETUP_JS    = `${REPO_ROOT}/setup.js`;
    const GITHUB_MAIN_JS     = `${REPO_ROOT}/main.js`;
    const GITHUB_PDFAPP_JS   = `${REPO_ROOT}/PDFApp.js`;

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.next-step-btn, .prev-step-btn');
        if (!btn) return;
        const nextStep = btn.dataset.next || btn.dataset.prev;
        if (nextStep === "3") generateCodesFromGitHub();
        switchStep(nextStep);
    });

    function switchStep(stepNum) {
        document.querySelectorAll('.wizard-step').forEach(el => {
            el.classList.remove('active-step'); 
            el.style.display = 'none';
        });
        const targetStep = document.getElementById(`step-${stepNum}`);
        if (targetStep) {
            targetStep.style.display = 'flex';
            targetStep.classList.add('active-step');
        }
        document.querySelectorAll('.step-indicator .step').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.step === stepNum) el.classList.add('active');
        });
    }

    document.addEventListener('click', function(e) {
        if (!e.target.classList.contains('tab-btn')) return;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const targetId = `code-${e.target.dataset.tab}`;
        document.querySelectorAll('.code-block').forEach(b => b.classList.remove('active'));
        document.getElementById(targetId)?.classList.add('active');
    });

    async function generateCodesFromGitHub() {
        const setupArea = document.getElementById('setup-code-textarea');
        const mainArea = document.getElementById('main-code-textarea');
        const pdfAppArea = document.getElementById('pdfapp-code-textarea');
        
        [setupArea, mainArea, pdfAppArea].forEach(el => {
            if(el) el.value = "// GitHubから取得中...";
        });

        const extractIdFromUrl = (url) => {
            if (!url) return '';
            const match = url.match(/[-\w]{25,}/);
            return match ? match[0] : url;
        }

        const pdfId = extractIdFromUrl(document.getElementById('wiz-pdf-url').value.trim());
        const fontId = extractIdFromUrl(document.getElementById('wiz-font-url').value.trim());
        const configId = extractIdFromUrl(document.getElementById('wiz-config-url').value.trim());
        const folderId = extractIdFromUrl(document.getElementById('wiz-folder-url').value.trim());

        try {
            const [setupRes, mainRes, pdfAppRes] = await Promise.all([
                fetch(GITHUB_SETUP_JS),
                fetch(GITHUB_MAIN_JS),
                fetch(GITHUB_PDFAPP_JS)
            ]);

            let setupCode = await setupRes.text();
            let mainCode = await mainRes.text();
            const pdfAppCode = await pdfAppRes.text();

            const replaceIds = (code) => {
                code = code.replace(/const CONFIG_FILE_ID\s*=\s*['"].*?['" ];/, `const CONFIG_FILE_ID = '${configId}';`);
                code = code.replace(/const PDF_FILE_ID\s*=\s*['"].*?['" ];/,    `const PDF_FILE_ID    = '${pdfId}';`);
                code = code.replace(/const SANS_FONT_FILE_ID\s*=\s*['"].*?['" ];/, `const SANS_FONT_FILE_ID = '${fontId}';`);
                code = code.replace(/const SAVE_FOLDER_ID\s*=\s*['"].*?['" ];/, `const SAVE_FOLDER_ID = '${folderId}';`);
                return code;
            };

            if(setupArea) setupArea.value = replaceIds(setupCode);
            if(mainArea) mainArea.value = replaceIds(mainCode);
            if(pdfAppArea) pdfAppArea.value = pdfAppCode;

        } catch (err) {
            console.error(err);
            if(mainArea) mainArea.value = `// エラー:\n// ${err.message}`;
        }
    }
});
