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
    speak: function (text, lang = 'en-US', rate = 1.0) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate || 1.0;
      window.speechSynthesis.speak(u);
    }
  };
})();
