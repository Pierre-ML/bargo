// Jeu de rythme — logique client
// Les données SSR sont lues depuis #rythme-meta (data-attributes)

const meta       = document.getElementById('rythme-meta');
const speed      = parseFloat(meta.dataset.speed);    // px/s
const spawnMs    = parseInt(meta.dataset.spawnMs);     // ms entre spawns
const basePts    = parseInt(meta.dataset.basePts);     // pts max par frappe
const totalTime  = parseInt(meta.dataset.totalTime);   // durée en secondes
const sessionId  = meta.dataset.sessionId;
const pbUrl      = meta.dataset.pbUrl;
const gameToken  = meta.dataset.token;
const gameUserId = meta.dataset.userId;
const inSession  = meta.dataset.inSession === 'true';
const difficulty = meta.dataset.difficulty;

const gameArea    = document.getElementById('game-area');
const scoreEl     = document.getElementById('score-count');
const comboEl     = document.getElementById('combo-count');
const multBadge   = document.getElementById('mult-badge');
const timerEl     = document.getElementById('timer-text');
const timerBarEl  = document.getElementById('timer-bar');
const countdownEl = document.getElementById('countdown');
const overlay     = document.getElementById('result-overlay');
const btnRejouer  = document.getElementById('btn-rejouer');
const btnParams   = document.getElementById('btn-params');

const LANES        = 2;
const BLOCK_H      = 58;    // hauteur du bloc en px
const BTN_H        = 80;    // hauteur des boutons en bas
const HIT_OFFSET   = 28;    // px au-dessus des boutons pour la ligne de frappe
const HIT_TOLE     = 52;    // tolérance ±px autour de la ligne

// URLs
const suffix = sessionId ? '&session=' + sessionId : '';
if (btnRejouer) btnRejouer.href = '/jeux_rythme/jouer?difficulty=' + difficulty + suffix;
if (btnParams)  btnParams.href  = '/jeux_rythme' + (sessionId ? '?session=' + sessionId : '');

// État
let blocks    = [];
let score     = 0;
let combo     = 0;
let maxCombo  = 0;
let hits      = 0;
let misses    = 0;
let blockId   = 0;
let timeLeft  = totalTime;
let lastFrame = null;
let lastSpawn = 0;
let running   = false;
let animId    = null;

// CSS animation inline
const styleTag = document.createElement('style');
styleTag.textContent = `
  @keyframes rythme-pop {
    0%   { opacity:1; transform:translateX(-50%) translateY(0)   scale(1);   }
    60%  { opacity:1; transform:translateX(-50%) translateY(-18px) scale(1.1); }
    100% { opacity:0; transform:translateX(-50%) translateY(-36px) scale(0.9); }
  }
`;
document.head.appendChild(styleTag);

// ── Multiplicateur combo ───────────────────────────────────────────────────
function getComboMult() {
  if (combo >= 20) return 2.5;
  if (combo >= 10) return 2.0;
  if (combo >= 5)  return 1.5;
  return 1.0;
}

// ── Ligne de frappe (Y absolue dans gameArea) ──────────────────────────────
function hitLineY() {
  return gameArea.offsetHeight - BTN_H - HIT_OFFSET;
}

// ── Spawn un bloc dans un couloir libre ───────────────────────────────────
function spawnBlock() {
  // Choisir un couloir qui n'a pas déjà un bloc trop proche du haut
  let lane, tries = 0;
  do {
    lane = Math.floor(Math.random() * LANES);
    tries++;
  } while (
    tries < 10 &&
    blocks.some(b => b.lane === lane && b.state === 'falling' && b.y < BLOCK_H + 50)
  );

  const el = document.createElement('div');
  const laneW = 100 / LANES;
  el.style.cssText =
    'position:absolute;' +
    'width:calc(' + laneW + '% - 8px);' +
    'left:calc(' + (lane * laneW) + '% + 4px);' +
    'height:' + BLOCK_H + 'px;' +
    'top:' + (-BLOCK_H) + 'px;' +
    'background:linear-gradient(to bottom,#72C073,#347645);' +
    'border-radius:10px;' +
    'pointer-events:none;' +
    'will-change:transform;';

  gameArea.appendChild(el);
  blocks.push({ id: ++blockId, lane, y: -BLOCK_H, state: 'falling', el });
}

// ── Boucle de jeu ─────────────────────────────────────────────────────────
function gameLoop(ts) {
  if (!running) return;

  if (!lastFrame) lastFrame = ts;
  const dt = Math.min((ts - lastFrame) / 1000, 0.05);
  lastFrame = ts;

  // Temps
  timeLeft -= dt;
  if (timeLeft <= 0) { endGame(); return; }
  renderTimer();

  // Spawn
  if (ts - lastSpawn >= spawnMs) {
    spawnBlock();
    lastSpawn = ts;
  }

  // Déplacement blocs
  const lineY    = hitLineY();
  const missEdge = lineY + HIT_TOLE + BLOCK_H / 2;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.state !== 'falling') continue;

    b.y += speed * dt;
    b.el.style.top = b.y + 'px';

    // Bloc raté (centre dépasse le bord bas de la tolérance)
    if (b.y + BLOCK_H / 2 > missEdge) {
      b.state = 'missed';
      b.el.style.background = '#ef4444';
      b.el.style.opacity    = '0.35';
      const captured = b.el;
      setTimeout(() => captured.remove(), 280);
      blocks.splice(i, 1);
      onMiss(b.lane);
    }
  }

  animId = requestAnimationFrame(gameLoop);
}

// ── Raté (bloc passé) ──────────────────────────────────────────────────────
function onMiss(lane) {
  misses++;
  combo = 0;
  renderCombo();
  flashLane(lane, '#7f1d1d', '#ef4444');
}

// ── Clic sur un couloir ───────────────────────────────────────────────────
function clickLane(lane) {
  if (!running) return;

  const lineY = hitLineY();
  let best = null, bestDist = Infinity;

  for (const b of blocks) {
    if (b.lane !== lane || b.state !== 'falling') continue;
    const center = b.y + BLOCK_H / 2;
    const dist   = Math.abs(center - lineY);
    if (dist <= HIT_TOLE && dist < bestDist) { bestDist = dist; best = b; }
  }

  if (best) {
    const accuracy = Math.max(0, 1 - bestDist / HIT_TOLE);
    const pts = Math.max(5, Math.round(basePts * accuracy * getComboMult()));
    score += pts;
    combo++;
    hits++;
    if (combo > maxCombo) maxCombo = combo;

    best.state = 'hit';
    best.el.style.opacity = '0';
    const captured = best.el;
    setTimeout(() => captured.remove(), 140);
    blocks.splice(blocks.indexOf(best), 1);

    renderScore();
    renderCombo();
    flashLane(lane, '#14532d', '#16a34a');
    popText(lane, pts, accuracy);
  } else {
    // Frappe dans le vide
    flashLane(lane, '#713f12', '#ca8a04');
  }
}

// ── Flash visuel couloir ──────────────────────────────────────────────────
function flashLane(lane, bgColor, borderColor) {
  const btn = document.querySelector('[data-lane="' + lane + '"]');
  if (!btn) return;
  btn.style.background   = bgColor;
  btn.style.borderColor  = borderColor;
  setTimeout(() => {
    btn.style.background  = '';
    btn.style.borderColor = '';
  }, 110);
}

// ── Texte pop "PERFECT / GOOD / OK" ──────────────────────────────────────
function popText(lane, pts, accuracy) {
  const el    = document.createElement('div');
  const laneW = gameArea.offsetWidth / LANES;
  const label = accuracy >= 0.75 ? 'PERFECT' : accuracy >= 0.4 ? 'GOOD' : 'OK';
  const color = accuracy >= 0.75 ? '#72C073' : accuracy >= 0.4  ? '#facc15' : '#fb923c';

  el.style.cssText =
    'position:absolute;' +
    'left:' + (lane * laneW + laneW / 2) + 'px;' +
    'bottom:' + (BTN_H + HIT_OFFSET + 14) + 'px;' +
    'transform:translateX(-50%);' +
    'color:' + color + ';' +
    'font-weight:900;font-size:0.8rem;' +
    'text-transform:uppercase;letter-spacing:0.06em;' +
    'pointer-events:none;z-index:20;white-space:nowrap;' +
    'animation:rythme-pop 0.5s ease-out forwards;';
  el.textContent = label;
  gameArea.appendChild(el);
  setTimeout(() => el.remove(), 520);
}

// ── Rendu UI ──────────────────────────────────────────────────────────────
function renderScore() {
  if (scoreEl) scoreEl.textContent = score;
}

function renderCombo() {
  if (comboEl) comboEl.textContent = combo;
  const mult = getComboMult();
  if (multBadge) {
    if (mult > 1) {
      multBadge.textContent = '×' + mult;
      multBadge.classList.remove('hidden');
    } else {
      multBadge.classList.add('hidden');
    }
  }
}

function renderTimer() {
  const pct   = Math.max(0, timeLeft / totalTime);
  const secs  = Math.ceil(Math.max(0, timeLeft));
  const color = pct > 0.5 ? '#72C073' : pct > 0.25 ? '#f59e0b' : '#ef4444';
  if (timerEl)    { timerEl.textContent = secs + 's'; timerEl.style.color = color; }
  if (timerBarEl) { timerBarEl.style.width = (pct * 100) + '%'; timerBarEl.style.background = color; }
}

// ── Fin de partie ──────────────────────────────────────────────────────────
function endGame() {
  running = false;
  cancelAnimationFrame(animId);
  blocks.forEach(b => b.el.remove());
  blocks = [];

  const total    = hits + misses;
  const accuracy = total > 0 ? Math.round((hits / total) * 100) : 0;

  document.getElementById('result-score').textContent    = score + ' pts';
  document.getElementById('result-accuracy').textContent = 'Précision : ' + accuracy + '%';
  document.getElementById('result-hits').textContent     = hits;
  document.getElementById('result-misses').textContent   = misses;
  document.getElementById('result-max-combo').textContent= maxCombo;

  if (inSession && score > 0 && gameToken && gameUserId) savePoints(score);
  overlay.classList.remove('hidden');
}

// ── Sauvegarde points (même système que memory-game) ──────────────────────
function savePoints(pts) {
  fetch(pbUrl + '/api/collections/users/records/' + gameUserId, {
    headers: { Authorization: 'Bearer ' + gameToken }
  })
  .then(r => r.json())
  .then(u => fetch(pbUrl + '/api/collections/users/records/' + gameUserId, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + gameToken },
    body:    JSON.stringify({ points: (u.points ?? 0) + pts }),
  }))
  .catch(() => {});
}

// ── Compte à rebours ──────────────────────────────────────────────────────
function startCountdown() {
  if (!countdownEl) { startGame(); return; }
  let n = 3;
  countdownEl.textContent = n;

  const iv = setInterval(() => {
    n--;
    if (n > 0) {
      countdownEl.textContent = n;
    } else {
      clearInterval(iv);
      countdownEl.style.display = 'none';
      startGame();
    }
  }, 1000);
}

function startGame() {
  running   = true;
  lastSpawn = performance.now();
  animId    = requestAnimationFrame(gameLoop);
}

// ── Contrôles clavier ─────────────────────────────────────────────────────
// AZERTY: A=0, Z=1 | QWERTY fallback: Q=0, S=1
const KEY_MAP = { a:0, z:1, q:0, s:1 };
document.addEventListener('keydown', e => {
  if (e.repeat) return;
  const lane = KEY_MAP[e.key.toLowerCase()];
  if (lane !== undefined) clickLane(lane);
});

// ── Contrôles touch / clic ────────────────────────────────────────────────
document.querySelectorAll('.lane-btn').forEach(btn => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    clickLane(parseInt(btn.dataset.lane));
  });
});

// ── Lancement ─────────────────────────────────────────────────────────────
startCountdown();
