// === 設定 === //

const PDF_FILE_ID    = '';//

const SANS_FONT_FILE_ID   = '';   // ゴシック系（M PLUS 1p 等）

//const SERIF_FONT_FILE_ID  = '';   // 明朝系（BIZ UD明朝 等）
const CONFIG_FILE_ID = '';//

const SAVE_FOLDER_ID = '';
// ▼▼▼ メール送信設定 ▼▼▼
const SEND_EMAIL     = true;  // メールを送るかどうか (true:送る, false:送らない)
const EMAIL_FIELD    = 'メールアドレス'; // フォーム側でメールアドレスを入力させている「質問のタイトル」
const EMAIL_SUBJECT  = '【自動送信】PDF送信のお知らせ'; // メールの件名
const EMAIL_BODY     = 'フォームへの回答ありがとうございます。\n作成されたPDFを添付いたします。\nご確認ください。'; // メールの本文

/**
 * Googleフォーム連動トリガー
 */
async function onFormSubmit(e) {
  try {
    // =================================================
    // (1) 回答データの取得ロジック（フォーム側/シート側 両対応）
    // =================================================
    let answers = {};

    if (e.namedValues) {
      // 【スプレッドシート連携の場合】
      answers = e.namedValues;
    } else if (e.response) {
      // 【Googleフォーム単体の場合】
      const itemResponses = e.response.getItemResponses();
      for (const itemResponse of itemResponses) {
        const title = itemResponse.getItem().getTitle();
        const response = itemResponse.getResponse();
        // 配列形式に統一
        answers[title] = Array.isArray(response) ? response : [response.toString()];
      }
      // メールアドレス収集が有効な場合
      const email = e.response.getRespondentEmail();
      if (email) { answers[EMAIL_FIELD] = [email]; }
    } else {
      // テスト実行時などのガード
      Logger.log("イベントオブジェクト e がありません。トリガー実行してください。");
      return;
    }

    Logger.log("★解析済み回答: " + JSON.stringify(answers));

    // --- ファイル読み込み --- //
    const templateFile = DriveApp.getFileById(PDF_FILE_ID);
    const templateName = templateFile.getName();            
    const pdfBlob      = templateFile.getBlob();            
    const configText   = DriveApp.getFileById(CONFIG_FILE_ID).getBlob().getDataAsString();
    const config       = JSON.parse(configText);
    const saveFolder   = DriveApp.getFolderById(SAVE_FOLDER_ID);

    // --- PDFApp の初期化 --- //
    const pdfApp = new PDFApp({});  
    pdfApp.setPDFBlob(pdfBlob);

    // --- フォント登録 --- //
    pdfApp.registerFontMap({
      NotoSansJP: DriveApp.getFileById(SANS_FONT_FILE_ID).getBlob(),
      NotoSerifJP: DriveApp.getFileById(SERIF_FONT_FILE_ID).getBlob(),
    });

    // PDF サイズ取得
    const pdfData = await pdfApp.getPDFObjectFromBlob_(pdfBlob);
    const page = pdfData.getPages()[0];
    const pageHeight = page.getHeight();

    // =============================
    // (A) TEXT フィールド (1行)
    // =============================
    const textObjects = [];

    for (const key in config.fieldPositions) {
      const f = config.fieldPositions[key];
      if (f.type !== 'text') continue;

      let value = "";
      let shouldCenter = false;

      // 1. 複製 (duplicate)
      if (f.dataSourceType === 'duplicate' && f.dataSource) {
        value = answers[f.dataSource]?.[0] || "";
      }
      // 2. 電話番号 (phone-split)
      else if (f.dataSourceType === 'phone-split' && f.dataSource && f.dataPart) {
        const rawPhone = answers[f.dataSource]?.[0];
        const parts = splitPhoneNumber(rawPhone);
        const index = parseInt(f.dataPart.split('_')[1], 10);
        value = parts[index] || "";
        shouldCenter = true;
      }
      // 3. 文字分割 (char-split)
      else if (f.dataSourceType === 'char-split' && f.dataSource && f.dataPart) {
        const fullText = answers[f.dataSource]?.[0] || "";
        const indexStr = f.dataPart.split('_')[1];
        const index = parseInt(indexStr, 10);
        value = (fullText && index < fullText.length) ? fullText[index] : "";
        shouldCenter = true; 
      }
      // 4. AutoFill
      else if (f.autoFill && f.autoFill.sourceId) {
        const sourceField = config.fieldPositions[f.autoFill.sourceId];
        if (sourceField) {
          const sourceKey = sourceField.label || sourceField.dataSource;
          const sourceValue = answers[sourceKey]?.[0] || "";
          if (f.autoFill.rules) {
            for (const rule of f.autoFill.rules) {
              if (sourceValue.toString().startsWith(rule.key)) {
                value = rule.value;
                break; 
              }
            }
          }
        }
      } 
      // 5. 通常テキスト
      else {
        value = answers[f.label]?.[0];
      }

      // -------------------------------------------------
      // 日付生成・分割系 (datetime) ★復活★
      // -------------------------------------------------
      if (f.dataSourceType === "datetime") {
        const now = new Date();
        let targetDate = now;
        
        // フォーム回答があればそれを使う
        if (answers[f.dataSource]?.[0]) {
             targetDate = new Date(answers[f.dataSource][0]);
        }
        
        if (!isNaN(targetDate.getTime())) {
            const year = targetDate.getFullYear();
            const month = (targetDate.getMonth() + 1).toString();
            const day = targetDate.getDate().toString();
            let yearWarekiVal;
            if (year >= 2019) yearWarekiVal = (year - 2018).toString(); // 令和
            else if (year >= 1989) yearWarekiVal = (year - 1988).toString(); // 平成
            else if (year >= 1926) yearWarekiVal = (year - 1925).toString(); // 昭和
            else yearWarekiVal = year.toString();
            
            const partsMap = {
                'year-ad': year.toString(),
                'year-wareki': yearWarekiVal,
                'month': month,
                'day': day,
            };

            if (f.dataPart && f.dataPart.includes('-split_')) {
                const [baseRoleSplit, indexStr] = f.dataPart.split('_');
                const baseRole = baseRoleSplit.replace('-split', '');
                let baseValue = partsMap[baseRole] || "";
                if (['month', 'day', 'year-wareki'].includes(baseRole)) {
                    baseValue = baseValue.padStart(2, '0');
                }
                value = baseValue[parseInt(indexStr, 10)] || "";
                shouldCenter = true; 
            } else if (f.dataPart && partsMap[f.dataPart]) {
                value = partsMap[f.dataPart];
            } else {
                 // 今日の日付ロジック (today-xxx)
                 switch (f.dataPart) {
                    case "today-year-wareki": value = (now.getFullYear() - 2018).toString(); break;
                    case "today-month": value = (now.getMonth() + 1).toString(); break;
                    case "today-day": value = now.getDate().toString(); break;
                    case "today-year-ad": value = now.getFullYear().toString(); break;
                 }
            }
        }
      }

      if (!value) continue;

      // 文字列の正規化
      value = value.toString()
        .replace(/\s+/g, '') 
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[ー−]/g, '-');

      const fontName = f.font || "NotoSansJP";
      const baseSize = f.size || 14;
      
      // 幅広文字対応
      let drawSize = baseSize;
      if (value.toString().match(/[mwMW@%]/)) {
          drawSize = baseSize * 0.95; 
      }
      
      let drawX = f.x + 5;
      if (shouldCenter) {
        const estWidth = estimateCharWidth(value, drawSize);
        drawX = f.x + (f.width - estWidth) / 2;
      }

      textObjects.push({
        text: value.toString(),
        x: drawX,
        y: pageHeight - f.y - baseSize, 
        size: drawSize, 
        fontName: fontName,
      });
    }

    // =============================
    // (A-2) TEXTAREA フィールド
    // =============================
    const textareaObjects = [];
    for (const key in config.fieldPositions) {
      const f = config.fieldPositions[key];
      if (f.type !== 'textarea') continue;

      let value = answers[f.label]?.[0] || f.value || "";
      
      // AutoFill (TEXTAREA版)
      if (!value && f.autoFill && f.autoFill.sourceId) {
          const sourceField = config.fieldPositions[f.autoFill.sourceId];
          if (sourceField) {
            const sourceKey = sourceField.label || sourceField.dataSource;
            const sourceValue = answers[sourceKey]?.[0] || "";
            if (f.autoFill.rules) {
                for (const rule of f.autoFill.rules) {
                    if (sourceValue.toString().startsWith(rule.key)) {
                        value = rule.value;
                        break;
                    }
                }
            }
          }
      }

      if (!value) continue;
      const fontSize = f.size || 11;
      const lineHeight = fontSize * 1.4;
      const lines = splitStringByWidth(value, f.width, fontSize);

      lines.forEach((lineText, index) => {
        if ((index + 1) * lineHeight > f.height) return;
        textareaObjects.push({
          text: lineText,
          x: f.x,
          y: pageHeight - (f.y + (index * lineHeight)) - (fontSize * 0.9), 
          size: fontSize,
          fontName: f.font || "NotoSansJP",
        });
      });
    }

    // =============================
    // (B) CIRCLE & (C) CHECK
    // =============================
    const circleObjects = [];
    const checkTextObjects = [];

    for (const q of config.questions) {
      const raw = answers[q.title]?.[0];
      if (!raw) continue;
      const selectedList = raw.split(",").map(s => s.trim());

      for (const selected of selectedList) {
        const choice = q.choices.find(c => c.name === selected);
        if (!choice) continue;
        const f = config.fieldPositions[choice.fieldId];
        if (!f) continue;

        if (f.type === "circle") {
          circleObjects.push({
            type: "ellipse",
            x: f.x + f.width / 2,
            y: pageHeight - (f.y + f.height / 2),
            width: f.width,
            height: f.height,
            borderColor: "#000000",
            borderWidth: 1.5,
            fillOpacity: 0,
          });
        } else if (f.type === "check") {
          const fs = (f.size || f.height) * 0.9;
          checkTextObjects.push({
            text: "✓",
            x: f.x + (f.width / 2) - (fs * 0.4),
            y: pageHeight - (f.y + f.height / 2) - (fs * 0.5),
            size: fs,
            fontName: f.font || "NotoSansJP"
          });
        }
      }
    }

    // ▼▼▼ (B-2) 日付連動の CIRCLE 処理 (令和などの丸囲み) ★復活★ ▼▼▼
    for (const key in config.fieldPositions) {
      const f = config.fieldPositions[key];
      if (f.type === 'circle' && f.dataSourceType === 'datetime' && f.dataSource) {
        
        let dateStr = answers[f.dataSource]?.[0];
        // today指定の場合、回答がなくても今日の日付を入れる
        if (!dateStr && f.dataPart && f.dataPart.startsWith('today-')) {
            dateStr = new Date();
        }

        if (!dateStr) continue; 
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) continue;

        const ymd = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
        let targetEra = '';

        if (ymd >= 20190501) targetEra = 'circle-reiwa';      // 令和
        else if (ymd >= 19890108) targetEra = 'circle-heisei'; // 平成
        else if (ymd >= 19261225) targetEra = 'circle-showa';  // 昭和

        if (f.dataPart === targetEra) {
           circleObjects.push({
            type: "ellipse",
            x: f.x + f.width / 2,
            y: pageHeight - (f.y + f.height / 2),
            width: f.width,
            height: f.height,
            borderColor: "#000000",
            borderWidth: 1.5, 
            fillOpacity: 0,
          });
          Logger.log(`→ CIRCLE (ERA) ${f.label}: ON`);
        }
      }
    }

    // =============================
    // (D) embedObjects 用オブジェクト
    // =============================
    const object = {
      page1: [
        ...textObjects,
        ...textareaObjects,
        ...circleObjects,
        ...checkTextObjects,
      ],
    };

    // =============================
    // (E) PDF生成（2引数）
    // =============================
    const newBlob = await pdfApp.embedObjects(pdfBlob, object);
    const fileName = templateName; 
    newBlob.setName(fileName);
    const saved = saveFolder.createFile(newBlob).setName(fileName);

    Logger.log('✅ 出力完了: ' + saved.getUrl());

    // =============================
    // (F) メール送信処理
    // =============================
    if (SEND_EMAIL) {
      const recipientEmail = answers[EMAIL_FIELD]?.[0];

      if (recipientEmail && recipientEmail.includes('@')) {
        GmailApp.sendEmail(recipientEmail, EMAIL_SUBJECT, EMAIL_BODY, {
          attachments: [newBlob],
          name: 'PIST自動システム' // ★送信者名
        });
        Logger.log(`📩 メール送信成功: ${recipientEmail}`);
      } else {
        Logger.log(`⚠️ メール送信スキップ: アドレスが見つかりません (${EMAIL_FIELD})`);
      }
    }
  } catch (err) {
    Logger.log('❌ エラー: ' + err);
  }
}


/**
 * ヘルパー関数群
 */
function splitStringByWidth(text, maxWidth, fontSize) {
  if (!text) return [];
  const resultLines = [];
  const rawLines = text.toString().split(/\r\n|\n|\r/);
  const prohibitedStartChars = /[、。，．・：；？！゛゜´｀¨＾ー—‐／＼〜‖｜…‥‘’“”（）〔〕［］｛｝〈〉《》「」『』【】＋−±×÷＝≠＜＞≦≧∞∴♂♀°′″℃￥＄￠￡％＃＆＊＠§☆★○●◎◇]/;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    if (line === "") { resultLines.push(""); continue; }
    let currentLineStr = "";
    let currentLineWidth = 0;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const charW = estimateCharWidth(char, fontSize);

      if (currentLineWidth + charW > maxWidth) {
        // 禁則処理（追い出し）
        if (currentLineStr.length > 0 && char.match(prohibitedStartChars)) {
            const lastChar = currentLineStr.slice(-1);
            const lastCharW = estimateCharWidth(lastChar, fontSize);
            resultLines.push(currentLineStr.slice(0, -1));
            currentLineStr = lastChar + char;
            currentLineWidth = lastCharW + charW;
        } else {
            resultLines.push(currentLineStr);
            currentLineStr = char;
            currentLineWidth = charW;
        }
      } else {
        currentLineStr += char;
        currentLineWidth += charW;
      }
    }
    if (currentLineStr) resultLines.push(currentLineStr);
  }
  return resultLines;
}

function toHalfWidth(str) {
  if (!str) return "";
  return str.toString().replace(/[Ａ-Ｚａ-ｚ０-９]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
}

function splitPhoneNumber(inputValue) {
  if (!inputValue) return ["", "", ""];
  let val = inputValue.toString()
    .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .replace(/[ー−]/g, '-');
  if (val.includes('-')) {
    return val.split('-');
  }
  const digits = val.replace(/\D/g, ''); 
  const len = digits.length;
  if (len === 11) {
    return [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)];
  } else if (len === 10) {
    if (digits.startsWith('03') || digits.startsWith('06')) {
      return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)];
    } else {
      return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
    }
  }
  return [digits];
}

function estimateCharWidth(text, fontSize) {
  if (!text) return 0;
  const str = text.toString();
  let totalWidth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    let charWidth = 0;
    if (char.match(/[0-9]/)) {
      charWidth = fontSize * 0.65;
    } else if (char.match(/[iIl1\.,;:'"!]/)) {
      charWidth = fontSize * 0.3;
    } else if (char.match(/[mwMW@%]/)) {
      charWidth = fontSize * 1.0; 
    } else if (char.match(/[a-zA-Z]/)) {
      charWidth = fontSize * 0.7; 
    } else if (char.match(/[ -~]/)) { 
      charWidth = fontSize * 0.5; 
    } else {
      charWidth = fontSize; 
    }
    totalWidth += charWidth;
  }
  return totalWidth;
}
/**
 * 初回承認用（実行ボタンを押して権限ポップアップを出すための関数）
 */
 function authorizeScript() {
   FormApp.getActiveForm();
   DriveApp.getRootFolder();
   // メール機能に触れるコマンドを呼ぶ（実際には送信されません）
   //GmailApp.getRemainingDailyQuota();
   MailApp.getRemainingDailyQuota();

   console.log("権限の承認が完了しました。この関数は削除しても大丈夫です。");
 }
