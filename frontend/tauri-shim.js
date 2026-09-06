// Compatibility bridge & High-Fidelity Human Audio Engine for Zad English
(function () {
  'use strict';

  const T = window.__TAURI__;
  const invoke = T && T.core ? T.core.invoke : (T ? T.invoke : null);
  const listen = T && T.event ? T.event.listen : null;

  // Local IndexedDB cache for offline human audio
  let dbPromise = null;
  function getAudioDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open('ZadEnglishAudioCache', 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('audio')) {
              db.createObjectStore('audio');
            }
          };
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => resolve(null);
        } catch (err) {
          resolve(null);
        }
      });
    }
    return dbPromise;
  }

  async function getCachedAudio(key) {
    try {
      const db = await getAudioDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction('audio', 'readonly');
        const store = tx.objectStore('audio');
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function setCachedAudio(key, blob) {
    try {
      const db = await getAudioDB();
      if (!db) return;
      const tx = db.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(blob, key);
    } catch (e) {
      // Ignore cache write errors
    }
  }

  async function getCachedCount() {
    try {
      const db = await getAudioDB();
      if (!db) return 0;
      return new Promise((resolve) => {
        const tx = db.transaction('audio', 'readonly');
        const store = tx.objectStore('audio');
        const req = store.count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
    } catch (e) {
      return 0;
    }
  }

  window.Zad = {
    getCacheCount: getCachedCount,
    invoke: function (cmd, args) {
      if (invoke) {
        return invoke(cmd, args || {});
      }
      console.warn('[Zad] Invoke called without Tauri runtime:', cmd, args);
      return Promise.resolve(null);
    },
    listen: function (event, cb) {
      if (listen) {
        return listen(event, (e) => cb(e.payload));
      }
      console.warn('[Zad] Listen called without Tauri runtime:', event);
      return Promise.resolve(() => {});
    },

    currentAudio: null,
    audioPlayingState: { playing: false, dialect: null, word: '' },

    // Primary High-Fidelity Human Pronunciation function
    speak: async function (text, lang = 'en-US', rate = 1.0) {
      if (!text) return;
      
      const isUk = (lang && (lang.includes('uk') || lang.includes('gb') || lang.includes('GB')));
      const dialect = isUk ? 'uk' : 'us';
      const youdaoType = isUk ? 1 : 2; // 1 = UK Native, 2 = US Native

      // Clean the word for audio lookup
      let clean = text.split(',')[0].trim().replace(/[\/\\#!$%\^&\*;:{}=\-_`~()]/g, '');
      if (!clean) clean = text.trim();

      const cacheKey = `${clean.toLowerCase()}_${dialect}`;

      // Dispatch event: audio starting
      this.dispatchAudioEvent(true, dialect, clean);

      // Stop any existing playback
      if (this.currentAudio) {
        try {
          this.currentAudio.pause();
          this.currentAudio.currentTime = 0;
        } catch (e) {}
        this.currentAudio = null;
      }

      // 1. Try local offline backend files if available
      if (invoke) {
        try {
          const b64 = await invoke('get_offline_audio', { word: clean, dialect: dialect });
          if (b64) {
            const played = await this.playAudioUrl('data:audio/mp3;base64,' + b64, rate);
            if (played) return;
          }
        } catch (e) {
          console.debug('[Zad] get_offline_audio check skipped:', e);
        }
      }

      // 2. Try IndexedDB Cached Human Audio
      try {
        const cachedBlob = await getCachedAudio(cacheKey);
        if (cachedBlob) {
          const objectUrl = URL.createObjectURL(cachedBlob);
          const played = await this.playAudioUrl(objectUrl, rate);
          if (played) return;
        }
      } catch (e) {}

      // 3. Play from Native Studio Human Audio CDN (Youdao/Oxford high-quality CDN)
      const primaryUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=${youdaoType}`;
      const fallbackUrl = `https://ssl.gstatic.com/dictionary/static/sounds/20200429/${encodeURIComponent(clean.toLowerCase())}--_${dialect}_1.mp3`;

      let played = await this.playAudioUrl(primaryUrl, rate);
      if (!played) {
        played = await this.playAudioUrl(fallbackUrl, rate);
      }

      // Cache audio in background for future offline use
      if (played) {
        fetch(primaryUrl)
          .then(res => res.blob())
          .then(blob => setCachedAudio(cacheKey, blob))
          .catch(() => {});
        return;
      }

      // 4. Last resort: Web Speech Synthesis if totally offline and uncached
      console.warn('[Zad] Human audio CDN unavailable, falling back to local speech engine');
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = isUk ? 'en-GB' : 'en-US';
        u.rate = rate || 1.0;
        u.onend = () => this.dispatchAudioEvent(false, dialect, clean);
        u.onerror = () => this.dispatchAudioEvent(false, dialect, clean);
        window.speechSynthesis.speak(u);
      } else {
        this.dispatchAudioEvent(false, dialect, clean);
      }
    },

    playAudioUrl: function (url, rate = 1.0) {
      return new Promise((resolve) => {
        try {
          const audio = new Audio();
          audio.src = url;
          if (rate && rate !== 1.0) {
            audio.playbackRate = rate;
          }

          let hasResolved = false;
          const finish = (success) => {
            if (!hasResolved) {
              hasResolved = true;
              if (!success) {
                this.dispatchAudioEvent(false);
              }
              resolve(success);
            }
          };

          audio.onended = () => {
            this.dispatchAudioEvent(false);
            finish(true);
          };

          audio.onerror = () => {
            finish(false);
          };

          // Timeout in case audio hangs
          const timer = setTimeout(() => {
            if (!hasResolved) {
              try { audio.pause(); } catch (e) {}
              finish(false);
            }
          }, 6000);

          audio.play()
            .then(() => {
              this.currentAudio = audio;
              clearTimeout(timer);
            })
            .catch(() => {
              clearTimeout(timer);
              finish(false);
            });
        } catch (err) {
          resolve(false);
        }
      });
    },

    dispatchAudioEvent: function (playing, dialect = null, word = '') {
      this.audioPlayingState = { playing, dialect, word };
      window.dispatchEvent(new CustomEvent('zad:audio_state', {
        detail: { playing, dialect, word }
      }));
    }
  };
})();
