'use strict';

const WINNING_LINES = [
  { cells: [0, 1, 2], name: 'Top row' }, { cells: [3, 4, 5], name: 'Middle row' },
  { cells: [6, 7, 8], name: 'Bottom row' }, { cells: [0, 3, 6], name: 'Left column' },
  { cells: [1, 4, 7], name: 'Middle column' }, { cells: [2, 5, 8], name: 'Right column' },
  { cells: [0, 4, 8], name: 'Diagonal ↘' }, { cells: [2, 4, 6], name: 'Diagonal ↙' }
];

const state = {
  board: Array(9).fill(''), currentPlayer: 'X', active: true, computerThinking: false,
  mode: 'computer', humanSymbol: 'X', difficulty: 'medium', sound: true,
  scores: { X: 0, O: 0, draws: 0 },
  stats: { games: 0, wins: 0, bestStreak: 0, currentStreak: 0 }
};

const $ = selector => document.querySelector(selector);
const elements = {
  board: $('#board'), turnText: $('#turnText'), turnSymbol: $('.turn-symbol'), thinking: $('#thinking'),
  modal: $('#resultModal'), resultTitle: $('#resultTitle'), resultDetail: $('#resultDetail'), resultIcon: $('#resultIcon'),
  difficultyField: $('#difficultyField'), difficultyNote: $('#difficultyNote'), xLabel: $('#xLabel'), oLabel: $('#oLabel')
};

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem('neonGridData'));
    if (saved?.scores) Object.assign(state.scores, saved.scores);
    if (saved?.stats) Object.assign(state.stats, saved.stats);
    if (typeof saved?.sound === 'boolean') state.sound = saved.sound;
    if (saved?.theme) document.documentElement.dataset.theme = saved.theme;
  } catch (_) { /* Start with defaults if saved data is invalid. */ }
}

function saveData() {
  localStorage.setItem('neonGridData', JSON.stringify({
    scores: state.scores, stats: state.stats, sound: state.sound,
    theme: document.documentElement.dataset.theme || 'dark'
  }));
}

function createBoard() {
  elements.board.innerHTML = '';
  state.board.forEach((_, index) => {
    const cell = document.createElement('button');
    cell.className = 'cell'; cell.type = 'button'; cell.dataset.index = index;
    cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-label', `Cell ${index + 1}, empty`);
    cell.addEventListener('click', () => handleMove(index));
    elements.board.appendChild(cell);
  });
}

function startRound() {
  state.board = Array(9).fill(''); state.currentPlayer = 'X'; state.active = true; state.computerThinking = false;
  elements.thinking.classList.remove('active');
  if (elements.modal.open) elements.modal.close();
  createBoard(); updateLabels(); updateTurnIndicator();
  if (state.mode === 'computer' && state.humanSymbol === 'O') scheduleComputerMove();
}

function handleMove(index) {
  if (!state.active || state.computerThinking || state.board[index]) return;
  if (state.mode === 'computer' && state.currentPlayer !== state.humanSymbol) return;
  makeMove(index);
  if (state.active && state.mode === 'computer') scheduleComputerMove();
}

function makeMove(index) {
  if (!state.active || state.board[index]) return;
  state.board[index] = state.currentPlayer;
  const cell = elements.board.children[index];
  cell.innerHTML = `<span>${state.currentPlayer}</span>`;
  cell.classList.add(state.currentPlayer.toLowerCase(), 'marked');
  cell.disabled = true;
  cell.setAttribute('aria-label', `Cell ${index + 1}, ${state.currentPlayer}`);
  playSound('move');

  const result = evaluateBoard(state.board);
  if (result.winner) finishGame(result.winner, result.line, result.name);
  else if (result.draw) finishGame(null, [], 'No winning combination');
  else { state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X'; updateTurnIndicator(); }
}

function evaluateBoard(board) {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line.cells;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: line.cells, name: line.name, draw: false };
  }
  return { winner: null, line: [], name: '', draw: board.every(Boolean) };
}

function finishGame(winner, line, combinationName) {
  state.active = false; state.computerThinking = false; elements.thinking.classList.remove('active');
  [...elements.board.children].forEach(cell => { cell.disabled = true; });
  line.forEach(index => elements.board.children[index].classList.add('winner'));

  state.stats.games += 1;
  if (winner) {
    state.scores[winner] += 1;
    const humanWon = state.mode === 'pvp' || winner === state.humanSymbol;
    if (humanWon) {
      state.stats.wins += 1; state.stats.currentStreak += 1;
      state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.currentStreak);
    } else state.stats.currentStreak = 0;
    elements.resultTitle.textContent = `${winner} Wins!`;
    elements.resultDetail.textContent = `Winning combination: ${combinationName}`;
    elements.resultIcon.textContent = '✦'; playSound('win');
  } else {
    state.scores.draws += 1; state.stats.currentStreak = 0;
    elements.resultTitle.textContent = "It's a Draw!";
    elements.resultDetail.textContent = 'A perfectly matched round. Run it back.';
    elements.resultIcon.textContent = '◇'; playSound('draw');
  }
  updateScoreboard(); updateStats(); saveData();
  setTimeout(() => { if (!elements.modal.open) elements.modal.showModal(); }, 650);
}

function scheduleComputerMove() {
  if (!state.active || state.currentPlayer === state.humanSymbol) return;
  state.computerThinking = true; elements.thinking.classList.add('active');
  [...elements.board.children].forEach(cell => { cell.disabled = true; });
  setTimeout(() => {
    if (!state.active) return;
    const move = getComputerMove();
    state.computerThinking = false; elements.thinking.classList.remove('active');
    [...elements.board.children].forEach((cell, i) => { cell.disabled = Boolean(state.board[i]); });
    makeMove(move);
  }, 450 + Math.random() * 300);
}

function getComputerMove() {
  const open = state.board.map((cell, i) => cell ? null : i).filter(i => i !== null);
  if (state.difficulty === 'easy') return randomItem(open);
  if (state.difficulty === 'medium') {
    const tactical = findTacticalMove();
    return Math.random() < .72 && tactical !== null ? tactical : randomItem(open);
  }
  return getBestMove();
}

function findTacticalMove() {
  const computer = state.humanSymbol === 'X' ? 'O' : 'X';
  for (const symbol of [computer, state.humanSymbol]) {
    for (let i = 0; i < 9; i++) {
      if (state.board[i]) continue;
      const copy = [...state.board]; copy[i] = symbol;
      if (evaluateBoard(copy).winner === symbol) return i;
    }
  }
  if (!state.board[4]) return 4;
  return null;
}

// Minimax explores all possible future boards, making Hard mode unbeatable.
function getBestMove() {
  const computer = state.humanSymbol === 'X' ? 'O' : 'X';
  let bestScore = -Infinity, bestMoves = [];
  state.board.forEach((cell, index) => {
    if (cell) return;
    state.board[index] = computer;
    const score = minimax(state.board, 0, false, computer);
    state.board[index] = '';
    if (score > bestScore) { bestScore = score; bestMoves = [index]; }
    else if (score === bestScore) bestMoves.push(index);
  });
  return randomItem(bestMoves);
}

function minimax(board, depth, maximizing, computer) {
  const result = evaluateBoard(board);
  if (result.winner === computer) return 10 - depth;
  if (result.winner === state.humanSymbol) return depth - 10;
  if (result.draw) return 0;
  const scores = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = maximizing ? computer : state.humanSymbol;
    scores.push(minimax(board, depth + 1, !maximizing, computer));
    board[i] = '';
  }
  return maximizing ? Math.max(...scores) : Math.min(...scores);
}

function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }

function updateTurnIndicator() {
  elements.turnSymbol.textContent = state.currentPlayer;
  const isHumanTurn = state.mode === 'pvp' || state.currentPlayer === state.humanSymbol;
  elements.turnText.textContent = state.mode === 'pvp' ? `Player ${state.currentPlayer}'s move` : isHumanTurn ? 'Your move' : "Computer's move";
}

function updateLabels() {
  if (state.mode === 'pvp') { elements.xLabel.textContent = 'PLAYER 1'; elements.oLabel.textContent = 'PLAYER 2'; }
  else {
    elements.xLabel.textContent = state.humanSymbol === 'X' ? 'YOU' : 'CPU';
    elements.oLabel.textContent = state.humanSymbol === 'O' ? 'YOU' : 'CPU';
  }
}

function updateScoreboard() {
  $('#scoreX').textContent = state.scores.X; $('#scoreO').textContent = state.scores.O; $('#scoreDraw').textContent = state.scores.draws;
}

function updateStats() {
  const rate = state.stats.games ? Math.round((state.stats.wins / state.stats.games) * 100) : 0;
  $('#totalGames').textContent = state.stats.games; $('#winRate').textContent = `${rate}%`;
  $('#bestStreak').textContent = state.stats.bestStreak; $('#currentStreak').textContent = state.stats.currentStreak;
  const goalProgress = state.stats.wins % 10;
  $('#progressText').textContent = `${goalProgress} / 10 wins`;
  $('#progressBar').style.width = `${goalProgress * 10}%`;
}

function selectButton(group, clicked) {
  group.querySelectorAll('button').forEach(button => { const active = button === clicked; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
}

function setMode(mode, button) {
  state.mode = mode; selectButton($('#modeSelector'), button);
  elements.difficultyField.classList.toggle('hidden', mode === 'pvp'); startRound();
}

function setSymbol(symbol, button) { state.humanSymbol = symbol; selectButton($('#symbolSelector'), button); startRound(); }
function setDifficulty(level, button) {
  state.difficulty = level; selectButton($('#difficultySelector'), button);
  const notes = { easy: 'Relaxed play with random moves.', medium: 'Balanced play with smart moves.', hard: 'Perfect strategy. The machine never slips.' };
  elements.difficultyNote.textContent = notes[level]; startRound();
}

let audioContext;
function playSound(type) {
  if (!state.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === 'win' ? [523, 659, 784] : type === 'draw' ? [330, 294] : [type === 'move' ? 440 : 220];
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = type === 'move' ? 'sine' : 'triangle'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.05, audioContext.currentTime + index * .1);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + index * .1 + .13);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(audioContext.currentTime + index * .1); oscillator.stop(audioContext.currentTime + index * .1 + .15);
    });
  } catch (_) { /* Audio is optional and may be blocked by browser settings. */ }
}

function toggleSound() {
  state.sound = !state.sound;
  $('#soundToggle').classList.toggle('muted', !state.sound);
  $('#soundToggle').setAttribute('aria-label', state.sound ? 'Mute sound' : 'Unmute sound');
  $('.sound-icon').textContent = state.sound ? '♪' : '×'; saveData();
  if (state.sound) playSound('move');
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  $('#themeToggle').setAttribute('aria-label', `Switch to ${current} theme`);
  $('.theme-icon').textContent = next === 'dark' ? '☼' : '☾'; saveData();
}

function resetScores() {
  state.scores = { X: 0, O: 0, draws: 0 }; updateScoreboard(); saveData(); startRound();
}

function clearSavedData() {
  if (!confirm('Clear scores, statistics and saved preferences?')) return;
  localStorage.removeItem('neonGridData');
  state.scores = { X: 0, O: 0, draws: 0 }; state.stats = { games: 0, wins: 0, bestStreak: 0, currentStreak: 0 };
  updateScoreboard(); updateStats(); startRound();
}

$('#modeSelector').addEventListener('click', e => { const button = e.target.closest('[data-mode]'); if (button) setMode(button.dataset.mode, button); });
$('#symbolSelector').addEventListener('click', e => { const button = e.target.closest('[data-symbol]'); if (button) setSymbol(button.dataset.symbol, button); });
$('#difficultySelector').addEventListener('click', e => { const button = e.target.closest('[data-difficulty]'); if (button) setDifficulty(button.dataset.difficulty, button); });
$('#startGame').addEventListener('click', startRound); $('#restartGame').addEventListener('click', startRound);
$('#resetScores').addEventListener('click', resetScores); $('#playAgain').addEventListener('click', startRound);
$('#newGameModal').addEventListener('click', () => { elements.modal.close(); document.querySelector('.setup-card').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
$('#closeModal').addEventListener('click', () => elements.modal.close());
$('#soundToggle').addEventListener('click', toggleSound); $('#themeToggle').addEventListener('click', toggleTheme); $('#clearData').addEventListener('click', clearSavedData);

document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'r') startRound();
  if (event.key.toLowerCase() === 'm') toggleSound();
  if (/^[1-9]$/.test(event.key)) handleMove(Number(event.key) - 1);
  if (event.key === 'Escape' && elements.modal.open) elements.modal.close();
});

loadPreferences();
const savedTheme = document.documentElement.dataset.theme || 'dark';
document.documentElement.dataset.theme = savedTheme;
$('.theme-icon').textContent = savedTheme === 'dark' ? '☼' : '☾';
$('#soundToggle').classList.toggle('muted', !state.sound);
$('.sound-icon').textContent = state.sound ? '♪' : '×';
updateScoreboard(); updateStats(); startRound();
