# Karaoke Kun Kari (カラオケくんカリ)

MIDIベースの簡易カラオケWebアプリケーション

Vite + TypeScript + Tone.js + pitchy で作成された、ブラウザで動作するリアルタイム音程検出・採点機能付きカラオケシステムです。

## 特徴

- 🎤 **リアルタイム音程検出**: マイク入力からリアルタイムで音程を検出
- 🎵 **MIDI再生**: MIDIファイルを伴奏として再生（シーク対応）
- 📊 **採点機能**: 歌唱音程と期待音程の一致度を計算してスコア表示
- 📈 **音程バー**: Canvas を使った視覚的な音程表示
- 📱 **モバイル対応**: iOS Safari を含むモバイルブラウザで動作
- ⚡ **高速処理**: 時間解像度ベースの最適化された音程配列

## 技術スタック

- **ビルド**: Vite 7 (Rolldown) + TypeScript 5
- **UI**: Vanilla TypeScript + CSS
- **MIDIパーサ**: @tonejs/midi
- **オーディオ再生**: Tone.js (Transport同期)
- **ピッチ検出**: pitchy (軽量で高精度)
- **描画**: HTML Canvas

## セットアップ

### 必要要件

- Node.js 18以上
- Bun (推奨) または npm/yarn

### インストール

```bash
# リポジトリをクローン
git clone <repository-url>
cd KaraokeKunKari

# 依存関係をインストール（Bunを使用）
bun install

# または npm を使用
npm install
```

### 開発サーバーの起動

```bash
# Bunを使用
bun run dev

# または npm を使用
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

### ビルド

```bash
# プロダクションビルド
bun run build

# または npm を使用
npm run build

# ビルド結果をプレビュー
bun run preview
```

## 使い方

### 1. 初期化

1. アプリを開き、「🎙️ 初期化して開始」ボタンをクリック
2. マイクへのアクセスを許可（ブラウザのプロンプトが表示されます）
3. 初期化完了を待つ

### 2. MIDIファイルの読み込み

1. 「ファイルを選択」ボタンをクリック
2. お使いのMIDIファイル（.mid または .midi）を選択
3. MIDIファイルの情報が表示されます

### 3. カラオケの実行

1. 「▶️ 再生」ボタンをクリックして伴奏を開始
2. マイクに向かって歌う
3. 画面上の音程バーで、期待音程（緑）と検出音程（赤）を確認
4. リアルタイムでスコアが更新されます

### 4. コントロール

- **再生/一時停止**: 伴奏の再生を制御
- **停止**: 再生を停止して最初に戻る
- **シークバー**: 任意の位置にジャンプ
- **音量調整**: 伴奏の音量を調整（-40dB 〜 0dB）

## 設定オプション

### 音程配列の解像度

音程検出の時間解像度を選択できます：

- **高 (10ms)**: 高精度だが処理負荷が高い
- **中 (20ms)**: バランスの取れた設定（推奨）
- **低 (40ms)**: 低負荷だが精度は低い

### ポリフォニー解決戦略

複数の音が同時に鳴る場合の処理方法：

- **最初のノート優先**: 最初に開始されたノートを採用
- **最大音量優先**: 最も音量の大きいノートを採用（推奨）
- **周波数重心**: 音量で重み付けした平均音程を採用

## プロジェクト構造

```
KaraokeKunKari/
├── src/
│   ├── types/           # 型定義
│   │   └── index.ts
│   ├── core/            # コアロジック
│   │   ├── midiParser.ts         # MIDIパーサー
│   │   ├── pitchArrayBuilder.ts  # 音程配列生成
│   │   └── scoring.ts            # スコアリングシステム
│   ├── audio/           # 音声関連
│   │   ├── midiPlayer.ts         # MIDI再生
│   │   └── pitchDetector.ts      # ピッチ検出
│   ├── ui/              # UI関連
│   │   └── pitchBar.ts           # 音程バー描画
│   ├── karaokeApp.ts    # メインアプリケーション
│   ├── main.ts          # エントリーポイント
│   └── style.css        # スタイル
├── public/              # 公開アセット
├── index.html           # HTMLテンプレート
├── package.json
├── tsconfig.json
├── vite.config.ts
└── siyou.md            # 仕様書
```

## API概要

### KaraokeApp

メインアプリケーションクラス

```typescript
const app = new KaraokeApp();

// 初期化（ユーザージェスチャから呼び出す）
await app.initialize();

// MIDIファイルを読み込む
await app.loadMidiFromFile(file, { resolution: 0.02, strategy: 'VELOCITY' });

// 再生制御
await app.play();
app.pause();
app.stop();
app.seek(timeInSeconds);

// 状態監視
app.onStateChanged((state) => {
  console.log('Score:', state.score.score);
});
```

### MidiPlayer

MIDI再生を管理

```typescript
const player = new MidiPlayer();
await player.initialize();
player.loadNotes(noteEvents);
await player.play();
player.pause();
player.seek(time);
```

### MicrophonePitchDetector

マイクからのピッチ検出

```typescript
const detector = new MicrophonePitchDetector({ clarityThreshold: 0.85 });
await detector.initialize();
detector.start((pitch) => {
  console.log('Detected:', pitch.midi, pitch.frequency, pitch.clarity);
});
detector.stop();
```

### ScoreTracker

スコア計算とトラッキング

```typescript
const tracker = new ScoreTracker();
tracker.addFrame(detectedPitch, expectedPitchArray, currentTime);
const stats = tracker.getStats();
console.log('Score:', stats.score, 'Perfect:', stats.perfectFrames);
```

## iOS/Safari 対応

iOS Safari での動作のため、以下の対応を実施しています：

1. **AudioContext の初期化**: ユーザージェスチャ（ボタンクリック）から `Tone.start()` を呼び出し
2. **低レイテンシ設定**: `latencyHint: 'interactive'` を指定
3. **エコーキャンセル**: マイク入力に `echoCancellation: true` を設定
4. **フィードバック防止**: マイク入力をスピーカーに接続しない
5. **タッチ最適化**: 大きめのボタンとタッチ領域を確保

## パフォーマンス最適化

- 時間解像度ベースの音程配列で高速ルックアップ
- requestAnimationFrame を使った効率的な描画
- Canvas の必要最小限の領域のみ再描画
- Web Worker での大規模MIDI処理（将来実装予定）

## ブラウザ対応

- Chrome/Edge (最新版)
- Firefox (最新版)
- Safari (iOS 14+)
- Chrome for Android

## トラブルシューティング

### マイクが動作しない

1. ブラウザのマイク権限を確認
2. システムのマイク設定を確認
3. HTTPS接続で実行（localhost以外の場合）

### 音が出ない（iOS）

1. サイレントモードを解除
2. 「初期化して開始」ボタンを必ず押す
3. 音量を確認

### 音程検出の精度が低い

1. 静かな環境で歌う
2. マイクの距離を調整
3. 設定で「解像度」を「高」に変更

## ライセンス

MIT License

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

## 参考資料

- [Tone.js Documentation](https://tonejs.github.io/)
- [pitchy GitHub](https://github.com/ianprime0509/pitchy)
- [@tonejs/midi](https://github.com/Tonejs/Midi)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## 開発者

作成: taisan11

---

**Note**: このプロジェクトは教育・研究目的で作成されています。商用利用の際は適切なライセンス確認を行ってください。