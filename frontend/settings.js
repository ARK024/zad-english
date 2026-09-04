(function () {
  'use strict';

  let config = {};
  let wordsCache = [];

  const el = {
    tabs: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    pageTitle: document.getElementById('pageTitle'),
    btnSaveConfig: document.getElementById('btnSaveConfig'),

    // Inputs
    selLevel: document.getElementById('selLevel'),
    selQuizFreq: document.getElementById('selQuizFreq'),
    selInterval: document.getElementById('selInterval'),
    selDuration: document.getElementById('selDuration'),
    selVoice: document.getElementById('selVoice'),
    selSpeed: document.getElementById('selSpeed'),
    chkAutoPronounce: document.getElementById('chkAutoPronounce'),
    selPosition: document.getElementById('selPosition'),
    selTheme: document.getElementById('selTheme'),
    chkAutoStart: document.getElementById('chkAutoStart'),

    // Dictionary
    searchWords: document.getElementById('searchWords'),
    filterLevel: document.getElementById('filterLevel'),
    wordListContainer: document.getElementById('wordListContainer'),

    // Stats
    statTotalWords: document.getElementById('statTotalWords'),
    statMemorizedWords: document.getElementById('statMemorizedWords'),
    statReviewWords: document.getElementById('statReviewWords'),
    statStreakDays: document.getElementById('statStreakDays'),
    btnResetProgress: document.getElementById('btnResetProgress'),

    // Offline Audio
    badgeAudioUs: document.getElementById('badgeAudioUs'),
    countAudioUs: document.getElementById('countAudioUs'),
    badgeAudioUk: document.getElementById('badgeAudioUk'),
    countAudioUk: document.getElementById('countAudioUk'),
  };

  // Tab switching
  el.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.tabs.forEach(t => t.classList.remove('active'));
      el.tabContents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = 'tab-' + tab.dataset.tab;
      const target = document.getElementById(targetId);
      if (target) target.classList.add('active');

      if (tab.dataset.tab === 'general') {
        el.pageTitle.textContent = 'الإعدادات والتوقيت';
      } else if (tab.dataset.tab === 'dictionary') {
        el.pageTitle.textContent = 'المعجم ومستودع الكلمات';
        loadDictionary();
      } else if (tab.dataset.tab === 'stats') {
        el.pageTitle.textContent = 'التقدم والإحصائيات';
        loadStats();
      }
    });
  });

  // Load configuration from backend
  async function loadConfig() {
    try {
      const res = await Zad.invoke('s_get_config');
      if (!res) return;
      config = res;

      el.selLevel.value = config.currentLevel || 'All';
      el.selQuizFreq.value = String(config.quizFrequency ?? 5);
      el.selInterval.value = String(config.intervalMinutes ?? 15);
      el.selDuration.value = String(config.displayDurationSeconds ?? 30);
      el.selVoice.value = config.soundVoice || 'en-US';
      el.selSpeed.value = String(config.soundRate ?? 1.0);
      el.chkAutoPronounce.checked = !!config.autoPronounce;
      el.selPosition.value = config.position || 'bottom-right';
      el.selTheme.value = config.theme || 'dark';
      el.chkAutoStart.checked = !!config.autoStart;

      document.body.className = config.theme === 'light' ? 'light' : '';
      await checkAudioPacks();
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }

  // Offline audio pack status
  async function checkAudioPacks() {
    try {
      const status = await Zad.invoke('get_audio_status');
      if (!status) return;
      if (el.countAudioUs && el.badgeAudioUs) {
        if (status.usCount > 0) {
          el.badgeAudioUs.textContent = 'محملة ✅';
          el.badgeAudioUs.style.background = '#059669';
          el.countAudioUs.textContent = `${status.usCount.toLocaleString('ar-EG')} ملف صوتي مثبت محلياً (${status.usCount} files)`;
        } else {
          el.badgeAudioUs.textContent = 'غير متوفرة ❌';
          el.badgeAudioUs.style.background = '#dc2626';
          el.countAudioUs.textContent = 'يمكن تشغيل سكريبت scripts/download_audio.py للتحميل';
        }
      }
      if (el.countAudioUk && el.badgeAudioUk) {
        if (status.ukCount > 0) {
          el.badgeAudioUk.textContent = 'محملة ✅';
          el.badgeAudioUk.style.background = '#059669';
          el.countAudioUk.textContent = `${status.ukCount.toLocaleString('ar-EG')} ملف صوتي مثبت محلياً (${status.ukCount} files)`;
        } else {
          el.badgeAudioUk.textContent = 'غير متوفرة ❌';
          el.badgeAudioUk.style.background = '#dc2626';
          el.countAudioUk.textContent = 'يمكن تشغيل سكريبت scripts/download_audio.py للتحميل';
        }
      }
    } catch (e) {
      console.error('Failed to check audio status:', e);
    }
  }

  // Save configuration
  el.btnSaveConfig.addEventListener('click', async () => {
    config.currentLevel = el.selLevel.value;
    config.quizFrequency = parseInt(el.selQuizFreq.value, 10);
    config.intervalMinutes = parseInt(el.selInterval.value, 10);
    config.displayDurationSeconds = parseInt(el.selDuration.value, 10);
    config.autoHide = config.displayDurationSeconds > 0;
    config.soundVoice = el.selVoice.value;
    config.soundRate = parseFloat(el.selSpeed.value);
    config.autoPronounce = el.chkAutoPronounce.checked;
    config.position = el.selPosition.value;
    config.theme = el.selTheme.value;
    config.autoStart = el.chkAutoStart.checked;

    document.body.className = config.theme === 'light' ? 'light' : '';

    try {
      await Zad.invoke('s_save_config', { payload: config });
      const origText = el.btnSaveConfig.textContent;
      el.btnSaveConfig.textContent = 'تم الحفظ بنجاح! ✓';
      el.btnSaveConfig.style.background = '#10b981';
      setTimeout(() => {
        el.btnSaveConfig.textContent = origText;
        el.btnSaveConfig.style.background = '';
      }, 1500);
    } catch (err) {
      alert('حدث خطأ أثناء الحفظ: ' + err);
    }
  });

  // Dictionary management
  async function loadDictionary() {
    const q = el.searchWords.value.trim();
    const lvl = el.filterLevel.value === 'All' ? null : el.filterLevel.value;

    try {
      wordsCache = await Zad.invoke('s_search_words', { query: q, level: lvl });
      renderWordList(wordsCache);
    } catch (e) {
      console.error('Failed to load words:', e);
    }
  }

  function renderWordList(words) {
    el.wordListContainer.innerHTML = '';
    if (!words || words.length === 0) {
      el.wordListContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-dim);">لا توجد كلمات مطابقة للبحث</div>';
      return;
    }

    const memSet = new Set(config.memorizedIds || []);
    const revSet = new Set(config.reviewIds || []);

    const limit = 60;
    const slice = words.slice(0, limit);

    slice.forEach(w => {
      appendWordRow(w, memSet, revSet);
    });

    if (words.length > limit) {
      const moreBtn = document.createElement('button');
      moreBtn.className = 'btn-sm';
      moreBtn.style.cssText = 'align-self: center; margin: 15px auto; padding: 10px 24px; font-size: 13.5px; background: rgba(56, 189, 248, 0.15); color: var(--accent); border-color: var(--accent);';
      moreBtn.textContent = `عرض المزيد (يوجد ${words.length - limit} كلمة إضافية)`;
      
      let currentOffset = limit;
      moreBtn.addEventListener('click', () => {
        const nextBatch = words.slice(currentOffset, currentOffset + limit);
        nextBatch.forEach(w => appendWordRow(w, memSet, revSet));
        currentOffset += limit;
        if (currentOffset >= words.length) {
          moreBtn.remove();
        } else {
          moreBtn.textContent = `عرض المزيد (يوجد ${words.length - currentOffset} كلمة إضافية)`;
        }
      });
      el.wordListContainer.appendChild(moreBtn);
    }
  }

  function appendWordRow(w, memSet, revSet) {
    const row = document.createElement('div');
    row.className = 'word-row';

    let statusBadge = '';
    if (memSet.has(w.id)) {
      statusBadge = '<span style="color:#10b981; font-weight:700; font-size:12px;">✅ محفوظ</span>';
    } else if (revSet.has(w.id)) {
      statusBadge = '<span style="color:#f59e0b; font-weight:700; font-size:12px;">🔄 مراجعة</span>';
    }

    row.innerHTML = `
      <div class="word-info">
        <div class="word-head">
          <span class="w-text">${w.word}</span>
          <span class="w-ipa">${w.phonetic || ''}</span>
          <span class="w-badge" style="background: rgba(56, 189, 248, 0.2); color:#38bdf8;">${w.level}</span>
          ${statusBadge}
        </div>
        <div class="w-ar">${w.meaningAr}</div>
        <div class="w-ex">“${w.example}”</div>
      </div>
      <div class="word-actions">
        <button class="btn-sm btn-speak" title="استمع للنطق">🔊 استماع</button>
        <button class="btn-sm btn-show" title="عرض في الودجت الآن">👁️ عرض</button>
      </div>
    `;

    row.querySelector('.btn-speak').addEventListener('click', () => {
      Zad.speak(w.word, config.soundVoice || 'en-US', config.soundRate || 1.0);
    });

    row.querySelector('.btn-show').addEventListener('click', () => {
      Zad.invoke('s_show_specific_word', { id: w.id });
    });

    el.wordListContainer.appendChild(row);
  }

  let searchTimeout = null;
  el.searchWords.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadDictionary, 250);
  });
  el.filterLevel.addEventListener('change', loadDictionary);

  // Statistics management
  async function loadStats() {
    try {
      const allWords = await Zad.invoke('s_search_words', { query: '', level: null });
      const totalCount = allWords ? allWords.len || allWords.length : 0;
      const memCount = config.memorizedIds ? config.memorizedIds.length : 0;
      const revCount = config.reviewIds ? config.reviewIds.length : 0;

      el.statTotalWords.textContent = totalCount;
      el.statMemorizedWords.textContent = memCount + ' (' + (totalCount ? Math.round(memCount / totalCount * 100) : 0) + '%)';
      el.statReviewWords.textContent = revCount;
      el.statStreakDays.textContent = config.streakDays || 1;
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }

  el.btnResetProgress.addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من تصفير سجل التعلم وقوائم الحفظ والمراجعة بالكامل؟')) {
      const updated = await Zad.invoke('s_reset_progress');
      if (updated) {
        config = updated;
        loadStats();
        alert('تم تصفير التقدم بنجاح.');
      }
    }
  });

  // Initial load
  loadConfig();
})();
