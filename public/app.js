const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const themeSelect = document.getElementById('themeSelect');
const moodSelect = document.getElementById('moodSelect');
const descriptionInput = document.getElementById('descriptionInput');
const generateBtn = document.getElementById('generateBtn');
const shortBtn = document.getElementById('shortBtn');
const vibeBtn = document.getElementById('vibeBtn');
const resultCard = document.getElementById('resultCard');

const state = {
  lastResult: null,
  mode: 'normal',
};

photoInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    photoPreview.src = reader.result;
    photoPreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

function updateResultCard(result) {
  resultCard.classList.remove('empty');
  resultCard.innerHTML = `
    <div class="emoji">${result.emoji || '📸'}</div>
    <h3>${result.title || '今日の一枚'}</h3>
    <div class="body">${(result.body || '').replace(/\n/g, '<br>')}</div>
    <div class="hashtags">
      ${(result.hashtags || []).map((tag) => `<span class="tag">${tag}</span>`).join('')}
    </div>
  `;
}

async function requestGenerate(mode = 'normal') {
  const formData = new FormData();
  const photoFile = photoInput.files[0];

  if (photoFile) {
    formData.append('photo', photoFile);
  }

  formData.append('theme', themeSelect.value);
  formData.append('mood', moodSelect.value);
  formData.append('description', descriptionInput.value.trim());
  formData.append('mode', mode);

  if (state.lastResult) {
    formData.append('previousResult', JSON.stringify(state.lastResult));
  }

  generateBtn.disabled = true;
  generateBtn.textContent = '生成中...';

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || '生成に失敗しました');
    }

    state.lastResult = data.result;
    updateResultCard(data.result);
  } catch (error) {
    resultCard.classList.remove('empty');
    resultCard.innerHTML = `<div class="body">エラー: ${error.message}</div>`;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = 'AIで生成';
  }
}

generateBtn.addEventListener('click', () => requestGenerate('normal'));
shortBtn.addEventListener('click', () => requestGenerate('shorter'));
vibeBtn.addEventListener('click', () => requestGenerate('different-vibe'));
