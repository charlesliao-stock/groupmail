<script>
// =====================================================
// 遊戲設定
// =====================================================
const LEVELS = [
  { id:1,  name:'🟢 史萊姆',      hp:80,   minAngle:30, color:'#2ecc71', size:80,  boss:false },
  { id:2,  name:'🔵 水精靈',      hp:100,  minAngle:30, color:'#3498db', size:85,  boss:false },
  { id:3,  name:'🟡 沙袋熊',      hp:120,  minAngle:35, color:'#f1c40f', size:90,  boss:false },
  { id:4,  name:'🟠 火蜥蜴',      hp:140,  minAngle:35, color:'#e67e22', size:95,  boss:false },
  { id:5,  name:'🔴 烈焰惡魔',    hp:200,  minAngle:40, color:'#e74c3c', size:120, boss:true  },
  { id:6,  name:'💜 毒霧幽靈',    hp:160,  minAngle:40, color:'#9b59b6', size:95,  boss:false },
  { id:7,  name:'🩵 冰晶巨人',    hp:180,  minAngle:45, color:'#00bcd4', size:100, boss:false },
  { id:8,  name:'🖤 暗影刺客',    hp:200,  minAngle:45, color:'#607d8b', size:100, boss:false },
  { id:9,  name:'🤍 鋼鐵機甲',    hp:220,  minAngle:50, color:'#bdc3c7', size:105, boss:false },
  { id:10, name:'⚡ 雷霆龍王',    hp:350,  minAngle:50, color:'#f39c12', size:140, boss:true  },
  { id:11, name:'🟤 岩石巨獸',    hp:250,  minAngle:50, color:'#795548', size:110, boss:false },
  { id:12, name:'🌿 森林守護者',  hp:280,  minAngle:55, color:'#4caf50', size:110, boss:false },
  { id:13, name:'🌊 深海之神',    hp:300,  minAngle:55, color:'#1565c0', size:115, boss:false },
  { id:14, name:'☄️ 隕石惡靈',    hp:320,  minAngle:55, color:'#ff5722', size:115, boss:false },
  { id:15, name:'👑 終極魔王',    hp:500,  minAngle:60, color:'#ffd700', size:160, boss:true  },
];

// =====================================================
// 狀態
// =====================================================
let currentLevel = 0;
let monsterHP = 0;
let monsterMaxHP = 0;
let score = 0;
let combo = 0;
let lastAttackTime = 0;
let gameRunning = false;
let paused = false;
let sessionStartTime = 0;
let restTimerInterval = null;
let animFrameId = null;

// 怪物動畫狀態
let monsterAnim = { x:0, y:0, bobPhase:0, shakeX:0, hitFlash:0, deathAlpha:1 };
let particles = [];
let attackEffects = [];

// =====================================================
// 畫布設定
// =====================================================
const gameCanvas = document.getElementById('game-canvas');
const gctx = gameCanvas.getContext('2d');
const outputCanvas = document.getElementById('output-canvas');
const octx = outputCanvas.getContext('2d');

function resizeCanvases() {
  gameCanvas.width  = window.innerWidth;
  gameCanvas.height = window.innerHeight;
  outputCanvas.width  = window.innerWidth;
  outputCanvas.height = window.innerHeight;
  monsterAnim.x = window.innerWidth / 2;
  monsterAnim.y = window.innerHeight * 0.38;
}
window.addEventListener('resize', resizeCanvases);
resizeCanvases();

// =====================================================
// MediaPipe Pose
// =====================================================
let currentAngle = 0;
let poseReady = false;

const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});
pose.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  enableSegmentation: false,
  minDetectionConfidence: 0.55,
  minTrackingConfidence: 0.55
});

function calcAngle(a, b, c) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const cb = { x: b.x - c.x, y: b.y - c.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const cross = ab.x * cb.y - ab.y * cb.x;
  return Math.abs(Math.atan2(Math.abs(cross), dot) * 180 / Math.PI);
}

pose.onResults((results) => {
  // 繪製鏡頭畫面到 canvas
  octx.save();
  octx.scale(-1, 1);
  octx.drawImage(results.image, -outputCanvas.width, 0, outputCanvas.width, outputCanvas.height);
  octx.restore();

  if (!results.poseLandmarks || !gameRunning || paused) return;

  const lm = results.poseLandmarks;
  const scaleX = outputCanvas.width;
  const scaleY = outputCanvas.height;

  if (poseReady) {
    drawPoseSkeleton(lm, scaleX, scaleY);
  }

  // 計算左右腿角度（取最大值）
  const angleR = calcAngle(lm[24], lm[26], lm[28]);
  const angleL = calcAngle(lm[23], lm[25], lm[27]);
  currentAngle = Math.round(Math.max(angleR, angleL));

  updateAngleUI(currentAngle);
  processAttack(currentAngle);
});

function drawPoseSkeleton(lm, sw, sh) {
  const connections = [
    [23,24],[23,25],[24,26],[25,27],[26,28],[27,29],[28,30],[29,31],[30,32]
  ];
  octx.save();
  octx.scale(-1, 1);
  octx.translate(-sw, 0);

  connections.forEach(([a,b]) => {
    if (lm[a].visibility > 0.5 && lm[b].visibility > 0.5) {
      octx.beginPath();
      octx.moveTo(lm[a].x * sw, lm[a].y * sh);
      octx.lineTo(lm[b].x * sw, lm[b].y * sh);
      octx.strokeStyle = 'rgba(0,229,255,0.7)';
      octx.lineWidth = 3;
      octx.stroke();
    }
  });

  [23,24,25,26,27,28].forEach(i => {
    if (lm[i].visibility > 0.5) {
      octx.beginPath();
      octx.arc(lm[i].x * sw, lm[i].y * sh, 6, 0, Math.PI*2);
      octx.fillStyle = '#00e5ff';
      octx.fill();
    }
  });
  octx.restore();
}

// =====================================================
// 角度 UI
// =====================================================
function updateAngleUI(angle) {
  document.getElementById('angle-number').textContent = angle + '°';
  const pct = Math.min(angle / 70, 1);
  const circ = 2 * Math.PI * 35;
  const offset = circ - pct * circ;
  document.getElementById('angle-ring-fill').style.strokeDashoffset = offset;
  document.getElementById('angle-ring-fill').style.stroke =
    angle >= 60 ? '#ff5722' : angle >= 45 ? '#ffd700' : '#00e5ff';

  const warning = document.getElementById('angle-warning');
  warning.style.display = angle > 70 ? 'block' : 'none';
}

// =====================================================
// 攻擊邏輯
// =====================================================
let lastLegDown = true;
let holdTimer = null;
let holdDamageInterval = null;

function processAttack(angle) {
  const lvl = LEVELS[currentLevel];
  const threshold = lvl.minAngle;

  if (angle >= threshold) {
    if (lastLegDown) {
      lastLegDown = false;
      triggerAttack(angle, Date.now(), false);
      holdDamageInterval = setInterval(() => {
        if (currentAngle >= threshold) triggerAttack(currentAngle, Date.now(), true);
      }, 800);
    }
  } else {
    if (!lastLegDown) {
      lastLegDown = true;
      clearInterval(holdDamageInterval);
    }
    if (angle < 15) {
      if (combo > 0) {
        setTimeout(() => { if (currentAngle < 15) { combo = 0; updateComboUI(); } }, 1500);
      }
    }
  }
}

function triggerAttack(angle, now, isHold) {
  if (monsterHP <= 0) return;
  const lvl = LEVELS[currentLevel];
  const extraAngle = Math.max(0, angle - lvl.minAngle);
  let dmg = Math.floor(3 + extraAngle * 0.6);
  if (!isHold) combo++;
  const multiplier = combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
  if (multiplier > 1) dmg = Math.floor(dmg * multiplier);

  monsterHP = Math.max(0, monsterHP - dmg);
  score += dmg * 10;
  updateHUD();
  updateComboUI();
  spawnDamagePopup(dmg, multiplier > 1);
  monsterAnim.hitFlash = 10;
  monsterAnim.shakeX = 8;
  spawnAttackParticles(monsterAnim.x, monsterAnim.y, lvl.color);

  if (monsterHP <= 0) {
    clearInterval(holdDamageInterval);
    setTimeout(() => showLevelClear(), 600);
  }
}

// =====================================================
// 傷害數字彈出
// =====================================================
function spawnDamagePopup(dmg, isCrit) {
  const el = document.createElement('div');
  el.className = 'damage-popup';
  el.textContent = (isCrit ? '💥 ' : '') + dmg;
  el.style.fontSize = isCrit ? '28px' : '20px';
  el.style.color = isCrit ? '#ffd700' : '#ff6b6b';
  const mx = monsterAnim.x;
  const my = monsterAnim.y;
  el.style.left = (mx + (Math.random()-0.5)*60 - 20) + 'px';
  el.style.top  = (my - 40 + (Math.random()-0.5)*30) + 'px';
  document.getElementById('app').appendChild(el);
  setTimeout(() => el.remove(), 800);
}

// =====================================================
// 粒子特效
// =====================================================
function spawnAttackParticles(mx, my, color) {
  for (let i = 0; i < 10; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x: mx + (Math.random()-0.5)*40,
      y: my + (Math.random()-0.5)*40,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed,
      life: 1, color,
      r: 3 + Math.random()*5
    });
  }
}

// =====================================================
// 遊戲畫布渲染
// =====================================================
function renderGame() {
  gctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  if (!gameRunning || paused) {
    animFrameId = requestAnimationFrame(renderGame);
    return;
  }

  monsterAnim.bobPhase += 0.04;
  const bobY = Math.sin(monsterAnim.bobPhase) * 6;

  drawMonster(
    monsterAnim.x + monsterAnim.shakeX,
    monsterAnim.y + bobY,
    LEVELS[currentLevel]
  );

  if (monsterAnim.shakeX > 0) monsterAnim.shakeX = Math.max(0, monsterAnim.shakeX - 1.5);
  if (monsterAnim.hitFlash > 0) monsterAnim.hitFlash--;

  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.05;
    gctx.globalAlpha = p.life;
    gctx.beginPath();
    gctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    gctx.fillStyle = p.color;
    gctx.fill();
    gctx.globalAlpha = 1;
  });

  animFrameId = requestAnimationFrame(renderGame);
}

function drawMonster(x, y, lvl) {
  const s = lvl.size;
  const ctx = gctx;

  // 光暈
  const grd = ctx.createRadialGradient(x, y, s*0.1, x, y, s*0.8);
  grd.addColorStop(0, lvl.color + '44');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(x-s, y-s, s*2, s*2);

  // 命中閃白
  if (monsterAnim.hitFlash > 0) {
    ctx.globalAlpha = monsterAnim.hitFlash / 10;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x, y, s*0.55, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.save();
  ctx.translate(x, y);
  drawMonsterShape(ctx, lvl, s);
  ctx.restore();

  // 陰影
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#000';
  ctx.scale(1, 0.3);
  ctx.beginPath();
  ctx.ellipse(x, (y + s*0.6)/0.3, s*0.4, s*0.15/0.3, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawMonsterShape(ctx, lvl, s) {
  const c = lvl.color;
  const isBoss = lvl.boss;

  ctx.beginPath();
  if (isBoss) {
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2 - Math.PI/2;
      i === 0 ? ctx.moveTo(Math.cos(a)*s*0.55, Math.sin(a)*s*0.55)
               : ctx.lineTo(Math.cos(a)*s*0.55, Math.sin(a)*s*0.55);
    }
    ctx.closePath();
  } else {
    ctx.arc(0, 0, s*0.45, 0, Math.PI*2);
  }
  ctx.fillStyle = c;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 高光
  ctx.beginPath();
  ctx.ellipse(-s*0.12, -s*0.15, s*0.12, s*0.07, -0.4, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();

  // 眼睛
  const eyeOffX = s * 0.15;
  const eyeOffY = s * (isBoss ? -0.08 : -0.05);
  const eyeR    = s * (isBoss ? 0.1 : 0.09);
  [-1,1].forEach(dir => {
    ctx.beginPath();
    ctx.arc(dir*eyeOffX, eyeOffY, eyeR, 0, Math.PI*2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dir*eyeOffX + s*0.02, eyeOffY + s*0.02, eyeR*0.55, 0, Math.PI*2);
    ctx.fillStyle = isBoss ? '#ff0000' : '#222';
    ctx.fill();
  });

  // 嘴巴
  ctx.beginPath();
  const mouthY = s * 0.18;
  if (monsterAnim.hitFlash > 5) {
    ctx.arc(0, mouthY*0.6, s*0.15, 0, Math.PI);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; ctx.stroke();
  } else {
    ctx.arc(0, mouthY, s*0.2, Math.PI, 0);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5; ctx.stroke();
  }

  // Boss 角
  if (isBoss) {
    ctx.beginPath();
    ctx.moveTo(-s*0.2, -s*0.5);
    ctx.lineTo(-s*0.1, -s*0.75);
    ctx.lineTo(0, -s*0.5);
    ctx.moveTo(0, -s*0.5);
    ctx.lineTo(s*0.1, -s*0.75);
    ctx.lineTo(s*0.2, -s*0.5);
    ctx.strokeStyle = c;
    ctx.lineWidth = 5;
    ctx.stroke();
  }
}

// =====================================================
// HUD 更新
// =====================================================
function updateHUD() {
  const pct = monsterHP / monsterMaxHP * 100;
  document.getElementById('hp-bar').style.width = pct + '%';
  document.getElementById('hp-text').textContent = `${monsterHP} / ${monsterMaxHP}`;
  document.getElementById('score-display').textContent = '⭐ ' + score.toLocaleString();
}

function updateComboUI() {
  const el = document.getElementById('combo-text');
  el.textContent = 'x' + combo;
  el.style.transform = 'scale(1.3)';
  el.style.color = combo >= 5 ? '#ff5722' : '#ffd700';
  setTimeout(() => el.style.transform = 'scale(1)', 120);
}

// =====================================================
// 關卡控制
// =====================================================
function loadLevel(idx) {
  if (idx >= LEVELS.length) { showGameComplete(); return; }
  currentLevel = idx;
  const lvl = LEVELS[idx];
  monsterHP = lvl.hp;
  monsterMaxHP = lvl.hp;
  combo = 0;
  lastLegDown = true;
  particles = [];
  monsterAnim.hitFlash = 0;
  monsterAnim.shakeX = 0;
  document.getElementById('level-badge').textContent = '關卡 ' + lvl.id;
  document.getElementById('monster-name').textContent = lvl.name;
  updateHUD();
  updateComboUI();

  if (lvl.boss) {
    const alert = document.getElementById('boss-alert');
    alert.classList.add('show');
    setTimeout(() => alert.classList.remove('show'), 2000);
  }
}

function showLevelClear() {
  gameRunning = false;
  const lvl = LEVELS[currentLevel];
  const earned = lvl.hp * 10 + (combo >= 5 ? 500 : combo >= 3 ? 200 : 0);
  document.getElementById('clear-info').innerHTML =
    `擊敗了 ${lvl.name}！<br>本關分數 +${earned.toLocaleString()}<br>最高連擊：${combo} 連`;
  document.getElementById('level-clear').classList.add('show');
}

function startNextLevel() {
  document.getElementById('level-clear').classList.remove('show');
  gameRunning = true;
  loadLevel(currentLevel + 1);
  checkRestNeeded();
}

function showGameComplete() {
  document.getElementById('clear-title').textContent = '🏆 全部通關！';
  document.getElementById('clear-info').innerHTML =
    `恭喜完成所有 15 關！<br>總分：${score.toLocaleString()}<br>你的復健訓練非常出色！`;
  document.getElementById('next-btn').textContent = '重新開始';
  document.getElementById('next-btn').onclick = () => location.reload();
  document.getElementById('level-clear').classList.add('show');
}

// =====================================================
// 10 分鐘休息機制
// =====================================================
function checkRestNeeded() {
  const elapsed = (Date.now() - sessionStartTime) / 1000 / 60;
  if (elapsed >= 10) {
    gameRunning = false;
    let t = 120;
    const overlay = document.getElementById('rest-overlay');
    overlay.classList.add('show');
    restTimerInterval = setInterval(() => {
      t--;
      document.getElementById('rest-timer').textContent = t;
      if (t <= 0) skipRest();
    }, 1000);
  }
}

function skipRest() {
  clearInterval(restTimerInterval);
  document.getElementById('rest-overlay').classList.remove('show');
  sessionStartTime = Date.now();
  gameRunning = true;
}

// =====================================================
// 暫停 / 緊急停止
// =====================================================
function emergencyStop() {
  paused = !paused;
  gameRunning = !paused;
  const btn = document.getElementById('action-btn');
  if (paused) {
    btn.innerHTML = '▶<br>繼續';
    btn.style.background = 'linear-gradient(135deg,#27ae60,#229954)';
  } else {
    btn.innerHTML = '⏸<br>暫停';
    btn.style.background = 'linear-gradient(135deg,#e74c3c,#c0392b)';
  }
}

// =====================================================
// 啟動遊戲
// =====================================================
async function startGame() {
  document.getElementById('start-screen').style.display = 'none';
  gameRunning = true;
  sessionStartTime = Date.now();
  loadLevel(0);
  renderGame();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width:{ideal:640}, height:{ideal:480} }
    });
    const video = document.getElementById('input-video');
    video.srcObject = stream;
    video.play();
    poseReady = true;

    const camera = new Camera(video, {
      onFrame: async () => await pose.send({ image: video }),
      width: 640, height: 480
    });
    camera.start();
  } catch(e) {
    console.warn('鏡頭無法使用，進入示範模式', e);
    demoMode();
  }
}

// =====================================================
// 示範模式（無鏡頭時自動模擬抬腿）
// =====================================================
function demoMode() {
  let demoAngle = 0;
  let demoDir = 1;
  setInterval(() => {
    demoAngle += demoDir * 2;
    if (demoAngle >= 55) demoDir = -1;
    if (demoAngle <= 0)  demoDir = 1;
    currentAngle = demoAngle;
    updateAngleUI(demoAngle);
    processAttack(demoAngle);
  }, 60);
}
</script>
</body>
</html>