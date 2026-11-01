/* Untuk Wulan - FE-1: kado, taman, chibi, 7 makanan, polaroid.
   Skrip biasa (tanpa build). THREE = global dari vendor/three/three.min.js (r149).
   Semua teks ucapan dibaca dari data/ucapan.json. Hook FE-2: window.KADO. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FOOD_KEYS = ['sei', 'sate', 'mochi', 'dimsum', 'bakso', 'mieayam', 'pallumara'];
  // 11 foto taman (urutan sesuai keputusan). foto-09/12/15 = penutup (FE-2).
  var GARDEN_PHOTOS = ['02', '03', '04', '05', '06', '07', '08', '11', '13', '14', '16', '01'];
  var HALF = 12;          // setengah sisi taman
  var LIMIT = 11;         // batas jalan karakter
  var FOOD_NEAR = 1.8, FOOD_FAR = 2.7;

  var data = null, renderer, scene, camera, clock;
  var sceneName = 'kado';
  var cardOpen = false, photoOpen = false;
  var updaters = [];
  var visited = {};
  var extLock = false, eco = false;
  function blocked() { return cardOpen || photoOpen || extLock; }

  // ---------- util ----------
  var matCache = {};
  function mat(color, opts) {
    var k = color + (opts ? JSON.stringify(opts) : '');
    if (!matCache[k]) {
      var o = { color: color, flatShading: true };
      if (opts) for (var i in opts) o[i] = opts[i];
      matCache[k] = new THREE.MeshLambertMaterial(o);
    }
    return matCache[k];
  }
  function mk(geo, color, x, y, z, parent, opts) {
    var m = new THREE.Mesh(geo, mat(color, opts));
    m.position.set(x || 0, y || 0, z || 0);
    if (parent) parent.add(m);
    return m;
  }
  function hit(r, parent, ud) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 4), new THREE.MeshBasicMaterial({ visible: false }));
    m.userData = ud; parent.add(m); return m;
  }
  var G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    cyl10: new THREE.CylinderGeometry(1, 1, 1, 10),
    sph: new THREE.SphereGeometry(1, 10, 8),
    sphLow: new THREE.SphereGeometry(1, 7, 5),
    cone: new THREE.ConeGeometry(1, 1, 7),
    oct: new THREE.OctahedronGeometry(1, 0)
  };
  function scaled(geo, color, sx, sy, sz, x, y, z, parent, opts) {
    var m = mk(geo, color, x, y, z, parent, opts); m.scale.set(sx, sy, sz); return m;
  }

  // ---------- DOM / UI ----------
  function showEl(id, on) { $(id).classList.toggle('hidden', !on); }
  function setText(id, t) { $(id).textContent = t; }

  function openCard(title, text) {
    setText('cardTitle', title); setText('cardText', text);
    showEl('card', true); cardOpen = true; $('cardClose').focus({ preventScroll: true });
    resetInput();
  }
  function closeCard() { var was = cardOpen; showEl('card', false); cardOpen = false; if (was) window.dispatchEvent(new CustomEvent('kado:cardclosed')); }
  function openPhoto(idx) {
    var f = 'foto/foto-' + GARDEN_PHOTOS[idx] + '.jpg';
    $('photoImg').src = f; $('photoImg').alt = data.ui.foto;
    showEl('photo', true); photoOpen = true; resetInput();
  }
  function closePhoto() { showEl('photo', false); photoOpen = false; }

  // ---------- input ----------
  var keys = {}, joy = { id: null, x: 0, y: 0 };
  function resetInput() { keys = {}; joy.x = joy.y = 0; $('knob').style.transform = ''; }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeCard(); closePhoto(); window.dispatchEvent(new CustomEvent('kado:esc')); return; }
    var k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) >= 0) {
      keys[k] = true; e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) { delete keys[e.key.toLowerCase()]; });
  window.addEventListener('blur', resetInput);

  function setupJoystick() {
    var el = $('joy'), knob = $('knob'), R = 46;
    function upd(e) {
      var r = el.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      joy.x = dx / R; joy.y = dy / R;
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }
    el.addEventListener('pointerdown', function (e) {
      if (joy.id !== null) return;
      joy.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (_) {}
      upd(e); e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) { if (e.pointerId === joy.id) { upd(e); e.preventDefault(); } });
    function end(e) {
      if (e.pointerId !== joy.id) return;
      joy.id = null; joy.x = joy.y = 0; knob.style.transform = '';
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  // tap/klik pada kanvas
  var ray = new THREE.Raycaster(), pickables = [], tapStart = null;
  function setupTap() {
    var c = $('c');
    c.addEventListener('pointerdown', function (e) { tapStart = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; });
    c.addEventListener('pointerup', function (e) {
      if (!tapStart || tapStart.id !== e.pointerId) return;
      var moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y), dt = performance.now() - tapStart.t;
      tapStart = null;
      if (moved < 12 && dt < 600) pick(e.clientX, e.clientY);
    });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function pick(cx, cy) {
    if (blocked()) return;
    var v = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(v, camera);
    var hits = ray.intersectObjects(pickables, false);
    if (!hits.length) return;
    var u = hits[0].object.userData;
    if (u.kind === 'kado') tapKado();
    else if (u.kind === 'food') visitFood(u.key);
    else if (u.kind === 'photo') openPhoto(u.idx);
    else if (u.kind === 'hook' && u.fn) u.fn();
  }

  // ---------- setup three ----------
  function initThree() {
    renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = false;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffeef2);
    scene.fog = new THREE.Fog(0xffeef2, 28, 60);
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9b3bd, 0.55));
    var sun = new THREE.DirectionalLight(0xffffff, 0.4); sun.position.set(-6, 12, 8); scene.add(sun);
    clock = new THREE.Clock();
    resize(); window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 200); });
  }
  function resize() {
    var w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
  }

  // ---------- adegan 1: kado ----------
  var kado = { group: null, lid: null, taps: 0, shake: 0, state: 'idle', confetti: [], t: 0 };
  function buildKado() {
    var g = new THREE.Group(); kado.group = g; scene.add(g);
    var floor = scaled(G.cyl10, 0xffd6e0, 5, 0.1, 5, 0, -0.05, 0, g);
    var body = mk(G.box, 0xb3123f, 0, 0.9, 0, g); body.scale.set(2, 1.8, 2);
    var lid = new THREE.Group(); lid.position.set(0, 1.8, 0); g.add(lid); kado.lid = lid;
    scaled(G.box, 0x9c0f37, 2.3, 0.4, 2.3, 0, 0.2, 0, lid);
    // pita
    scaled(G.box, 0xfff8f0, 0.4, 1.82, 2.02, 0, 0.9, 0, g);
    scaled(G.box, 0xfff8f0, 2.02, 1.82, 0.4, 0, 0.9, 0, g);
    scaled(G.box, 0xfff8f0, 0.4, 0.42, 2.32, 0, 0.2, 0, lid);
    scaled(G.box, 0xfff8f0, 2.32, 0.42, 0.4, 0, 0.2, 0, lid);
    var bow1 = scaled(G.sphLow, 0xfff8f0, 0.55, 0.35, 0.3, -0.4, 0.62, 0, lid); bow1.rotation.z = 0.5;
    var bow2 = scaled(G.sphLow, 0xfff8f0, 0.55, 0.35, 0.3, 0.4, 0.62, 0, lid); bow2.rotation.z = -0.5;
    scaled(G.sphLow, 0xffd6e0, 0.2, 0.2, 0.2, 0, 0.55, 0, lid);
    hit(1.9, g, { kind: 'kado' }).position.set(0, 1.2, 0);
    pickables = [g.children[g.children.length - 1]];
    g.position.y = 0;
  }
  function tapKado() {
    if (kado.state === 'idle' || kado.state === 'shaken') {
      kado.taps++;
      if (kado.taps === 1) {
        kado.shake = 0.7; kado.state = 'shaken';
        setText('bubble', data.kado); showEl('bubble', true);
        setText('tapHint', data.ui.tapLagi);
      } else {
        kado.state = 'open'; kado.t = 0;
        showEl('bubble', false); showEl('tapHint', false);
        burst();
        setTimeout(function () { toGarden(); }, RM ? 300 : 1700);
      }
    }
  }
  function burst() {
    var cols = [0xb3123f, 0xffb3c6, 0xfff8f0, 0xff6f91, 0xe8a400];
    var n = RM ? 30 : (eco ? 50 : 90), geo = new THREE.PlaneGeometry(0.16, 0.1);
    for (var i = 0; i < n; i++) {
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      m.position.set(0, 2.2, 0);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 7, 4 + Math.random() * 5, (Math.random() - 0.5) * 7);
      m.userData.r = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      scene.add(m); kado.confetti.push(m);
    }
  }
  function updateKado(dt) {
    kado.t += dt;
    var g = kado.group;
    if (kado.shake > 0) {
      kado.shake -= dt;
      var a = RM ? 0 : Math.sin(kado.t * 40) * 0.12 * Math.max(kado.shake, 0) / 0.7;
      g.rotation.z = a; g.rotation.x = a * 0.5;
    } else { g.rotation.z = g.rotation.x = 0; }
    if (kado.state === 'idle' || kado.state === 'shaken') {
      g.position.y = RM ? 0 : Math.abs(Math.sin(kado.t * 2.2)) * 0.12;
    }
    if (kado.state === 'open') {
      kado.lid.position.y += (2.9 - kado.lid.position.y) * Math.min(1, dt * 8);
      kado.lid.rotation.z += (0.5 - kado.lid.rotation.z) * Math.min(1, dt * 6);
    }
    for (var i = kado.confetti.length - 1; i >= 0; i--) {
      var c = kado.confetti[i], v = c.userData.v, r = c.userData.r;
      v.y -= 9 * dt; c.position.addScaledVector(v, dt);
      c.rotation.x += r.x * dt; c.rotation.y += r.y * dt; c.rotation.z += r.z * dt;
      if (c.position.y < -3) { scene.remove(c); kado.confetti.splice(i, 1); }
    }
    camera.position.set(0, 2.8, 7.5); camera.lookAt(0, 1.1, 0);
  }

  // ---------- adegan 2: taman ----------
  var garden = { group: null, player: null, parts: {}, pos: new THREE.Vector3(0, 0, 3), heading: 0, walk: 0, obstacles: [], foods: [], photos: [], camLook: new THREE.Vector3() };
  var HOOKS = {
    cake: new THREE.Vector3(0, 0, -9),
    tv: new THREE.Vector3(-9.5, 0, -1),
    rose: new THREE.Vector3(9.5, 0, -10)
  };
  var FOOD_POS = {
    sei: [-8, -6], sate: [-3.5, -3], mochi: [4, -4.5], dimsum: [8.5, -1],
    bakso: [7, 5], mieayam: [-7, 4], pallumara: [-1, 6.5]
  };
  var TREES = [[-10.5, -10], [-5.5, -9.5], [5.5, -9.5], [11, -4], [-11.5, -5.5], [-11, 8], [-4, 10], [4, 10], [11, 9]];
  var LAMPS = [[-6, 0.5], [2.5, -6.5], [8, -6], [-5, 6.5]];

  function buildGarden() {
    var g = new THREE.Group(); garden.group = g; g.visible = false; scene.add(g);
    // lantai
    scaled(G.cyl10, 0xf6dfe4, 60, 0.02, 60, 0, -0.06, 0, g);
    var grass = mk(G.box, 0xbfe3b0, 0, -0.1, 0, g); grass.scale.set(HALF * 2, 0.2, HALF * 2);
    // jalan setapak krem
    scaled(G.box, 0xfff3e0, 2.4, 0.02, HALF * 2 - 1, 0, 0.02, 0, g);
    // pagar
    var fenceCol = 0xfff8f0;
    [[0, -HALF, HALF * 2, 0.15], [0, HALF, HALF * 2, 0.15]].forEach(function (p) { scaled(G.box, fenceCol, p[2], 0.1, p[3], p[0], 0.55, p[1], g); });
    [[-HALF, 0], [HALF, 0]].forEach(function (p) { scaled(G.box, fenceCol, 0.15, 0.1, HALF * 2, p[0], 0.55, p[1], g); });
    for (var i = -HALF; i <= HALF; i += 2) {
      scaled(G.box, fenceCol, 0.18, 0.9, 0.18, i, 0.45, -HALF, g);
      scaled(G.box, fenceCol, 0.18, 0.9, 0.18, i, 0.45, HALF, g);
      scaled(G.box, fenceCol, 0.18, 0.9, 0.18, -HALF, 0.45, i, g);
      scaled(G.box, fenceCol, 0.18, 0.9, 0.18, HALF, 0.45, i, g);
    }
    // bunga acak (deterministik)
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var fl = [0xb3123f, 0xff8fab, 0xffffff, 0xffd166];
    for (var f = 0; f < 36; f++) {
      var fx = (rnd() - 0.5) * 22, fz = (rnd() - 0.5) * 22;
      if (Math.abs(fx) < 1.5) continue;
      scaled(G.sphLow, fl[f % 4], 0.12, 0.12, 0.12, fx, 0.15, fz, g);
      scaled(G.cyl6, 0x6bb36b, 0.02, 0.15, 0.02, fx, 0.07, fz, g);
    }
    // pohon & lampu
    var spots = [];
    TREES.forEach(function (t) { buildTree(g, t[0], t[1]); spots.push({ x: t[0], z: t[1], y: 1.9, lamp: false }); garden.obstacles.push({ x: t[0], z: t[1], r: 0.7 }); });
    LAMPS.forEach(function (t) { buildLamp(g, t[0], t[1]); spots.push({ x: t[0], z: t[1], y: 1.7, lamp: true }); garden.obstacles.push({ x: t[0], z: t[1], r: 0.4 }); });
    // polaroid
    GARDEN_PHOTOS.forEach(function (n, i) { if (spots[i]) buildPolaroid(g, spots[i], i); });
    // makanan
    FOOD_KEYS.forEach(function (k) { buildFood(g, k); });
    // jangkar hook FE-2 (grup kosong, tak terlihat)
    ['cake', 'tv', 'rose'].forEach(function (k) {
      var a = new THREE.Group(); a.position.copy(HOOKS[k]); a.name = 'anchor-' + k; g.add(a); HOOKS[k + 'Anchor'] = a;
    });
    buildPlayer(g);
  }

  function buildTree(parent, x, z) {
    var t = new THREE.Group(); t.position.set(x, 0, z); parent.add(t);
    scaled(G.cyl6, 0x8a5a44, 0.28, 2.2, 0.28, 0, 1.1, 0, t);
    scaled(G.sphLow, 0x7cc47a, 1.5, 1.3, 1.5, 0, 3.0, 0, t);
    scaled(G.sphLow, 0x8fd18a, 1.05, 0.95, 1.05, 0.5, 3.8, 0.2, t);
    scaled(G.sphLow, 0xffb3c6, 0.18, 0.18, 0.18, 0.9, 3.2, 1.0, t);
    scaled(G.sphLow, 0xffb3c6, 0.18, 0.18, 0.18, -0.9, 3.4, 0.8, t);
  }
  function buildLamp(parent, x, z) {
    var t = new THREE.Group(); t.position.set(x, 0, z); parent.add(t);
    scaled(G.cyl6, 0x6d4c5a, 0.07, 3.0, 0.07, 0, 1.5, 0, t);
    scaled(G.box, 0x6d4c5a, 0.7, 0.06, 0.06, 0.3, 2.4, 0, t);
    var bulb = mk(G.sphLow, 0xfff1b8, 0, 3.15, 0, t, { emissive: 0xffe08a, emissiveIntensity: 0.9 });
    bulb.scale.set(0.25, 0.25, 0.25);
    scaled(G.cone, 0xb3123f, 0.38, 0.25, 0.38, 0, 3.4, 0, t);
  }

  var texLoader = new THREE.TextureLoader();
  function buildPolaroid(parent, spot, idx) {
    var p = new THREE.Group();
    p.position.set(spot.x + (spot.lamp ? 0 : 0.0), spot.y, spot.z + 0.95);
    p.rotation.y = Math.atan2(-spot.x, 24);
    var swing = new THREE.Group(); p.add(swing);
    var frame = scaled(G.box, 0xffffff, 1.1, 1.35, 0.04, 0, 0, 0, swing, { side: THREE.DoubleSide });
    var img = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd6e0 }));
    img.scale.set(0.92, 1.05, 1); img.position.set(0, 0.1, 0.025); swing.add(img);
    var back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffd6e0 }));
    back.position.set(0, 0.1, -0.025); back.rotation.y = Math.PI; back.scale.set(0.92, 1.05, 1); swing.add(back);
    scaled(G.box, 0x8a5a44, 0.02, 0.9, 0.02, 0, 1.0, -0.4, p); // tali tipis
    frame.userData = { kind: 'photo', idx: idx };
    hit(0.95, swing, { kind: 'photo', idx: idx });
    parent.add(p);
    var o = { group: p, swing: swing, img: img, back: back, idx: idx, loaded: false, near: false, s: 1, x: p.position.x, z: p.position.z, ph: idx * 1.3 };
    garden.photos.push(o);
  }
  function loadPhotoTex(o) {
    if (o.loaded) return; o.loaded = true;
    texLoader.load('foto/foto-' + GARDEN_PHOTOS[o.idx] + '.jpg', function (tex) {
      var a = tex.image.width / tex.image.height, w = 0.92, h = 1.05;
      if (a > w / h) h = w / a; else w = h * a;
      o.img.scale.set(w, h, 1); o.back.scale.set(w, h, 1);
      o.img.material.map = tex; o.img.material.color.set(0xffffff); o.img.material.needsUpdate = true;
      o.back.material.map = tex; o.back.material.color.set(0xffffff); o.back.material.needsUpdate = true;
    }, undefined, function () { o.loaded = false; });
  }

  function buildFood(parent, key) {
    var pos = FOOD_POS[key];
    var root = new THREE.Group(); root.position.set(pos[0], 0, pos[1]); parent.add(root);
    var obj = new THREE.Group(); obj.position.y = 1.0; root.add(obj);
    var plate = function (r) { scaled(G.cyl10, 0xfff8f0, r, 0.06, r, 0, -0.05, 0, obj); };
    var bowl = function (col) {
      var b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(col, { side: THREE.DoubleSide }));
      b.position.y = 0.2; obj.add(b);
    };
    if (key === 'sei') {
      plate(0.7);
      for (var i = 0; i < 4; i++) scaled(G.box, i % 2 ? 0x8b3a2b : 0x6e2d22, 0.55, 0.12, 0.28, (i - 1.5) * 0.14, 0.05 + i * 0.1, 0, obj).rotation.y = (i - 1.5) * 0.25;
      scaled(G.sphLow, 0xe6e6e6, 0.13, 0.13, 0.13, 0.1, 0.65, 0.05, obj);
      scaled(G.sphLow, 0xf0f0f0, 0.1, 0.1, 0.1, -0.05, 0.85, -0.02, obj);
    } else if (key === 'sate') {
      plate(0.75);
      for (var s = -1; s <= 1; s++) {
        var sk = new THREE.Group(); sk.position.set(0, 0.1 + (s + 1) * 0.02, s * 0.25); sk.rotation.y = s * 0.12; obj.add(sk);
        scaled(G.cyl6, 0xd9b27c, 0.02, 1.4, 0.02, 0, 0, 0, sk).rotation.z = Math.PI / 2;
        for (var c = 0; c < 3; c++) scaled(G.box, 0x7a3b1d, 0.2, 0.17, 0.17, -0.2 + c * 0.22, 0, 0, sk);
      }
    } else if (key === 'mochi') {
      plate(0.65);
      scaled(G.sph, 0xffffff, 0.45, 0.32, 0.45, 0, 0.25, 0, obj);
      scaled(G.sphLow, 0xffb3c6, 0.22, 0.12, 0.22, 0, 0.55, 0, obj);
      scaled(G.sphLow, 0x333333, 0.04, 0.04, 0.04, -0.14, 0.3, 0.38, obj);
      scaled(G.sphLow, 0x333333, 0.04, 0.04, 0.04, 0.14, 0.3, 0.38, obj);
    } else if (key === 'dimsum') {
      scaled(G.cyl10, 0xd9a86c, 0.55, 0.28, 0.55, 0, 0.0, 0, obj);
      scaled(G.cyl10, 0xc4915a, 0.58, 0.05, 0.58, 0, 0.16, 0, obj);
      scaled(G.cyl10, 0xd9a86c, 0.55, 0.28, 0.55, 0, 0.32, 0, obj);
      scaled(G.sph, 0xfff1dd, 0.32, 0.22, 0.32, 0, 0.62, 0, obj);
      scaled(G.cone, 0xffd6e0, 0.1, 0.12, 0.1, 0, 0.82, 0, obj);
    } else if (key === 'bakso') {
      bowl(0xb3123f);
      scaled(G.cyl10, 0xe8b25a, 0.52, 0.03, 0.52, 0, 0.2, 0, obj);
      [[-0.18, 0.1], [0.2, 0.05], [0, -0.22], [0.05, 0.28]].forEach(function (p) { scaled(G.sph, 0x9a6a50, 0.2, 0.2, 0.2, p[0], 0.3, p[1], obj); });
      scaled(G.box, 0x6bb36b, 0.1, 0.03, 0.1, 0.1, 0.5, -0.05, obj);
    } else if (key === 'mieayam') {
      bowl(0xfff8f0);
      for (var n = 0; n < 4; n++) {
        var tor = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 5, 9), mat(0xf3cf5a));
        tor.position.set(0, 0.28 + n * 0.05, 0); tor.rotation.set(Math.PI / 2 + n * 0.3, n * 0.7, 0); obj.add(tor);
      }
      scaled(G.box, 0x8b4a2b, 0.2, 0.1, 0.2, -0.12, 0.5, 0.1, obj);
      scaled(G.box, 0x8b4a2b, 0.18, 0.1, 0.16, 0.14, 0.5, -0.05, obj);
      scaled(G.box, 0x6bb36b, 0.08, 0.04, 0.08, 0, 0.55, 0.15, obj);
    } else if (key === 'pallumara') {
      bowl(0xfff8f0);
      scaled(G.cyl10, 0xf0a640, 0.52, 0.03, 0.52, 0, 0.2, 0, obj);
      var fish = scaled(G.sph, 0xc9c2b4, 0.38, 0.12, 0.16, 0, 0.3, 0, obj); fish.rotation.y = 0.4;
      var tail = scaled(G.cone, 0xb3ab9c, 0.12, 0.16, 0.04, 0.38, 0.3, -0.12, obj); tail.rotation.z = Math.PI / 2;
      scaled(G.sphLow, 0xe8a400, 0.12, 0.08, 0.12, -0.2, 0.34, 0.2, obj);
      scaled(G.sphLow, 0xe8a400, 0.1, 0.07, 0.1, 0.18, 0.32, 0.22, obj);
    }
    // cincin tanah
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 20), new THREE.MeshBasicMaterial({ color: 0xff8fab, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; root.add(ring);
    // bintang 'sudah dikunjungi'
    var star = new THREE.Mesh(G.oct, new THREE.MeshBasicMaterial({ color: 0xffc400 }));
    star.scale.set(0.2, 0.27, 0.1); star.position.y = 2.2; star.visible = false; root.add(star);
    var pr = hit(1.1, root, { kind: 'food', key: key }); pr.position.y = 1.0;
    pickables.push(pr);
    garden.foods.push({ key: key, root: root, obj: obj, ring: ring, star: star, near: false, x: pos[0], z: pos[1], ph: garden.foods.length * 0.9 });
  }

  function buildPlayer(parent) {
    var p = new THREE.Group(); garden.player = p; parent.add(p);
    var body = new THREE.Group(); p.add(body); garden.parts.body = body;
    // badan kecil (gaun merah mawar)
    scaled(G.cone, 0xb3123f, 0.42, 0.75, 0.42, 0, 0.62, 0, body);
    scaled(G.cyl6, 0xffd6c4, 0.12, 0.1, 0.12, 0, 0.98, 0, body);
    // kepala besar
    var head = new THREE.Group(); head.position.y = 1.62; body.add(head); garden.parts.head = head;
    scaled(G.sph, 0xffdcc8, 0.62, 0.58, 0.58, 0, 0, 0, head);
    // rambut
    var hair = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), mat(0x3b2230));
    hair.scale.set(0.66, 0.62, 0.62); hair.position.set(0, 0.04, -0.03); head.add(hair);
    scaled(G.sph, 0x3b2230, 0.64, 0.5, 0.2, 0, -0.08, -0.45, head);
    // pita pink
    scaled(G.sphLow, 0xff8fab, 0.14, 0.1, 0.08, -0.38, 0.45, 0.2, head);
    scaled(G.sphLow, 0xff8fab, 0.14, 0.1, 0.08, -0.6, 0.45, 0.2, head);
    // mata + pipi
    scaled(G.sphLow, 0x2b1a24, 0.07, 0.1, 0.05, -0.22, -0.02, 0.55, head);
    scaled(G.sphLow, 0x2b1a24, 0.07, 0.1, 0.05, 0.22, -0.02, 0.55, head);
    scaled(G.sphLow, 0xffa3b8, 0.1, 0.06, 0.04, -0.37, -0.17, 0.5, head);
    scaled(G.sphLow, 0xffa3b8, 0.1, 0.06, 0.04, 0.37, -0.17, 0.5, head);
    scaled(G.box, 0xb3123f, 0.1, 0.03, 0.03, 0, -0.2, 0.57, head);
    // lengan & kaki
    var mkLimb = function (x, y, col, len) {
      var l = new THREE.Group(); l.position.set(x, y, 0); body.add(l);
      scaled(G.cyl6, col, 0.07, len, 0.07, 0, -len / 2, 0, l); return l;
    };
    garden.parts.armL = mkLimb(-0.3, 0.92, 0xffdcc8, 0.4);
    garden.parts.armR = mkLimb(0.3, 0.92, 0xffdcc8, 0.4);
    garden.parts.legL = mkLimb(-0.13, 0.32, 0xffdcc8, 0.32);
    garden.parts.legR = mkLimb(0.13, 0.32, 0xffdcc8, 0.32);
    scaled(G.box, 0xfff8f0, 0.14, 0.07, 0.2, -0.13, 0.02, 0.03, body);
    scaled(G.box, 0xfff8f0, 0.14, 0.07, 0.2, 0.13, 0.02, 0.03, body);
    p.position.copy(garden.pos);
  }

  function visitFood(key) {
    var f = garden.foods.filter(function (x) { return x.key === key; })[0];
    if (!f) return;
    if (!visited[key]) {
      visited[key] = true; f.star.visible = true;
      var n = visitedCount();
      setText('countNum', n + '/7');
      window.dispatchEvent(new CustomEvent('kado:visit', { detail: { key: key, count: n } }));
      if (n === 7) window.dispatchEvent(new CustomEvent('kado:allvisited'));
    }
    openCard(data.label[key], data.makanan[key]);
  }
  function visitedCount() { return Object.keys(visited).length; }

  var _v = new THREE.Vector2();
  function updateGarden(dt, t) {
    // input
    var ix = 0, iz = 0;
    if (!blocked()) {
      ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
      iz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
      if (ix === 0 && iz === 0) { ix = joy.x; iz = joy.y; }
    }
    _v.set(ix, iz); var mag = Math.min(1, _v.length());
    if (mag < 0.15) mag = 0;
    var moving = mag > 0;
    var pos = garden.pos;
    if (moving) {
      _v.normalize();
      var sp = 4.6 * mag;
      pos.x += _v.x * sp * dt; pos.z += _v.y * sp * dt;
      var target = Math.atan2(_v.x, _v.y), d = target - garden.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      garden.heading += d * Math.min(1, dt * 12);
      garden.walk += dt * 11 * Math.max(mag, 0.5);
    } else { garden.walk *= Math.max(0, 1 - dt * 8); }
    // batas & tabrakan
    pos.x = Math.max(-LIMIT, Math.min(LIMIT, pos.x)); pos.z = Math.max(-LIMIT, Math.min(LIMIT, pos.z));
    garden.obstacles.forEach(function (o) {
      var dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz), m = o.r + 0.3;
      if (d < m && d > 0.0001) { pos.x = o.x + dx / d * m; pos.z = o.z + dz / d * m; }
    });
    var P = garden.player, pr = garden.parts;
    P.position.copy(pos); P.rotation.y = garden.heading;
    var sw = Math.sin(garden.walk) * (moving ? 0.8 : 0.0);
    if (RM) sw *= 0.4;
    pr.legL.rotation.x = sw; pr.legR.rotation.x = -sw;
    pr.armL.rotation.x = -sw * 0.8; pr.armR.rotation.x = sw * 0.8;
    pr.body.position.y = moving && !RM ? Math.abs(Math.sin(garden.walk)) * 0.07 : 0;
    pr.head.rotation.z = moving && !RM ? Math.sin(garden.walk) * 0.05 : (RM ? 0 : Math.sin(t * 2) * 0.03);

    // makanan
    garden.foods.forEach(function (f) {
      if (!RM) { f.obj.position.y = 1.0 + Math.sin(t * 1.8 + f.ph) * 0.12; f.obj.rotation.y = t * 0.8 + f.ph; }
      f.star.rotation.y = t * 2;
      f.ring.material.color.set(visited[f.key] ? 0xffd166 : 0xff8fab);
      var d = Math.hypot(pos.x - f.x, pos.z - f.z);
      if (d < FOOD_NEAR && !f.near && !blocked()) { f.near = true; visitFood(f.key); }
      else if (d > FOOD_FAR) f.near = false;
    });
    // polaroid
    garden.photos.forEach(function (o) {
      var d = Math.hypot(pos.x - o.x, pos.z - o.z);
      if (d < 8) loadPhotoTex(o);
      var want = d < 2.6 ? 1.45 : 1;
      o.s += (want - o.s) * Math.min(1, dt * 6);
      o.swing.scale.setScalar(o.s);
      o.swing.rotation.z = RM ? 0 : Math.sin(t * 1.2 + o.ph) * 0.04;
    });
    // kamera
    var portrait = innerWidth / innerHeight < 0.8;
    var camH = portrait ? 8.5 : 7.2, camD = portrait ? 9.5 : 8.2;
    var k = RM ? 1 : 1 - Math.exp(-5 * dt);
    camera.position.x += (pos.x - camera.position.x) * k;
    camera.position.y += (camH - camera.position.y) * k;
    camera.position.z += (pos.z + camD - camera.position.z) * k;
    garden.camLook.x += (pos.x - garden.camLook.x) * k; garden.camLook.z += (pos.z - garden.camLook.z) * k;
    camera.lookAt(garden.camLook.x, 0.8, garden.camLook.z);
  }

  function toGarden() {
    var f = $('fade'); f.classList.add('on');
    setTimeout(function () {
      kado.group.visible = false;
      kado.confetti.forEach(function (c) { scene.remove(c); }); kado.confetti = [];
      garden.group.visible = true; sceneName = 'garden';
      scene.background.set(0xffeef2);
      pickables = pickables.filter(function (m) { return m.userData && m.userData.kind === 'hook'; });
      garden.foods.forEach(function (fd) { pickables.push(fd.root.children[fd.root.children.length - 1]); });
      garden.photos.forEach(function (o) { pickables.push(o.swing.children[0]); pickables.push(o.swing.children[o.swing.children.length - 1]); });
      camera.position.set(garden.pos.x, 8, garden.pos.z + 9);
      garden.camLook.set(garden.pos.x, 0, garden.pos.z);
      showEl('counter', true); setText('countNum', visitedCount() + '/7');
      var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      if (touch) { showEl('joy', true); setText('hint', data.ui.hint); }
      else setText('hint', data.ui.hintDesktop);
      showEl('hint', true);
      setTimeout(function () { $('hint').style.opacity = 0; }, 6000);
      f.classList.remove('on');
    }, RM ? 0 : 520);
  }

  // ---------- loop ----------
  var running = false;
  function frame() {
    if (document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    if (sceneName === 'kado') updateKado(dt); else updateGarden(dt, t);
    for (var i = 0; i < updaters.length; i++) updaters[i](dt, t, sceneName);
    renderer.render(scene, camera);
    fpsTick(dt);
  }
  // mode hemat: rata-rata FPS < 30 selama 3 detik -> pixel ratio 1, partikel dikurangi
  var fps = { t: 0, n: 0, warm: 0 };
  function fpsTick(rawDt) {
    if (eco) return;
    fps.warm += rawDt; if (fps.warm < 2) return;
    fps.t += rawDt; fps.n++;
    if (fps.t >= 3) {
      if (fps.n / fps.t < 30) { setEco(); }
      fps.t = 0; fps.n = 0;
    }
  }
  function setEco() {
    eco = true; renderer.setPixelRatio(1); resize();
    window.dispatchEvent(new CustomEvent('kado:eco'));
  }
  function start() { if (running || document.hidden) return; running = true; clock.getDelta(); requestAnimationFrame(frame); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { fps.t = 0; fps.n = 0; fps.warm = 0; start(); } else resetInput(); });

  // ---------- boot ----------
  function fail(msg) {
    $('loader').classList.add('hidden');
    setText('fallback', msg); showEl('fallback', true);
  }
  function webglOk() {
    try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
    catch (e) { return false; }
  }
  function boot() {
    if (typeof THREE === 'undefined' || !webglOk()) { fail('Maaf, perangkat ini belum bisa menampilkan 3D.'); return; }
    fetch('data/ucapan.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('json ' + r.status); return r.json();
    }).then(function (j) {
      data = j;
      setText('cardClose', data.ui.tutup); setText('photoClose', data.ui.tutup);
      initThree(); buildKado(); buildGarden();
      setupJoystick(); setupTap();
      $('cardClose').addEventListener('click', closeCard);
      $('photoClose').addEventListener('click', closePhoto);
      $('card').addEventListener('pointerdown', function (e) { if (e.target === $('card')) closeCard(); });
      $('photo').addEventListener('pointerdown', function (e) { if (e.target === $('photo')) closePhoto(); });
      setText('tapHint', data.ui.tapKado); showEl('tapHint', true);
      $('loader').classList.add('out');
      setTimeout(function () { $('loader').classList.add('hidden'); }, 450);
      exposeHooks();
      if (window.KADO_FE2) window.KADO_FE2(window.KADO);
      start();
    }).catch(function (e) {
      console.warn('gagal memuat', e);
      fail('Maaf, kado ini belum bisa dibuka. Coba muat ulang.');
    });
  }

  // ---------- kait untuk FE-2 ----------
  function exposeHooks() {
    window.KADO = {
      THREE: THREE, data: data, scene: scene, camera: camera, renderer: renderer,
      garden: garden.group,
      hooks: {
        cake: { pos: HOOKS.cake, anchor: HOOKS.cakeAnchor },
        tv: { pos: HOOKS.tv, anchor: HOOKS.tvAnchor },
        rose: { pos: HOOKS.rose, anchor: HOOKS.roseAnchor }
      },
      visited: visited,
      visitedCount: visitedCount,
      allVisited: function () { return visitedCount() === 7; },
      foodKeys: FOOD_KEYS.slice(),
      closingPhotos: ['foto/foto-09.jpg', 'foto/foto-15.jpg', 'foto/foto-12.jpg'],
      player: garden.player, playerPos: garden.pos,
      addUpdater: function (fn) { updaters.push(fn); },
      addPickable: function (mesh, fn) { mesh.userData = { kind: 'hook', fn: fn }; pickables.push(mesh); },
      showCard: openCard, closeCard: closeCard,
      lock: function (on) { extLock = !!on; if (on) resetInput(); },
      isEco: function () { return eco; }, reducedMotion: RM, _forceEco: setEco,
      ui: { setText: setText, showEl: showEl, $: $ },
      scene_name: function () { return sceneName; },
      // pembantu uji/QA
      _teleport: function (x, z) { garden.pos.set(x, 0, z); },
      _skipKado: function () { if (sceneName === 'kado') { kado.taps = 1; tapKado(); } },
      _state: function () {
        return { scene: sceneName, x: garden.pos.x, z: garden.pos.z, visited: Object.keys(visited), cardOpen: cardOpen, photoOpen: photoOpen,
          loadedPhotos: garden.photos.filter(function (o) { return o.loaded; }).length };
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
