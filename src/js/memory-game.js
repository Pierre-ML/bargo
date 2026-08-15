// Jeu de mémoire — logique client
// Les données SSR sont lues depuis #memory-meta (data-attributes)

const meta       = document.getElementById('memory-meta');
const totalTime  = parseInt(meta.dataset.totalTime);
const nbPairs    = parseInt(meta.dataset.nbPairs);
const maxLives   = parseInt(meta.dataset.maxLives);
const multiplier = parseFloat(meta.dataset.multiplier);
const ptsPerPair = parseInt(meta.dataset.ptsPerPair);
const pbUrl      = meta.dataset.pbUrl;
const gameToken  = meta.dataset.token;
const gameUserId = meta.dataset.userId;
const inSession  = meta.dataset.inSession === 'true';

let lives    = maxLives;
let matched  = 0;
let flipped  = [];
let locked   = false;
let score    = 0;
let timerRef = null;
let timeLeft = totalTime;

function $(id) { return document.getElementById(id); }

// ── Formatage temps MM:SS ──────────────────────────────────────────────────
function fmtTime(s) {
  if (s < 60) return s + 's';
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// ── Vies ───────────────────────────────────────────────────────────────────
function loseLife() {
  lives--;
  const val   = String(Math.max(0, lives));
  const color = lives <= Math.floor(maxLives * 0.33) ? '#ef4444'
              : lives <= Math.floor(maxLives * 0.6)  ? '#f59e0b' : '';
  ['lives-count', 'lives-count-lg'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.textContent = val;
    el.style.color = color;
  });
}

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimer() {
  if (totalTime <= 0) return;
  timerRef = setInterval(() => {
    timeLeft--;
    const pct   = Math.max(0, timeLeft / totalTime);
    const color = pct > 0.5 ? '#72C073' : pct > 0.25 ? '#f59e0b' : '#ef4444';
    const barEl = $('timer-bar');
    const fmt   = fmtTime(Math.max(0, timeLeft));
    ['timer-text', 'timer-text-lg'].forEach(id => {
      const el = $(id);
      if (el) { el.textContent = fmt; el.style.color = color; }
    });
    if (barEl) { barEl.style.width = (pct * 100) + '%'; barEl.style.backgroundColor = color; }
    if (timeLeft <= 0) { clearInterval(timerRef); showResult('timeout'); }
  }, 1000);
}

// ── Clic carte ─────────────────────────────────────────────────────────────
document.querySelectorAll('.memory-card').forEach(card => {
  card.addEventListener('click', function () {
    if (locked) return;
    if (this.classList.contains('flipped')) return;
    if (this.classList.contains('matched')) return;
    this.classList.add('flipped');
    flipped.push({ el: this, boissonId: this.dataset.boissonId });
    if (flipped.length === 2) { locked = true; checkMatch(); }
  });
});

// ── Vérification paire ─────────────────────────────────────────────────────
function checkMatch() {
  const [a, b] = flipped;

  if (a.boissonId === b.boissonId) {
    // ✅ Paire trouvée
    a.el.classList.add('matched');
    b.el.classList.add('matched');
    score  += ptsPerPair;
    matched++;
    ['pairs-count', 'pairs-count-lg'].forEach(id => {
      const el = $(id);
      if (el) el.textContent = String(matched);
    });
    flipped = [];
    locked  = false;
    if (matched === nbPairs) {
      clearInterval(timerRef);
      score += lives * 5;
      if (totalTime > 0 && timeLeft > 0) score += 20;
      setTimeout(() => showResult('win'), 600);
    }
  } else {
    // ❌ Erreur — flash rouge + perte de vie
    a.el.classList.add('error');
    b.el.classList.add('error');
    setTimeout(() => {
      a.el.classList.remove('flipped', 'error');
      b.el.classList.remove('flipped', 'error');
      flipped = [];
      loseLife();
      locked  = false;
      if (lives <= 0) {
        clearInterval(timerRef);
        setTimeout(() => showResult('lose'), 300);
      }
    }, 900);
  }
}

// ── Résultat ───────────────────────────────────────────────────────────────
function showResult(state) {
  const overlay = $('result-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  const pct         = nbPairs > 0 ? matched / nbPairs : 0;
  const accentColor = state === 'win' ? '#72C073' : state === 'timeout' ? '#f59e0b' : '#ef4444';
  const errors      = maxLives - lives;

  if (state === 'win') {
    $('result-title').textContent = pct >= 0.8 ? 'Excellent !' : pct >= 0.5 ? 'Bien joué !' : 'Pas mal !';
    $('result-sub').textContent   = errors + ' erreur' + (errors !== 1 ? 's' : '') + ' — ×' + multiplier + ' — ' + ptsPerPair + ' pts/paire';
  } else if (state === 'timeout') {
    $('result-title').textContent = 'Temps écoulé !';
    $('result-sub').textContent   = matched + ' paire' + (matched !== 1 ? 's' : '') + ' sur ' + nbPairs;
  } else {
    $('result-title').textContent = 'Game Over !';
    $('result-sub').textContent   = matched + ' paire' + (matched !== 1 ? 's' : '') + ' sur ' + nbPairs;
  }

  $('result-correct').textContent = String(matched);
  $('result-score').textContent   = score + ' pts';

  const circle = $('result-circle');
  if (circle) {
    circle.style.background = `conic-gradient(${accentColor} 0deg, ${accentColor} calc(${pct} * 360deg), #333 calc(${pct} * 360deg))`;
  }
  setTimeout(() => {
    const bar = $('result-bar');
    if (bar) { bar.style.width = (pct * 100) + '%'; bar.style.background = accentColor; }
  }, 100);

  if (inSession && score > 0 && gameToken && gameUserId) savePoints(score);
}

// ── Sauvegarde points ──────────────────────────────────────────────────────
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

// ── Démarrage ──────────────────────────────────────────────────────────────
startTimer();
