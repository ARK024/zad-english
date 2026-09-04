// Compatibility bridge for Zad English
(function () {
  'use strict';

  const T = window.__TAURI__;
  const invoke = T && T.core ? T.core.invoke : (T ? T.invoke : null);
  const listen = T && T.event ? T.event.listen : null;

  window.Zad = {
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
    speak: async function (text, lang = 'en-US', rate = 1.0) {
      const dialect = (lang && (lang.includes('uk') || lang.includes('gb') || lang.includes('GB'))) ? 'uk' : 'us';
      
      // Try offline native MP3 audio first
      if (invoke) {
        try {
          const b64 = await invoke('get_offline_audio', { word: text, dialect: dialect });
          if (b64) {
            if (this.currentAudio) {
              this.currentAudio.pause();
              this.currentAudio = null;
            }
            const snd = new Audio('data:audio/mp3;base64,' + b64);
            if (rate && rate !== 1.0) {
              snd.playbackRate = rate;
            }
            this.currentAudio = snd;
            await snd.play();
            return;
          }
        } catch (e) {
          console.debug('[Zad.speak] Offline audio failed or not found, falling back to TTS:', e);
        }
      }

      // Offline TTS fallback via Web Speech API
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang || 'en-US';
        u.rate = rate || 1.0;
        window.speechSynthesis.speak(u);
      }
    }
  };
})();
