(() => {
  if (window !== window.top || location.origin !== 'http://127.0.0.1:43217') return;
  Object.defineProperty(window, 'megitDesktop', {
    value: (request) => window.__TAURI_INTERNALS__.invoke('desktop_window', { request }),
  });
})();
