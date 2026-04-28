/**
 * customerdog widget — vanilla JS, no dependencies, ~3 KB.
 *
 * Drop this into any HTML page:
 *   <script src="https://YOUR-DEPLOY/widget.js" defer></script>
 *
 * Optional data attributes on the script tag:
 *   data-color   — accent color (default: #dc2626)
 *   data-label   — aria-label for the bubble (default: "Chat with us")
 *   data-icon    — emoji or single character shown on the bubble
 *                  (default: 🐕)
 *
 * The script is fully isolated: scoped CSS, an iframe for the chat
 * (so host-page styles can't leak in), and a postMessage protocol for
 * close events. The iframe loads /embed from this script's own origin.
 */
(function () {
  if (window.__customerdog_loaded) return;
  window.__customerdog_loaded = true;

  // Find our origin via this script's src — works regardless of where
  // the host site mounts the script from.
  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if ((all[i].src || '').indexOf('/widget.js') !== -1) return all[i];
      }
      return null;
    })();
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;

  var color = script.getAttribute('data-color') || '#dc2626';
  var label = script.getAttribute('data-label') || 'Chat with us';
  var icon = script.getAttribute('data-icon') || '🐕';

  // Inject minimal, namespaced CSS.
  var style = document.createElement('style');
  style.textContent =
    '.customerdog-bubble{position:fixed;bottom:20px;right:20px;z-index:2147483647;' +
    'width:56px;height:56px;border-radius:50%;background:' + color + ';color:#fff;' +
    'border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);' +
    'display:flex;align-items:center;justify-content:center;font-size:24px;' +
    'transition:transform .15s,box-shadow .15s;font-family:inherit;}' +
    '.customerdog-bubble:hover{transform:scale(1.06);box-shadow:0 6px 20px rgba(0,0,0,.22);}' +
    '.customerdog-frame{position:fixed;bottom:90px;right:20px;z-index:2147483646;' +
    'width:380px;height:600px;max-width:calc(100vw - 40px);' +
    'max-height:calc(100vh - 110px);border-radius:14px;border:none;background:#fff;' +
    'box-shadow:0 12px 36px rgba(0,0,0,.22);}' +
    '.customerdog-hidden{display:none;}' +
    '@media (max-width:480px){' +
    '.customerdog-frame{right:0;bottom:0;width:100%;height:100%;' +
    'max-width:100%;max-height:100%;border-radius:0;}}';
  document.head.appendChild(style);

  // Bubble button.
  var bubble = document.createElement('button');
  bubble.className = 'customerdog-bubble';
  bubble.setAttribute('aria-label', label);
  bubble.type = 'button';
  bubble.innerHTML = icon;

  // Iframe is lazily created on first open — no extra page-weight if
  // visitors never click.
  var frame = null;
  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.className = 'customerdog-frame customerdog-hidden';
    frame.src = origin + '/embed';
    frame.title = label;
    frame.allow = 'clipboard-write';
    document.body.appendChild(frame);
    return frame;
  }

  var open = false;
  function toggle() {
    open = !open;
    var f = ensureFrame();
    if (open) {
      f.classList.remove('customerdog-hidden');
    } else {
      f.classList.add('customerdog-hidden');
    }
    bubble.innerHTML = open ? '\u2715' : icon;
  }

  bubble.addEventListener('click', toggle);

  // Iframe → host: { type: 'customerdog:close' } when visitor clicks
  // the close button inside the chat.
  window.addEventListener('message', function (ev) {
    if (ev.origin !== origin) return;
    var data = ev.data;
    if (data && data.type === 'customerdog:close' && open) toggle();
  });

  function mount() {
    if (document.body) document.body.appendChild(bubble);
    else document.addEventListener('DOMContentLoaded', mount);
  }
  mount();
})();
