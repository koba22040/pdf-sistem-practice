// === 設定 (自動で書き換わります) ===
const CONFIG_FILE_ID = ''; 

/**
 * フォーム自動作成スクリプト
 * この関数を選んで「実行」してください。
 */
function setUpForm() {
  if (!CONFIG_FILE_ID) throw new Error("IDが設定されていません");

  // JSON読み込み
  const file = DriveApp.getFileById(CONFIG_FILE_ID);
  const json = JSON.parse(file.getBlob().getDataAsString());

  // フォーム作成
  const form = FormApp.create(json.name || "Mushin PDF Form");
  form.setCollectEmail(true); // メール収集ON

  // 質問追加
  const fields = json.fieldPositions;
  // Y座標順にソート
  const sortedKeys = Object.keys(fields).sort((a,b) => fields[a].y - fields[b].y);
  const created = new Set();

  sortedKeys.forEach(key => {
    const f = fields[key];
    if(!f.label || created.has(f.label)) return;
    created.add(f.label);

    let item;
    if (f.type === 'textarea') {
      item = form.addParagraphTextItem();
    } else if (['circle','check','radio'].includes(f.type)) {
      // 選択肢
      const q = json.questions ? json.questions.find(q => q.fieldId === key) : null;
      const choices = (q && q.choices) ? q.choices.map(c => c.text) : [];
      
      if(choices.length > 0) {
        item = (f.type === 'check') ? form.addCheckboxItem() : form.addMultipleChoiceItem();
        item.setChoiceValues(choices);
      } else {
        item = form.addTextItem();
      }
    } else {
      item = form.addTextItem();
    }
    item.setTitle(f.label);
  });

  console.log("✅ 完了！以下のURLを使用してください");
  console.log("公開用URL: " + form.getPublishedUrl());
  console.log("編集用URL: " + form.getEditUrl());
}