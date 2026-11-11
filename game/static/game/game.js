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
  let apple;
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

    context.fillStyle = "#ff8067";
    context.beginPath();
    context.arc(
      apple.x * cellSize + cellSize / 2,
      apple.y * cellSize + cellSize / 2,
      cellSize * 0.37,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.fillStyle = "#b9f27c";
    context.beginPath();
    context.ellipse(
      apple.x * cellSize + cellSize / 2 + 3,
      apple.y * cellSize + 4,
      4,
      2,
      -0.5,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  function placeApple() {
    const emptyCells = [];
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        if (!snake.some((segment) => segment.x === x && segment.y === y)) {
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
    apple = placeApple();
    score = 0;
    scoreElement.textContent = "000";
    state = "playing";
    overlay.hidden = true;
    statusElement.textContent = "You're on a roll";
    draw();
    timer = window.setInterval(tick, 135);
  }

  function tick() {
    direction = nextDirection;
    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };
    const eating = head.x === apple.x && head.y === apple.y;
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

    snake.unshift(head);
    if (eating) {
      score += 10;
      scoreElement.textContent = String(score).padStart(3, "0");
      playEatSound();
      apple = placeApple();
      if (!apple) {
        endGame();
        return;
      }
      window.clearInterval(timer);
      timer = window.setInterval(tick, Math.max(65, 135 - score / 10));
    } else {
      snake.pop();
    }
    draw();
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
    timer = window.setInterval(tick, Math.max(65, 135 - score / 10));
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
