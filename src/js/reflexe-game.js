// Jeu de réflexe — logique client
// Les données SSR sont lues depuis #reflexe-meta (data-attributes)

const meta       = document.getElementById('reflexe-meta');
const mode       = meta.dataset.mode;
const timeWindow = parseInt(meta.dataset.timeWindow);
const maxPts     = parseInt(meta.dataset.maxPts);
const modeBonus  = parseFloat(meta.dataset.modeBonus);
const totalRounds= parseInt(meta.dataset.totalRounds);
const sessionId  = meta.dataset.sessionId;
const pbUrl      = meta.dataset.pbUrl;
const gameToken  = meta.dataset.token;
const gameUserId = meta.dataset.userId;
const inSession  = meta.dataset.inSession === 'true';
const difficulty = meta.dataset.difficulty;

const btn         = document.getElementById('reflex-btn');
const btnLabel    = document.getElementById('btn-label');
const gameArea    = document.getElementById('game-area');
const feedbackEl  = document.getElementById('feedback');
const feedbackTx  = document.getElementById('feedback-text');
const roundCount  = document.getElementById('round-count');
const scoreCount  = document.getElementById('score-count');
const overlay     = document.getElementById('result-overlay');
const resultScore = document.getElementById('result-score');
const resultAvg   = document.getElementById('result-avg');
const resultRounds= document.getElementById('result-rounds');
const btnRejouer  = document.getElementById('btn-rejouer');
const btnParams   = document.getElementById('btn-params');

// URLs rejouer / params
const suffix = sessionId ? '&session=' + sessionId : '';
if (btnRejouer) btnRejouer.href = '/jeux_reflexe/jouer?difficulty=' + difficulty + '&mode=' + mode + suffix;
if (btnParams)  btnParams.href  = '/jeux_reflexe' + (sessionId ? '?session=' + sessionId : '');

let currentRound = 1;
let totalScore   = 0;
// 'idle' | 'waiting' | 'green' | 'feedback' | 'done'
let phase        = 'idle';
let greenTimer   = null;
let timeoutTimer = null;
let feedbackTimer= null;
let greenStart   = null;
const roundResults = [];

// ── Points ─────────────────────────────────────────────────────────────────
function calcPoints(reactionMs) {
  return Math.max(0, Math.round(maxPts * (1 - reactionMs / timeWindow) * modeBonus));
}

// ── Position aléatoire ─────────────────────────────────────────────────────
function placeBtn(random) {
  if (!random) {
    btn.style.top       = '50%';
    btn.style.left      = '50%';
    btn.style.transform = 'translate(-50%, -50%)';
    return;
  }
  const half = btn.offsetWidth / 2 + 16;
  const w    = gameArea.offsetWidth;
  const h    = gameArea.offsetHeight;
  const x    = half + Math.random() * (w - half * 2);
  const y    = half + Math.random() * (h - half * 2);
  btn.style.top       = y + 'px';
  btn.style.left      = x + 'px';
  btn.style.transform = 'translate(-50%, -50%)';
}

// ── Feedback volant ────────────────────────────────────────────────────────
function showFeedback(text, color) {
  clearTimeout(feedbackTimer);
  feedbackTx.textContent = text;
  feedbackTx.style.color = color;
  feedbackEl.style.opacity = '1';
  feedbackTimer = setTimeout(() => { feedbackEl.style.opacity = '0'; }, 900);
}

// ── Démarrage d'un round ───────────────────────────────────────────────────
function startRound() {
  phase = 'waiting';
  btn.style.pointerEvents = 'none';

  if (mode === 'aleatoire') {
    // Caché pendant la phase rouge — apparaît uniquement au vert
    btn.style.opacity = '0';
    btn.style.background = '#16a34a';
    btnLabel.textContent = 'CLIQUEZ !';
    placeBtn(true);
  } else {
    btn.style.opacity = '1';
    btn.style.background = '#dc2626';
    btn.style.pointerEvents = 'auto';
    btnLabel.textContent = 'Attendez...';
    placeBtn(false);
  }

  const delay = 1500 + Math.random() * 2500; // 1.5 s – 4 s aléatoire
  greenTimer = setTimeout(() => {
    if (phase !== 'waiting') return;
    phase = 'green';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    btn.style.background = '#16a34a';
    btnLabel.textContent = 'CLIQUEZ !';
    greenStart = Date.now();

    // Timeout si le joueur ne clique pas dans la fenêtre
    timeoutTimer = setTimeout(() => {
      if (phase !== 'green') return;
      phase = 'feedback';
      btn.style.background = '#dc2626';
      btn.style.pointerEvents = 'none';
      if (mode === 'aleatoire') btn.style.opacity = '0';
      btnLabel.textContent = 'Raté...';
      showFeedback('Raté !', '#ef4444');
      roundResults.push({ result: 'miss', pts: 0, ms: null });
      afterRound();
    }, timeWindow);
  }, delay);
}

// ── Après un round (hit / miss / tôt) ─────────────────────────────────────
function afterRound() {
  clearTimeout(greenTimer);
  clearTimeout(timeoutTimer);
  setTimeout(() => {
    if (currentRound >= totalRounds) {
      endGame();
    } else {
      currentRound++;
      roundCount.textContent = currentRound;
      startRound();
    }
  }, 1400);
}

// ── Fin de partie ──────────────────────────────────────────────────────────
function endGame() {
  phase = 'done';
  btn.style.pointerEvents = 'none';

  const hits    = roundResults.filter(r => r.result === 'hit');
  const avgMs   = hits.length > 0
    ? Math.round(hits.reduce((s, r) => s + r.ms, 0) / hits.length)
    : null;

  resultScore.textContent = totalScore + ' pts';
  resultAvg.textContent   = avgMs !== null
    ? 'Temps moyen : ' + avgMs + ' ms'
    : 'Aucun clic réussi';

  resultRounds.innerHTML = '';
  roundResults.forEach((r, i) => {
    const row   = document.createElement('div');
    row.className = 'flex items-center justify-between gap-4';

    const lbl   = document.createElement('p');
    lbl.className = 'm-0 text-neutral-200 text-3.5 font-medium';
    lbl.textContent = 'Round ' + (i + 1);

    const val   = document.createElement('span');
    val.className = 'text-4 font-bold ' + (
      r.result === 'hit'   ? 'text-primary-500' :
      r.result === 'early' ? 'text-yellow-400'  : 'text-red-400'
    );
    val.textContent =
      r.result === 'hit'   ? r.ms + ' ms — +' + r.pts + ' pts' :
      r.result === 'early' ? 'Trop tôt — −20 pts' :
                             'Raté — 0 pt';

    row.appendChild(lbl);
    row.appendChild(val);
    resultRounds.appendChild(row);
  });

  if (inSession && totalScore > 0 && gameToken && gameUserId) {
    savePoints(totalScore);
  }

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

// ── Clic sur le bouton ─────────────────────────────────────────────────────
btn.addEventListener('click', () => {
  if (phase === 'waiting') {
    clearTimeout(greenTimer);
    phase = 'feedback';
    btn.style.background = '#b91c1c';
    btn.style.pointerEvents = 'none';
    btnLabel.textContent = 'Trop tôt !';
    showFeedback('Trop tôt !', '#facc15');
    totalScore = Math.max(0, totalScore - 20);
    scoreCount.textContent = totalScore;
    roundResults.push({ result: 'early', pts: -20, ms: null });
    afterRound();

  } else if (phase === 'green') {
    clearTimeout(timeoutTimer);
    const reactionMs = Date.now() - greenStart;
    const pts = calcPoints(reactionMs);
    totalScore += pts;
    phase = 'feedback';
    btn.style.pointerEvents = 'none';
    if (mode === 'aleatoire') btn.style.opacity = '0';
    btnLabel.textContent = reactionMs + ' ms';
    showFeedback(reactionMs + ' ms', '#72C073');
    scoreCount.textContent = totalScore;
    roundResults.push({ result: 'hit', pts, ms: reactionMs });
    afterRound();
  }
});

// ── Lancement ──────────────────────────────────────────────────────────────
startRound();
