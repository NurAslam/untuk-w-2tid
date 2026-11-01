/* Untuk Wulan - FE-2: kue + lilin + musik HBD (WebAudio), TV reels, mawar + penutup.
   Dipasang lewat window.KADO_FE2(KADO) yang dipanggil main.js setelah hook siap.
   Semua teks dari KADO.data (data/ucapan.json). */
(function () {
  'use strict';
  window.KADO_FE2 = function (K) {
    var T = K.THREE, D = K.data, U = D.ui, RM = K.reducedMotion;
    var $ = function (id) { return document.getElementById(id); };
    function show(id, on) { $(id).classList.toggle('hidden', !on); }
    function fmt(s, o) { return s.replace(/\{(\w+)\}/g, function (_, k) { return o[k]; }); }

    var geoBox = new T.BoxGeometry(1, 1, 1), geoCyl = new T.CylinderGeometry(1, 1, 1, 14),
        geoSph = new T.SphereGeometry(1, 10, 8), geoCone = new T.ConeGeometry(1, 1, 8);
    var mats = {};
    function M(c, o) {
      var k = c + (o ? JSON.stringify(o) : '');
      if (!mats[k]) { var p = { color: c, flatShading: true }; if (o) for (var i in o) p[i] = o[i]; mats[k] = new T.MeshLambertMaterial(p); }
      return mats[k];
    }
    function add(geo, c, sx, sy, sz, x, y, z, parent, o) {
      var m = new T.Mesh(geo, M(c, o)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent.add(m); return m;
    }
    function hitMesh(r, x, y, z, parent) {
      var m = new T.Mesh(new T.SphereGeometry(r, 6, 4), new T.MeshBasicMaterial({ visible: false }));
      m.position.set(x, y, z); parent.add(m); return m;
    }

    // ---------- toast ----------
    var toastTimer = 0;
    function toast(msg, ms) {
      var el = $('toast'); el.textContent = msg; show('toast', true);
      clearTimeout(toastTimer); toastTimer = setTimeout(function () { show('toast', false); }, ms || 3200);
    }

    // ---------- status syarat penutup ----------
    var state = { blown: false, bloomed: false };
    function remaining() { return 7 - K.visitedCount(); }
    function ready() { return K.allVisited() && state.blown; }
    function missingText() {
      var n = remaining();
      if (n > 0 && !state.blown) return fmt(U.sisaBoth, { n: n });
      if (n > 0) return fmt(U.sisaMakanan, { n: n });
      if (!state.blown) return U.sisaLilin;
      return '';
    }

    // ---------- audio ----------
    var audio = { ctx: null, master: null, muted: false, playing: false };
    var NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
    // Happy Birthday (domain publik), [nada, beat]
    var MELODY = [['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
      ['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
      ['G4', .75], ['G4', .25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 1],
      ['F5', .75], ['F5', .25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 2]];
    function playHBD() {   // dipanggil dari gestur pengguna (ketukan)
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        if (!audio.ctx) {
          audio.ctx = new AC(); audio.master = audio.ctx.createGain();
          audio.master.gain.value = audio.muted ? 0 : 0.5; audio.master.connect(audio.ctx.destination);
        }
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        var c = audio.ctx, t0 = c.currentTime + 0.1, beat = 0.46, t = t0;
        MELODY.forEach(function (n) {
          var f = NOTE[n[0]], d = n[1] * beat;
          [[f, 'triangle', 0.5], [f * 2, 'sine', 0.12]].forEach(function (v) {
            var o = c.createOscillator(), g = c.createGain();
            o.type = v[1]; o.frequency.value = v[0];
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(v[2], t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.95);
            o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + d);
          });
          t += d;
        });
        audio.playing = true; setTimeout(function () { audio.playing = false; }, (t - t0) * 1000 + 300);
      } catch (e) { console.warn('audio', e); }
      show('mute', true); updateMute();
    }
    function updateMute() {
      var b = $('mute'); b.textContent = audio.muted ? '\u{1F507}' : '\u{1F50A}';
      b.setAttribute('aria-label', audio.muted ? U.suara : U.bisu); b.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
    }
    $('mute').addEventListener('click', function () {
      audio.muted = !audio.muted;
      if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
      updateMute();
    });
    document.addEventListener('visibilitychange', function () {
      if (!audio.ctx) return;
      if (document.hidden) audio.ctx.suspend(); else if (audio.playing || true) audio.ctx.resume();
    });

    // ---------- overlay generik ----------
    var openId = null;
    function openOv(id) { openId = id; show(id, true); K.lock(true); }
    function closeOv(id) {
      show(id, false); if (openId === id) openId = null; K.lock(false);
    }

    // ---------- KUE ----------
    var cake = { flames: [], smoke: [], t: 0, group: null };
    (function buildCake() {
      var g = new T.Group(); cake.group = g; g.position.copy(K.hooks.cake.pos); K.garden.add(g);
      add(geoCyl, 0xc98a6a, 1.5, 0.7, 1.5, 0, 0.35, 0, g);                 // meja bundar
      add(geoCyl, 0xfff8f0, 1.25, 0.06, 1.25, 0, 0.73, 0, g);              // piring
      add(geoCyl, 0xffd6e0, 0.95, 0.5, 0.95, 0, 1.01, 0, g);               // tingkat bawah
      add(geoCyl, 0xfff8f0, 0.99, 0.07, 0.99, 0, 1.28, 0, g);              // krim
      add(geoCyl, 0xffc2d1, 0.62, 0.42, 0.62, 0, 1.52, 0, g);              // tingkat atas
      add(geoCyl, 0xb3123f, 0.66, 0.07, 0.66, 0, 1.76, 0, g);              // lapisan merah mawar
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * Math.PI * 2;
        add(geoSph, 0xfff8f0, 0.09, 0.09, 0.09, Math.cos(a) * 0.95, 1.3, Math.sin(a) * 0.95, g);
      }
      add(geoSph, 0xb3123f, 0.13, 0.13, 0.13, 0, 1.85, 0.0, g);
      [[-0.28, 0.1], [0.28, 0.1], [0, -0.3]].forEach(function (p, i) {
        var cd = new T.Group(); cd.position.set(p[0], 1.8, p[1]); g.add(cd);
        add(geoCyl, i % 2 ? 0xfff8f0 : 0xff8fab, 0.05, 0.4, 0.05, 0, 0.2, 0, cd);
        var fl = add(geoCone, 0xffb300, 0.07, 0.2, 0.07, 0, 0.5, 0, cd, null);
        fl.material = new T.MeshBasicMaterial({ color: 0xffc233 });
        cake.flames.push({ mesh: fl, base: cd, on: true, ph: i * 1.7 });
      });
      var h = hitMesh(1.5, 0, 1.3, 0, g);
      K.addPickable(h, function () { blow(); });
    })();

    function blow() {
      if (state.blown) { toast(D.kue, 3000); return; }
      state.blown = true;
      cake.flames.forEach(function (f) {
        f.on = false; f.mesh.visible = false;
        var n = RM ? 2 : 5;
        for (var i = 0; i < n; i++) {
          var s = new T.Mesh(geoSph, new T.MeshBasicMaterial({ color: 0xb8b8b8, transparent: true, opacity: 0.7 }));
          s.scale.setScalar(0.06 + Math.random() * 0.04);
          s.position.set(f.base.position.x + (Math.random() - 0.5) * 0.06, 2.2, f.base.position.z + (Math.random() - 0.5) * 0.06);
          s.userData = { age: -i * 0.18, vx: (Math.random() - 0.5) * 0.15 };
          cake.group.add(s); cake.smoke.push(s);
        }
      });
      playHBD();
      $('cakeTitle').textContent = U.selamat; $('cakeText').textContent = D.kue;
      setTimeout(function () { openOv('cakeMsg'); $('cakeClose').focus({ preventScroll: true }); }, RM ? 100 : 700);
      if (!RM) confettiPop();
    }
    function confettiPop() {
      var cols = [0xb3123f, 0xffb3c6, 0xfff8f0, 0xff6f91, 0xe8a400], n = K.isEco() ? 20 : 40, geo = new T.PlaneGeometry(0.14, 0.09);
      for (var i = 0; i < n; i++) {
        var m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: cols[i % 5], side: T.DoubleSide }));
        m.position.set(K.hooks.cake.pos.x, 2.4, K.hooks.cake.pos.z);
        m.userData = { v: new T.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4), life: 2.2 };
        K.scene.add(m); conf.push(m);
      }
    }
    var conf = [];
    $('cakeClose').addEventListener('click', function () {
      closeOv('cakeMsg');
      var mt = missingText();
      setTimeout(function () { toast(mt || U.mawarSiap, 4200); }, 250);
    });

    // ---------- TV ----------
    var tv = { group: null, screen: null };
    (function buildTV() {
      var g = new T.Group(); tv.group = g; g.position.copy(K.hooks.tv.pos); g.rotation.y = Math.PI / 2 * 0.6; K.garden.add(g);
      add(geoBox, 0x6d4c5a, 0.18, 0.5, 0.18, -0.55, 0.25, 0, g); add(geoBox, 0x6d4c5a, 0.18, 0.5, 0.18, 0.55, 0.25, 0, g);
      add(geoBox, 0xb3123f, 1.9, 1.4, 0.9, 0, 1.2, 0, g);
      tv.screen = add(geoBox, 0xffeef2, 1.5, 1.0, 0.06, -0.08, 1.2, 0.47, g, { emissive: 0xffc2d1, emissiveIntensity: 0.6 });
      var tri = new T.Mesh(new T.ConeGeometry(0.22, 0.3, 3), M(0xb3123f));
      tri.rotation.z = -Math.PI / 2; tri.position.set(-0.08, 1.2, 0.52); tv.screen.parent.add(tri);
      add(geoSph, 0xfff8f0, 0.07, 0.07, 0.04, 0.78, 1.45, 0.47, g); add(geoSph, 0xfff8f0, 0.07, 0.07, 0.04, 0.78, 1.2, 0.47, g);
      var a1 = add(geoCyl, 0x4a2030, 0.015, 0.8, 0.015, -0.2, 2.2, 0, g); a1.rotation.z = 0.5;
      var a2 = add(geoCyl, 0x4a2030, 0.015, 0.8, 0.015, 0.2, 2.2, 0, g); a2.rotation.z = -0.5;
      add(geoSph, 0xff8fab, 0.35, 0.3, 0.1, -0.7, 0.2, 0.5, g); // kaki pita lucu
      var h = hitMesh(1.6, 0, 1.2, 0.2, g);
      K.addPickable(h, openTV);
    })();

    var reels = (D.reels || []).slice(0, 4), reelIdx = 0;
    function reelEmbed(url) { return url.replace(/\/?$/, '/') + 'embed'; }
    function showReel() {
      var box = $('tvFrame'); box.textContent = '';
      var url = reels[reelIdx];
      var f = document.createElement('iframe');
      f.src = reelEmbed(url); f.title = fmt(U.reelKe, { i: reelIdx + 1, n: reels.length });
      f.setAttribute('allowfullscreen', ''); f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin'); f.setAttribute('scrolling', 'no'); f.setAttribute('frameborder', '0');
      box.appendChild(f);
      $('tvCount').textContent = fmt(U.reelKe, { i: reelIdx + 1, n: reels.length });
      var a = $('tvLink'); a.href = url; a.textContent = U.tonton;
      $('tvPrev').disabled = reelIdx === 0; $('tvNext').disabled = reelIdx === reels.length - 1;
    }
    function openTV() {
      if (openId || !reels.length) return;
      reelIdx = 0; $('tvText').textContent = D.tv;
      $('tvPrev').setAttribute('aria-label', U.sebelumnya); $('tvNext').setAttribute('aria-label', U.berikutnya);
      $('tvClose').textContent = U.tutup;
      openOv('tvOv'); showReel(); $('tvClose').focus({ preventScroll: true });
    }
    function closeTV() { $('tvFrame').textContent = ''; closeOv('tvOv'); }   // iframe dilepas
    $('tvClose').addEventListener('click', closeTV);
    $('tvPrev').addEventListener('click', function () { if (reelIdx > 0) { reelIdx--; showReel(); } });
    $('tvNext').addEventListener('click', function () { if (reelIdx < reels.length - 1) { reelIdx++; showReel(); } });
    $('tvOv').addEventListener('pointerdown', function (e) { if (e.target === $('tvOv')) closeTV(); });

    // ---------- MAWAR ----------
    var rose = { group: null, layers: [], b: 0, target: 0, glow: null, cam: 0, done: false, ringMat: null };
    (function buildRose() {
      var g = new T.Group(); rose.group = g; g.position.copy(K.hooks.rose.pos); K.garden.add(g);
      add(geoCyl, 0x8a5a44, 1.1, 0.18, 1.1, 0, 0.09, 0, g);                 // petak tanah
      add(geoCyl, 0x6bb36b, 0.05, 1.6, 0.05, 0, 0.95, 0, g);                // batang
      var l1 = add(geoSph, 0x6bb36b, 0.28, 0.06, 0.14, 0.28, 0.8, 0, g); l1.rotation.z = 0.5;
      var l2 = add(geoSph, 0x6bb36b, 0.28, 0.06, 0.14, -0.28, 1.1, 0, g); l2.rotation.z = -0.5;
      var head = new T.Group(); head.position.y = 1.85; g.add(head); rose.head = head;
      var specs = [{ n: 5, r: 0.12, c: 0xb3123f, open: 1.15, y: 0.00, s: 0.9 }, { n: 5, r: 0.2, c: 0xc2184a, open: 0.95, y: -0.02, s: 1.05 },
        { n: 6, r: 0.27, c: 0xd02a5a, open: 0.7, y: -0.05, s: 1.2 }, { n: 4, r: 0.04, c: 0x8a0e31, open: 0.18, y: 0.08, s: 0.75 }];
      specs.forEach(function (sp, li) {
        var layer = { hinges: [], open: sp.open };
        for (var i = 0; i < sp.n; i++) {
          var piv = new T.Group(); piv.rotation.y = i / sp.n * Math.PI * 2 + li * 0.5; piv.position.y = sp.y; head.add(piv);
          var hinge = new T.Group(); hinge.position.x = sp.r; piv.add(hinge);
          var pm = add(geoSph, sp.c, 0.17 * sp.s, 0.3 * sp.s, 0.05, 0.0, 0.26 * sp.s, 0, hinge, { side: T.DoubleSide });
          layer.hinges.push(hinge);
        }
        rose.layers.push(layer);
      });
      rose.ringMat = new T.MeshBasicMaterial({ color: 0xff8fab, side: T.DoubleSide, transparent: true, opacity: 0.0 });
      var ring = new T.Mesh(new T.RingGeometry(0.95, 1.15, 24), rose.ringMat);
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
      var h = hitMesh(1.3, 0, 1.4, 0, g);
      K.addPickable(h, tapRose);
      setBloom(0);
    })();
    function setBloom(b) {
      rose.b = b;
      rose.layers.forEach(function (l, i) {
        var e = Math.max(0, Math.min(1, b * 1.25 - i * 0.12)); e = e * e * (3 - 2 * e);
        var tilt = 0.12 + (l.open - 0.12) * e;
        l.hinges.forEach(function (h) { h.rotation.z = -tilt; });
      });
      rose.head.scale.setScalar(0.85 + 0.35 * b);
    }
    function tapRose() {
      if (openId) return;
      if (rose.done) { openClosing(); return; }
      if (!ready()) { toast(missingText(), 3600); return; }
      startBloom();
    }
    function startBloom() {
      if (rose.target === 1) return;
      rose.target = 1; rose.cam = 1; K.lock(true);
      toast('\u2764', 1500);
    }
    var bloomT = 0, camLook = new T.Vector3(), camPos = new T.Vector3();
    function updateRose(dt, t) {
      var near = Math.hypot(K.playerPos.x - K.hooks.rose.pos.x, K.playerPos.z - K.hooks.rose.pos.z) < 3;
      if (near && !rose.near) {
        rose.near = true;
        if (!openId && !rose.done) toast(ready() ? U.mawarSiap : missingText(), 3200);
      } else if (!near && rose.near && Math.hypot(K.playerPos.x - K.hooks.rose.pos.x, K.playerPos.z - K.hooks.rose.pos.z) > 4.2) rose.near = false;
      rose.ringMat.opacity = ready() && !rose.done ? (RM ? 0.8 : 0.45 + 0.35 * Math.sin(t * 3)) : 0;
      if (rose.target === 1 && !rose.done) {
        bloomT += dt; setBloom(Math.min(1, bloomT / (RM ? 1.2 : 4.5)));
        // kamera mendekat ke mawar selama mekar
        var hp = K.hooks.rose.pos, w = Math.min(1, bloomT / 1.6); w = w * w * (3 - 2 * w);
        camPos.set(hp.x - 1.2, 3.1, hp.z + 4.2);
        K.camera.position.lerp(camPos, w);
        camLook.set(hp.x, 1.9, hp.z); K.camera.lookAt(camLook);
        if (bloomT >= (RM ? 1.2 : 4.5) + 1.0) { rose.done = true; K.lock(false); openClosing(); }
      }
      if (!RM) rose.head.rotation.y = Math.sin(t * 0.5) * 0.2;
      // asap + konfeti
      for (var i = cake.smoke.length - 1; i >= 0; i--) {
        var s = cake.smoke[i], u = s.userData; u.age += dt;
        if (u.age < 0) { s.visible = false; continue; }
        s.visible = true; s.position.y += dt * 0.55; s.position.x += u.vx * dt; s.scale.multiplyScalar(1 + dt * 0.9);
        s.material.opacity = Math.max(0, 0.7 - u.age * 0.4);
        if (u.age > 1.8) { cake.group.remove(s); s.material.dispose(); cake.smoke.splice(i, 1); }
      }
      for (var j = conf.length - 1; j >= 0; j--) {
        var c = conf[j], d = c.userData; d.v.y -= 7 * dt; c.position.addScaledVector(d.v, dt); c.rotation.x += 6 * dt; c.rotation.y += 5 * dt; d.life -= dt;
        if (d.life <= 0) { K.scene.remove(c); c.material.dispose(); conf.splice(j, 1); }
      }
    }
    var closingLoaded = false;
    function openClosing() {
      var P = D.penutup;
      $('endTitle').textContent = P.judul; $('endText').textContent = P.isi; $('endFrom').textContent = '\u2014 ' + P.dari;
      $('endBack').textContent = U.kembali;
      if (!closingLoaded) {   // foto dimuat baru saat penutup dibuka
        closingLoaded = true;
        var box = $('endPhotos'); box.textContent = '';
        K.closingPhotos.forEach(function (src) {
          var im = document.createElement('img'); im.alt = U.foto; im.decoding = 'async'; im.src = src; box.appendChild(im);
        });
      }
      openOv('endOv'); $('endScroll').scrollTop = 0; $('endBack').focus({ preventScroll: true });
    }
    $('endBack').addEventListener('click', function () { closeOv('endOv'); });

    // ---------- Esc ----------
    window.addEventListener('kado:esc', function () {
      if (openId === 'tvOv') closeTV(); else if (openId === 'cakeMsg') $('cakeClose').click(); else if (openId === 'endOv') closeOv('endOv');
    });
    window.addEventListener('kado:allvisited', function () {
      if (state.blown) setTimeout(function () { toast(U.mawarSiap, 4200); }, 1500);
    });

    // ---------- petunjuk dekat TV / kue ----------
    var near = { tv: false, cake: false };
    K.addUpdater(function (dt, t, scn) {
      if (scn !== 'garden') return;
      updateRose(dt, t);
      cake.flames.forEach(function (f) {
        if (f.on) { f.mesh.scale.set(0.07 * (1 + Math.sin(t * 14 + f.ph) * 0.12), 0.2 * (1 + Math.sin(t * 11 + f.ph) * 0.18), 0.07); }
      });
      if (!RM) tv.screen.material.emissiveIntensity = 0.55 + Math.sin(t * 3) * 0.15;
      var p = K.playerPos;
      var dTv = Math.hypot(p.x - K.hooks.tv.pos.x, p.z - K.hooks.tv.pos.z), dCk = Math.hypot(p.x - K.hooks.cake.pos.x, p.z - K.hooks.cake.pos.z);
      if (dTv < 3 && !near.tv && !openId) { near.tv = true; toast(U.tvHint, 2600); } else if (dTv > 4.2) near.tv = false;
      if (dCk < 3 && !near.cake && !openId && !state.blown) { near.cake = true; toast(U.tiup, 2600); } else if (dCk > 4.2) near.cake = false;
    });

    K._fe2 = {
      state: function () { return { blown: state.blown, bloomed: rose.done, open: openId, ready: ready(), eco: K.isEco(), iframes: document.querySelectorAll('iframe').length, muted: audio.muted, audioState: audio.ctx && audio.ctx.state }; },
      blow: blow, openTV: openTV, tapRose: tapRose
    };
  };
})();
