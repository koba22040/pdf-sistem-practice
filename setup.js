// === 設定 ===
const CONFIG_FILE_ID = ''; 

function setUpForm() {
  if (!CONFIG_FILE_ID) throw new Error("IDが設定されていません");

  // JSON読み込み
  const file = DriveApp.getFileById(CONFIG_FILE_ID);
  const json = JSON.parse(file.getBlob().getDataAsString());

  // フォーム作成
  const form = FormApp.create(json.name || "方書登録申出書フォーム");
  form.setCollectEmail(true); 

  // --- 準備: 処理済みフィールドの管理 ---
  // 質問グループ(questions)で使われているfieldIdを記録しておき、後で重複作成しないようにする
  const usedFieldIds = new Set();
  if (json.questions) {
    json.questions.forEach(q => {
      if (q.choices) {
        q.choices.forEach(c => {
          if (c.fieldId) usedFieldIds.add(c.fieldId);
          if (c.textFieldId) usedFieldIds.add(c.textFieldId); // 「その他」のテキスト入力欄も除外
        });
      }
    });
  }

  // 作成するフォーム項目のリスト（Y座標でソートするため一旦配列に入れる）
  let formItems = [];

  // 1. グループ化された質問 (Radio, Checkbox) をリストに追加
  if (json.questions) {
    json.questions.forEach(q => {
      // この質問のY座標を特定（選択肢の最初のフィールドの位置を基準にする）
      let y = 0;
      if (q.choices && q.choices.length > 0) {
        const firstFieldId = q.choices[0].fieldId;
        if (json.fieldPositions[firstFieldId]) {
          y = json.fieldPositions[firstFieldId].y;
        }
      }

      formItems.push({
        type: 'question_group', // 独自タイプ: グループ質問
        y: y,
        data: q
      });
    });
  }

  // 2. 単独のフィールド (Text, TextArea) をリストに追加
  const createdLabels = new Set(); // 重複ラベル（住所[1], 住所[2]...）をまとめる用

  Object.keys(json.fieldPositions).forEach(key => {
    const f = json.fieldPositions[key];

    // 除外条件:
    // A. すでにグループ質問で使われているフィールドならスキップ
    if (usedFieldIds.has(key)) return;
    
    // B. 「自動」や計算フィールドならスキップ
    if (f.label && f.label.includes('【自動】')) return;
    if (f.dataSource === '日付') return; // 今日の日付など

    // C. 住所や電話番号の分割フィールド (char-split, phone-split) の処理
    // ラベルから [0], [1] などを除去してベース名を取得
    let baseLabel = f.label.replace(/\[\d+\]/g, ''); 
    
    // すでに同じベース名の質問を作っていたらスキップ (例: 住所[0]を作ったら住所[1]は作らない)
    if (createdLabels.has(baseLabel)) return;
    
    createdLabels.add(baseLabel);

    formItems.push({
      type: 'single_field', // 独自タイプ: 単独フィールド
      y: f.y,
      label: baseLabel, // 整形したラベルを使用
      originalType: f.type
    });
  });

  // 3. Y座標順 (上から下) にソート
  formItems.sort((a, b) => a.y - b.y);

  // 4. 実際にフォームに追加
  formItems.forEach(item => {
    if (item.type === 'question_group') {
      // --- ラジオボタン・チェックボックスの作成 ---
      const qData = item.data;
      let formItem;
      
      if (qData.type === 'check') {
        formItem = form.addCheckboxItem();
      } else {
        formItem = form.addMultipleChoiceItem();
      }
      
      formItem.setTitle(qData.title);
      
      // 選択肢のセット
      const choices = qData.choices.map(c => c.name);
      // 「その他」がある場合などは必要に応じて showOtherOption(true) を検討できますが、今回は単純化して選択肢として追加
      formItem.setChoiceValues(choices);

    } else if (item.type === 'single_field') {
      // --- テキストボックスの作成 ---
      let formItem;
      if (item.originalType === 'textarea') {
        formItem = form.addParagraphTextItem();
      } else {
        formItem = form.addTextItem();
      }
      formItem.setTitle(item.label);
    }
  });

  console.log("✅ 完了！以下のURLを使用してください");
  console.log("公開用URL: " + form.getPublishedUrl());
  console.log("編集用URL: " + form.getEditUrl());
}