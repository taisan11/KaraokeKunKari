# MIDIベース簡易カラオケ（Vite + TypeScript）仕様書(仮)

パッケージマネージャーやランナーにはbunを使用すること

---

## 目的

MIDIを伴奏に使ったWebベースの簡易カラオケをVite + TypeScriptで実装する。主な機能は以下。

* MIDI再生（シーク対応）
* マイク入力によるリアルタイム音程検出
* 音程バー（リアルタイム表示）
* 採点：歌唱時間に対する正解音程の一致割合
* シークバーで任意位置に戻れる
* モバイル（特にiOS Safari）での安定動作

---

## 技術スタック

* ビルド: Vite + TypeScript
* UI: Vanilla TS + CSS
* MIDIパーサ: `@tonejs/midi` または `midi-file-parser`（推奨: @tonejs/midi）
* オーディオ再生: Tone.js（Transport同期）または直接 Web Audio API
* 音源: SoundFont（`soundfont-player` / Tone.Sampler）
* ピッチ検出: `pitchy`（軽量で精度良）
* 描画: HTML Canvas（音程バー）

---

## 依存パッケージ（例）

```json
{
  "dependencies": {
    "tone": "^14.x",
    "@tonejs/midi": "^2.x",
    "pitchy": "^1.x",
    "soundfont-player": "^0.x"
  },
  "devDependencies": {
    "vite": "^5.x",
    "typescript": "^5.x"
  }
}
```

---

## データモデル

```ts
type NoteEvent = {
  time: number;       // seconds (Tone.Transport.seconds 基準)
  duration: number;   // seconds
  midi: number;       // MIDIノート番号（整数）
  velocity: number;   // 0..1
};

// 時間解像度での正解音程配列（補助構造）
// index -> time = start + index * step
interface ExpectedPitchArray {
  start: number;      // start time in seconds
  step: number;       // resolution in seconds (例: 0.02s)
  pitches: (number | null)[]; // MIDIノート番号か null
}
```

---

## 主要ワークフロー

1. MIDIファイルをロードし `NoteEvent[]` に変換
2. ノート配列から `ExpectedPitchArray` を生成（最適化済み）
3. Tone.js（Transport）でMIDI伴奏を再生（シーク対応）
4. マイク入力を `pitchy` でリアルタイム検出（Hz -> MIDI）
5. 毎フレームで現在時刻を取得して `ExpectedPitchArray` の期待音を参照
6. 検出音程と期待音程を比較して音程バーを描画・スコア集計

---

## 2 — MIDI → 音程配列の最適化（詳細設計）

### 目的

再生時間に対して高速に期待音程を参照できるように、時間解像度を持った配列（ExpectedPitchArray）を生成する。シークやリアルタイム比較で高速かつメモリ効率を保つ。

### 要件

* 解像度の選択可能（例: 0.01〜0.05秒）。低解像度で負荷軽減、高解像度で精度向上。
* ポリフォニー（同時発音）がある場合はボーカル用途に合わせて単一ピッチを得る方法を提供する（優先戦略を選択可能）。
* 速いシーク・大量データでも即時参照できる。

### アルゴリズム（概略）

1. MIDIの `NoteEvent[]` を取得（各ノートは time, duration, midi, velocity を持つ）
2. `start = min(note.time)`, `end = max(note.time + duration)` を計算
3. `step = resolution`（例 0.02s）。`len = Math.ceil((end - start) / step)` を求める
4. 空の `pitches` 配列を `len` 長で初期化（null）
5. 各ノートについて、`i0 = floor((note.time - start) / step)`, `i1 = ceil((note.time + duration - start) / step)` を計算
6. `pitches[i]` に値を入れるロジック：

   * 単純優先: 先に書かれたノートで上書きしない（最初のトラック優先）
   * 音量優先: 同じスロットで複数ノートが被る場合、`velocity` が最大のノートを採用
   * 支配周波数（推奨）: スロットで複数ノートがある場合、**周波数帯域の中央値**か**最も強い音（velocity最大）**を適用

### ポリフォニー対策（ボーカル特化）

人の歌に合わせる場合、多くのMIDI伴奏は単旋律（ボーカルメロディ）を1トラックに持つ設計が望ましい。だが伴奏MIDIが多声の場合：

* オプションA（トラック優先）: メロディトラックが分かっているならそれを専用に使う。
* オプションB（優勢音選出）: 各スロットで `max velocity` のノートを選ぶ。
* オプションC（周波数中心）: 各スロットでノート群の加重中央値（velocity重み）を使う。

### 精度とパフォーマンスのトレードオフ

* step を小さくすると精度↑だがメモリ↑／生成コスト↑
* 推奨: 歌唱用途は `step = 0.02`〜`0.04` 秒。人間のピッチ判定のラグや振幅を考慮するとこの範囲が実用的。

### TypeScript 擬似実装

```ts
function buildExpectedPitchArray(notes: NoteEvent[], resolution = 0.02): ExpectedPitchArray {
  const start = Math.min(...notes.map(n => n.time));
  const end = Math.max(...notes.map(n => n.time + n.duration));
  const len = Math.ceil((end - start) / resolution);
  const pitches: (number | null)[] = new Array(len).fill(null);

  for (const note of notes) {
    const i0 = Math.max(0, Math.floor((note.time - start) / resolution));
    const i1 = Math.min(len, Math.ceil((note.time + note.duration - start) / resolution));

    for (let i = i0; i < i1; i++) {
      const existing = pitches[i];
      if (existing === null) {
        pitches[i] = note.midi;
      } else {
        // ここでポリフォニー解決：velocity優先など
        // 仮: 既存より velocity が小さければ上書き
        // 実装では slotごとに実際の候補を保持して比較することを推奨
      }
    }
  }

  return { start, step: resolution, pitches };
}
```

### 追加最適化（大規模MIDI向け）

* スロットごとに「候補リスト（最小限）」を保持しておき、最後に一括選定を行う。これによりループ中の条件分岐を減らす。
* Web Worker で配列生成を行いメインスレッドのブロックを避ける（大きいMIDIや高解像度時に必須）。
* 圧縮: 連続同値を RLE (run-length encoding) にしてメモリ削減可能（読み出し時に復元コストは僅少）。

---

## 4 — スマホ（iOS）対応の実装方針

### 問題点（iOS/Safari特有）

* AudioContext はユーザー操作（タップ等）で `resume()` しないと音を出せない
* サンプルレートの差異（iOS はハードウェアにより 48000Hz 固定など）
* 自動再生制限（再生開始はユーザージェスチャ必須）
* getUserMedia の制限や一部機能差（setSinkId 不可など）
* マイクとスピーカーのフィードバック（エコー）が発生しやすい
* Safari は `AudioWorklet` のサポートがあるが、バージョン差がある

### 対策（実装上の具体案）

1. **初回インタラクションでオーディオを開始**

   * 最初の「スタート／録音開始」ボタンをユーザーに押してもらい、そのハンドラ内で `await Tone.start()` と `audioContext.resume()` を呼ぶ。

2. **低レイテンシ設定**

   * AudioContext を生成するときに `latencyHint: 'interactive'` を指定。
   * Tone.js を使う場合は `Tone.context = new AudioContext({ latencyHint: 'interactive' });`

3. **マイク取得時の制約指定**

   * `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 } })`
   * iOSでは `sampleRate` が無視される場合があるが、指定することでブラウザが最適化する場合あり。

4. **音声フィードバック対策**

   * マイク入力は `MediaStreamAudioSourceNode` で拾い、`AnalyserNode` と `ScriptProcessor/AudioWorklet` 経由で検出のみ行う。
   * マイクの音はスピーカーにループバックしない（`source.connect(audioCtx.destination)` をしない）。
   * 必要に応じて低遅延モニタリングはユーザーがオンにするオプション（明示的に要求）にする。

5. **UIのタッチ最適化**

   * 大きめの操作ボタン、タッチ領域を確保
   * iOSの回転やキーボード表示でCanvasがリサイズされることを想定して再描画ロジックを入れる

6. **Safari の制約への対処**

   * `AudioWorklet` が必要な処理はフォールバックとして `ScriptProcessorNode` を最低限実装（ただし非推奨）
   * `WebAudio` API の `suspend()` / `resume()` 状態管理を厳密に行う

7. **テストマトリクス**

   * iOS Safari（最新）
   * iOS Chrome（WebKitベースなのでSafariと同様）
   * Android Chrome（複数機種）

---

## シーク実装の注意点

* `Tone.Transport.seconds` を動かした場合、同期して UI と `ExpectedPitchArray` の参照位置を更新
* シーク時はスコア履歴や音程履歴をどう扱うか明示する（リセット or 巻き戻し再集計）
* シークはユーザー操作で頻繁に行われるため、`onSeek` ハンドラは軽量にして即時反映する

---

## 音程検出パイプライン（簡易実装）

1. `getUserMedia` でマイクを取得
2. `MediaStreamAudioSourceNode` -> `AnalyserNode` で time-domain を取得
3. `pitchy` の `findPitch()` に buffer を渡して周波数取得
4. 周波数が `clarity`（自信度）閾値を超えれば Hz -> MIDI へ変換
5. Frame 毎に `ExpectedPitchArray` の対応スロットを参照して一致判定

---

## スコア計算仕様

* フレーム幅は `frameStep`（例 0.02s）でサンプリング
* 各フレームで `detectedMidi` と `expectedMidi` の差を `absDiff`
* 合致判定（デフォルト）:

  * `absDiff <= 0.5` => PERFECT (カウントする)
  * `absDiff <= 1.0` => ACCEPTABLE (カウントする)
  * それ以上 => MISS
* 最終スコア = (合致フレーム数 / 検査対象フレーム数) * 100（%）

注意: `clarity`（pitchy の信頼度）が低いフレームは `検査対象` から除外して再計算するか、低ウェイトを与える。

---

## UI案（要点）

* 上部: 曲タイトル + 再生/一時停止 + シークバー
* 中央: 歌詞行（LRC） + 現在小節ハイライト
* 下部: 音程バー（Canvas）

  * 真ん中が期待音程（縦ラインまたはターゲット帯）
  * 現在音程は移動するドット/線で表示
  * ピッチヒストリを一定幅で表示（右へスクロール）
* 右下: スコア表示（%） + 合致時間 / 総時間

---

## 実装スニペット（シーク + 期待音取得）

```ts
// 再生位置に応じて期待MIDIを得る
function getExpectedMidiAt(time: number, expected: ExpectedPitchArray): number | null {
  if (time < expected.start) return null;
  const idx = Math.floor((time - expected.start) / expected.step);
  if (idx < 0 || idx >= expected.pitches.length) return null;
  return expected.pitches[idx];
}

// シークハンドラ
seekInput.oninput = (e) => {
  const t = Number((e.target as HTMLInputElement).value);
  Tone.Transport.seconds = t; // Transport をジャンプ
  // スコアや履歴の扱いを決める
  resetOrRecomputeOnSeek();
};
```

---

## パフォーマンスとテスト

* Web Worker で MIDI -> ExpectedPitchArray の生成
* `requestAnimationFrame` と `setInterval` の併用で UI 更新を制御
* Canvas は必要最小限の領域のみ再描画
* モバイルでの CPU 使用量を抑えるため、`resolution` を動的に変える（低スペック時は 0.04s など）

---

## 開発タスクとマイルストーン

1. ベース: Vite + Tone.js の雛形（MIDI再生、再生/一時停止）
2. MIDI パース → `NoteEvent[]` → `ExpectedPitchArray` 実装（Web Worker）
3. マイク入力 + pitchy 実装（PCでテスト）
4. 音程バー Canvas 実装
5. シーク & スコア算出ロジック
6. モバイル（iOS）特化対応とテスト
7. UX調整・バグ修正・デプロイ

---

## QA（想定チェック項目）

* MIDIと音声が同期しているか（シーク含む）
* iOS Safari での起動（タッチで開始）とマイク許可フロー
* ピッチ推定の精度（クリアリティ閾値の調整）
* シーク時のスコア挙動が期待どおりか
* マルチトラックMIDIで期待音が正しく選ばれているか

---

## 参考（実装上の小さなヒント）

* AudioContext は必ずユーザー操作で `resume()` する
* マイク音はスピーカーにループバックしない（フィードバック回避）
* 高負荷処理（解析や大きいMIDI生成）は Web Worker にオフロード
* できれば曲のメロディトラックを事前に指定できる UI を作る（精度が劇的に上がる）
