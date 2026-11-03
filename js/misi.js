/* Pop-up "Misi" ala game. Semua teks dari data/ucapan.json (ui.misi.*).
   Muncul sekali otomatis saat masuk taman (state di memori, tanpa localStorage). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var K = null, M = null, autoShown = false, isOpen = false, lastFocus = null, tvSeen = false, items = [], start0 = null, movedOnce = false;

  function touchDevice() { return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

  function build() {
    M = K.data.ui.misi;
    $('misiTitle').textContent = M.judul;
    $('misiSub').textContent = M.sub;
    $('misiFoto').textContent = M.foto;
    $('misiGo').textContent = M.mulai;
    $('misiX').setAttribute('aria-label', M.tutupAria);
    var b = $('misiBtn'); b.textContent = M.tombol; b.setAttribute('aria-label', M.tombolAria);
    var list = $('misiList');
    [['joy', '🕹️'], ['food', '🍢'], ['cake', '🎂'], ['tv', '📺'], ['rose', '🌹']].forEach(function (d, i) {
      var li = document.createElement('li');
      li.style.setProperty('--i', i);
      var ic = document.createElement('span'); ic.className = 'mi'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = d[1];
      var tx = document.createElement('span'); tx.className = 'mt';
      var ck = document.createElement('span'); ck.className = 'mc'; ck.setAttribute('aria-hidden', 'true');
      li.appendChild(ic); li.appendChild(tx); li.appendChild(ck);
      list.appendChild(li); items.push({ key: d[0], li: li, tx: tx, ck: ck });
    });
  }

  function moved() {
    var p = K.playerPos;
    if (!start0) start0 = { x: p.x, z: p.z };
    if (Math.hypot(p.x - start0.x, p.z - start0.z) > 0.5) movedOnce = true;
    return movedOnce;
  }
  function sync() {
    var n = K.visitedCount(), st = (K._fe2 && K._fe2.state()) || {};
    var done = { joy: moved(), food: n >= 7, cake: !!st.blown, tv: tvSeen, rose: !!st.bloomed };
    items.forEach(function (it) {
      var t;
      if (it.key === 'joy') t = touchDevice() ? M.joyHp : M.joyDesk;
      else if (it.key === 'food') t = M.makanan.replace('{n}', n);
      else t = M[it.key === 'cake' ? 'lilin' : it.key === 'rose' ? 'mawar' : it.key];
      it.tx.textContent = t;
      var d = done[it.key];
      it.li.classList.toggle('done', d);
      it.ck.textContent = d ? '✅' : '';
      it.li.setAttribute('data-done', d ? '1' : '0');
    });
  }

  function open() {
    if (isOpen || K.scene_name() !== 'garden') return;
    // jangan tumpuk di atas overlay lain
    var other = document.querySelector('#card:not(.hidden), #photo:not(.hidden), #cakeMsg:not(.hidden), #tvOv:not(.hidden), #endOv:not(.hidden)');
    if (other) return;
    sync();
    lastFocus = document.activeElement;
    isOpen = true; K.setModal(true);
    $('misi').classList.remove('hidden');
    var box = $('misiBox'); box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    $('misiGo').focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; K.setModal(false);
    $('misi').classList.add('hidden');
    var f = lastFocus && lastFocus !== document.body && document.contains(lastFocus) ? lastFocus : $('misiBtn');
    if (f && f.focus) f.focus({ preventScroll: true });
  }

  function init() {
    K = window.KADO; build();
    $('misiBtn').addEventListener('click', open);
    $('misiX').addEventListener('click', close);
    $('misiGo').addEventListener('click', close);
    $('misi').addEventListener('pointerdown', function (e) { if (e.target === $('misi')) close(); });
    window.addEventListener('kado:esc', close);
    window.addEventListener('kado:tvopened', function () { tvSeen = true; });
    $('misi').addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var a = $('misiX'), z = $('misiGo');
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    });
    window.addEventListener('kado:garden', function () {
      $('misiBtn').classList.remove('hidden');
      if (!autoShown) { autoShown = true; open(); }
    });
    K._misi = { open: open, close: close, isOpen: function () { return isOpen; }, sync: sync };
    if (K.scene_name() === 'garden') window.dispatchEvent(new CustomEvent('kado:garden'));
  }
  // dipasang setelah window.KADO siap (main.js memanggil KADO_FE2 -> kita ikut lewat polling singkat)
  var tries = 0;
  (function wait() {
    if (window.KADO && window.KADO._fe2) return init();
    if (++tries < 400) setTimeout(wait, 50);
  })();
})();
