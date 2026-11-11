(() => {
  const canvas = document.querySelector("#game-board");
  const context = canvas.getContext("2d");
  const scoreElement = document.querySelector("#score");
  const statusElement = document.querySelector("#game-status");
  const overlay = document.querySelector("#game-overlay");
  const overlayIcon = document.querySelector("#overlay-icon");
  const overlayTitle = document.querySelector("#overlay-title");
  const overlayCopy = document.querySelector("#overlay-copy");
  const startButton = document.querySelector("#start-button");
  const scoreList = document.querySelector("#score-list");
  const musicButton = document.querySelector("#music-toggle");
  const musicLabel = document.querySelector("#music-label");
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const isStaticSite =
    document.querySelector('meta[name="score-storage"]').content === "local";
  const cellSize = 20;
  const columns = canvas.width / cellSize;
  const rows = canvas.height / cellSize;
  const portalColumns = [Math.round(columns / 3), Math.round((columns * 2) / 3)];
  const portalRows = [Math.round(rows / 3), Math.round((rows * 2) / 3)];
  const portals = [
    ...portalColumns.flatMap((x, pair) => [
      { x, y: 1, pair, exitDirection: { x: 0, y: 1 } },
      { x, y: rows - 2, pair, exitDirection: { x: 0, y: -1 } },
    ]),
    ...portalRows.flatMap((y, pair) => [
      { x: 1, y, pair: pair + 2, exitDirection: { x: 1, y: 0 } },
      { x: columns - 2, y, pair: pair + 2, exitDirection: { x: -1, y: 0 } },
    ]),
  ];
  const portalColors = ["#70e5d1", "#c18cff", "#ffba66", "#ff78a6"];
  const startingTickInterval = 190;
  const fastestTickInterval = 120;
  const eggLifetime = 6500;
  const eggBreakDuration = 570;
  const directions = {
    ArrowUp: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
  };

  let snake;
  let direction;
  let nextDirection;
  let egg;
  let eggRemaining = eggLifetime;
  let eggBreak;
  let score;
  let timer;
  let state = "ready";
  let audioContext;
  let musicGain;
  let musicTimer;
  let musicStep = 0;
  let musicEnabled = true;
  let musicMood = "game";

  const music = {
    game: {
      melody: [
        440, null, 523.25, 659.25, null, 587.33, 523.25, null,
        392, null, 440, 523.25, null, 392, 329.63, null,
      ],
      bass: [110, 87.31, 130.81, 98],
      tempo: 300,
    },
    gameOver: {
      melody: [
        392, null, 349.23, null, 329.63, null, 293.66, null,
        261.63, null, 293.66, null, 261.63, null, 220, null,
      ],
      bass: [98, 87.31, 82.41, 73.42],
      tempo: 420,
    },
  };

  function updateMusicButton(enabled) {
    musicEnabled = enabled;
    musicButton.setAttribute("aria-pressed", String(enabled));
    musicButton.setAttribute(
      "aria-label",
      enabled ? "Disable music" : "Enable music",
    );
    musicLabel.textContent = enabled ? "Music on" : "Music off";
  }

  function playTone(frequency, duration, waveform, volume) {
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(volume, now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(musicGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function playMusicStep() {
    const track = music[musicMood];
    const step = musicStep % track.melody.length;
    const note = track.melody[step];
    if (note) {
      playTone(note, musicMood === "gameOver" ? 0.38 : 0.28, "sine", 0.35);
    }
    if (step % 4 === 0) {
      playTone(track.bass[step / 4], 1.1, "triangle", 0.18);
    }
    musicStep += 1;
  }

  async function startMusic(mood = musicMood) {
    try {
      if (!audioContext) {
        audioContext = new window.AudioContext();
        musicGain = audioContext.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(audioContext.destination);
      }
      await audioContext.resume();
      if (!musicEnabled) return;

      window.clearInterval(musicTimer);
      musicMood = mood;
      musicStep = 0;
      const now = audioContext.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0.12, now + 0.3);
      playMusicStep();
      musicTimer = window.setInterval(playMusicStep, music[musicMood].tempo);
    } catch (error) {
      statusElement.textContent = "Music couldn't be started";
      console.error("Could not start background music.", error);
    }
  }

  function stopMusic() {
    window.clearInterval(musicTimer);
    if (musicGain) {
      const now = audioContext.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0, now + 0.2);
    }
  }

  async function toggleMusic() {
    musicButton.disabled = true;
    try {
      if (musicEnabled) {
        updateMusicButton(false);
        stopMusic();
        return;
      }

      updateMusicButton(true);
      await startMusic();
    } finally {
      musicButton.disabled = false;
    }
  }

  if (!("AudioContext" in window)) {
    musicButton.disabled = true;
    updateMusicButton(false);
    musicLabel.textContent = "Music unavailable";
    musicButton.setAttribute("aria-label", "Music unavailable in this browser");
  } else {
    updateMusicButton(true);
    musicButton.addEventListener("click", () => {
      toggleMusic().catch((error) => {
        statusElement.textContent = "Music couldn't be changed";
        console.error("Could not toggle background music.", error);
      });
    });
  }

  function drawBoard() {
    context.fillStyle = "#111a15";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(151, 185, 153, 0.055)";
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += cellSize) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    }
    for (let y = 0; y <= canvas.height; y += cellSize) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
    }
  }

  function draw() {
    drawBoard();
    if (!snake) return;

    portals.forEach((portal) => {
      const centerX = portal.x * cellSize + cellSize / 2;
      const centerY = portal.y * cellSize + cellSize / 2;
      const color = portalColors[portal.pair];
      context.save();
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = "#15241e";
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(centerX, centerY, cellSize * 0.43, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.shadowBlur = 0;
      context.lineWidth = 1.5;
      context.beginPath();
      context.ellipse(centerX, centerY, 4, 8, Math.PI / 4, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(centerX, centerY, 2, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      const { x: directionX, y: directionY } = portal.exitDirection;
      const tipX = centerX + directionX * 4;
      const tipY = centerY + directionY * 4;
      context.beginPath();
      context.moveTo(centerX - directionX * 5, centerY - directionY * 5);
      context.lineTo(tipX, tipY);
      context.moveTo(
        tipX - directionX * 3 - directionY * 3,
        tipY - directionY * 3 + directionX * 3,
      );
      context.lineTo(tipX, tipY);
      context.lineTo(
        tipX - directionX * 3 + directionY * 3,
        tipY - directionY * 3 - directionX * 3,
      );
      context.stroke();
      context.restore();
    });

    snake.forEach((segment, index) => {
      context.fillStyle = index === 0 ? "#b9f27c" : "#79c75c";
      context.beginPath();
      context.roundRect(
        segment.x * cellSize + 2,
        segment.y * cellSize + 2,
        cellSize - 4,
        cellSize - 4,
        index === 0 ? 6 : 5,
      );
      context.fill();
    });

    if (egg) drawEgg(egg);
    if (eggBreak) drawBrokenEgg();
  }

  function drawEgg(position) {
    const centerX = position.x * cellSize + cellSize / 2;
    const centerY = position.y * cellSize + cellSize / 2;
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-0.15);
    context.fillStyle = "#f3e8ce";
    context.strokeStyle = "#d9c59e";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(0, -8);
    context.bezierCurveTo(4, -7, 7, -1, 6, 3);
    context.bezierCurveTo(5, 8, -5, 8, -6, 3);
    context.bezierCurveTo(-7, -1, -4, -7, 0, -8);
    context.fill();
    context.stroke();
    context.strokeStyle = "#fff9e9";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-2, -4);
    context.quadraticCurveTo(-4, -1, -3, 1);
    context.stroke();
    context.restore();
  }

  function drawBrokenEgg() {
    const { position, elapsed } = eggBreak;
    const progress = Math.min(elapsed / eggBreakDuration, 1);
    const centerX = position.x * cellSize + cellSize / 2;
    const centerY = position.y * cellSize + cellSize / 2;
    const spread = progress * 7;

    context.save();
    context.translate(centerX, centerY);
    context.rotate(-0.15);
    context.save();
    context.globalAlpha = 1 - progress * 0.65;
    context.fillStyle = "#fffaf0";
    context.strokeStyle = "#e8dcc5";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-2, 1);
    context.bezierCurveTo(-7, -2, -10, 3, -7, 5);
    context.bezierCurveTo(-6, 8, 5, 8, 8, 5);
    context.bezierCurveTo(11, 2, 6, -2, 2, 1);
    context.bezierCurveTo(1, -2, -2, -2, -2, 1);
    context.fill();
    context.stroke();
    context.fillStyle = "#fffcf5";
    for (const side of [-1, 1]) {
      context.beginPath();
      context.ellipse(
        side * (4 + progress * 5),
        1 + progress * 2,
        1.5,
        2.5,
        side * 0.3,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.restore();

    context.fillStyle = "#f3e8ce";
    context.strokeStyle = "#d9c59e";
    context.lineWidth = 1.5;

    context.save();
    context.translate(-spread, progress * 3);
    context.beginPath();
    context.moveTo(0, -8);
    context.bezierCurveTo(-4, -7, -7, -1, -6, 3);
    context.lineTo(-3, 2);
    context.lineTo(-1, 4);
    context.lineTo(1, 2);
    context.lineTo(2, 4);
    context.lineTo(5, 2);
    context.bezierCurveTo(5, -1, 3, -6, 0, -8);
    context.fill();
    context.stroke();
    context.restore();

    context.save();
    context.translate(spread, -progress * 3);
    context.beginPath();
    context.moveTo(0, -8);
    context.bezierCurveTo(4, -7, 7, -1, 6, 3);
    context.lineTo(3, 2);
    context.lineTo(1, 4);
    context.lineTo(-1, 2);
    context.lineTo(-2, 4);
    context.lineTo(-5, 2);
    context.bezierCurveTo(-5, -1, -3, -6, 0, -8);
    context.fill();
    context.stroke();
    context.restore();

    context.fillStyle = "#f5c46b";
    context.globalAlpha = 1 - progress * 0.75;
    context.beginPath();
    context.ellipse(0, 3 + progress * 4, 2.5 + progress, 3.5 - progress, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffe5a0";
    context.beginPath();
    context.ellipse(-0.7, 2.5 + progress * 4, 0.8, 1.2, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function placeEgg(previousPosition = null) {
    const emptyCells = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const isPortal = portals.some((portal) => portal.x === x && portal.y === y);
        if (
          !isPortal &&
          !(previousPosition?.x === x && previousPosition?.y === y) &&
          !snake.some((segment) => segment.x === x && segment.y === y)
        ) {
          emptyCells.push({ x, y });
        }
      }
    }
    return emptyCells.length
      ? emptyCells[Math.floor(Math.random() * emptyCells.length)]
      : null;
  }

  function startGame() {
    window.clearInterval(timer);
    if (musicEnabled) startMusic("game");
    snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
    direction = { x: 1, y: 0 };
    nextDirection = direction;
    egg = placeEgg();
    eggRemaining = eggLifetime;
    eggBreak = null;
    score = 0;
    scoreElement.textContent = "000";
    state = "playing";
    overlay.hidden = true;
    statusElement.textContent = "You're on a roll";
    draw();
    timer = window.setInterval(tick, getTickInterval());
  }

  function getTickInterval() {
    return Math.max(fastestTickInterval, startingTickInterval - score / 10);
  }

  function tick() {
    const tickDuration = getTickInterval();
    if (eggBreak) {
      eggBreak.elapsed += tickDuration;
      if (eggBreak.elapsed >= eggBreakDuration) {
        const previousPosition = eggBreak.position;
        eggBreak = null;
        egg = placeEgg(previousPosition);
        eggRemaining = eggLifetime;
        statusElement.textContent = "A new egg appeared";
      }
    } else if (egg) {
      eggRemaining -= tickDuration;
      if (eggRemaining <= 0) breakEgg();
    }

    if (statusElement.textContent === "Portal hop!") {
      statusElement.textContent = "You're on a roll";
    }
    direction = nextDirection;
    let head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };
    const enteredPortalIndex = portals.findIndex(
      (portal) => portal.x === head.x && portal.y === head.y,
    );
    if (enteredPortalIndex !== -1) {
      const enteredPortal = portals[enteredPortalIndex];
      const exitPortal = portals.find(
        (portal, index) =>
          index !== enteredPortalIndex && portal.pair === enteredPortal.pair,
      );
      head = { x: exitPortal.x, y: exitPortal.y };
      direction = { ...exitPortal.exitDirection };
      nextDirection = { ...exitPortal.exitDirection };
      statusElement.textContent = "Portal hop!";
    }
    const eating = egg && head.x === egg.x && head.y === egg.y;
    const body = eating ? snake : snake.slice(0, -1);
    const hitBody = body.some(
      (segment) => segment.x === head.x && segment.y === head.y,
    );
    if (
      head.x < 0 ||
      head.y < 0 ||
      head.x >= columns ||
      head.y >= rows ||
      hitBody
    ) {
      endGame();
      return;
    }

    if (enteredPortalIndex !== -1) playPortalSound();
    snake.unshift(head);
    if (eating) {
      score += 10;
      scoreElement.textContent = String(score).padStart(3, "0");
      playEatSound();
      egg = placeEgg(egg);
      eggRemaining = eggLifetime;
      if (!egg) {
        endGame();
        return;
      }
      window.clearInterval(timer);
      timer = window.setInterval(tick, getTickInterval());
    } else {
      snake.pop();
    }
    draw();
  }

  function breakEgg() {
    eggBreak = { position: egg, elapsed: 0 };
    egg = null;
    playEggCrackSound();
    statusElement.textContent = "Egg cracked!";
  }

  function playEatSound() {
    if (!musicEnabled || !audioContext || audioContext.state !== "running") return;
    playTone(659.25, 0.09, "square", 0.45);
    window.setTimeout(() => {
      if (musicEnabled && audioContext.state === "running") {
        playTone(987.77, 0.14, "square", 0.35);
      }
    }, 75);
  }

  function playEggCrackSound() {
    if (!musicEnabled || !audioContext || audioContext.state !== "running") return;

    const now = audioContext.currentTime;
    const crack = audioContext.createOscillator();
    const crackEnvelope = audioContext.createGain();
    crack.type = "triangle";
    crack.frequency.setValueAtTime(420, now);
    crack.frequency.exponentialRampToValueAtTime(125, now + 0.16);
    crackEnvelope.gain.setValueAtTime(0.0001, now);
    crackEnvelope.gain.exponentialRampToValueAtTime(0.4, now + 0.008);
    crackEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    crack.connect(crackEnvelope);
    crackEnvelope.connect(musicGain);
    crack.start(now);
    crack.stop(now + 0.22);

    const shell = audioContext.createOscillator();
    const shellEnvelope = audioContext.createGain();
    shell.type = "square";
    shell.frequency.setValueAtTime(880, now + 0.025);
    shell.frequency.exponentialRampToValueAtTime(330, now + 0.13);
    shellEnvelope.gain.setValueAtTime(0.0001, now);
    shellEnvelope.gain.setValueAtTime(0.0001, now + 0.025);
    shellEnvelope.gain.exponentialRampToValueAtTime(0.12, now + 0.035);
    shellEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    shell.connect(shellEnvelope);
    shellEnvelope.connect(musicGain);
    shell.start(now + 0.025);
    shell.stop(now + 0.18);
  }

  function playPortalSound() {
    if (!musicEnabled || !audioContext || audioContext.state !== "running") return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(240, now);
    oscillator.frequency.exponentialRampToValueAtTime(960, now + 0.16);
    oscillator.frequency.exponentialRampToValueAtTime(520, now + 0.38);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.4, now + 0.04);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    oscillator.connect(envelope);
    envelope.connect(musicGain);
    oscillator.start(now);
    oscillator.stop(now + 0.42);
  }

  function pauseGame() {
    window.clearInterval(timer);
    state = "paused";
    showOverlay("Ⅱ", "Taking a breather?", "Press Space or tap below when you're ready.", "Resume game");
    statusElement.textContent = "Paused";
  }

  function resumeGame() {
    state = "playing";
    overlay.hidden = true;
    statusElement.textContent = "You're on a roll";
    timer = window.setInterval(tick, getTickInterval());
  }

  function showOverlay(icon, title, copy, buttonText) {
    overlayIcon.textContent = icon;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    startButton.innerHTML = `${buttonText} <span>→</span>`;
    overlay.hidden = false;
  }

  function getLocalScores() {
    const storedScores = window.localStorage.getItem("viboritaScores");
    if (!storedScores) return [];

    const scores = JSON.parse(storedScores);
    if (!Array.isArray(scores)) {
      throw new Error("Saved scores must be a list.");
    }
    return scores
      .filter(
        (entry) =>
          entry &&
          typeof entry.name === "string" &&
          Number.isInteger(entry.score) &&
          entry.score >= 0,
      )
      .sort((first, second) => second.score - first.score)
      .slice(0, 10);
  }

  async function endGame() {
    window.clearInterval(timer);
    state = "over";
    if (musicEnabled) startMusic("gameOver");
    else musicMood = "gameOver";
    showOverlay("↻", "Game over!", `You scored ${score}. Ready for another round?`, "Play again");
    statusElement.textContent = "Round over";
    try {
      if (isStaticSite) {
        const scores = getLocalScores();
        scores.push({ name: "Player", score });
        scores.sort((first, second) => second.score - first.score);
        scores.splice(10);
        window.localStorage.setItem("viboritaScores", JSON.stringify(scores));
        renderScores(scores);
        return;
      }

      const response = await fetch("/scores/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ score, name: "Player" }),
      });
      if (!response.ok) {
        throw new Error(`Score save failed (${response.status}).`);
      }
      const result = await response.json();
      renderScores(result.scores);
    } catch (error) {
      statusElement.textContent = "Round over · score couldn't be saved";
      console.error("Could not save the game score.", error);
    }
  }

  if (isStaticSite) {
    try {
      renderScores(getLocalScores());
    } catch (error) {
      statusElement.textContent = "Saved scores couldn't be loaded";
      console.error("Could not load saved game scores.", error);
    }
  }

  function renderScores(scores) {
    scoreList.replaceChildren();
    if (!scores.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No scores yet. Make the first one!";
      scoreList.append(empty);
      return;
    }
    scores.forEach((entry, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(index + 1).padStart(2, "0");
      const name = document.createElement("span");
      name.className = "player-name";
      name.textContent = entry.name;
      const points = document.createElement("strong");
      points.textContent = entry.score;
      item.append(rank, name, points);
      scoreList.append(item);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (state === "playing") pauseGame();
      else if (state === "paused") resumeGame();
      return;
    }
    const next =
      directions[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (next && state === "playing") {
      event.preventDefault();
      if (next.x !== -nextDirection.x || next.y !== -nextDirection.y) {
        nextDirection = next;
      }
    } else if (event.key === "Enter" && state !== "playing") {
      if (state === "paused") resumeGame();
      else startGame();
    }
  });

  startButton.addEventListener("click", () => {
    if (state === "paused") resumeGame();
    else startGame();
  });
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = directions[button.dataset.direction];
      if (
        state === "playing" &&
        (next.x !== -nextDirection.x || next.y !== -nextDirection.y)
      ) {
        nextDirection = next;
      }
    });
  });

  draw();
})();
