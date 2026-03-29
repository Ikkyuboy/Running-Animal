# Running Animal - 進捗レポート

## プロジェクト概要
- **リポジトリ**: `Ikkyuboy/Running-Animal`
- **ブランチ**: `claude/setup-running-animal-0pBmk`
- **内容**: Chrome恐竜ゲーム風の横スクロールエンドレスランナー
- **キャラ**: ゴールドのジオメトリック・トラ（9枚のPNGアニメーションフレーム、黒背景を実行時にluminance閾値で自動除去）
- **技術**: Pure HTML5 Canvas + vanilla JS（フレームワークなし）

## 現在の進捗: 約30%

## 完了済み

### 1. index.html（コミット済み）
- Canvas要素、viewport meta、モバイル対応
- フォント: `Press Start 2P` + `DotGothic16`（ドット絵用）
- CSS: `image-rendering: pixelated; image-rendering: crisp-edges;`

### 2. game.js 初版（コミット済み・旧デザイン）
基本ゲームメカニクスが動作する状態。ただし背景は仮のダーク/ゴールドテーマ。
- トラ9フレームアニメーション＋黒背景除去（offscreen canvasでピクセル操作）
- ジャンプ（Space/↑/クリック/タップ）
- 衝突判定（25%インセットAABB）
- スコア＆ハイスコア（localStorage保存）
- 障害物3タイプ（rock/wall/double）、タイマーベーススポーン
- 難易度上昇（速度300→700、スポーン間隔短縮）
- パーティクル（ダスト、死亡時爆発）、画面シェイク
- パララックス背景2層、スクロール地面
- タイトル画面、ゲームオーバー画面

### 3. runner/ フォルダ（GitHub上に存在）
- 9枚のトラPNG画像: split_1_1.png ~ split_3_3.png
- 各341x341 RGBA、黒背景付き（実行時に透過処理）

### 4. Gitコミット履歴
```
6c300ca - Update fonts for pixel art theme (Press Start 2P, DotGothic16)
07ce36d - Add Running Animal endless runner game
```

## 未完了: 戦国ドット絵テーマへの全面リデザイン（残り70%）

### ユーザー要求
参考画像2枚に基づき、ドット絵で戦国時代の背景に変更:
1. **ムラマサ風**: 赤/オレンジ夕焼け空、軍勢シルエット、すすき野原、霧
2. **戦国アクション風**: 日本家屋、土の地面、暗めのトーン

### 設計済みプラン（/root/.claude/plans/happy-kindling-parrot.md）

#### 核心アーキテクチャ: オフスクリーン・ドット絵パイプライン
- 半解像度キャンバス `pCtx`（400x150）にシーン描画 → 2倍拡大でメインキャンバス `ctx`（800x300）に転写
- HUDテキストは `ctx` に直接描画（フル解像度で鮮明に）
- `image-rendering: pixelated` でブロッキーなドット絵感を実現

#### 書き換え対象（game.js のほぼ全描画関数）

| 要素 | 旧 | 新（戦国テーマ） |
|------|-----|-------------------|
| **空** | 暗いグラデーション(#0a0a0a→#1a1a2e) | 赤/オレンジ夕焼け4段階グラデーション |
| **遠景** | 単色の山2層 | 暗紫の山脈＋城/櫓シルエット |
| **中景** | なし | **新規**: 軍勢シルエット（槍の列） |
| **近景** | なし | **新規**: すすき野原（金色、sin()揺れアニメ） |
| **霧** | なし | **新規**: 地面付近の霧エフェクト rgba(200,180,160,0.3) |
| **地面** | 黒(#1a1a1a)＋ゴールドライン | 茶色の土道＋石テクスチャ |
| **障害物** | 幾何学的な岩/壁/二連岩 | 木柵(barricade)、幟旗(nobori)、鎧の残骸 |
| **装飾** | なし | **新規**: 城/鳥居のシルエット（遠景、8-15秒間隔スポーン） |
| **パーティクル** | ゴールドarc()円 | 土色fillRect()正方形（ドット絵風） |
| **HUD** | Orbitron/#D4A843 | Press Start 2P/#FFD700 |
| **タイトル** | "RUNNING ANIMAL" | "戦国虎走" + "SENGOKU TIGER RUN" |

#### カラーパレット
```
空:     #1a0508(暗赤) → #8B2500(赤) → #CC5500(オレンジ) → #E8A030(金色)
山:     #2a1020(遠), #3a1525(近)
軍勢:   #301028
すすき: #C4962C, #A07820, #806018
地面:   #5C4033(メイン), #3E2723(暗), #6B4226(明)
木材:   #4A3728(明), #2C1810(暗)
ロープ: #8B7355
HUD:    #FFD700(金), #CC9900(暗金)
```

#### render()パイプライン（新）
```
1. pCtx.clearRect (オフスクリーンクリア)
2. pCtxにシーン描画（半解像度400x150）:
   drawBgGradient → drawBackgroundDecorations → drawMountainsFar →
   drawArmySilhouettes → drawMountainsNear → drawSusukiGrass →
   drawMistLayer → drawGround → obstacles → dust/deathParticles → tiger
3. ctx.drawImage(offCanvas, 0, 0, 800, 300)  // 2x拡大転写
4. ctxにHUD描画（フル解像度800x300）
5. ctxにオーバーレイ描画（タイトル/ゲームオーバー/ローディング）
```

#### ゲームメカニクス（変更なし）
- 解像度: 論理800x300、ビューポートにフィット
- GRAVITY=2500, JUMP_VEL=-720
- BASE_SPEED=300 → MAX_SPEED=700, SPEED_ACCEL=0.4
- TIGER: 110x110, X=100固定
- 衝突: 25%インセットAABB
- スコア: 0.1秒ごと+1、localStorage保存
- 状態: LOADING → TITLE → PLAYING → GAME_OVER
- 入力: Space/↑/クリック/タップ

### 新規追加する変数
```js
armyScroll, grassScroll    // 新パララックスscroll
bgDecorations[]            // 背景装飾（城/鳥居）配列
decoSpawnTimer             // 装飾スポーンタイマー
grassStalks[]              // すすき茎データ（初期化時に生成）
offCanvas, pCtx            // オフスクリーンキャンバス
PIXEL_W=400, PIXEL_H=150, PX=2  // ドット絵スケール定数
```

## 次のアクション
**game.js を戦国ドット絵テーマで全面書き換え → コミット＆プッシュ**
