import * as THREE from 'three';

// Simplex noise (Ashima Arts, MIT) used to gently deform the core.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/**
 * Mounts the hero scene into `container`. Returns a controller with
 * setScroll(progress 0..1) or null when WebGL is unavailable.
 */
export function initHero(container, { reducedMotion = false } = {}) {
  if (!container || !hasWebGL()) return null;

  const isSmall = window.matchMedia('(max-width: 767px)').matches;
  const lowPower = isSmall || (navigator.hardwareConcurrency || 8) <= 4;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const world = new THREE.Group(); // everything that follows the cursor
  scene.add(world);
  const object = new THREE.Group(); // the central sculpture
  world.add(object);

  const teal = new THREE.Color('#5eead4');
  const indigo = new THREE.Color('#7b93ff');
  const violet = new THREE.Color('#c084fc');

  // Core: noise-displaced sphere with fresnel rim light
  const coreUniforms = {
    uTime: { value: 0 },
    uColorA: { value: teal },
    uColorB: { value: indigo },
    uColorC: { value: violet },
    uOpacity: { value: 1 },
  };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.25, lowPower ? 24 : 48),
    new THREE.ShaderMaterial({
      uniforms: coreUniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormal; varying vec3 vView; varying float vNoise;
        ${NOISE}
        void main(){
          float n = snoise(normal * 1.4 + vec3(uTime * 0.18));
          n += 0.5 * snoise(normal * 3.0 - vec3(uTime * 0.12));
          vNoise = n;
          vec3 pos = position + normal * n * 0.16;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC; uniform float uOpacity;
        varying vec3 vNormal; varying vec3 vView; varying float vNoise;
        void main(){
          float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.2);
          vec3 base = mix(uColorB, uColorA, smoothstep(-0.6, 0.8, vNoise));
          base = mix(base, uColorC, smoothstep(0.4, 1.0, vNormal.y * 0.5 + 0.5) * 0.35);
          vec3 col = base * (0.10 + fres * 1.25);
          float alpha = (0.35 + fres * 0.75) * uOpacity;
          gl_FragColor = vec4(col, alpha);
        }`,
    })
  );
  object.add(core);

  // Wireframe shell
  const shellMat = new THREE.LineBasicMaterial({ color: teal, transparent: true, opacity: 0.22 });
  const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)), shellMat);
  object.add(shell);

  // Orbiting shards
  const shardMat = new THREE.LineBasicMaterial({ color: indigo, transparent: true, opacity: 0.45 });
  const shards = [];
  const shardGeo = [
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.22)),
    new THREE.EdgesGeometry(new THREE.TetrahedronGeometry(0.26)),
    new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.16)),
  ];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.LineSegments(shardGeo[i], shardMat);
    s.userData = { r: 2.7 + i * 0.35, speed: 0.12 + i * 0.05, phase: i * 2.1, tilt: 0.4 - i * 0.35 };
    object.add(s);
    shards.push(s);
  }

  // Particle field (capped for performance)
  const count = lowPower ? 500 : 1200;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = 3.5 + Math.random() * 9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
    positions[i * 3 + 2] = r * Math.cos(phi) - 3;
    seeds[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const pUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uOpacity: { value: 1 },
  };
  const particles = new THREE.Points(
    pGeo,
    new THREE.ShaderMaterial({
      uniforms: pUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPixelRatio;
        attribute float aSeed; varying float vAlpha;
        void main(){
          vec3 p = position;
          p.y += sin(uTime * 0.3 + aSeed * 6.28) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (1.4 + aSeed * 2.2) * uPixelRatio * (8.0 / -mv.z);
          vAlpha = 0.25 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 20.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.75, 0.93, 0.95), a * vAlpha * uOpacity);
        }`,
    })
  );
  world.add(particles);

  // Layout: object sits right of the text on wide screens, behind it on narrow ones
  let baseX = 0;
  let baseScale = 1;
  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const wide = w >= 900;
    baseX = wide ? Math.min(3.6, (w / h) * 1.75) : 0;
    baseScale = wide ? 0.95 : 0.8;
    coreUniforms.uOpacity.value = wide ? 1 : 0.38;
    shellMat.opacity = wide ? 0.22 : 0.12;
  }
  resize();
  window.addEventListener('resize', resize);

  // Pointer / device-tilt parallax
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    target.x = Math.max(-1, Math.min(1, e.gamma / 30));
    target.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }, { passive: true });

  // Scroll-driven exit (set from main.js)
  let scroll = 0;

  // Only render while visible
  let visible = true;
  let running = false;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  });
  io.observe(container);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

  const clock = new THREE.Clock();
  let elapsed = 0;

  function frame() {
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    const dt = Math.min(clock.getDelta(), 0.05);
    const speed = reducedMotion ? 0.15 : 1;
    elapsed += dt * speed;

    coreUniforms.uTime.value = elapsed;
    pUniforms.uTime.value = elapsed;

    current.x += (target.x - current.x) * 0.045;
    current.y += (target.y - current.y) * 0.045;

    object.rotation.y = elapsed * 0.12 + current.x * 0.5;
    object.rotation.x = Math.sin(elapsed * 0.2) * 0.12 + current.y * 0.35;
    shell.rotation.z = elapsed * 0.05;

    shards.forEach((s) => {
      const { r, speed: sp, phase, tilt } = s.userData;
      const a = elapsed * sp + phase;
      s.position.set(Math.cos(a) * r, Math.sin(a) * r * tilt, Math.sin(a) * r * 0.6);
      s.rotation.x += dt * 0.4;
      s.rotation.y += dt * 0.3;
    });

    // Depth parallax: the camera drifts opposite the cursor so near and far layers separate
    camera.position.x = current.x * 0.6;
    camera.position.y = -current.y * 0.4;
    camera.lookAt(0, 0, 0);
    particles.rotation.y = elapsed * 0.01 + current.x * 0.08;

    const s = baseScale * (1 - scroll * 0.35);
    object.scale.setScalar(s);
    object.position.set(baseX, scroll * 1.6, 0);
    pUniforms.uOpacity.value = 1 - scroll * 0.7;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }
  start();

  return {
    setScroll(p) {
      scroll = Math.max(0, Math.min(1, p));
    },
  };
}
