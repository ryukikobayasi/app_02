# AI Photo Mood Generator

写真をアップロードし、テーマと雰囲気を選ぶと、AI がタイトル・本文・絵文字・ハッシュタグを自動生成します。

## 機能

- 画像アップロード
- テーマ選択: 「今日は出勤」「お礼」「日常」など
- 雰囲気選択: フレンドリー / ギャルっぽい / 清楚 / 甘め / 大人っぽい
- AI による投稿文生成
- 「もっと短く」「違う雰囲気」で再生成

## 使い方

1. Python 3.10 以上をインストール
2. 仮想環境を作成
   - Windows PowerShell: `python -m venv .venv`
3. 依存関係をインストール
   - PowerShellの実行ポリシーに影響されない方法: `.venv\Scripts\python.exe -m pip install -r requirements.txt`
4. `.env.example` を `.env` にコピーして、`OPENAI_API_KEY` を設定
5. `.venv\Scripts\python.exe app.py`
6. http://localhost:3000 を開く

## Render へのデプロイ

1. GitHub にこのリポジトリを push
2. Render で `New + Web Service` を選択
3. GitHub リポジトリを接続
4. `Build Command`: `pip install -r requirements.txt`
5. `Start Command`: `gunicorn app:app`
6. 環境変数 `OPENAI_API_KEY` を追加
7. デプロイ

## 環境変数

```bash
OPENAI_API_KEY=your_key_here
PORT=3000
```
