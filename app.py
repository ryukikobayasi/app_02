import base64
import json
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from openai import OpenAI

load_dotenv(Path(__file__).with_name(".env"))

app = Flask(__name__, static_folder="public", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

MOODS = {
    "friendly": "フレンドリーで親しみやすく、自然な会話調",
    "gyaru": "ギャルっぽく、テンション高めでかわいらしい言い回し",
    "clean": "清楚で上品で落ち着いた雰囲気",
    "sweet": "甘めでロマンチックで優しい雰囲気",
    "adult": "大人っぽく、上品で余裕のある雰囲気",
}

THEMES = {
    "attendance": "今日は出勤",
    "thanks": "お礼",
    "daily": "日常",
    "travel": "旅行",
    "celebration": "お祝い",
}


def extract_json(text: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"```json|```", "", text or "", flags=re.IGNORECASE).strip()
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def build_prompt(
    theme: str,
    mood: str,
    description: str,
    mode: str,
    previous_result: dict[str, Any] | None,
) -> str:
    selected_theme = THEMES.get(theme, theme or "日常")
    mood_tone = MOODS.get(mood, mood or "フレンドリーで親しみやすい")
    extra = (
        f"ユーザーからの補足情報（写真の解析結果と組み合わせて必ず反映）: {description}"
        if description
        else "写真そのものを詳しく観察し、写っている内容を具体的に反映する"
    )

    prompt = (
        "あなたは画像にも対応できるSNS投稿文のライターです。"
        "添付された写真がある場合は必ず実際に観察し、写真に写っている情報を投稿文に反映してください。\n"
        "写真がない場合は、テーマ・雰囲気・ユーザーの補足情報をもとに自然な投稿文を作成してください。\n"
        "写真がある場合は、人物や人数、表情、服装、場所、背景、食べ物、持ち物、色、季節感、"
        "行動、時間帯、全体の雰囲気を読み取ってください。読み取れない内容や推測に過ぎない内容は断定しないでください。\n"
        f"- 写真がある場合は、写真から読み取った具体的な内容を本文に2つ以上反映する\n"
        f"- テーマ: {selected_theme}\n"
        f"- 雰囲気: {mood_tone}\n"
        f"- 追加条件: {extra}\n"
    )

    if mode == "shorter":
        prompt += "- 文章はもっと短く、簡潔かつ一言で刺さる内容にする\n"
    elif mode == "different-vibe":
        prompt += "- 以前の文章と違う雰囲気に変えて、表現の方向性を変える\n"

    if previous_result:
        prompt += "- 前回の文章を踏まえつつ、新しいバリエーションを出す\n"
        prompt += f"- 前回のタイトル案: {previous_result.get('title', '')}\n"

    return prompt + (
        '- 出力は必ずJSON形式: {"title":"...", "body":"...", '
        '"emoji":"...", "hashtags":["#...","#..."]}\n'
        "- 通常モードのtitleは20〜30字、bodyは5〜8文（400〜700字程度）で、写真の情景・感情・出来事を具体的に描写する\n"
        "- shorterモードのtitleは20字前後、bodyは1〜2文の短い内容にする\n"
        "- emojiは投稿本文の自然な位置に1〜3個入れ、同じ絵文字を過剰に繰り返さない\n"
        "- emojiフィールドにも本文で使った絵文字を1〜3個入れ、hashtagsは3〜6個\n"
        "- 日本語で書き、説明文やコードブロックは含めない\n"
    )


def fallback_result() -> dict[str, Any]:
    return {
        "title": "今日の一枚",
        "body": "素敵な瞬間を感じられる一枚です。",
        "emoji": "📸",
        "hashtags": ["#今日の一枚", "#日常", "#お気に入り"],
    }


def contains_emoji(text: str) -> bool:
    return any(
        0x1F300 <= ord(char) <= 0x1FAFF
        or 0x2600 <= ord(char) <= 0x27BF
        for char in text
    )


def generate_caption(
    theme: str,
    mood: str,
    description: str,
    mode: str,
    previous_result: dict[str, Any] | None,
    image_data_url: str | None,
) -> dict[str, Any]:
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": build_prompt(theme, mood, description, mode, previous_result),
        }
    ]
    if image_data_url:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": image_data_url, "detail": "high"},
            }
        )

    response = openai_client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.9,
        max_tokens=900 if mode != "shorter" else 300,
        messages=[{"role": "user", "content": content}],
    )
    raw = response.choices[0].message.content or ""
    result = extract_json(raw) or fallback_result()
    hashtags = result.get("hashtags")
    if not isinstance(hashtags, list):
        hashtags = fallback_result()["hashtags"]

    title = str(result.get("title") or "今日の一枚").strip()
    body = str(result.get("body") or "素敵な瞬間を感じられる一枚です。").strip()
    emoji = str(result.get("emoji") or "📸").strip()
    if not contains_emoji(body):
        body = f"{body} {emoji}"

    return {
        "title": title,
        "body": body,
        "emoji": emoji,
        "hashtags": [str(tag).strip() for tag in hashtags[:6]],
    }


@app.post("/api/generate")
def generate():
    if openai_client is None:
        return jsonify({"error": "OPENAI_API_KEY が設定されていません。"}), 500

    try:
        previous_raw = request.form.get("previousResult")
        previous_result = json.loads(previous_raw) if previous_raw else None
        image = request.files.get("photo")
        image_data_url = None

        if image and image.filename:
            if not image.mimetype or not image.mimetype.startswith("image/"):
                return jsonify({"error": "画像ファイルをアップロードしてください。"}), 400

            encoded = base64.b64encode(image.read()).decode("ascii")
            image_data_url = f"data:{image.mimetype};base64,{encoded}"

        result = generate_caption(
            theme=request.form.get("theme", "daily"),
            mood=request.form.get("mood", "friendly"),
            description=request.form.get("description", ""),
            mode=request.form.get("mode", "normal"),
            previous_result=previous_result,
            image_data_url=image_data_url,
        )
        return jsonify({"success": True, "result": result})
    except (json.JSONDecodeError, TypeError) as error:
        app.logger.exception("Invalid request data")
        return jsonify({"success": False, "error": f"入力データが不正です: {error}"}), 400
    except Exception as error:
        app.logger.exception("Caption generation failed")
        return jsonify({"success": False, "error": str(error) or "AI生成に失敗しました。"}), 500


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "status": "running"})


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "画像サイズは5MB以下にしてください。"}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "3000")), debug=False)
