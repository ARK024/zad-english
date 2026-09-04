(function () {
  'use strict';

  let currentWord = null;
  let currentConfig = {};
  let autoHideTimeout = null;

  // DOM elements
  const el = {
    levelBadge: document.getElementById('levelBadge'),
    wordTitle: document.getElementById('wordTitle'),
    wordPos: document.getElementById('wordPos'),
    wordPhonetic: document.getElementById('wordPhonetic'),
    arabicMeaning: document.getElementById('arabicMeaning'),
    englishDef: document.getElementById('englishDef'),
    exampleEn: document.getElementById('exampleEn'),
    exampleAr: document.getElementById('exampleAr'),
    synonymsRow: document.getElementById('synonymsRow'),
    synonymsList: document.getElementById('synonymsList'),
    progFill: document.getElementById('progFill'),
    counterTag: document.getElementById('counterTag'),
    btnSoundUs: document.getElementById('btnSoundUs'),
    btnSoundUk: document.getElementById('btnSoundUk'),
    btnPlayAudio: document.getElementById('btnPlayAudio'),
    btnFontUp: document.getElementById('btnFontUp'),
    btnFontDown: document.getElementById('btnFontDown'),
    btnSettings: document.getElementById('btnSettings'),
    btnClose: document.getElementById('btnClose'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnQuiz: document.getElementById('btnQuiz'),
    btnReview: document.getElementById('btnReview'),
    btnMemorized: document.getElementById('btnMemorized'),
  };

  function renderWord(payload) {
    if (!payload || !payload.word) return;

    currentWord = payload.word;
    currentConfig = payload.config || {};

    const w = payload.word;
    const stats = payload.stats || {};
    const idx = payload.index || 0;
    const total = payload.total || 1;

    // Apply theme & font size
    document.body.className = currentConfig.theme === 'light' ? 'light' : '';
    if (currentConfig.fontSize) {
      el.wordTitle.style.fontSize = (currentConfig.fontSize + 6) + 'px';
      el.arabicMeaning.style.fontSize = (currentConfig.fontSize) + 'px';
    }

    // Set Level Badge
    el.levelBadge.textContent = w.level || 'All';
    el.levelBadge.className = 'badge-level level-' + (w.level || 'B1');

    // Word & phonetics
    el.wordTitle.textContent = w.word;
    el.wordPos.textContent = w.partOfSpeech || '';
    el.wordPhonetic.textContent = w.phonetic || '';

    // Meanings
    el.arabicMeaning.textContent = w.meaningAr;
    el.englishDef.textContent = w.definitionEn;

    // Example
    el.exampleEn.textContent = '“' + w.example + '”';
    el.exampleAr.textContent = w.exampleAr;

    // Synonyms
    if (w.synonyms && w.synonyms.length > 0) {
      el.synonymsRow.style.display = 'flex';
      el.synonymsList.innerHTML = '';
      w.synonyms.forEach(syn => {
        const span = document.createElement('span');
        span.className = 'syn-pill';
        span.textContent = syn;
        span.addEventListener('click', () => {
          Zad.speak(syn, currentConfig.soundVoice || 'en-US', currentConfig.soundRate || 1.0);
        });
        el.synonymsList.appendChild(span);
      });
    } else {
      el.synonymsRow.style.display = 'none';
    }

    // Progress bar & counter
    const pct = Math.round(((idx + 1) / total) * 100);
    el.progFill.style.width = pct + '%';
    el.counterTag.textContent = (idx + 1) + ' / ' + total + ' (' + pct + '%)';

    // Memorized / Review state styling
    if (payload.isMemorized) {
      el.btnMemorized.textContent = 'محفوظة ⭐';
      el.btnMemorized.style.background = '#059669';
    } else {
      el.btnMemorized.textContent = 'حفظتها ✅';
      el.btnMemorized.style.background = '';
    }

    if (payload.isReview) {
      el.btnReview.textContent = 'في المراجعة ⏳';
    } else {
      el.btnReview.textContent = '🔄 مراجعة';
    }

    // Auto pronounce if enabled
    if (currentConfig.autoPronounce) {
      setTimeout(() => {
        pronounce('en-US');
      }, 350);
    }

    // Reset auto-hide timer
    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
    }
    if (currentConfig.autoHide && currentConfig.displayDuration > 0) {
      autoHideTimeout = setTimeout(() => {
        Zad.invoke('w_hide');
      }, currentConfig.displayDuration * 1000);
    }
  }

  function pronounce(lang) {
    if (!currentWord) return;
    const rate = currentConfig.soundRate || 1.0;
    Zad.speak(currentWord.word, lang || currentConfig.soundVoice || 'en-US', rate);
  }

  // Event Listeners
  el.btnSoundUs.addEventListener('click', () => pronounce('en-US'));
  el.btnSoundUk.addEventListener('click', () => pronounce('en-GB'));
  el.btnPlayAudio.addEventListener('click', () => pronounce(currentConfig.soundVoice || 'en-US'));

  el.btnNext.addEventListener('click', () => {
    Zad.invoke('w_next');
  });

  el.btnPrev.addEventListener('click', () => {
    Zad.invoke('w_prev');
  });

  el.btnMemorized.addEventListener('click', () => {
    if (!currentWord) return;
    Zad.invoke('w_memorized', { id: currentWord.id });
  });

  el.btnReview.addEventListener('click', () => {
    if (!currentWord) return;
    Zad.invoke('w_review', { id: currentWord.id });
  });

  el.btnQuiz.addEventListener('click', () => {
    Zad.invoke('w_open_quiz');
  });

  el.btnSettings.addEventListener('click', () => {
    Zad.invoke('s_open_settings');
  });

  el.btnClose.addEventListener('click', () => {
    Zad.invoke('w_hide');
  });

  el.btnFontUp.addEventListener('click', () => {
    let size = (currentConfig.fontSize || 20) + 2;
    if (size <= 32) {
      currentConfig.fontSize = size;
      el.wordTitle.style.fontSize = (size + 6) + 'px';
      el.arabicMeaning.style.fontSize = size + 'px';
    }
  });

  el.btnFontDown.addEventListener('click', () => {
    let size = (currentConfig.fontSize || 20) - 2;
    if (size >= 14) {
      currentConfig.fontSize = size;
      el.wordTitle.style.fontSize = (size + 6) + 'px';
      el.arabicMeaning.style.fontSize = size + 'px';
    }
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Zad.invoke('w_hide');
    } else if (e.key === 'ArrowRight') {
      Zad.invoke('w_next');
    } else if (e.key === 'ArrowLeft') {
      Zad.invoke('w_prev');
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      pronounce();
    } else if (e.key === 'm' || e.key === 'M') {
      if (currentWord) Zad.invoke('w_memorized', { id: currentWord.id });
    }
  });

  // Receive live updates from Tauri backend
  Zad.listen('word_data', (payload) => {
    renderWord(payload);
  });

  // Inform backend that the widget webview is ready
  Zad.invoke('widget_ready');
})();
