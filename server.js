const express = require('express');
const multer = require('multer');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('画像ファイルをアップロードしてください'));
    }
    cb(null, true);
  },
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const moodMap = {
  friendly: 'フレンドリーで親しみやすく、自然な会話調',
  gyaru: 'ギャルっぽく、テンション高めでかわいらしい言い回し',
  clean: '清楚で上品で落ち着いた雰囲気',
  sweet: '甘めでロマンチックで優しい雰囲気',
  adult: '大人っぽく、上品で余裕のある雰囲気',
};

const themes = {
  attendance: '今日は出勤',
  thanks: 'お礼',
  daily: '日常',
  travel: '旅行',
  celebration: 'お祝い',
};

function extractJson(str) {
  if (!str) return null;
  const cleaned = str.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

function buildPrompt({ theme, mood, description, mode, previousResult }) {
  const selectedTheme = themes[theme] || theme || '日常';
  const moodTone = moodMap[mood] || mood || 'フレンドリーで親しみやすい';
  const baseDescription = description ? `写真の雰囲気や場面の補足: ${description}` : '写真の雰囲気と人物の表情を大事にして文章を作る';

  let instruction = `あなたはSNS投稿文のライターです。以下の条件で、写真に合う投稿文を1件作成してください。\n`;
  instruction += `- テーマ: ${selectedTheme}\n`;
  instruction += `- 雰囲気: ${moodTone}\n`;
  instruction += `- 追加条件: ${baseDescription}\n`;

  if (mode === 'shorter') {
    instruction += '- 文章はもっと短く、簡潔かつ一言で刺さる内容にする\n';
  } else if (mode === 'different-vibe') {
    instruction += '- 以前の文章と違う雰囲気に変えて、表現の方向性を変える\n';
  }

  if (previousResult) {
    instruction += `- 前回の文章の雰囲気を踏まえつつ、新しいバリエーションを出す\n`;
    instruction += `- 前回のタイトル案: ${previousResult.title || ''}\n`;
  }

  instruction += `- 出力は必ず JSON 形式で、以下のキーだけを含める: {"title":"...", "body":"...", "emoji":"...", "hashtags":["#...","#..."]}\n`;
  instruction += `- title は 20字前後、body は 1〜3文で自然に、emoji は 1〜3個の絵文字、hashtags は 3〜6個のハッシュタグ\n`;
  instruction += `- 日本語で書く\n`;
  instruction += `- 決して説明文やコードブロックは含めない\n`;

  return instruction;
}

async function generateCaption({ theme, mood, description, mode, previousResult, imageDataUrl }) {
  const prompt = buildPrompt({ theme, mood, description, mode, previousResult });

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        ...(imageDataUrl
          ? [{ type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }]
          : []),
      ],
    },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.9,
    max_tokens: 300,
    messages,
  });

  const raw = completion.choices[0]?.message?.content || '';
  const result = extractJson(raw) || {
    title: '今日の一枚',
    body: '素敵な瞬間を感じられる一枚です。',
    emoji: '📸',
    hashtags: ['#今日の一枚', '#日常', '#お気に入り'],
  };

  if (!Array.isArray(result.hashtags)) {
    result.hashtags = ['#今日の一枚', '#日常', '#お気に入り'];
  }

  return {
    title: String(result.title || '今日の一枚').trim(),
    body: String(result.body || '素敵な瞬間を感じられる一枚です。').trim(),
    emoji: String(result.emoji || '📸').trim(),
    hashtags: result.hashtags.slice(0, 6).map((tag) => String(tag).trim()),
  };
}

app.post('/api/generate', upload.single('photo'), async (req, res) => {
  try {
    if (!openai) {
      return res.status(500).json({ error: 'OPENAI_API_KEY が設定されていません。' });
    }

    const theme = req.body.theme || 'daily';
    const mood = req.body.mood || 'friendly';
    const description = req.body.description || '';
    const mode = req.body.mode || 'normal';
    const previousResult = req.body.previousResult ? JSON.parse(req.body.previousResult) : null;

    const imageDataUrl = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      : null;

    const result = await generateCaption({
      theme,
      mood,
      description,
      mode,
      previousResult,
      imageDataUrl,
    });

    res.json({ success: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI生成に失敗しました。',
    });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'running' });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Photo mood app listening at http://localhost:${port}`);
});
