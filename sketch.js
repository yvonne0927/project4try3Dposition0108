// =====================
// iPhone camera start UI
// =====================
let startBtn;
let camStarted = false;

let cam;
let cvReady = false;

let modelStatus = "not started";
let modelError = "";
let loadedCount = 0;
let totalCount = 0;


// Tracking (A/B stable boxes)
// =====================
let trackA = null;
let trackB = null;

let spawn3D = new THREE.Vector3(0, 0, 0);
const SPAWN_SMOOTH = 0.2; // 越小越稳

const SMOOTH = 0.25;
const TEXTURE_MAX = 1200;

// =====================
// OpenCV init
// =====================
(function waitForCvAndInit() {
  const t = setInterval(() => {
    if (window.cv) {
      clearInterval(t);

      window.cv.onRuntimeInitialized = () => {
        console.log("✅ OpenCV initialized");
        cvReady = true;
      };

      // 兜底：有的构建会直接可用
      if (window.cv.Mat) {
        console.log("✅ OpenCV already ready");
        cvReady = true;
      }
    }
  }, 50);
})();

// =====================
// Three.js overlay
// =====================
let three = {
  scene: null,
  camera: null,
  renderer: null,
  root: null,
  models: {},
  current: null,
  ready: false
};

function initThreeOverlay() {
  const w = windowWidth;
  const h = windowHeight;

  // 防止重复创建 renderer（热重载/重复调用）
  if (three.renderer) return;

  three.scene = new THREE.Scene();
  three.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
  three.camera.position.set(0, 0, 2.2);

  three.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  three.renderer.setSize(w, h);
  three.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  three.renderer.domElement.style.position = "fixed";
  three.renderer.domElement.style.left = "0";
  three.renderer.domElement.style.top = "0";
  three.renderer.domElement.style.zIndex = "5";
  three.renderer.domElement.style.pointerEvents = "none";
  document.body.appendChild(three.renderer.domElement);

three.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
// y=0 的水平地面：法线(0,1,0)，常数0


  // lights
  three.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(1, 2, 3);
  three.scene.add(dir);

  three.root = new THREE.Group();
  three.scene.add(three.root);

  three.ready = true;
}

function loadAllModels() {
  const manager = new THREE.LoadingManager();
  manager.onStart = () => { modelStatus = "loading..."; };
  manager.onLoad  = () => { modelStatus = "all loaded ✅"; };
  manager.onError = (url) => { modelStatus = "load error ❌"; modelError = `fail: ${url}`; };

  const loader = new THREE.GLTFLoader(manager);
  // 有些 iOS 情况下加这个更稳
  loader.setCrossOrigin("anonymous");

  const files = {
    Tendril:      "models/tendril.glb",
    Jelly:        "models/jelly.glb",
    SporeCloud:   "models/spore.glb",
    CrystalShell: "models/crystal.glb",
    GlyphLight:   "models/glyph.glb"
  };

  const keys = Object.keys(files);
  totalCount = keys.length;
  loadedCount = 0;

  keys.forEach((key) => {
    loader.load(
      files[key],
      (gltf) => {
        const obj = gltf.scene;
        obj.visible = false;
        obj.scale.set(0.6, 0.6, 0.6);
        obj.userData._materialCloned = false;

        three.models[key] = obj;
        three.root.add(obj);

        loadedCount++;
        modelStatus = `loaded ${loadedCount}/${totalCount}`;

        if (!three.current) setActiveModel(key);
      },
      undefined,
      (err) => {
        modelStatus = "load error ❌";
        modelError = `${key}: ${err?.message || err}`;
        console.error("❌ load error", key, err);
      }
    );
  });
}


function setActiveModel(name) {
  const m = three.models[name];
  if (!m) return;

  if (three.current) three.current.visible = false;
  three.current = m;
  three.current.visible = true;
}

// =====================
// p5 setup / draw
// =====================
function setup() {
  createCanvas(windowWidth, windowHeight);

// ✅ 让 p5 的线框/UI 永远在最上面
const c = document.querySelector("canvas");
c.style.position = "fixed";
c.style.left = "0";
c.style.top = "0";
c.style.zIndex = "10";       // ✅ p5 在上面
c.style.pointerEvents = "none"; // 可选：不挡触控

  // Three init + load models
 // initThreeOverlay();
 // loadAllModels();

  // Start Camera button
  startBtn = createButton("Start Camera");
  startBtn.position(20, 20);
  startBtn.size(160, 44);
  startBtn.mousePressed(startCamera);
}

function startCamera() {
  if (camStarted) return;
  camStarted = true;

  cam = createCapture({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  }, () => console.log("✅ camera callback"));

  cam.size(640, 480);

cam.elt.setAttribute("playsinline", "");
cam.elt.setAttribute("webkit-playsinline", "");
cam.elt.muted = true;

// ✅把 video 铺满屏幕，放在最底层
cam.elt.style.position = "fixed";
cam.elt.style.left = "0";
cam.elt.style.top = "0";
cam.elt.style.width = "100vw";
cam.elt.style.height = "100vh";
cam.elt.style.objectFit = "cover";
cam.elt.style.zIndex = "0";


  startBtn.hide();
}

function draw() {
  clear(); // ✅透明清屏，p5 只画UI，不遮挡 three

  // ✅ 延迟初始化 Three：避免一加载就报错导致黑屏
if (camStarted && !three.renderer) {
  console.log("✅ init three now");
  initThreeOverlay();
  loadAllModels();
}
fill(255);
textSize(14);
text(`three ready: ${!!three.renderer}`, 20, 50);
text(`model loaded: ${Object.keys(three.models).length}`, 20, 70);


  //background(0);

  if (!camStarted || !cam) {
    fill(255);
    textSize(16);
    text("Tap 'Start Camera' to begin", 20, 90);
    // 只渲染 three（也可不渲）
    if (three.ready) three.renderer.render(three.scene, three.camera);
    return;
  }

  //drawCameraCover(cam);

  // Scan box
const boxSize = Math.floor(Math.min(width, height) * 0.85);
const bx = Math.floor((width - boxSize) / 2);
const by = Math.floor((height - boxSize) / 2);


  noFill();
  stroke(0, 255, 0);
  rect(bx, by, boxSize, boxSize);

  fill(255);
  noStroke();
  textSize(16);
  text(`cvReady: ${cvReady}`, 20, 20);

  if (!cvReady) {
    if (three.ready) three.renderer.render(three.scene, three.camera);
    return;
  }

 // ✅ ROI 真实识别尺寸：限制在 cam 内（不要跟 boxSize 一样大）
const roiSize = Math.min(320, cam.width, cam.height); // 你也可以试 240/280/320

// ✅ ROI 永远取 cam 中心（稳定）
const roi = cam.get(
  Math.floor(cam.width / 2 - roiSize / 2),
  Math.floor(cam.height / 2 - roiSize / 2),
  roiSize,
  roiSize
);


  image(roi, 20, height - 140, 120, 120);

  // A) ROI features for UI
  const roiFeats = extractFeaturesFromP5Image(roi);
  const resultROI = classifyOrganism(
    roiFeats.warmth,
    roiFeats.brightness,
    roiFeats.straightness,
    roiFeats.smoothness
  );

  // B) find top2 rects in ROI
  const src = cv.imread(roi.canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const edges = new cv.Mat();
  cv.Canny(gray, edges, 50, 150);

  // Step1: morphology close
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
  kernel.delete();

  const edgePixels = cv.countNonZero(edges);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const edgesCopy = edges.clone();

  cv.findContours(edgesCopy, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let rects = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const r = cv.boundingRect(cnt);
    const area = r.width * r.height;
    if (area > 300) rects.push({ rect: r, area });
    cnt.delete();
  }

  rects.sort((a, b) => b.area - a.area);

  // IoU non-overlap pick
  let topRects = pickTopRectsNonOverlapping(rects.map(o => o.rect), 2, 0.35);
  // center de-dup
  topRects = filterDuplicateRects(topRects, 22);

  edgesCopy.delete();
  contours.delete();
  hierarchy.delete();

  // Step2/3: assign + smooth
  const assigned = assignToTracks(topRects, trackA, trackB);
  trackA = smoothRect(trackA, assigned.A, SMOOTH);
  trackB = smoothRect(trackB, assigned.B, SMOOTH);

  // C) stable rects -> objects
  let objects = [];
  const stableRects = [];
  if (trackA) stableRects.push(trackA);
  if (trackB) stableRects.push(trackB);

  for (let i = 0; i < stableRects.length; i++) {
    const r = stableRects[i];

    const rx = clampInt(r.x, 0, roi.width - 1);
    const ry = clampInt(r.y, 0, roi.height - 1);
    const rw = clampInt(r.width, 1, roi.width - rx);
    const rh = clampInt(r.height, 1, roi.height - ry);

    const sub = roi.get(rx, ry, rw, rh);
    const feats = extractFeaturesFromP5Image(sub);
    const res = classifyOrganism(feats.warmth, feats.brightness, feats.straightness, feats.smoothness);

    objects.push({
      rect: { x: rx, y: ry, width: rw, height: rh },
      organism: res.organism,
      confidence: res.confidence,
      score: res.score,
      feats
    });
  }

  // =========================
  // D) UI panel（更小字 + 更靠左 + 背景自适应宽度）
  // =========================
  const uiX = 12;      // 更靠左
  const uiY = 12;
  const pad = 10;      // 内边距
  const fontSize = 12; // ✅ 字变小（你也可以试 13）
  const lineH = 16;    // 行距

  textSize(fontSize);
  textFont("monospace"); // 可选：更像调试UI
  noStroke();

  const uiLines = [
    `cvReady: ${cvReady}`,
    `edgePixels(ROI): ${edgePixels}`,
    `warmth (R-B): ${roiFeats.warmth.toFixed(1)}`,
    `brightness: ${roiFeats.brightness.toFixed(2)}`,
    `straightness: ${roiFeats.straightness.toFixed(2)} (lines: ${roiFeats.lineCount})`,
    `texture: ${roiFeats.texture.toFixed(2)}  smoothness: ${roiFeats.smoothness.toFixed(2)}`,
    `ROI organism: ${resultROI.organism}`,
    `ROI confidence: ${resultROI.confidence.toFixed(2)}`,
    `Tendril: ${resultROI.score.Tendril.toFixed(2)}`,
    `Glyph:   ${resultROI.score.GlyphLight.toFixed(2)}`,
    `Crystal: ${resultROI.score.CrystalShell.toFixed(2)}`,
    `Jelly:   ${resultROI.score.Jelly.toFixed(2)}`,
    `Spore:   ${resultROI.score.SporeCloud.toFixed(2)}`
  ];

  // ✅ 背景宽度=最长字符串宽度+padding（不会再过宽）
  let maxW = 0;
  for (const s of uiLines) maxW = Math.max(maxW, textWidth(s));
  const panelW = maxW + pad * 2;
  const panelH = uiLines.length * lineH + pad * 2;

  fill(0, 140); // 半透明背景
  rect(uiX, uiY, panelW, panelH, 10);

  fill(255);
  let ty = uiY + pad + lineH - 4;
  for (const s of uiLines) {
    text(s, uiX + pad, ty);
    ty += lineH;
  }

  // E) draw boxes
  const scaleX = boxSize / roi.width;
  const scaleY = boxSize / roi.height;

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const r = obj.rect;

    const sx = bx + r.x * scaleX;
    const sy = by + r.y * scaleY;
    const sw = r.width * scaleX;
    const sh = r.height * scaleY;

    noFill();
    stroke(255, 0, 255);
    strokeWeight(2);
    rect(sx, sy, sw, sh);

    noStroke();
    fill(255, 0, 255);
    textSize(14);
    const label = (i === 0) ? "A" : "B";
    text(`${label}: ${obj.organism}`, sx, sy - 8);
  }

// F) Apply model + material + spawn point (use A)
if (three.ready && objects.length > 0) {
  const main = objects[0];
  setActiveModel(main.organism);

  if (three.current) {
    // ① 材质
    const app = makeAppearance(main.feats, main.organism);
    applyAppearanceToModel(three.current, app);

    // ② 取 A 框中心（ROI 内坐标）
    const cx = main.rect.x + main.rect.width / 2;
    const cy = main.rect.y + main.rect.height / 2;

    // ③ ROI -> 绿色扫描框(屏幕) 坐标
    //    你现在 ROI 的真实尺寸是 roiSize（不是 boxSize）
    const sx = bx + (cx / roiSize) * boxSize;
    const sy = by + (cy / roiSize) * boxSize;

    // ④ 屏幕点 -> 3D 地面点
    const hit = screenToGround(sx, sy);

    // ⑤ 平滑 + 放置模型
    if (hit) {
      spawn3D.lerp(hit, SPAWN_SMOOTH);

      // ✅ 轻微抬起一点，避免“埋进地面”
      three.current.position.set(spawn3D.x, spawn3D.y + 0.05, spawn3D.z);
    }

    // 让它慢慢转（方便你确认它在动）
    three.current.rotation.y += 0.01;
  }
}


  // Render three
  if (three.ready) three.renderer.render(three.scene, three.camera);

  // cleanup OpenCV mats
  src.delete();
  gray.delete();
  edges.delete();

  // 在 draw() 的末尾添加
fill(255, 0, 0);
textSize(20);
if (three.current) {
    let pos = three.current.position;
    text(`Model: ${three.current.visible ? 'Visible' : 'Hidden'}`, 20, 120);
    text(`Pos: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`, 20, 140);
} else {
    text("No Active Model", 20, 120);
}
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (three.renderer && three.camera) {
    three.renderer.setSize(windowWidth, windowHeight);
    three.camera.aspect = windowWidth / windowHeight;
    three.camera.updateProjectionMatrix();
  }
}

// =====================
// Helpers: camera cover
// =====================
function drawCameraCover(video) {
  const vw = video.width;
  const vh = video.height;
  if (!vw || !vh) return;

  const canvasRatio = width / height;
  const videoRatio = vw / vh;

  let drawW, drawH;
  if (videoRatio > canvasRatio) {
    drawH = height;
    drawW = height * videoRatio;
  } else {
    drawW = width;
    drawH = width / videoRatio;
  }

  const x = (width - drawW) / 2;
  const y = (height - drawH) / 2;
  image(video, x, y, drawW, drawH);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v | 0));
}

// =====================
// Rect utilities
// =====================
function rectCenter(r) {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}
function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function filterDuplicateRects(rects, thresholdPx) {
  const t2 = thresholdPx * thresholdPx;
  let out = [];
  for (const r of rects) {
    let keep = true;
    for (const rr of out) {
      if (dist2(rectCenter(r), rectCenter(rr)) < t2) {
        keep = false;
        break;
      }
    }
    if (keep) out.push(r);
  }
  return out;
}

function rectIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  const inter = w * h;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;

  if (union <= 0) return 0;
  return inter / union;
}

function pickTopRectsNonOverlapping(rects, k = 2, iouTh = 0.35) {
  const picked = [];
  for (const r of rects) {
    let ok = true;
    for (const p of picked) {
      if (rectIoU(r, p) > iouTh) {
        ok = false;
        break;
      }
    }
    if (ok) picked.push(r);
    if (picked.length >= k) break;
  }
  return picked;
}

// =====================
// Step2: assign to tracks
// =====================
function assignToTracks(rects, prevA, prevB) {
  if (rects.length === 0) return { A: null, B: null };

  if (rects.length === 1) {
    const r = rects[0];

    if (!prevA && !prevB) return { A: r, B: null };
    if (prevA && !prevB) return { A: r, B: null };
    if (!prevA && prevB) return { A: null, B: r };

    const c = rectCenter(r);
    const da = dist2(c, rectCenter(prevA));
    const db = dist2(c, rectCenter(prevB));
    return (da <= db) ? { A: r, B: null } : { A: null, B: r };
  }

  const r0 = rects[0], r1 = rects[1];

  if (!prevA && !prevB) return { A: r0, B: r1 };

  const c0 = rectCenter(r0);
  const c1 = rectCenter(r1);

  const a = prevA ? rectCenter(prevA) : null;
  const b = prevB ? rectCenter(prevB) : null;

  const cost01 = (a ? dist2(c0, a) : 0) + (b ? dist2(c1, b) : 0);
  const cost10 = (a ? dist2(c1, a) : 0) + (b ? dist2(c0, b) : 0);

  return (cost01 <= cost10) ? { A: r0, B: r1 } : { A: r1, B: r0 };
}

// Step3: EMA smoothing
function smoothRect(prev, curr, alpha = 0.25) {
  if (!curr) return null;
  if (!prev) return { ...curr };

  return {
    x: prev.x + (curr.x - prev.x) * alpha,
    y: prev.y + (curr.y - prev.y) * alpha,
    width: prev.width + (curr.width - prev.width) * alpha,
    height: prev.height + (curr.height - prev.height) * alpha
  };
}

// =====================
// Feature extraction
// =====================
function extractFeaturesFromP5Image(img) {
  img.loadPixels();

  let rSum = 0, gSum = 0, bSum = 0;
  const total = img.width * img.height;

  for (let i = 0; i < img.pixels.length; i += 4) {
    rSum += img.pixels[i];
    gSum += img.pixels[i + 1];
    bSum += img.pixels[i + 2];
  }

  const rAvg = rSum / total;
  const gAvg = gSum / total;
  const bAvg = bSum / total;

  const warmth = rAvg - bAvg;
  const brightness = (0.299 * rAvg + 0.587 * gAvg + 0.114 * bAvg) / 255.0;

  const src = cv.imread(img.canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const edges = new cv.Mat();
  cv.Canny(gray, edges, 50, 150);

  const lines = new cv.Mat();
  cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 50, 20, 5);
  const lineCount = lines.rows;
  const straightness = clamp01(lineCount / 30);

  const lap = new cv.Mat();
  cv.Laplacian(gray, lap, cv.CV_64F);

  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(lap, mean, stddev);

  const textureVar = stddev.doubleAt(0, 0) * stddev.doubleAt(0, 0);
  const texture = clamp01(textureVar / TEXTURE_MAX);
  const smoothness = 1 - texture;

  src.delete();
  gray.delete();
  edges.delete();
  lines.delete();
  lap.delete();
  mean.delete();
  stddev.delete();

  return { warmth, brightness, straightness, texture, smoothness, lineCount };
}

// =====================
// Organism classification
// =====================
function classifyOrganism(warmth, brightness, straightness, smoothness) {
  const W = clamp01((warmth + 60) / 120);
  const B = clamp01(brightness);
  const S = clamp01(straightness);
  const M = clamp01(smoothness);

  const score = {
    Tendril:      0.55 * W     + 0.25 * (1 - S) + 0.20 * (1 - M),
    GlyphLight:   0.55 * (1-W) + 0.35 * S       + 0.10 * B,
    CrystalShell: 0.45 * (1-W) + 0.35 * M       + 0.20 * B,
    Jelly:        0.45 * M     + 0.35 * (1 - S) + 0.20 * (1 - B),
    SporeCloud:   0.50 * (1-B) + 0.30 * (1 - M) + 0.20 * (1 - S),
  };

  let bestName = "Tendril";
  let bestScore = -1;
  let secondScore = -1;

  for (const [name, sc] of Object.entries(score)) {
    if (sc > bestScore) {
      secondScore = bestScore;
      bestScore = sc;
      bestName = name;
    } else if (sc > secondScore) {
      secondScore = sc;
    }
  }

  const confidence = clamp01((bestScore - secondScore) / 0.6);
  return { organism: bestName, confidence, score };
}

// =====================
// Material mapping + apply
// =====================
function normWarmth(warmthRB) {
  return clamp01((warmthRB + 60) / 120);
}

function lerpRGB(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

function makeAppearance(feats, organism) {
  const W = normWarmth(feats.warmth);
  const B = clamp01(feats.brightness);
  const S = clamp01(feats.straightness);
  const M = clamp01(feats.smoothness);

  const cold = { r: 130, g: 170, b: 255 };
  const warm = { r: 180, g: 255, b: 170 };

  const base = lerpRGB(cold, warm, W);
  const base2 = lerpRGB({ r: 0, g: 0, b: 0 }, base, 0.35 + 0.65 * B);

  let opacity = clamp01(0.35 + 0.55 * M);
  let roughness = clamp01(0.85 - 0.75 * M);
  let metalness = clamp01((1 - W) * 0.5 + S * 0.3 + M * 0.3);
  let emissiveStrength = clamp01(0.15 + 0.55 * (1 - W) + 0.30 * B);

  if (organism === "Tendril") {
    opacity = clamp01(opacity - 0.25);
    roughness = clamp01(roughness + 0.20);
    metalness = clamp01(metalness - 0.25);
    emissiveStrength = clamp01(emissiveStrength - 0.15);
  }
  if (organism === "Jelly") {
    opacity = clamp01(opacity + 0.20);
    roughness = clamp01(roughness - 0.25);
    metalness = clamp01(metalness - 0.30);
    emissiveStrength = clamp01(emissiveStrength + 0.05);
  }
  if (organism === "SporeCloud") {
    opacity = clamp01(opacity - 0.10);
    roughness = clamp01(roughness + 0.25);
    metalness = clamp01(metalness - 0.35);
    emissiveStrength = clamp01(emissiveStrength - 0.10);
  }
  if (organism === "CrystalShell") {
    opacity = clamp01(opacity + 0.10);
    roughness = clamp01(roughness - 0.35);
    metalness = clamp01(metalness + 0.35);
    emissiveStrength = clamp01(emissiveStrength + 0.25);
  }
  if (organism === "GlyphLight") {
    opacity = clamp01(opacity + 0.05);
    roughness = clamp01(roughness - 0.20);
    metalness = clamp01(metalness + 0.20);
    emissiveStrength = clamp01(emissiveStrength + 0.40);
  }

  return {
    baseColor: base2,
    opacity,
    roughness,
    metalness,
    emissiveColor: base2,
    emissiveStrength
  };
}

function applyAppearanceToModel(model, app) {
  if (!model) return;

  // ✅ 只 clone 一次（否则每帧 clone 会爆内存/卡死）
  if (!model.userData._materialCloned) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });
    model.userData._materialCloned = true;
  }

  model.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.transparent = true;
      child.material.opacity = app.opacity;

      if (child.material.color) {
        child.material.color.setRGB(app.baseColor.r / 255, app.baseColor.g / 255, app.baseColor.b / 255);
      }

      if ("roughness" in child.material) child.material.roughness = app.roughness;
      if ("metalness" in child.material) child.material.metalness = app.metalness;

      if (child.material.emissive) {
        child.material.emissive.setRGB(app.emissiveColor.r / 255, app.emissiveColor.g / 255, app.emissiveColor.b / 255);
        child.material.emissiveIntensity = app.emissiveStrength;
      }

      child.material.needsUpdate = true;
    }
  });
}

function screenToGround(sx, sy) {
  // 1. 确保 ndc 坐标计算准确
  const mouse = new THREE.Vector2();
  mouse.x = (sx / window.innerWidth) * 2 - 1;
  mouse.y = -(sy / window.innerHeight) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, three.camera);

  // 2. 创建一个虚拟的“前方”平面，防止射线射向无穷远
  // 即使没击中 ground 平面，也让模型出现在相机前方 2 个单位处
  const targetPoint = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(three.ground, targetPoint);
  
  if (ok) {
    return targetPoint;
  } else {
    // 兜底方案：如果没算到地面，把模型放在相机正前方
    const fallback = new THREE.Vector3();
    raycaster.ray.at(2, fallback); 
    return fallback;
  }
}
