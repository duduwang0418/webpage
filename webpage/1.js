// Enhanced galaxy script — supports dynamic controls (rotation speed, colors, count, branches)
let scene, camera, renderer, controls;
let galaxy = null;
let rotationEnabled = true;
let rotationSpeed = 0.5; // multiplier (user-controlled)
let clock = null;
// planets container
let planets = [];
let sun = null;
let running = true;

// configurable parameters
let params = {
  count: 4000,
  branches: 5,
  insideColor: '#ff6030',
  outsideColor: '#1b3984',
  size: 0.05
};

// orbit style defaults (color and suggested width)
let orbitStyle = { color: 0x555555, width: 1 };

function init() {
  console.log('[galaxy] init start');
  // guard: ensure Three.js is available
  if (typeof THREE === 'undefined') {
    console.error('[galaxy] THREE is undefined. Make sure three.js is loaded before 1.js');
    showOverlay('錯誤：Three.js 未載入，請檢查 index.html 是否正確引入 three.js');
    return;
  }
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 8, 20);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  try {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 1);
    const container = document.getElementById('container') || document.body;
    container.appendChild(renderer.domElement);
    // diagnostic: confirm WebGL context
    try {
      console.log('[galaxy] renderer.getContext ->', !!renderer.getContext());
    } catch (e) {
      console.warn('[galaxy] unable to query renderer context', e);
    }
  } catch (e) {
    console.error('[galaxy] renderer setup failed', e);
    // try append to body as fallback
    document.body.appendChild(renderer.domElement);
  }

  // OrbitControls
  // Ensure OrbitControls: try existing, else try to load from CDN, else fallback
  ensureOrbitControls().then(() => {
    try {
      controls = (THREE && THREE.OrbitControls) ? new THREE.OrbitControls(camera, renderer.domElement)
        : (typeof OrbitControls === 'function' ? new OrbitControls(camera, renderer.domElement) : null);
      if (controls) controls.enableDamping = true;
    } catch (e) {
      console.error('[galaxy] OrbitControls creation failed', e);
      showToast('警告：OrbitControls 建立失敗，使用簡易控制。拖曳旋轉、滾輪縮放。');
      controls = { update: function() {} };
    }
  }).catch((err) => {
    console.warn('[galaxy] ensureOrbitControls failed', err);
    showToast('警告：OrbitControls 無法載入，已切換到簡易控制模式。拖曳旋轉、滾輪縮放。');
    // use simple fallback controls so user can still orbit & zoom
    try {
      const el = (renderer && renderer.domElement) ? renderer.domElement : (document.getElementById('container') || document.body);
      controls = createSimpleControls(el, camera);
    } catch (e) {
      console.error('[galaxy] createSimpleControls failed', e);
      controls = { update: function() {} };
    }
  });

  // lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambientLight);
  // hemisphere to give better sky/ground shading
  const hemi = new THREE.HemisphereLight(0xffffee, 0x080820, 0.35);
  scene.add(hemi);
  // central light (sun)
  const pointLight = new THREE.PointLight(0xffffff, 2.0, 200);
  pointLight.position.set(0, 0, 0);
  scene.add(pointLight);

  // create a glowing sun at center
  const sunGeo = new THREE.SphereGeometry(1.2, 32, 32);
  const sunMat = new THREE.MeshStandardMaterial({
    emissive: new THREE.Color(0xffee88),
    emissiveIntensity: 1.5,
    color: 0x222222
  });
  sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 0, 0);
  scene.add(sun);

  createGalaxy();
  // create some planets that orbit the center
  clock = new THREE.Clock();
  createPlanets();

  // quick diagnostics: if after a short delay nothing is visible, create a fallback test scene
  setTimeout(() => {
    try {
      // if renderer context missing or nothing in scene, create fallback objects for visibility
      const hasContext = !!(renderer && typeof renderer.getContext === 'function' && renderer.getContext());
      const visibleCount = scene.children ? scene.children.length : 0;
      console.log('[galaxy] post-init diagnostics -> hasContext:', hasContext, 'scene.children:', visibleCount);
      if (!hasContext || visibleCount <= 1) {
        console.warn('[galaxy] diagnostic: scene seems empty or no WebGL context — creating fallback test objects');
        showToast('偵測到渲染問題，已建立測試物件以確認渲染是否正常', 6000);
        createFallbackTestScene();
      }
    } catch (e) {
      console.error('[galaxy] post-init diagnostics error', e);
    }
  }, 800);

  window.addEventListener('resize', onWindowResize);
  animate();
  console.log('[galaxy] init finished, animation started');
}

// display an overlay message to the user when fatal errors occur
function showOverlay(msg) {
  try {
    let el = document.getElementById('galaxy-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'galaxy-overlay';
      el.style.position = 'fixed';
      el.style.left = '0';
      el.style.top = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.zIndex = '2000';
      el.style.background = 'rgba(0,0,0,0.85)';
      el.style.color = '#fff';
      el.style.fontSize = '16px';
      el.style.padding = '20px';
      el.style.boxSizing = 'border-box';
      el.style.textAlign = 'center';
      document.body.appendChild(el);
    }
    el.textContent = msg;
  } catch (err) {
    console.error('[galaxy] showOverlay failed', err);
  }
}

// small non-blocking toast for warnings
function showToast(msg, duration = 5000) {
  try {
    let t = document.getElementById('galaxy-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'galaxy-toast';
      t.style.position = 'fixed';
      t.style.right = '16px';
      t.style.top = '16px';
      t.style.zIndex = '2500';
      t.style.background = 'rgba(0,0,0,0.7)';
      t.style.color = '#fff';
      t.style.padding = '10px 14px';
      t.style.borderRadius = '6px';
      t.style.fontSize = '13px';
      t.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._hideTimeout);
    t._hideTimeout = setTimeout(() => { t.style.display = 'none'; }, duration);
  } catch (e) {
    console.warn('[galaxy] showToast failed', e);
  }
}

// helper to load a script dynamically
function loadScript(src, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    let done = false;
    const to = setTimeout(() => {
      if (done) return;
      done = true;
      s.onerror = s.onload = null;
      reject(new Error('timeout loading ' + src));
    }, timeout);
    s.onload = () => { if (done) return; done = true; clearTimeout(to); resolve(); };
    s.onerror = (e) => { if (done) return; done = true; clearTimeout(to); reject(e || new Error('failed to load ' + src)); };
    document.head.appendChild(s);
  });
}

// try to ensure OrbitControls exists; returns a Promise
function ensureOrbitControls() {
  return new Promise((resolve, reject) => {
    // already available via THREE or global
    if ((typeof THREE !== 'undefined' && THREE.OrbitControls) || (typeof OrbitControls === 'function')) {
      console.log('[galaxy] OrbitControls already available');
      return resolve();
    }

    // try to load from CDN (non-module build)
    const cdn = 'https://cdn.jsdelivr.net/npm/three@0.154.0/examples/js/controls/OrbitControls.js';
    console.log('[galaxy] attempting to load OrbitControls from', cdn);
    loadScript(cdn, 8000).then(() => {
      // small delay to allow script to attach
      setTimeout(() => {
        if ((typeof THREE !== 'undefined' && THREE.OrbitControls) || (typeof OrbitControls === 'function')) {
          console.log('[galaxy] OrbitControls loaded');
          resolve();
        } else {
          reject(new Error('OrbitControls script loaded but class not found'));
        }
      }, 50);
    }).catch((err) => {
      console.warn('[galaxy] loading OrbitControls failed', err);
      reject(err);
    });
  });
}

// try to ensure Line2 (fat lines) support is available
function ensureLine2() {
  return new Promise((resolve, reject) => {
    if (typeof THREE !== 'undefined' && THREE.Line2 && THREE.LineGeometry && THREE.LineMaterial) {
      console.log('[galaxy] Line2 already available');
      return resolve();
    }
    const base = 'https://cdn.jsdelivr.net/npm/three@0.154.0/examples/js/lines/';
    const scripts = ['LineGeometry.js', 'LineMaterial.js', 'Line2.js'];
    // load sequentially
    let p = Promise.resolve();
    scripts.forEach((s) => {
      p = p.then(() => loadScript(base + s, 8000));
    });
    p.then(() => {
      // small delay
      setTimeout(() => {
        if (typeof THREE !== 'undefined' && THREE.Line2 && THREE.LineGeometry && THREE.LineMaterial) {
          console.log('[galaxy] Line2 loaded');
          resolve();
        } else {
          reject(new Error('Line2 script loaded but constructors not found'));
        }
      }, 50);
    }).catch((err) => {
      console.warn('[galaxy] loading Line2 failed', err);
      reject(err);
    });
  });
}

// upgrade existing orbit lines to fat Line2 lines
function upgradeOrbitLinesToFat(desiredWidth) {
  return new Promise((resolve, reject) => {
    ensureLine2().then(() => {
      try {
        // replace each planet orbitLine
        for (let i = 0; i < planets.length; i++) {
          const p = planets[i];
          if (!p.orbitLine || !p.orbitLine.geometry) continue;
          const posAttr = p.orbitLine.geometry.attributes.position;
          if (!posAttr) continue;
          const arr = [];
          for (let k = 0; k < posAttr.count; k++) {
            arr.push(posAttr.getX(k), posAttr.getY(k), posAttr.getZ(k));
          }
          // create LineGeometry
          const lg = new THREE.LineGeometry();
          lg.setPositions(arr);
          const mat = new THREE.LineMaterial({ color: orbitStyle.color, linewidth: desiredWidth, transparent: true, opacity: 0.25 });
          if (mat && mat.resolution) mat.resolution.set(window.innerWidth, window.innerHeight);
          const line = new THREE.Line2(lg, mat);
          line.computeLineDistances();
          line.scale.set(1, 1, 1);
          // replace in scene
          scene.remove(p.orbitLine);
          // dispose old
          try { p.orbitLine.geometry.dispose(); p.orbitLine.material.dispose(); } catch (e) {}
          p.orbitLine = line;
          scene.add(p.orbitLine);
        }
        // update resize handler for LineMaterial
        window.addEventListener('resize', () => {
          for (const p of planets) {
            if (p.orbitLine && p.orbitLine.material && p.orbitLine.material.resolution) p.orbitLine.material.resolution.set(window.innerWidth, window.innerHeight);
          }
        });
        resolve();
      } catch (e) {
        console.warn('[galaxy] upgradeOrbitLinesToFat failed', e);
        reject(e);
      }
    }).catch((err) => reject(err));
  });
}

// Simple fallback controls: pointer drag to orbit, wheel to zoom, basic touch support
function createSimpleControls(domElement, camera) {
  const target = new THREE.Vector3(0, 0, 0);
  let isPointerDown = false;
  let startX = 0, startY = 0;
  const spherical = { radius: camera.position.distanceTo(target), theta: 0, phi: Math.PI / 4 };
  // initialize theta/phi from camera
  (function initSpherical() {
    const v = camera.position.clone().sub(target);
    spherical.radius = v.length();
    spherical.theta = Math.atan2(v.x, v.z);
    spherical.phi = Math.acos(THREE.MathUtils.clamp(v.y / spherical.radius, -1, 1));
  })();

  function updateCamera() {
    // clamp phi
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.1, Math.PI - 0.1);
    spherical.radius = Math.max(1.5, Math.min(120, spherical.radius));
    const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    const y = spherical.radius * Math.cos(spherical.phi);
    const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.position.set(x + target.x, y + target.y, z + target.z);
    camera.lookAt(target);
  }

  function onPointerDown(e) {
    isPointerDown = true;
    startX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    startY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
    domElement.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!isPointerDown) return;
    const x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
    const y = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
    const dx = (x - startX) * 0.005; // sensitivity
    const dy = (y - startY) * 0.005;
    startX = x; startY = y;
    spherical.theta -= dx;
    spherical.phi -= dy;
    updateCamera();
  }

  function onPointerUp() {
    isPointerDown = false;
    domElement.style.cursor = 'default';
  }

  let lastTouchDist = null;
  function getTouchDistance(touches) {
    if (!touches || touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY || e.wheelDelta;
    spherical.radius += delta * 0.01; // zoom sensitivity
    updateCamera();
  }

  function onTouchStart(e) {
    if (e.touches && e.touches.length === 1) onPointerDown(e.touches[0]);
    if (e.touches && e.touches.length === 2) {
      lastTouchDist = getTouchDistance(e.touches);
    }
  }

  function onTouchMove(e) {
    if (e.touches && e.touches.length === 1) onPointerMove(e.touches[0]);
    if (e.touches && e.touches.length === 2) {
      const d = getTouchDistance(e.touches);
      if (lastTouchDist) {
        const diff = lastTouchDist - d;
        spherical.radius += diff * 0.02;
        updateCamera();
      }
      lastTouchDist = d;
    }
  }

  function onTouchEnd(e) {
    if (!e.touches || e.touches.length === 0) onPointerUp();
    if (e.touches && e.touches.length < 2) lastTouchDist = null;
  }

  // attach listeners
  domElement.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  domElement.addEventListener('wheel', onWheel, { passive: false });
  domElement.addEventListener('touchstart', onTouchStart, { passive: true });
  domElement.addEventListener('touchmove', onTouchMove, { passive: true });
  domElement.addEventListener('touchend', onTouchEnd, { passive: true });

  // return simple controls object
  return {
    update: function() {
      // no-op here because we update camera immediately on input
    },
    dispose: function() {
      try {
        domElement.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        domElement.removeEventListener('wheel', onWheel);
        domElement.removeEventListener('touchstart', onTouchStart);
        domElement.removeEventListener('touchmove', onTouchMove);
        domElement.removeEventListener('touchend', onTouchEnd);
      } catch (e) {
        console.warn('[galaxy] simpleControls dispose warning', e);
      }
    }
  };
}

// global error catcher to help debugging when page shows black
window.addEventListener('error', (ev) => {
  console.error('[galaxy] window error:', ev.message || ev.error || ev);
});

function createGalaxy() {
  // dispose previous
  if (galaxy) {
    galaxy.geometry.dispose();
    galaxy.material.dispose();
    scene.remove(galaxy);
    galaxy = null;
  }
  console.log('[galaxy] createGalaxy start — count=', params.count, 'branches=', params.branches);
  // protect count to reasonable max
  const MAX_COUNT = 50000;
  const count = Math.min(Number(params.count) || 0, MAX_COUNT);
  if (count <= 0) {
    console.warn('[galaxy] invalid count, aborting createGalaxy');
    return;
  }

  try {
    const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

    const colorInside = new THREE.Color(params.insideColor);
    const colorOutside = new THREE.Color(params.outsideColor);

  for (let i = 0; i < count; i++) {
    const radius = Math.pow(Math.random(), 0.7) * 10; // bias towards center
    const spinAngle = radius * 1.5;
    const branchAngle = ((i % params.branches) / params.branches) * Math.PI * 2;

    const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1);
    const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 0.3;
    const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1);

    positions[i * 3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
    positions[i * 3 + 1] = randomY;
    positions[i * 3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    const mixedColor = colorInside.clone();
    mixedColor.lerp(colorOutside, radius / 10);
    colors[i * 3] = mixedColor.r;
    colors[i * 3 + 1] = mixedColor.g;
    colors[i * 3 + 2] = mixedColor.b;
  }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: params.size,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    galaxy = new THREE.Points(geometry, material);
    scene.add(galaxy);
    console.log('[galaxy] created — points:', count);
  } catch (err) {
    console.error('[galaxy] createGalaxy error:', err);
    // try to recover by creating a small fallback galaxy
    try {
      params.count = 2000;
      const geometry = new THREE.BufferGeometry();
      const fallbackCount = 2000;
      const positions = new Float32Array(fallbackCount * 3);
      const colors = new Float32Array(fallbackCount * 3);
      const colorInside = new THREE.Color(params.insideColor);
      const colorOutside = new THREE.Color(params.outsideColor);
      for (let i = 0; i < fallbackCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 10;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
        const mixed = colorInside.clone().lerp(colorOutside, Math.random());
        colors[i * 3] = mixed.r;
        colors[i * 3 + 1] = mixed.g;
        colors[i * 3 + 2] = mixed.b;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const material = new THREE.PointsMaterial({ size: params.size, vertexColors: true });
      galaxy = new THREE.Points(geometry, material);
      scene.add(galaxy);
      console.log('[galaxy] fallback created');
    } catch (err2) {
      console.error('[galaxy] fallback creation failed', err2);
    }
  }
}

// planets helpers
function createPlanets() {
  // if planets already exist, remove them first
  for (const p of planets) {
    if (p.mesh) {
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      scene.remove(p.mesh);
    }
    if (p.orbitLine) {
      p.orbitLine.geometry.dispose();
      p.orbitLine.material.dispose();
      scene.remove(p.orbitLine);
    }
  }
  planets = [];

  // define a few planets with different radii, sizes and colors
  const defs = [
    { distance: 4, size: 0.45, color: 0x8fb6ff, speed: 0.6 },
    { distance: 6.5, size: 0.62, color: 0xffc28f, speed: 0.45 },
    { distance: 9.5, size: 1.0, color: 0xaade6a, speed: 0.28 },
    { distance: 13, size: 1.6, color: 0xd9d9d9, speed: 0.18 }
  ];

  // texture loader (uses public three.js example textures)
  const loader = new THREE.TextureLoader();

  // helper to create a realistic planet with layers
  function createPlanet(opts) {
    const {
      name = 'planet',
      radius = 1,
      distance = 5,
      rotationSpeed = 0.3,
      tilt = 0,
      mapUrl = null,
      normalUrl = null,
      specularUrl = null,
      emissiveUrl = null,
      cloudUrl = null,
      ringUrl = null
    } = opts;

    // placeholder material until textures load
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 1.0, metalness: 0.0 });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 48), baseMat);
    sphere.userData = { tilt: tilt, selfSpeed: rotationSpeed };
    sphere.name = name;

    // position
    const angle = Math.random() * Math.PI * 2;
    sphere.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);

    // clouds
    let clouds = null;
    if (cloudUrl) {
      const cloudGeo = new THREE.SphereGeometry(radius * 1.02, 48, 48);
      const cloudMat = new THREE.MeshPhongMaterial({ map: null, transparent: true, opacity: 0.85, depthWrite: false, depthTest: true });
      clouds = new THREE.Mesh(cloudGeo, cloudMat);
      clouds.renderOrder = 2;
      sphere.add(clouds);
    }

    // ring
    let ring = null;
    if (ringUrl) {
      const ringTexture = loader.load(ringUrl, () => {}, undefined, () => {});
      const inner = radius * 1.3;
      const outer = radius * 3.0;
      const ringGeo = new THREE.RingGeometry(inner, outer, 128);
      const ringMat = new THREE.MeshBasicMaterial({ map: ringTexture, side: THREE.DoubleSide, transparent: true });
      ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0, 0);
      sphere.add(ring);
    }

    // load maps async and update material (with fault tolerance)
    if (mapUrl) loader.load(mapUrl, (mapTex) => { baseMat.map = mapTex; baseMat.needsUpdate = true; }, undefined, () => { /* ignore */ });
    if (normalUrl) loader.load(normalUrl, (n) => { baseMat.normalMap = n; baseMat.normalScale = new THREE.Vector2(1,1); baseMat.needsUpdate = true; }, undefined, () => {});
    if (specularUrl) loader.load(specularUrl, (s) => { baseMat.roughness = 0.6; baseMat.metalness = 0.0; baseMat.needsUpdate = true; }, undefined, () => {});
    if (emissiveUrl) loader.load(emissiveUrl, (eMap) => { baseMat.emissiveMap = eMap; baseMat.emissive = new THREE.Color(0xffffff); baseMat.emissiveIntensity = 0.6; baseMat.needsUpdate = true; }, undefined, () => {});
    if (cloudUrl && clouds) loader.load(cloudUrl, (c) => { clouds.material.map = c; clouds.material.opacity = 0.85; clouds.material.needsUpdate = true; }, undefined, () => {});

    // tweak material defaults for more realistic appearance based on name hints
    if (/Mars/i.test(name)) {
      baseMat.roughness = 0.95; baseMat.metalness = 0.0; baseMat.bumpScale = 0.02;
    } else if (/Venus/i.test(name)) {
      baseMat.roughness = 0.9; baseMat.metalness = 0.0; // mostly cloudy smooth
    } else if (/Saturn/i.test(name)) {
      baseMat.roughness = 0.7; baseMat.metalness = 0.0;
    } else if (/Earth/i.test(name)) {
      baseMat.roughness = 0.7; baseMat.metalness = 0.0;
    }

    scene.add(sphere);

    // orbit line
    const orbitPts = [];
    for (let j = 0; j < 128; j++) orbitPts.push(new THREE.Vector3(Math.cos((j / 128) * Math.PI * 2) * distance, 0, Math.sin((j / 128) * Math.PI * 2) * distance));
  const lineMat = new THREE.LineBasicMaterial({ color: orbitStyle.color, transparent: true, opacity: 0.25, linewidth: orbitStyle.width });
  const orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orbitPts), lineMat);
    scene.add(orbitLine);

    return { mesh: sphere, clouds, ring, distance, speed: rotationSpeed, angle, orbitLine };
  }

  // base URL for three.js example planet textures (public)
  const base = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/';

  // Earth-like
  planets.push(createPlanet({ name: 'Earth', radius: 1, distance: 4, rotationSpeed: 0.6, tilt: 0.41,
    mapUrl: base + 'earth_atmos_2048.jpg', normalUrl: base + 'earth_normal_2048.jpg', specularUrl: base + 'earth_specular_2048.jpg', emissiveUrl: base + 'earth_lights_2048.png', cloudUrl: base + 'earth_clouds_1024.png' }));

  // Mars-like
  planets.push(createPlanet({ name: 'Mars', radius: 0.8, distance: 6.6, rotationSpeed: 0.45, tilt: 0.36,
    mapUrl: base + 'mars_1024.jpg', normalUrl: null, specularUrl: null, emissiveUrl: null, cloudUrl: null }));

  // Venus-like (smooth)
  planets.push(createPlanet({ name: 'Venus', radius: 1.0, distance: 9.5, rotationSpeed: 0.28, tilt: 0.02,
    mapUrl: base + 'venus_surface.jpg', normalUrl: null, specularUrl: null, emissiveUrl: null, cloudUrl: base + 'venus_clouds.png' }));

  // Saturn-like with ring
  planets.push(createPlanet({ name: 'Saturn', radius: 1.6, distance: 13, rotationSpeed: 0.18, tilt: 0.2,
    mapUrl: base + 'saturn.jpg', normalUrl: null, specularUrl: null, emissiveUrl: null, cloudUrl: null, ringUrl: base + 'saturn_ring.png' }));

  // adjust planets array angles etc are already set by createPlanet
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Create a very simple test scene (cube + light) so user can tell rendering is working
function createFallbackTestScene() {
  try {
    // avoid duplicating
    if (scene.getObjectByName && scene.getObjectByName('__fallback_cube')) return;
    // small ambient + directional light
    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    amb.name = '__fallback_amb';
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    dir.name = '__fallback_dir';
    scene.add(dir);

    const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const mat = new THREE.MeshStandardMaterial({ color: 0x44aa88 });
    const cube = new THREE.Mesh(geo, mat);
    cube.name = '__fallback_cube';
    cube.position.set(0, 1, 0);
    scene.add(cube);

    // reposition camera to see it clearly
    try { camera.position.set(0, 3.5, 8); camera.lookAt(0, 0, 0); } catch (e) {}

    // rotate cube gently to show animation
    const fallbackAnim = () => {
      try {
        if (!scene.getObjectByName('__fallback_cube')) return;
        const o = scene.getObjectByName('__fallback_cube');
        o.rotation.x += 0.01;
        o.rotation.y += 0.013;
      } catch (e) {}
      requestAnimationFrame(fallbackAnim);
    };
    fallbackAnim();
  } catch (e) {
    console.error('[galaxy] createFallbackTestScene error', e);
  }
}

function animate() {
  if (!running) return;
  try {
    // runtime check: WebGL context availability
    try {
      if (!renderer || typeof renderer.getContext !== 'function' || !renderer.getContext()) {
        console.error('[galaxy] animate: WebGL context missing or lost');
        showToast('警告：WebGL context 遺失或無法使用，嘗試建立測試物件以驗證渲染', 6000);
        createFallbackTestScene();
      }
    } catch (cx) {
      console.warn('[galaxy] animate context-check error', cx);
    }
    requestAnimationFrame(animate);
    const delta = clock ? clock.getDelta() : 0.016;
    if (rotationEnabled && galaxy) galaxy.rotation.y += 0.2 * delta * rotationSpeed;
    // animate planets (only when rotationEnabled)
    if (rotationEnabled) {
      for (const p of planets) {
        // orbit
        p.angle += p.speed * delta;
        const x = Math.cos(p.angle) * p.distance;
        const z = Math.sin(p.angle) * p.distance;
        if (p.mesh) p.mesh.position.set(x, 0, z);
        // self rotation and tilt
        if (p.mesh && p.mesh.userData) {
          p.mesh.rotation.y += (p.mesh.userData.selfSpeed || 0.2) * delta;
          p.mesh.rotation.x = p.mesh.userData.tilt || 0;
        }
        // rotate clouds if present
        if (p.clouds) p.clouds.rotation.y += 0.25 * delta * (p.clouds.userDataSpeed || 1.0);
        // slowly rotate rings if present
        if (p.ring) p.ring.rotation.z += 0.02 * delta;
      }
    }

    // gentle pulsate sun emissive
    if (sun && sun.material) {
      const t = performance.now() * 0.001;
      if (typeof sun.material.emissiveIntensity !== 'undefined') {
        sun.material.emissiveIntensity = 1.2 + Math.sin(t * 1.2) * 0.15;
      }
    }

    if (controls && typeof controls.update === 'function') controls.update();
    if (!renderer || !camera) throw new Error('renderer or camera missing');
    renderer.render(scene, camera);
  } catch (err) {
    console.error('[galaxy] animate error', err);
    showOverlay('運行時發生錯誤：' + (err.message || err));
    running = false;
  }
}

// Public control functions
function toggleRotation() {
  rotationEnabled = !rotationEnabled;
}

function setRotationSpeed(v) { rotationSpeed = Number(v) || 0; }

function setColors(insideHex, outsideHex) {
  params.insideColor = insideHex || params.insideColor;
  params.outsideColor = outsideHex || params.outsideColor;
}

function rebuildGalaxy(options = {}) {
  params.count = options.count || params.count;
  params.branches = options.branches || params.branches;
  if (options.insideColor) params.insideColor = options.insideColor;
  if (options.outsideColor) params.outsideColor = options.outsideColor;
  // recreate geometry
  createGalaxy();
}

// set orbit style (color: hex string or number, width: number)
function setOrbitStyle(color, width) {
  try {
    if (!color && typeof width === 'undefined') return;
    if (color) {
      if (typeof color === 'string') orbitStyle.color = parseInt(color.replace('#','0x'), 16);
      else orbitStyle.color = Number(color);
    }
    if (typeof width !== 'undefined') orbitStyle.width = Number(width) || 1;
    // rebuild orbit meshes (use torus meshes) so width and color are visible cross-browser
    for (const p of planets) {
      try {
        // remove old orbit
        if (p.orbitLine) {
          scene.remove(p.orbitLine);
          try { p.orbitLine.geometry.dispose(); p.orbitLine.material.dispose(); } catch (e) {}
          p.orbitLine = null;
        }
        // create new torus orbit mesh
        const tube = Math.max(0.02, orbitStyle.width * 0.03);
        const radialSeg = 256;
        const tubularSeg = 12;
        const geo = new THREE.TorusGeometry(p.distance, tube, tubularSeg, radialSeg);
        const mat = new THREE.MeshBasicMaterial({ color: orbitStyle.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        scene.add(mesh);
        p.orbitLine = mesh;
      } catch (e) {
        console.warn('[galaxy] setOrbitStyle: failed to recreate orbit for planet', e);
      }
    }
    console.log('[galaxy] setOrbitStyle ->', orbitStyle);
  } catch (e) {
    console.warn('[galaxy] setOrbitStyle failed', e);
  }
}

window.setOrbitStyle = setOrbitStyle;

function resetView() {
  if (controls) controls.reset();
}

// expose functions to window for UI binding
window.toggleRotation = toggleRotation;
window.setRotationSpeed = setRotationSpeed;
window.setColors = setColors;
window.rebuildGalaxy = rebuildGalaxy;
window.resetView = resetView;

// init
init();
