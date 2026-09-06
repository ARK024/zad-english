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
    wordPhoneticUs: document.getElementById('wordPhoneticUs'),
    wordPhoneticUk: document.getElementById('wordPhoneticUk'),
    chipUs: document.getElementById('chipUs'),
    chipUk: document.getElementById('chipUk'),
    arabicMeaning: document.getElementById('arabicMeaning'),
    englishDef: document.getElementById('englishDef'),
    exampleEn: document.getElementById('exampleEn'),
    exampleAr: document.getElementById('exampleAr'),
    synonymsRow: document.getElementById('synonymsRow'),
    synonymsList: document.getElementById('synonymsList'),
    progFill: document.getElementById('progFill'),
    counterTag: document.getElementById('counterTag'),
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
    const idx = payload.index || 0;
    const total = payload.total || 1;

    // Apply theme
    document.body.className = currentConfig.theme === 'light' ? 'light' : '';

    // Set Level Badge with CEFR display
    const lvl = w.level || 'B1';
    el.levelBadge.textContent = lvl;
    el.levelBadge.className = 'badge-level level-' + lvl;

    // Word & POS
    el.wordTitle.textContent = w.word;
    el.wordPos.textContent = w.partOfSpeech || 'word';

    // Phonetics
    const usIpa = w.phoneticUs || w.phonetic || '/.../';
    const ukIpa = w.phoneticUk || w.phonetic || usIpa;
    el.wordPhoneticUs.textContent = usIpa;
    el.wordPhoneticUk.textContent = ukIpa;

    // Meanings
    el.arabicMeaning.textContent = w.meaningAr || '';
    el.englishDef.textContent = w.definitionEn || '';

    // Real-world Example
    el.exampleEn.textContent = w.example ? `“${w.example}”` : '';
    el.exampleAr.textContent = w.exampleAr || '';

    // Synonyms Pills
    if (w.synonyms && w.synonyms.length > 0) {
      el.synonymsRow.style.display = 'flex';
      el.synonymsList.innerHTML = '';
      w.synonyms.forEach(syn => {
        const span = document.createElement('span');
        span.className = 'syn-pill';
        span.textContent = syn;
        span.title = `استمع لنطق ${syn}`;
        span.addEventListener('click', (e) => {
          e.stopPropagation();
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
    el.counterTag.textContent = (idx + 1) + ' / ' + total;

    // Memorized / Review state styling
    if (payload.isMemorized) {
      el.btnMemorized.classList.add('active');
      el.btnMemorized.querySelector('.txt').textContent = 'محفوظة ✓';
    } else {
      el.btnMemorized.classList.remove('active');
      el.btnMemorized.querySelector('.txt').textContent = 'حفظتها';
    }

    if (payload.isReview) {
      el.btnReview.classList.add('active');
      el.btnReview.querySelector('.txt').textContent = 'في المراجعة';
    } else {
      el.btnReview.classList.remove('active');
      el.btnReview.querySelector('.txt').textContent = 'مراجعة';
    }

    // Auto pronounce if enabled in settings
    if (currentConfig.autoPronounce) {
      setTimeout(() => {
        const voice = currentConfig.soundVoice || 'en-US';
        Zad.speak(currentWord.word, voice, currentConfig.soundRate || 1.0);
      }, 400);
    }

    // Auto-hide timer
    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
    }
    if (currentConfig.autoHide && currentConfig.displayDuration > 0) {
      autoHideTimeout = setTimeout(() => {
        Zad.invoke('w_hide');
      }, currentConfig.displayDuration * 1000);
    }
  }

  // Audio wave indicators listener
  window.addEventListener('zad:audio_state', (e) => {
    const detail = e.detail || {};
    if (detail.playing) {
      if (detail.dialect === 'uk') {
        el.chipUk.classList.add('is-playing');
        el.chipUs.classList.remove('is-playing');
      } else {
        el.chipUs.classList.add('is-playing');
        el.chipUk.classList.remove('is-playing');
      }
    } else {
      el.chipUs.classList.remove('is-playing');
      el.chipUk.classList.remove('is-playing');
    }
  });

  // Human Audio Trigger Handlers
  el.chipUs.addEventListener('click', () => {
    if (!currentWord) return;
    Zad.speak(currentWord.word, 'en-US', currentConfig.soundRate || 1.0);
  });

  el.chipUk.addEventListener('click', () => {
    if (!currentWord) return;
    Zad.speak(currentWord.word, 'en-GB', currentConfig.soundRate || 1.0);
  });

  // Navigation Handlers
  el.btnNext.addEventListener('click', () => {
    Zad.invoke('w_next');
  });

  el.btnPrev.addEventListener('click', () => {
    Zad.invoke('w_prev');
  });

  // Study Action Handlers
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

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Zad.invoke('w_hide');
    } else if (e.key === 'ArrowRight') {
      Zad.invoke('w_next');
    } else if (e.key === 'ArrowLeft') {
      Zad.invoke('w_prev');
    } else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
      if (currentWord) {
        Zad.speak(currentWord.word, currentConfig.soundVoice || 'en-US', currentConfig.soundRate || 1.0);
      }
    } else if (e.key === 'm' || e.key === 'M') {
      if (currentWord) Zad.invoke('w_memorized', { id: currentWord.id });
    } else if (e.key === 'r' || e.key === 'R') {
      if (currentWord) Zad.invoke('w_review', { id: currentWord.id });
    }
  });

  // Live updates from Tauri backend
  Zad.listen('word_data', (payload) => {
    renderWord(payload);
  });

  // Initial load
  Zad.invoke('widget_ready').then(payload => {
    if (payload) renderWord(payload);
  });
})();
