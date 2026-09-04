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
    btnAudioQuiz: document.getElementById('btnAudioQuiz'),
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

    el.qPrompt.textContent = currentQuestion.prompt;
    el.targetWordText.textContent = currentQuestion.targetWord;
    el.feedbackMsg.textContent = 'اختر الإجابة الصحيحة';
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
      el.feedbackMsg.textContent = 'أحسنت! إجابة صحيحة ✅';
      el.feedbackMsg.className = 'feedback-msg correct';
      Zad.speak(currentQuestion.targetWord, 'en-US', 1.0);
    } else {
      clickedBtn.classList.add('wrong');
      streak = 0;
      el.streakBadge.textContent = '🔥 0';
      el.feedbackMsg.textContent = 'إجابة خاطئة ❌';
      el.feedbackMsg.className = 'feedback-msg wrong';

      // Highlight the correct one
      currentQuestion.options.forEach((o, idx) => {
        if (o.isCorrect && allButtons[idx]) {
          allButtons[idx].classList.add('correct');
        }
      });
    }

    // Inform backend to update statistics / review queue
    Zad.invoke('q_answer', {
      isCorrect: isCorrect,
      wordId: currentQuestion.wordId
    });

    el.btnNextQuiz.style.display = 'inline-block';
  }

  el.btnAudioQuiz.addEventListener('click', () => {
    if (currentQuestion && currentQuestion.targetWord) {
      Zad.speak(currentQuestion.targetWord, 'en-US', 1.0);
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
