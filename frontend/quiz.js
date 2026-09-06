(function () {
  'use strict';

  let currentQuestion = null;
  let streak = 0;
  let answered = false;

  const el = {
    streakBadge: document.getElementById('streakBadge'),
    btnCloseQuiz: document.getElementById('btnCloseQuiz'),
    qPrompt: document.getElementById('qPrompt'),
    targetWordText: document.getElementById('targetWordText'),
    btnAudioQuizUs: document.getElementById('btnAudioQuizUs'),
    btnAudioQuizUk: document.getElementById('btnAudioQuizUk'),
    optionsGrid: document.getElementById('optionsGrid'),
    feedbackMsg: document.getElementById('feedbackMsg'),
    btnNextQuiz: document.getElementById('btnNextQuiz'),
  };

  function renderQuestion(payload) {
    if (!payload || !payload.question) return;

    currentQuestion = payload.question;
    answered = false;

    if (payload.config && payload.config.theme) {
      document.body.className = payload.config.theme === 'light' ? 'light' : '';
    }

    el.qPrompt.textContent = currentQuestion.prompt || 'ما هو المعنى الصحيح لهذه المفردة؟';
    el.targetWordText.textContent = currentQuestion.targetWord;
    el.feedbackMsg.textContent = 'اختر الإجابة المناسبة';
    el.feedbackMsg.className = 'feedback-msg';
    el.btnNextQuiz.style.display = 'none';

    el.optionsGrid.innerHTML = '';
    currentQuestion.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'opt-btn';
      btn.textContent = opt.text;
      btn.addEventListener('click', () => handleAnswer(opt, btn));
      el.optionsGrid.appendChild(btn);
    });

    // Auto-pronounce if desired
    if (payload.config && payload.config.soundVoice) {
      Zad.speak(currentQuestion.targetWord, payload.config.soundVoice, 1.0);
    }
  }

  function handleAnswer(opt, clickedBtn) {
    if (answered) return;
    answered = true;

    const allButtons = el.optionsGrid.querySelectorAll('.opt-btn');
    allButtons.forEach(b => b.disabled = true);

    const isCorrect = opt.isCorrect;
    if (isCorrect) {
      clickedBtn.classList.add('correct');
      streak++;
      el.streakBadge.textContent = '🔥 ' + streak;
      el.feedbackMsg.textContent = 'إجابة ممتازة وصحيحة! 🎉';
      el.feedbackMsg.className = 'feedback-msg correct';
      Zad.speak(currentQuestion.targetWord, 'en-US', 1.0);
    } else {
      clickedBtn.classList.add('wrong');
      streak = 0;
      el.streakBadge.textContent = '🔥 0';
      el.feedbackMsg.textContent = 'إجابة غير صحيحة ❌';
      el.feedbackMsg.className = 'feedback-msg wrong';

      // Highlight the correct one
      currentQuestion.options.forEach((o, idx) => {
        if (o.isCorrect && allButtons[idx]) {
          allButtons[idx].classList.add('correct');
        }
      });
    }

    // Inform backend to update statistics
    Zad.invoke('q_answer', {
      isCorrect: isCorrect,
      wordId: currentQuestion.wordId
    });

    el.btnNextQuiz.style.display = 'inline-flex';
  }

  if (el.btnAudioQuizUs) {
    el.btnAudioQuizUs.addEventListener('click', () => {
      if (currentQuestion && currentQuestion.targetWord) {
        Zad.speak(currentQuestion.targetWord, 'en-US', 1.0);
      }
    });
  }

  if (el.btnAudioQuizUk) {
    el.btnAudioQuizUk.addEventListener('click', () => {
      if (currentQuestion && currentQuestion.targetWord) {
        Zad.speak(currentQuestion.targetWord, 'en-GB', 1.0);
      }
    });
  }

  // Animate sound wave mini
  window.addEventListener('zad:audio_state', (e) => {
    const state = e.detail || {};
    if (state.playing) {
      if (state.dialect === 'uk') {
        if (el.btnAudioQuizUk) el.btnAudioQuizUk.classList.add('playing');
        if (el.btnAudioQuizUs) el.btnAudioQuizUs.classList.remove('playing');
      } else {
        if (el.btnAudioQuizUs) el.btnAudioQuizUs.classList.add('playing');
        if (el.btnAudioQuizUk) el.btnAudioQuizUk.classList.remove('playing');
      }
    } else {
      if (el.btnAudioQuizUs) el.btnAudioQuizUs.classList.remove('playing');
      if (el.btnAudioQuizUk) el.btnAudioQuizUk.classList.remove('playing');
    }
  });

  el.btnNextQuiz.addEventListener('click', () => {
    Zad.invoke('q_next');
  });

  el.btnCloseQuiz.addEventListener('click', () => {
    Zad.invoke('q_hide');
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Zad.invoke('q_hide');
    }
  });

  Zad.listen('quiz_data', (payload) => {
    renderQuestion(payload);
  });

  Zad.invoke('quiz_ready');
})();
