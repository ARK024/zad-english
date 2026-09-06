(function () {
  'use strict';

  let config = {};
  let wordsCache = [];

  const el = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    tabPanels: document.querySelectorAll('.tab-panel'),
    pageTitle: document.getElementById('pageTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    btnSaveConfig: document.getElementById('btnSaveConfig'),
    btnPreviewWidget: document.getElementById('btnPreviewWidget'),
    toastPopup: document.getElementById('toastPopup'),

    // General Form Fields
    selLevel: document.getElementById('selLevel'),
    selQuizFreq: document.getElementById('selQuizFreq'),
    selInterval: document.getElementById('selInterval'),
    selDuration: document.getElementById('selDuration'),
    selPosition: document.getElementById('selPosition'),
    selTheme: document.getElementById('selTheme'),
    chkAutoStart: document.getElementById('chkAutoStart'),
    chkAutoPronounce: document.getElementById('chkAutoPronounce'),
    selVoice: document.getElementById('selVoice'),
    selSpeed: document.getElementById('selSpeed'),

    // Audio Lab
    audioTestInput: document.getElementById('audioTestInput'),
    btnTestUs: document.getElementById('btnTestUs'),
    btnTestUk: document.getElementById('btnTestUk'),
    presetTags: document.querySelectorAll('.preset-tag'),
    cachedAudioCount: document.getElementById('cachedAudioCount'),
    statusAudioUsText: document.getElementById('statusAudioUsText'),
    statusAudioUsDot: document.getElementById('statusAudioUsDot'),
    statusAudioUkText: document.getElementById('statusAudioUkText'),
    statusAudioUkDot: document.getElementById('statusAudioUkDot'),

    // Dictionary
    searchWords: document.getElementById('searchWords'),
    filterLevel: document.getElementById('filterLevel'),
    dictResultCount: document.getElementById('dictResultCount'),
    wordListContainer: document.getElementById('wordListContainer'),

    // Stats
    statTotalWords: document.getElementById('statTotalWords'),
    statMemorizedWords: document.getElementById('statMemorizedWords'),
    statReviewWords: document.getElementById('statReviewWords'),
    statStreakDays: document.getElementById('statStreakDays'),
    miniWordCount: document.getElementById('miniWordCount'),
    btnResetProgress: document.getElementById('btnResetProgress'),
  };

  const TAB_METADATA = {
    general: {
      title: 'الإعدادات والتوقيت',
      subtitle: 'تخصيص سلوك الويدجت العائم، تردد الظهور، والمسار التعليمي'
    },
    audio: {
      title: 'مختبر الصوت البشري (Studio Human Audio)',
      subtitle: 'نظام نطق بشري حي عالي النقاء 100% بدون إنترنت مع تجربة اللكنات الأمريكية والبريطانية'
    },
    dictionary: {
      title: 'المعجم ومستودع الكلمات (6,207 مفردة)',
      subtitle: 'استكشف كافة مفردات أكسفورد من A1 إلى C2 مع النطق الصوتي الفوري والمعاني'
    },
    stats: {
      title: 'الإحصائيات ومسار التقدم',
      subtitle: 'متابعة سجل الحفظ والمراجعة وأيام الالتزام المستمر'
    }
  };

  // Switch Tabs
  el.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabKey = btn.dataset.tab;
      el.navItems.forEach(b => b.classList.remove('active'));
      el.tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = document.getElementById('tab-' + tabKey);
      if (panel) panel.classList.add('active');

      const meta = TAB_METADATA[tabKey] || TAB_METADATA.general;
      el.pageTitle.textContent = meta.title;
      el.pageSubtitle.textContent = meta.subtitle;

      if (tabKey === 'audio') {
        updateAudioStats();
      } else if (tabKey === 'dictionary') {
        loadDictionary();
      } else if (tabKey === 'stats') {
        loadStats();
      }
    });
  });

  // Load Configuration
  async function loadConfig() {
    try {
      const res = await Zad.invoke('s_get_config');
      if (!res) return;
      config = res;

      el.selLevel.value = config.currentLevel || 'All';
      el.selQuizFreq.value = String(config.quizFrequency ?? 5);
      el.selInterval.value = String(config.intervalMinutes ?? 15);
      el.selDuration.value = String(config.displayDurationSeconds ?? 30);
      el.selPosition.value = config.position || 'bottom-right';
      el.selTheme.value = config.theme || 'dark';
      el.chkAutoStart.checked = !!config.autoStart;
      el.chkAutoPronounce.checked = !!config.autoPronounce;
      el.selVoice.value = config.soundVoice || 'en-US';
      el.selSpeed.value = String(config.soundRate ?? 1.0);

      document.body.className = config.theme === 'light' ? 'light' : '';
      updateAudioStats();
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }

  // Toast Helper
  function showToast(msg) {
    el.toastPopup.textContent = msg;
    el.toastPopup.classList.add('visible');
    setTimeout(() => {
      el.toastPopup.classList.remove('visible');
    }, 2500);
  }

  // Save Configuration
  el.btnSaveConfig.addEventListener('click', async () => {
    config.currentLevel = el.selLevel.value;
    config.quizFrequency = parseInt(el.selQuizFreq.value, 10);
    config.intervalMinutes = parseInt(el.selInterval.value, 10);
    config.displayDurationSeconds = parseInt(el.selDuration.value, 10);
    config.autoHide = config.displayDurationSeconds > 0;
    config.position = el.selPosition.value;
    config.theme = el.selTheme.value;
    config.autoStart = el.chkAutoStart.checked;
    config.autoPronounce = el.chkAutoPronounce.checked;
    config.soundVoice = el.selVoice.value;
    config.soundRate = parseFloat(el.selSpeed.value);

    document.body.className = config.theme === 'light' ? 'light' : '';

    try {
      await Zad.invoke('s_save_config', { payload: config });
      showToast('تم حفظ التعديلات وتطبيقها بنجاح ✅');
    } catch (err) {
      showToast('حدث خطأ أثناء الحفظ: ' + err);
    }
  });

  // Preview Widget Button
  el.btnPreviewWidget.addEventListener('click', async () => {
    try {
      await Zad.invoke('w_next');
    } catch (e) {
      console.error('Failed to preview widget:', e);
    }
  });

  // Audio Laboratory
  async function updateAudioStats() {
    try {
      if (typeof Zad.getCacheCount === 'function') {
        const count = await Zad.getCacheCount();
        el.cachedAudioCount.textContent = count.toLocaleString('ar-EG');
      }

      const status = await Zad.invoke('get_audio_status');
      if (status) {
        if (status.usCount > 0) {
          el.statusAudioUsText.textContent = `${status.usCount.toLocaleString('ar-EG')} ملف صوتي مثبت محلياً`;
          el.statusAudioUsDot.style.background = 'var(--emerald)';
        } else {
          el.statusAudioUsText.textContent = 'يعتمد على التخزين السريع التلقائي (Cached)';
          el.statusAudioUsDot.style.background = 'var(--accent)';
        }

        if (status.ukCount > 0) {
          el.statusAudioUkText.textContent = `${status.ukCount.toLocaleString('ar-EG')} ملف صوتي مثبت محلياً`;
          el.statusAudioUkDot.style.background = 'var(--emerald)';
        } else {
          el.statusAudioUkText.textContent = 'يعتمد على التخزين السريع التلقائي (Cached)';
          el.statusAudioUkDot.style.background = 'var(--accent)';
        }
      }
    } catch (e) {
      console.error('Audio status error:', e);
    }
  }

  function playTestAudio(dialect) {
    const word = (el.audioTestInput.value || 'extraordinary').trim();
    if (!word) return;
    const lang = dialect === 'uk' ? 'en-GB' : 'en-US';
    const rate = parseFloat(el.selSpeed.value || '1.0');
    Zad.speak(word, lang, rate);
  }

  el.btnTestUs.addEventListener('click', () => playTestAudio('us'));
  el.btnTestUk.addEventListener('click', () => playTestAudio('uk'));

  el.presetTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const word = tag.dataset.word;
      el.audioTestInput.value = word;
      playTestAudio('us');
    });
  });

  // Audio playback event listener for animated waves
  window.addEventListener('zad:audio_state', (e) => {
    const state = e.detail || {};
    if (state.playing) {
      if (state.dialect === 'uk') {
        el.btnTestUk.classList.add('playing');
        el.btnTestUs.classList.remove('playing');
      } else {
        el.btnTestUs.classList.add('playing');
        el.btnTestUk.classList.remove('playing');
      }
    } else {
      el.btnTestUs.classList.remove('playing');
      el.btnTestUk.classList.remove('playing');
    }
  });

  // Dictionary Explorer
  async function loadDictionary() {
    const q = el.searchWords.value.trim();
    const lvl = el.filterLevel.value === 'All' ? null : el.filterLevel.value;

    el.dictResultCount.textContent = 'جاري البحث...';
    try {
      wordsCache = await Zad.invoke('s_search_words', { query: q, level: lvl });
      renderDictionary(wordsCache);
    } catch (e) {
      console.error('Failed to load words:', e);
      el.dictResultCount.textContent = 'خطأ في تحميل الكلمات';
    }
  }

  function renderDictionary(words) {
    el.wordListContainer.innerHTML = '';
    if (!words || words.length === 0) {
      el.dictResultCount.textContent = 'لم يتم العثور على أي نتائج';
      el.wordListContainer.innerHTML = '<div style="text-align:center; padding: 48px; color: var(--text-dim); font-size: 14px;">لا توجد كلمات مطابقة لمعايير البحث</div>';
      return;
    }

    el.dictResultCount.textContent = `تم العثور على ${words.length.toLocaleString('ar-EG')} مفردة`;

    const limit = 50;
    const slice = words.slice(0, limit);
    const memSet = new Set(config.memorizedIds || []);
    const revSet = new Set(config.reviewIds || []);

    slice.forEach(w => appendWordCard(w, memSet, revSet));

    if (words.length > limit) {
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'btn btn-secondary';
      loadMoreBtn.style.cssText = 'align-self: center; margin: 20px auto; padding: 10px 24px;';
      loadMoreBtn.textContent = `عرض المزيد من الكلمات (+${(words.length - limit).toLocaleString('ar-EG')})`;

      let currentOffset = limit;
      loadMoreBtn.addEventListener('click', () => {
        const nextBatch = words.slice(currentOffset, currentOffset + limit);
        nextBatch.forEach(w => appendWordCard(w, memSet, revSet));
        currentOffset += limit;
        if (currentOffset >= words.length) {
          loadMoreBtn.remove();
        } else {
          loadMoreBtn.textContent = `عرض المزيد (+${(words.length - currentOffset).toLocaleString('ar-EG')})`;
        }
      });
      el.wordListContainer.appendChild(loadMoreBtn);
    }
  }

  function appendWordCard(w, memSet, revSet) {
    const card = document.createElement('div');
    card.className = 'word-card-item';

    let statusPill = '';
    if (memSet.has(w.id)) {
      statusPill = '<span class="word-level-pill" style="background:var(--emerald-soft); color:var(--emerald);">✅ محفوظ</span>';
    } else if (revSet.has(w.id)) {
      statusPill = '<span class="word-level-pill" style="background:rgba(245,158,11,0.15); color:var(--amber);">🔄 مراجعة</span>';
    }

    const lvl = w.level || 'A1';

    card.innerHTML = `
      <div class="word-card-main">
        <div class="word-card-head">
          <span class="word-term">${escapeHtml(w.word)}</span>
          ${w.phonetic ? `<span class="word-ipa-tag">${escapeHtml(w.phonetic)}</span>` : ''}
          <span class="word-level-pill ${lvl}">${lvl}</span>
          ${statusPill}
        </div>
        <div class="word-meaning-ar">${escapeHtml(w.meaningAr || '')}</div>
        ${w.example ? `<div class="word-example-quote">“${escapeHtml(w.example)}”</div>` : ''}
      </div>

      <div class="word-card-actions">
        <button class="btn-audio-mini btn-us" title="استمع بالنطق الأمريكي البشري">
          <span>🇺🇸</span>
          <span>US</span>
        </button>
        <button class="btn-audio-mini btn-uk" title="استمع بالنطق البريطاني البشري">
          <span>🇬🇧</span>
          <span>UK</span>
        </button>
        <button class="btn-show-widget" title="عرض هذه الكلمة في الويدجت الآن">
          <span>👁️ عرض</span>
        </button>
      </div>
    `;

    card.querySelector('.btn-us').addEventListener('click', () => {
      Zad.speak(w.word, 'en-US', 1.0);
    });

    card.querySelector('.btn-uk').addEventListener('click', () => {
      Zad.speak(w.word, 'en-GB', 1.0);
    });

    card.querySelector('.btn-show-widget').addEventListener('click', () => {
      Zad.invoke('s_show_specific_word', { id: w.id });
      showToast(`تم إرسال الكلمة "${w.word}" إلى شاشتك ✅`);
    });

    el.wordListContainer.appendChild(card);
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  let searchTimeout = null;
  el.searchWords.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadDictionary, 250);
  });
  el.filterLevel.addEventListener('change', loadDictionary);

  // Stats Tab
  async function loadStats() {
    try {
      const allWords = await Zad.invoke('s_search_words', { query: '', level: null });
      const totalCount = (allWords && allWords.length) || 6207;
      const memCount = (config.memorizedIds && config.memorizedIds.length) || 0;
      const revCount = (config.reviewIds && config.reviewIds.length) || 0;
      const streak = config.streakDays || 1;

      el.statTotalWords.textContent = totalCount.toLocaleString('ar-EG');
      el.miniWordCount.textContent = totalCount.toLocaleString('ar-EG');
      el.statMemorizedWords.textContent = `${memCount.toLocaleString('ar-EG')} (${totalCount ? Math.round(memCount / totalCount * 100) : 0}%)`;
      el.statReviewWords.textContent = revCount.toLocaleString('ar-EG');
      el.statStreakDays.textContent = streak.toLocaleString('ar-EG');
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  el.btnResetProgress.addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من تصفير سجل التعلم وقوائم الحفظ والمراجعة بالكامل للبدء من جديد؟')) {
      try {
        const updated = await Zad.invoke('s_reset_progress');
        if (updated) {
          config = updated;
          loadStats();
          showToast('تم تصفير سجل التقدم بنجاح 🔄');
        }
      } catch (err) {
        alert('فشل تصفير السجل: ' + err);
      }
    }
  });

  // Initial Boot
  loadConfig();
})();
