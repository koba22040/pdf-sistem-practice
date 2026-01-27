// === 設定 ===
//const CONFIG_FILE_ID = '1qy4w5U0UiQ9Qni-crwi2NqxOpVZ29tR9'; 
const CONFIG_FILE_ID = ''; 


function setUpForm() {
  if (!CONFIG_FILE_ID) throw new Error("IDが設定されていません");

  // JSON読み込み
  const file = DriveApp.getFileById(CONFIG_FILE_ID);
  const json = JSON.parse(file.getBlob().getDataAsString());

  // フォーム作成
  const form = FormApp.create(json.name || "フォーム");
  form.setCollectEmail(true); 

  // --- 準備: 処理済みフィールドの管理 ---
  const usedFieldIds = new Set();
  if (json.questions) {
    json.questions.forEach(q => {
      if (q.choices) {
        q.choices.forEach(c => {
          if (c.fieldId) usedFieldIds.add(c.fieldId);
          if (c.textFieldId) usedFieldIds.add(c.textFieldId);
        });
      }
    });
  }

  // 作成するフォーム項目のリスト
  let formItems = [];

  // ==================================================
  // 1. グループ化された質問 (Radio, Checkbox) をリストに追加
  // ==================================================
  if (json.questions) {
    json.questions.forEach(q => {
      let y = 0;
      if (q.choices && q.choices.length > 0) {
        const firstFieldId = q.choices[0].fieldId;
        if (json.fieldPositions[firstFieldId]) {
          y = json.fieldPositions[firstFieldId].y;
        }
      }
      formItems.push({
        type: 'question_group',
        y: y,
        data: q
      });
    });
  }

  // ==================================================
  // ★追加機能: 日時ソース (開始時刻・終了時刻) の自動検出
  // ==================================================
  const dateTimeSources = {}; // 例: { "開始時刻": { y: 500, hasTime: true } }

  Object.keys(json.fieldPositions).forEach(key => {
    const f = json.fieldPositions[key];
    
    // dataSourceTypeがdatetimeで、かつ「自動の日付(today-xxx)」ではないものを探す
    if (f.dataSourceType === 'datetime' && f.dataSource && f.dataSource !== '日付') {
      
      // まだ登録されていなければ初期化
      if (!dateTimeSources[f.dataSource]) {
        dateTimeSources[f.dataSource] = { y: f.y, hasTime: false };
      }

      // Y座標は、そのグループの中で一番上のものを採用（フォームの並び順のため）
      if (f.y < dateTimeSources[f.dataSource].y) {
        dateTimeSources[f.dataSource].y = f.y;
      }

      // 「時」や「分」が含まれていれば、時刻付きの質問にするフラグを立てる
      if (f.dataPart && (f.dataPart.includes('hour') || f.dataPart.includes('minute'))) {
        dateTimeSources[f.dataSource].hasTime = true;
      }
    }
  });

  // 検出した日時ソースをフォーム項目リストに追加
  Object.keys(dateTimeSources).forEach(sourceName => {
    const info = dateTimeSources[sourceName];
    formItems.push({
      type: 'datetime_source', // 独自タイプ: 日時質問
      label: sourceName,       // 質問タイトル（開始時刻、終了時刻など）
      y: info.y,
      hasTime: info.hasTime
    });
  });

  // ==================================================
  // 2. 単独のフィールド (Text, TextArea) をリストに追加
  // ==================================================
  const createdLabels = new Set(); 

  Object.keys(json.fieldPositions).forEach(key => {
    const f = json.fieldPositions[key];

    // 除外条件:
    if (usedFieldIds.has(key)) return; // 既にラジオボタン等で使った
    if (f.label && f.label.includes('【自動】')) return; // 自動項目
    if (f.dataSource === '日付') return; // 今日の日付
    
    // ★追加: 日時ソースとして検出されたものはテキストボックスを作らない
    // (例: 「年」「月」などの個別の枠は作らず、「開始時刻」という1つの質問に任せる)
    if (f.dataSourceType === 'datetime' && dateTimeSources[f.dataSource]) return;

    // 住所や電話番号の分割統合
    let baseLabel = f.label.replace(/\[\d+\]/g, ''); 
    if (createdLabels.has(baseLabel)) return;
    createdLabels.add(baseLabel);

    formItems.push({
      type: 'single_field',
      y: f.y,
      label: baseLabel,
      originalType: f.type
    });
  });

  // ==================================================
  // 3. Y座標順にソートしてフォーム生成
  // ==================================================
  formItems.sort((a, b) => a.y - b.y);

  formItems.forEach(item => {
    if (item.type === 'question_group') {
      // --- ラジオボタン・チェックボックス ---
      const qData = item.data;
      let formItem = (qData.type === 'check') ? form.addCheckboxItem() : form.addMultipleChoiceItem();
      formItem.setTitle(qData.title);
      formItem.setChoiceValues(qData.choices.map(c => c.name));

    } else if (item.type === 'datetime_source') {
      // --- ★日時質問（開始時刻・終了時刻） ---
      let formItem;
      if (item.hasTime) {
        formItem = form.addDateTimeItem(); // 日付 ＋ 時刻
      } else {
        formItem = form.addDateItem();     // 日付のみ
      }
      formItem.setTitle(item.label);
      formItem.setIncludesYear(true);      // 年を含める

    } else if (item.type === 'single_field') {
      // --- テキストボックス ---
      let formItem = (item.originalType === 'textarea') ? form.addParagraphTextItem() : form.addTextItem();
      formItem.setTitle(item.label);
    }
  });

  console.log("✅ 完了！");
  console.log("公開用URL: " + form.getPublishedUrl());
  console.log("編集用URL: " + form.getEditUrl());
}