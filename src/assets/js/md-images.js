// Images in Markdown boxes (#193), as on GitHub: in any textarea.md-img, pasting or
// dropping an image or an SVG (a file, or an SVG's own text), or choosing one from the
// line under the box, uploads it to the lab's Google Drive (functions/index.js
// markdownImage) and writes ![name](its Drive link) where the caret is; markdown.js and
// an abstract show it (BOLD.imageHtml). Anyone with the link can see it, so it asks
// every time (the ground rule). Loaded on every signed-in page (base.njk).
(function(){
  var TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
  var MAX_MB = 10;
  var LINE = 'Paste or drop an image or SVG, or <button type="button" class="btn-text mi-pick">choose one</button>' +
    '<input type="file" class="mi-file" hidden multiple accept="' + TYPES.join(',') + '"><span class="mi-msg"></span>';

  // The line under each box, added as boxes appear (pages draw them as they go).
  function addLines(root){
    var boxes = root.matches && root.matches('textarea.md-img') ? [root] : root.querySelectorAll('textarea.md-img');
    Array.prototype.forEach.call(boxes, function(ta){
      if (ta.nextElementSibling && ta.nextElementSibling.classList.contains('mi-line')) return;
      var p = document.createElement('span');
      p.className = 'mi-line';
      p.innerHTML = LINE;
      ta.insertAdjacentElement('afterend', p);
      sync(ta);
    });
  }
  // The button is greyed out with the box (a disabled or read-only box).
  function sync(ta){
    var b = ta.nextElementSibling && ta.nextElementSibling.querySelector('.mi-pick');
    if (!b) return;
    var off = ta.disabled || ta.readOnly;
    b.disabled = off || busy(ta);
    b.title = off ? 'This box can’t be changed' : '';
  }
  function lineOf(ta){ return ta.nextElementSibling && ta.nextElementSibling.classList.contains('mi-line') ? ta.nextElementSibling : null; }
  function busy(ta){ return ta.getAttribute('data-mi-busy') === '1'; }
  function say(ta, t){ var l = lineOf(ta), m = l && l.querySelector('.mi-msg'); if (m) m.textContent = t ? ' · ' + t : ''; }

  // Pasted text that is a whole SVG → a file.
  function svgFile(text){
    var t = String(text || '').trim();
    if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t) || !/<\/svg>$/i.test(t)) return null;
    try { return new File([t], 'diagram.svg', { type: 'image/svg+xml' }); } catch (e){ return null; }
  }

  function call(args){ return firebase.app().functions('europe-west2').httpsCallable('markdownImage')(args); }
  function put(url, f){
    return new Promise(function(ok, no){
      var x = new XMLHttpRequest();
      x.open('PUT', url);
      x.onload = function(){ var j = null; try { j = JSON.parse(x.responseText); } catch (e){} if (x.status < 300 && j && j.id) ok(j.id); else no(new Error('Google Drive said ' + x.status + '.')); };
      x.onerror = function(){ no(new Error('The upload didn’t go through.')); };
      x.send(f);
    });
  }
  // Writes `text` in place of the caret's selection, as typing would (drafts and counters hear it).
  function insert(ta, text){
    var a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
    var pre = a > 0 && !/\s$/.test(v.slice(0, a)) ? ' ' : '';
    ta.value = v.slice(0, a) + pre + text + v.slice(b);
    var at = a + pre.length + text.length;
    ta.setSelectionRange(at, at);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function swap(ta, from, to){
    var i = ta.value.indexOf(from);
    if (i < 0) { if (to) insert(ta, to); return; }
    ta.value = ta.value.slice(0, i) + to + ta.value.slice(i + from.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function altOf(name){ return String(name || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[\[\]\n]/g, ' ').slice(0, 80) || 'image'; }

  function upload(ta, files){
    files = Array.prototype.filter.call(files || [], function(f){ return f; });
    if (!files.length || busy(ta) || ta.disabled || ta.readOnly) return;
    var bad = files.filter(function(f){ return TYPES.indexOf(f.type) < 0 || f.size > MAX_MB * 1024 * 1024; });
    if (bad.length) { say(ta, 'Only PNG, JPEG, GIF, WebP or SVG images, up to ' + MAX_MB + ' MB.'); return; }
    var one = files.length === 1;
    BOLD.confirmAlways({ title: one ? 'Upload ' + files[0].name + '?' : 'Upload ' + files.length + ' images?', go: 'Upload',
      effects: ['Put ' + (one ? 'it' : 'them') + ' on the lab’s Google Drive, where anyone with the link can see ' + (one ? 'it' : 'them')] }).then(function(ok){
      if (!ok) return;
      ta.setAttribute('data-mi-busy', '1'); sync(ta);
      var n = 0;
      return files.reduce(function(chain, f){
        return chain.then(function(){
          var mark = '![Uploading ' + altOf(f.name) + '…]()';
          insert(ta, mark);
          say(ta, 'Uploading ' + (one ? f.name : (++n) + ' of ' + files.length) + '…');
          return call({ name: f.name, type: f.type, size: f.size })
            .then(function(r){ return put(r.data.url, f); })
            .then(function(id){ return call({ file: id }); })
            .then(function(r){ swap(ta, mark, '![' + altOf(f.name) + '](' + r.data.url + ')'); },
              function(err){ swap(ta, mark, ''); throw err; });
        });
      }, Promise.resolve()).then(function(){ say(ta, one ? 'Uploaded: save to keep it' : 'Uploaded: save to keep them'); }, function(err){
        console.error('[BOLD] uploading an image failed', err);
        say(ta, err && err.message && err.code !== 'functions/internal' ? err.message : 'Couldn’t upload it — try again.');
      }).then(function(){ ta.removeAttribute('data-mi-busy'); sync(ta); });
    });
  }

  function imagesIn(dt){
    return Array.prototype.filter.call((dt && dt.files) || [], function(f){ return /^image\//.test(f.type); });
  }
  function box(t){ return t && t.tagName === 'TEXTAREA' && t.classList.contains('md-img') ? t : null; }

  document.addEventListener('paste', function(e){
    var ta = box(e.target);
    if (!ta) return;
    var files = imagesIn(e.clipboardData);
    if (!files.length) { var svg = svgFile(e.clipboardData && e.clipboardData.getData('text/plain')); if (svg) files = [svg]; }
    if (!files.length) return;
    e.preventDefault();
    upload(ta, files);
  });
  document.addEventListener('dragover', function(e){
    if (box(e.target) && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault();
  });
  document.addEventListener('drop', function(e){
    var ta = box(e.target), files = ta && imagesIn(e.dataTransfer);
    if (!files || !files.length) return;
    e.preventDefault();
    ta.focus();
    upload(ta, files);
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.mi-pick');
    if (!b) return;
    e.preventDefault();
    b.parentNode.querySelector('.mi-file').click();
  });
  document.addEventListener('change', function(e){
    if (!e.target.classList || !e.target.classList.contains('mi-file')) return;
    var line = e.target.parentNode, ta = line.previousElementSibling;
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (box(ta)) { ta.focus(); upload(ta, files); }
  });

  addLines(document);
  new MutationObserver(function(list){
    list.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes, function(n){ if (n.nodeType === 1) addLines(n); }); });
  }).observe(document.body, { childList: true, subtree: true });
})();
