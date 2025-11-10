// === Digit Destroyer + SOUND (self-contained; no audio files needed) ===
// Uses Web Audio API to synthesize SFX. Press "M" to mute/unmute.

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this._init();
    this._bindMuteKey();
  }
  _init() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5; // master volume
    this.masterGain.connect(this.ctx.destination);
  }
  _bindMuteKey() {
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "m") this.toggleMute();
    });
  }
  async resumeIfNeeded() {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : 0.5;
  }
  // Basic tone
  tone({
    freq = 440,
    duration = 0.1,
    type = "sine",
    attack = 0.005,
    release = 0.05,
    gain = 0.6,
  } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.linearRampToValueAtTime(0.0001, t0 + attack + duration + release);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + attack + duration + release + 0.02);
  }
  // Simple arpeggio/chord helper
  arpeggio(freqs = [440, 554, 659], step = 0.07, type = "sine") {
    freqs.forEach((f, i) =>
      this.tone({
        freq: f,
        duration: 0.12,
        type,
        gain: 0.5,
        attack: 0.004,
        release: 0.04,
        startOffset: i * step,
      })
    );
  }
  // Noise burst (explosions)
  noise({ duration = 0.25, color = "white", gain = 0.5 } = {}) {
    if (!this.ctx || this.muted) return;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // white noise; could color with simple filter
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start();
  }

  // High-level SFX
  sfxClick() {
    this.tone({ freq: 520, duration: 0.05, type: "square", gain: 0.3 });
  }
  sfxValidPop() {
    this.tone({ freq: 740, duration: 0.08, type: "triangle", gain: 0.45 });
  }
  sfxInvalid() {
    this.tone({ freq: 180, duration: 0.12, type: "sawtooth", gain: 0.35 });
    setTimeout(
      () =>
        this.tone({ freq: 140, duration: 0.1, type: "sawtooth", gain: 0.3 }),
      70
    );
  }
  sfxExplosion() {
    this.noise({ duration: 0.22, gain: 0.6 });
  }
  sfxScoreChime() {
    this.arpeggio([660, 880, 990], 0.06, "triangle");
  }
  sfxLevelUp() {
    this.arpeggio([523, 659, 784, 1046], 0.08, "sine");
  }
  sfxPowerUp() {
    this.arpeggio([700, 930, 1240], 0.05, "square");
  }
  sfxTick() {
    this.tone({ freq: 900, duration: 0.03, type: "square", gain: 0.35 });
  }
  sfxGameOver() {
    this.arpeggio([440, 330, 220], 0.12, "sawtooth");
  }
}

class DigitDestroyer {
  constructor() {
    // Core state
    this.grid = [];
    this.gridSize = 8;
    this.score = 0;
    this.timeLeft = 60;
    this.combo = 0;
    this.level = 1;
    this.isPlaying = false;
    this.isPaused = false;
    this.selectedCells = [];
    this.previewCells = [];
    this.timer = null;
    this.powerUps = [];
    this._startCooldown = false;
    this._lastTickPlayed = null;

    // SOUND
    this.sound = new SoundManager();

    this.initializeGrid();
    this.bindEvents();
    this.addMouseHoverEffects();
  }

  // Element cache
  els() {
    return {
      grid: document.getElementById("gameGrid"),
      startBtn: document.getElementById("startBtn"),
      pauseBtn: document.getElementById("pauseBtn"),
      resetBtn: document.getElementById("resetBtn"),
      comboDisplay: document.getElementById("comboDisplay"),
      comboMultiplier: document.getElementById("comboMultiplier"),
      score: document.getElementById("score"),
      timer: document.getElementById("timer"),
      level: document.getElementById("level"),
      gameOver: document.getElementById("gameOver"),
      finalScore: document.getElementById("finalScore"),
      fxLayer: document.getElementById("specialEffects"),
    };
  }

  initializeGrid() {
    const { grid } = this.els();
    grid.innerHTML = "";
    this.grid = [];
    for (let row = 0; row < this.gridSize; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.gridSize; col++) {
        const digit = Math.floor(Math.random() * 10);
        this.grid[row][col] = digit;
        const cell = document.createElement("div");
        cell.className = `digit-cell digit-${digit}`;
        cell.textContent = digit;
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.addEventListener("click", (e) => this.handleCellClick(e));
        cell.addEventListener("mouseenter", (e) => this.handleCellHover(e));
        cell.addEventListener("mouseleave", () => this.handleCellLeave());
        grid.appendChild(cell);
        setTimeout(
          () => cell.classList.add("spawning"),
          (row * this.gridSize + col) * 50
        );
      }
    }
  }

  bindEvents() {
    const { startBtn, pauseBtn, resetBtn } = this.els();
    startBtn.addEventListener("click", async () => {
      await this.sound.resumeIfNeeded();
      this.handleStartButton();
    });
    pauseBtn.addEventListener("click", async () => {
      await this.sound.resumeIfNeeded();
      this.pauseGame();
    });
    resetBtn.addEventListener("click", () => this.resetGame());

    // CSS for sparkle
    const style = document.createElement("style");
    style.textContent = `
        @keyframes sparkleEffect { 0% { transform: scale(1) rotate(0deg); opacity: 1; } 
        100% { transform: scale(3) rotate(360deg); opacity: 0; } }
      `;
    document.head.appendChild(style);
  }

  addMouseHoverEffects() {
    const { grid } = this.els();
    grid.addEventListener("mousemove", (e) => {
      if (!this.isPlaying || this.isPaused) return;
      this.createSparkle(e.clientX, e.clientY);
    });
  }

  // ---------- Controls ----------
  handleStartButton() {
    // showInstructions();
    if (this._startCooldown) return;
    this._startCooldown = true;
    setTimeout(() => (this._startCooldown = false), 250);

    const instructions = document.querySelector(".instructions-container");
    if (instructions) {
      instructions.style.display = "none";
    }
    if (!this.isPlaying || this.isPaused) {
      this.startGame();
    } else {
      this.resetGame();
      this.startGame();
    }
  }

  startGame() {
    const { startBtn, pauseBtn, gameOver } = this.els();

    this.isPlaying = true;
    this.isPaused = false;
    this.timeLeft = 60;
    this.score = 0;
    this.combo = 0;
    this.level = 1;

    startBtn.textContent = "Restart";
    startBtn.disabled = false;
    pauseBtn.disabled = false;
    gameOver.style.display = "none";

    this.updateDisplay();
    this._stopTimer();
    this._startTimer();

    this.clearPowerUps();
    this.spawnPowerUps();

    // SFX
    this.sound.sfxClick();
    this.sound.sfxLevelUp(); // subtle start fanfare
  }

  pauseGame() {
    const { pauseBtn } = this.els();
    if (this.isPaused) {
      this.isPaused = false;
      this._startTimer();
      pauseBtn.textContent = "Pause";
      this.sound.sfxClick();
    } else {
      this.isPaused = true;
      this._stopTimer();
      pauseBtn.textContent = "Resume";
      this.sound.sfxClick();
    }
  }

  resetGame() {
    showInstructions();
    gameCacheAd();
    const { startBtn, pauseBtn, comboDisplay, gameOver } = this.els();
    this.isPlaying = false;
    this.isPaused = false;
    this.score = 0;
    this.timeLeft = 60;
    this.combo = 0;
    this.level = 1;
    this.selectedCells = [];
    this.clearPreview();
    this.clearPowerUps();
    this._stopTimer();

    startBtn.disabled = false;
    startBtn.textContent = "Start Game";
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";
    comboDisplay.style.display = "none";

    this.initializeGrid();
    this.updateDisplay();
    gameOver.style.display = "none";

    this.sound.sfxClick();
    const instructions = document.querySelector(".instructions-container");
    if (instructions) {
      instructions.style.display = "flex";
    }
  }

  shuffleGrid() {
    this.initializeGrid();
    this.updateDisplay();

    this.sound.sfxClick();
  }

  _startTimer() {
    this._stopTimer();
    this._lastTickPlayed = null;
    this.timer = setInterval(() => {
      if (!this.isPaused) {
        this.timeLeft--;
        // Tick SFX for last 10 seconds
        if (this.timeLeft <= 10 && this.timeLeft >= 0) {
          if (isRVReady) {
            showAdMessage();
          } else {
            console.log("Rewarded video not ready");
          }
          if (this._lastTickPlayed !== this.timeLeft) {
            this.sound.sfxTick();
            this._lastTickPlayed = this.timeLeft;
          }
        }
        this.updateDisplay();
        if (this.timeLeft <= 0) this.endGame();
      }
    }, 1000);
  }

  _stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ---------- Gameplay ----------
  handleCellClick(event) {
    if (!this.isPlaying || this.isPaused) return;

    const row = parseInt(event.target.dataset.row, 10);
    const col = parseInt(event.target.dataset.col, 10);
    const digit = this.grid[row][col];

    const connectedCells = this.findConnectedCells(row, col, digit);
    // console.log(JSON.stringify(connectedCells.length));

    if (connectedCells.length >= 2) {
      this.createMassiveExplosion(connectedCells);
      this.destroyCells(connectedCells);
      this.calculateScore(connectedCells.length);
      this.shakeScreen();

      // SFX
      this.sound.sfxExplosion();
      this.sound.sfxValidPop();

      setTimeout(() => {
        this.dropCells();
        this.fillEmptySpaces();
      }, 500);

      if (this.score > this.level * 600 && this.level <= 15) {
        this.level++;
        this.createLevelUpEffect();
        this.sound.sfxLevelUp();
        this.updateDisplay();
      }
    } else {
      this.createInvalidSelectionEffect(event.target);
      this.sound.sfxInvalid();
    }
  }

  handleCellHover(event) {
    if (!this.isPlaying || this.isPaused) return;
    const row = parseInt(event.target.dataset.row, 10);
    const col = parseInt(event.target.dataset.col, 10);
    const digit = this.grid[row][col];

    this.clearPreview();
    const connectedCells = this.findConnectedCells(row, col, digit);
    if (connectedCells.length >= 2) {
      this.previewCells = connectedCells;
      connectedCells.forEach(({ row, col }) => {
        const cell = document.querySelector(
          `[data-row="${row}"][data-col="${col}"]`
        );
        if (cell) cell.classList.add("preview-selected");
      });
    }
  }

  handleCellLeave() {
    this.clearPreview();
  }

  clearPreview() {
    this.previewCells.forEach(({ row, col }) => {
      const cell = document.querySelector(
        `[data-row="${row}"][data-col="${col}"]`
      );
      if (cell) cell.classList.remove("preview-selected");
    });
    this.previewCells = [];
  }

  createSparkle(x, y) {
    const sparkle = document.createElement("div");
    Object.assign(sparkle.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      width: "4px",
      height: "4px",
      background: "#fff",
      borderRadius: "50%",
      pointerEvents: "none",
      zIndex: "1000",
      animation: "sparkleEffect 0.8s ease-out forwards",
    });
    document.body.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 800);
  }

  // Effects + Scoring
  createMassiveExplosion(cells) {
    cells.forEach(({ row, col }, index) => {
      setTimeout(() => {
        const cell = document.querySelector(
          `[data-row="${row}"][data-col="${col}"]`
        );
        if (!cell) return;
        const rect = cell.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        this.createParticleExplosion(cx, cy, 15);
        this.createShockwave(cx, cy);
      }, index * 100);
    });
  }

  createParticleExplosion(x, y, count) {
    const { fxLayer } = this.els();
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "particle explosion";
      const angle = (360 / count) * i;
      const velocity = 50 + Math.random() * 100;
      const size = 4 + Math.random() * 8;
      Object.assign(p.style, {
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        background: `hsl(${Math.random() * 360},100%,60%)`,
        borderRadius: "50%",
        animation: `particleTrajectory 1.2s ease-out forwards, particleFade 1.2s ease-out forwards`,
      });
      const rad = (angle * Math.PI) / 180;
      const endX = x + Math.cos(rad) * velocity;
      const endY = y + Math.sin(rad) * velocity;
      p.style.setProperty("--endX", `${endX}px`);
      p.style.setProperty("--endY", `${endY}px`);
      fxLayer.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
    this.addParticleAnimations();
  }

  addParticleAnimations() {
    if (document.getElementById("particleAnimations")) return;
    const style = document.createElement("style");
    style.id = "particleAnimations";
    style.textContent = `
        @keyframes particleTrajectory { to { transform: translate(var(--endX), var(--endY)); } }
        @keyframes particleFade { 0% { opacity:1; transform: scale(1); } 100% { opacity:0; transform: scale(0); } }
      `;
    document.head.appendChild(style);
  }

  createShockwave(x, y) {
    const { fxLayer } = this.els();
    const ring = document.createElement("div");
    Object.assign(ring.style, {
      position: "fixed",
      left: `${x - 25}px`,
      top: `${y - 25}px`,
      width: "50px",
      height: "50px",
      border: "3px solid rgba(255,255,255,0.8)",
      borderRadius: "50%",
      animation: "shockwaveExpand 0.8s ease-out forwards",
      pointerEvents: "none",
      zIndex: "999",
    });
    fxLayer.appendChild(ring);
    setTimeout(() => ring.remove(), 800);
    this.addShockwaveAnimation();
  }

  addShockwaveAnimation() {
    if (document.getElementById("shockwaveAnimation")) return;
    const style = document.createElement("style");
    style.id = "shockwaveAnimation";
    style.textContent = `
        @keyframes shockwaveExpand {
          0% { transform: scale(1); opacity: .8; border-width: 3px; }
          100% { transform: scale(6); opacity: 0; border-width: 1px; }
        }
      `;
    document.head.appendChild(style);
  }

  createInvalidSelectionEffect(cell) {
    cell.style.background = "linear-gradient(145deg, #e74c3c, #c0392b)";
    cell.style.animation = "invalidShake 0.5s ease-in-out";
    setTimeout(() => {
      const digit = cell.textContent;
      cell.className = `digit-cell digit-${digit}`;
      cell.style.animation = "";
      cell.style.background = "";
    }, 500);
    this.addInvalidShakeAnimation();
  }

  addInvalidShakeAnimation() {
    if (document.getElementById("invalidShakeAnimation")) return;
    const style = document.createElement("style");
    style.id = "invalidShakeAnimation";
    style.textContent = `
        @keyframes invalidShake {
          0%,100% { transform: translateX(0); }
          10%,30%,50%,70%,90% { transform: translateX(-8px) rotateZ(-3deg); }
          20%,40%,60%,80% { transform: translateX(8px) rotateZ(3deg); }
        }
      `;
    document.head.appendChild(style);
  }

  shakeScreen() {
    document.body.classList.add("screen-shake");
    setTimeout(() => document.body.classList.remove("screen-shake"), 500);
  }

  createLevelUpEffect() {
    const txt = document.createElement("div");
    txt.textContent = `LEVEL ${this.level}!`;
    Object.assign(txt.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      fontSize: "3rem",
      fontWeight: "bold",
      color: "#f39c12",
      zIndex: "1500",
      pointerEvents: "none",
      textShadow: "3px 3px 6px rgba(0,0,0,0.7)",
      animation: "levelUpAnimation 2s ease-out forwards",
    });
    document.body.appendChild(txt);
    setTimeout(() => txt.remove(), 2000);
    this.addLevelUpAnimation();
  }

  addLevelUpAnimation() {
    if (document.getElementById("levelUpAnimation")) return;
    const style = document.createElement("style");
    style.id = "levelUpAnimation";
    style.textContent = `
        @keyframes levelUpAnimation {
          0% { transform: translate(-50%,-50%) scale(0) rotate(180deg); opacity:0; }
          50% { transform: translate(-50%,-50%) scale(1.5) rotate(0deg); opacity:1; }
          100% { transform: translate(-50%,-50%) scale(1) rotate(0deg); opacity:0; }
        }
      `;
    document.head.appendChild(style);
  }

  // Power-ups
  spawnPowerUps() {
    if (!this.isPlaying) return;
    if (Math.random() < 0.3) {
      const types = ["⚡", "💣", "🎯", "⭐", "🔥"];
      const t = types[Math.floor(Math.random() * types.length)];
      const n = document.createElement("div");
      n.className = "power-up";
      n.textContent = t;
      n.style.left = Math.random() * (window.innerWidth - 100) + "px";
      n.style.top = Math.random() * (window.innerHeight - 100) + "px";
      n.dataset.type = t;
      n.addEventListener("click", () => {
        this.activatePowerUp(t, n);
        this.sound.sfxPowerUp();
      });
      const { fxLayer } = this.els();
      fxLayer.appendChild(n);
      this.powerUps.push(n);
      setTimeout(() => {
        if (n.parentNode) {
          n.remove();
          this.powerUps = this.powerUps.filter((p) => p !== n);
        }
      }, 5000);
    }
    setTimeout(() => this.spawnPowerUps(), 8000 + Math.random() * 7000);
  }

  activatePowerUp(type, el) {
    el.remove();
    this.powerUps = this.powerUps.filter((p) => p !== el);
    switch (type) {
      case "⚡":
        this.timeLeft += 10;
        this.showPowerUpMessage("Time Boost! +10 seconds");
        break;
      case "💣":
        this.explodeRandomCells();
        this.showPowerUpMessage("Mega Explosion!");
        break;
      case "🎯":
        this.score += 500;
        this.showPowerUpMessage("Bonus Points! +500");
        if (this.score > this.level * 600) {
          this.level++;
          this.createLevelUpEffect();
          this.sound.sfxLevelUp();
          this.updateDisplay();
        }
        break;
      case "⭐":
        this.combo += 3;
        this.showPowerUpMessage("Combo Boost! +3");
        setTimeout(() => {
          this.combo -= 3;
          this.updateDisplay();
        }, 3000);
        break;
      case "🔥":
        this.clearRandomDigit();
        this.showPowerUpMessage("Digit Destroyer!");
        break;
    }
    this.updateDisplay();
  }

  explodeRandomCells() {
    const cells = [];
    for (let i = 0; i < 8; i++) {
      const row = Math.floor(Math.random() * this.gridSize);
      const col = Math.floor(Math.random() * this.gridSize);
      if (!cells.find((c) => c.row === row && c.col === col))
        cells.push({ row, col });
    }
    this.createMassiveExplosion(cells);
    this.destroyCells(cells);
    this.score += cells.length * 20;
    if (this.score > this.level * 600) {
      this.level++;
      this.createLevelUpEffect();
      this.sound.sfxLevelUp();
      this.updateDisplay();
    }
    this.sound.sfxExplosion();
    setTimeout(() => {
      this.dropCells();
      this.fillEmptySpaces();
    }, 500);
  }

  clearRandomDigit() {
    const target = Math.floor(Math.random() * 10);
    const cells = [];
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.grid[r][c] === target) cells.push({ row: r, col: c });
      }
    }
    if (cells.length) {
      this.createMassiveExplosion(cells);
      this.destroyCells(cells);
      this.score += cells.length * 15;
      if (this.score > this.level * 600) {
        this.level++;
        this.createLevelUpEffect();
        this.sound.sfxLevelUp();
        this.updateDisplay();
      }
      this.sound.sfxExplosion();
      setTimeout(() => {
        this.dropCells();
        this.fillEmptySpaces();
      }, 500);
    }
  }

  showPowerUpMessage(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    Object.assign(el.style, {
      position: "fixed",
      top: "20%",
      left: "50%",
      transform: "translateX(-50%)",
      fontSize: "2rem",
      fontWeight: "bold",
      color: "#f39c12",
      zIndex: "1500",
      width: "80vw",
      pointerEvents: "none",
      textShadow: "2px 2px 4px rgba(0,0,0,0.7)",
      animation: "powerUpMessage 2s ease-out forwards",
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
    this.addPowerUpMessageAnimation();
  }

  addPowerUpMessageAnimation() {
    if (document.getElementById("powerUpMessageAnimation")) return;
    const style = document.createElement("style");
    style.id = "powerUpMessageAnimation";
    style.textContent = `
        @keyframes powerUpMessage {
          0% { transform: translateX(-50%) translateY(-30px) scale(0); opacity:0; }
          30% { transform: translateX(-50%) translateY(0) scale(1.2); opacity:1; }
          70% { transform: translateX(-50%) translateY(0) scale(1); opacity:1; }
          100% { transform: translateX(-50%) translateY(-20px) scale(.8); opacity:0; }
        }
      `;
    document.head.appendChild(style);
  }

  clearPowerUps() {
    this.powerUps.forEach((p) => p.parentNode && p.remove());
    this.powerUps = [];
  }

  // Board mechanics
  findConnectedCells(r, c, digit, visited = new Set()) {
    const key = `${r}-${c}`;
    if (visited.has(key)) return [];
    if (this.grid[r][c] !== digit) return [];
    visited.add(key);
    const out = [{ row: r, col: c }];
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    for (let [dr, dc] of dirs) {
      const nr = r + dr,
        nc = c + dc;
      if (
        nr >= 0 &&
        nr < this.gridSize &&
        nc >= 0 &&
        nc < this.gridSize &&
        this.grid[nr][nc] === digit
      ) {
        out.push(...this.findConnectedCells(nr, nc, digit, visited));
      }
    }
    return out;
  }

  destroyCells(cells) {
    cells.forEach(({ row, col }) => {
      const cell = document.querySelector(
        `[data-row="${row}"][data-col="${col}"]`
      );
      if (cell) {
        cell.classList.add("destroying");
        setTimeout(() => {
          this.grid[row][col] = null;
        }, 250);
      }
    });
  }

  calculateScore(n) {
    const base = n * 10;
    const bonus = Math.max(0, (n - 2) * 15);
    const comboBonus = this.combo * 5;
    const levelBonus = this.level * 2;
    const total = base + bonus + comboBonus + levelBonus;

    this.score += total;
    this.combo++;

    this.showFloatingScore(total);
    const { comboDisplay, comboMultiplier } = this.els();
    if (this.combo > 1) {
      comboDisplay.style.display = "block";
      comboMultiplier.textContent = this.combo;
    }

    // SFX for scoring
    this.sound.sfxScoreChime();

    setTimeout(() => {
      if (this.combo > 0) {
        this.combo = Math.max(0, this.combo - 1);
        if (this.combo <= 1) comboDisplay.style.display = "none";
      }
      this.updateDisplay();
    }, 3000);

    this.updateDisplay();
  }

  showFloatingScore(points) {
    const { fxLayer, score } = this.els();
    const tag = document.createElement("div");
    tag.className = "floating-score";
    tag.textContent = `+${points}`;
    tag.style.left = Math.random() * (window.innerWidth - 100) + "px";
    tag.style.top = Math.random() * (window.innerHeight - 100) + "px";
    fxLayer.appendChild(tag);
    setTimeout(() => tag.remove(), 1500);
    score.classList.add("score-increase");
    setTimeout(() => score.classList.remove("score-increase"), 800);
  }

  dropCells() {
    for (let col = 0; col < this.gridSize; col++) {
      let write = this.gridSize - 1;
      for (let row = this.gridSize - 1; row >= 0; row--) {
        if (this.grid[row][col] !== null) {
          if (row !== write) {
            this.grid[write][col] = this.grid[row][col];
            this.grid[row][col] = null;
          }
          write--;
        }
      }
    }
  }

  fillEmptySpaces() {
    setTimeout(() => {
      let changed = false;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          if (this.grid[r][c] === null) {
            this.grid[r][c] = Math.floor(Math.random() * 10);
            changed = true;
          }
        }
      }
      if (changed) this.updateGridDisplay();
    }, 800);
  }

  updateGridDisplay() {
    const { grid } = this.els();
    const cells = grid.children;
    for (let i = 0; i < cells.length; i++) {
      const row = Math.floor(i / this.gridSize);
      const col = i % this.gridSize;
      const digit = this.grid[row][col];
      if (digit !== null && cells[i].textContent !== String(digit)) {
        cells[i].textContent = digit;
        cells[i].className = `digit-cell digit-${digit} falling`;
        setTimeout(() => cells[i].classList.remove("falling"), 800);
      }
    }
  }

  updateDisplay() {
    const { score, timer, level, comboMultiplier } = this.els();
    score.textContent = this.score.toLocaleString();
    timer.textContent = this.timeLeft;
    level.textContent = `${this.level}/15`;
    comboMultiplier.textContent = this.combo;
  }

  endGame() {
    const { finalScore, gameOver, startBtn, pauseBtn } = this.els();
    this.isPlaying = false;
    this._stopTimer();
    this.clearPowerUps();

    postScore(this.score);
    if (isAdReady) {
      showAd();
    } else {
      console.log("mid roll Ad not ready");
    }
    finalScore.textContent = `Final Score: ${this.score.toLocaleString()}`;
    gameOver.style.display = "flex";

    startBtn.disabled = false;
    startBtn.textContent = "Start Game";
    pauseBtn.disabled = true;
    pauseBtn.textContent = "Pause";

    // SFX
    this.sound.sfxGameOver();
  }
}

// Boot
const game = new DigitDestroyer();
function startNewGame() {
  showInstructions();
  gameCacheAd();
  document.getElementById("gameOver").style.display = "none";
  game.handleStartButton();
}

function shuffleGridEvent() {
  game.shuffleGrid();
}

function showRewardedVideo() {
  // Pause game
  if (game) {
    game.isPaused = true;
    game._stopTimer();
  }

  console.log("Showing rewarded ad...");
  showAdRewarded();
}

function showAdMessage() {
  // Only show ad offer once when time hits 10 seconds
  if (!game || !game.isPlaying) {
    return;
  }

  if (game.timeLeft === 10) {
    AdMessage();
  }
}

function AdMessage() {
  const instructionsBottom = document.querySelector(".instructions-bottom");
  if (instructionsBottom) {
    instructionsBottom.innerHTML = `
        <h3>🎁 Reward Available!</h3>
        <p>Watch video to get <strong>+20 seconds</strong> extra play time!</p>
        <button class="btn btn--primary" onclick="showRewardedVideo()">Watch Ad (+20s)</button>
      `;
  }
}
function showInstructions() {
  const instructionsBottom = document.querySelector(".instructions-bottom");
  if (instructionsBottom) {
    instructionsBottom.innerHTML = `
      <button class="btn" onclick="gotoHome()">Go to Home</button>
    `;
  }
}

function giveReward(){
    if (game) {
      game.timeLeft += 20;
      game.isPaused = false;
      game._startTimer();
      game.updateDisplay();
      game.sound.sfxPowerUp();
      showInstructions();
    }
}
