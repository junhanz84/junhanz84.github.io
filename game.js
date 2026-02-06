"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const bestValue = document.getElementById("bestValue");
const timeValue = document.getElementById("timeValue");
const comboValue = document.getElementById("comboValue");

const introOverlay = document.getElementById("introOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const finalMessage = document.getElementById("finalMessage");

const CONFIG = {
  durationSeconds: 60,
  maxLives: 4,
  chopstickLength: 138,
  chopstickHandleGap: 30,
  chopstickHandleWidth: 10.8,
  chopstickTipWidth: 3,
  tipOpenGap: 11,
  tipClosedGap: 1.2,
  tipCatchGapMax: 3.5,
  tipCatchRadius: 7.1,
  tipAutoCloseRange: 54,
  tipSnapRange: 30,
  tipCloseSpeed: 18,
  tipOpenSpeed: 10,
  baseSpawnSeconds: 5,
  minSpawnSeconds: 5,
  comboWindowSeconds: 1.45,
};

const RAMEN = {
  bowlRadiusX: 92,
  bowlRadiusY: 22,
  flyAirspaceScale: 5,
};

const FLY_TYPES = {
  normal: {
    points: 10,
    speed: 132,
    size: 13.4,
    color: "92,90,94",
  },
  swift: {
    points: 14,
    speed: 168,
    size: 11.6,
    color: "98,96,100",
  },
  gold: {
    points: 24,
    speed: 148,
    size: 12.8,
    color: "138,122,78",
  },
};

const pointer = {
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  speed: 0,
  active: false,
  initialized: false,
  id: null,
};

const state = {
  phase: "ready",
  score: 0,
  best: loadBestScore(),
  lives: CONFIG.maxLives,
  timeLeft: CONFIG.durationSeconds,
  combo: 0,
  comboClock: 0,
  spawnClock: CONFIG.baseSpawnSeconds,
  elapsed: 0,
  lastTimestamp: 0,
  lastAngle: -Math.PI * 0.24,
  cursorGlow: 0,
  tipGap: CONFIG.tipOpenGap,
  targetTipGap: CONFIG.tipOpenGap,
  nearestFlyDistance: Infinity,
  viewport: {
    width: 0,
    height: 0,
  },
  flies: [],
  particles: [],
  slashTrail: [],
  scorePopups: [],
};

function loadBestScore() {
  try {
    const raw = localStorage.getItem("chopstickNinjaBest");
    return raw ? Math.max(0, Number(raw) || 0) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem("chopstickNinjaBest", String(Math.floor(value)));
  } catch {
    // Local storage may not be available in some browsing modes.
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function getRamenAnchor() {
  const width = state.viewport.width;
  const height = state.viewport.height;
  const tableTopY = height * 0.57;
  const tableTopHeight = height * 0.12;
  const bowlY = tableTopY + tableTopHeight * 0.56;
  const ramenWidth = RAMEN.bowlRadiusX * 2;
  const ramenHeight = RAMEN.bowlRadiusY * 2;

  return {
    x: width * 0.5,
    y: bowlY,
    tableTopY,
    tableTopHeight,
    airCenterX: width * 0.5,
    airCenterY: bowlY - height * 0.2,
    airRadiusX: (ramenWidth * RAMEN.flyAirspaceScale) * 0.5,
    airRadiusY: (ramenHeight * RAMEN.flyAirspaceScale) * 0.5,
  };
}

function pickAirspaceTarget(ramen, inset = 0.95) {
  const angle = rand(0, Math.PI * 2);
  const radius = Math.sqrt(Math.random()) * inset;
  return {
    x: ramen.airCenterX + Math.cos(angle) * ramen.airRadiusX * radius,
    y: ramen.airCenterY + Math.sin(angle) * ramen.airRadiusY * radius,
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  state.viewport.width = rect.width;
  state.viewport.height = rect.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (!pointer.initialized) {
    pointer.x = rect.width * 0.5;
    pointer.y = rect.height * 0.55;
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.initialized = true;
  } else {
    pointer.x = clamp(pointer.x, 0, rect.width);
    pointer.y = clamp(pointer.y, 0, rect.height);
    pointer.prevX = clamp(pointer.prevX, 0, rect.width);
    pointer.prevY = clamp(pointer.prevY, 0, rect.height);
  }
}

function updateHud() {
  const comboMultiplier = 1 + Math.floor(Math.max(0, state.combo - 1) / 4);
  scoreValue.textContent = String(Math.floor(state.score));
  bestValue.textContent = String(Math.floor(state.best));
  timeValue.textContent = String(Math.max(0, Math.ceil(state.timeLeft)));
  comboValue.textContent = "x" + String(comboMultiplier);
}

function showOverlay(overlay) {
  overlay.classList.add("show");
}

function hideOverlay(overlay) {
  overlay.classList.remove("show");
}

function resetStateForGame() {
  state.phase = "playing";
  state.score = 0;
  state.lives = CONFIG.maxLives;
  state.timeLeft = CONFIG.durationSeconds;
  state.combo = 0;
  state.comboClock = 0;
  state.spawnClock = CONFIG.baseSpawnSeconds;
  state.elapsed = 0;
  state.flies.length = 0;
  state.particles.length = 0;
  state.slashTrail.length = 0;
  state.scorePopups.length = 0;
  state.tipGap = CONFIG.tipOpenGap;
  state.targetTipGap = CONFIG.tipOpenGap;
  state.nearestFlyDistance = Infinity;
  pointer.speed = 0;
  updateHud();
}

function startGame() {
  hideOverlay(introOverlay);
  hideOverlay(gameOverOverlay);
  pointer.active = false;
  pointer.id = null;
  resetStateForGame();
}

function endGame(reason) {
  if (state.phase !== "playing") {
    return;
  }

  state.phase = "gameover";
  if (state.score > state.best) {
    state.best = state.score;
    saveBestScore(state.best);
  }
  updateHud();

  finalMessage.textContent =
    reason +
    " You scored " +
    Math.floor(state.score) +
    " points. Best: " +
    Math.floor(state.best) +
    ".";
  showOverlay(gameOverOverlay);
}

function chooseFlyType(difficulty) {
  const roll = Math.random();
  const goldChance = 0.09 + difficulty * 0.05;
  const swiftChance = 0.18 + difficulty * 0.12;

  if (roll < goldChance) {
    return "gold";
  }

  if (roll < goldChance + swiftChance) {
    return "swift";
  }

  return "normal";
}

function spawnFly() {
  const difficulty = clamp(state.elapsed / 180, 0, 1);
  const type = chooseFlyType(difficulty);
  const data = FLY_TYPES[type];
  const speed = data.speed * rand(0.92, 1.1) * (1 + difficulty * 0.1);
  const size = data.size * rand(0.92, 1.08);
  const ramen = getRamenAnchor();
  const width = state.viewport.width;
  const height = state.viewport.height;
  const margin = 96;
  const side = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;

  if (side === 0) {
    x = -margin;
    y = rand(28, height - 40);
  } else if (side === 1) {
    x = width + margin;
    y = rand(28, height - 40);
  } else if (side === 2) {
    x = rand(24, width - 24);
    y = -margin;
  } else {
    x = rand(24, width - 24);
    y = height + margin;
  }

  const entryTarget = pickAirspaceTarget(ramen, 0.92);
  const targetX = entryTarget.x;
  const targetY = entryTarget.y;
  const toTargetX = targetX - x;
  const toTargetY = targetY - y;
  const toTargetLength = Math.hypot(toTargetX, toTargetY) || 1;
  const vx = (toTargetX / toTargetLength) * speed;
  const vy = (toTargetY / toTargetLength) * speed;

  state.flies.push({
    x,
    y,
    vx,
    vy,
    baseSpeed: speed,
    size,
    type,
    points: data.points,
    color: data.color,
    age: 0,
    wingSeed: rand(0, Math.PI * 2),
    wobbleSpeed: rand(4.5, 9.8),
    mode: "approach",
    hasEnteredScene: false,
    roamTargetX: targetX,
    roamTargetY: targetY,
    retargetClock: rand(1.1, 2.2),
  });
}

function emitBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(60, 310);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(15, 80),
      life: rand(0.2, 0.55),
      maxLife: rand(0.2, 0.55),
      size: rand(1.2, 3.8),
      color,
    });
  }

  if (state.particles.length > 800) {
    state.particles.splice(0, state.particles.length - 800);
  }
}

function addTrailPoint(x, y, intensity) {
  state.slashTrail.push({
    x,
    y,
    life: 0.22 + intensity * 0.18,
    width: 2.4 + intensity * 7.5,
  });

  if (state.slashTrail.length > 32) {
    state.slashTrail.shift();
  }
}

function addScorePopup(text, x, y, color) {
  state.scorePopups.push({
    text,
    x,
    y,
    vx: rand(-14, 14),
    vy: rand(-72, -56),
    life: 0.82,
    maxLife: 0.82,
    color,
  });

  if (state.scorePopups.length > 60) {
    state.scorePopups.splice(0, state.scorePopups.length - 60);
  }
}

function getChopstickPairGeometry() {
  const angle = state.lastAngle;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const normalX = -dirY;
  const normalY = dirX;

  const tipCenterX = pointer.x;
  const tipCenterY = pointer.y;
  const tipHalfGap = state.tipGap * 0.5;
  const handleCenterX = tipCenterX - dirX * CONFIG.chopstickLength;
  const handleCenterY = tipCenterY - dirY * CONFIG.chopstickLength;
  const handleHalfGap = CONFIG.chopstickHandleGap * 0.5;

  return {
    tipCenterX,
    tipCenterY,
    handleCenterX,
    handleCenterY,
    midX: (tipCenterX + handleCenterX) * 0.5,
    midY: (tipCenterY + handleCenterY) * 0.5,
    angle,
    top: {
      x1: handleCenterX + normalX * handleHalfGap,
      y1: handleCenterY + normalY * handleHalfGap,
      x2: tipCenterX + normalX * tipHalfGap,
      y2: tipCenterY + normalY * tipHalfGap,
    },
    bottom: {
      x1: handleCenterX - normalX * handleHalfGap,
      y1: handleCenterY - normalY * handleHalfGap,
      x2: tipCenterX - normalX * tipHalfGap,
      y2: tipCenterY - normalY * tipHalfGap,
    },
  };
}

function updateTipGap(dt) {
  let nearestDistance = Infinity;
  if (pointer.active && state.phase === "playing") {
    for (let i = 0; i < state.flies.length; i += 1) {
      const fly = state.flies[i];
      const distance = Math.hypot(fly.x - pointer.x, fly.y - pointer.y) - fly.size;
      if (distance < nearestDistance) {
        nearestDistance = distance;
      }
    }
  }

  state.nearestFlyDistance = nearestDistance;
  const approach = 1 - clamp(nearestDistance / CONFIG.tipAutoCloseRange, 0, 1);
  let targetGap = CONFIG.tipOpenGap;

  if (pointer.active && Number.isFinite(nearestDistance)) {
    targetGap =
      CONFIG.tipOpenGap - (CONFIG.tipOpenGap - CONFIG.tipClosedGap) * approach;
    if (nearestDistance <= CONFIG.tipSnapRange) {
      targetGap = CONFIG.tipClosedGap;
    }
  }

  state.targetTipGap = targetGap;
  const speed = targetGap < state.tipGap ? CONFIG.tipCloseSpeed : CONFIG.tipOpenSpeed;
  const blend = clamp(dt * speed, 0, 1);
  state.tipGap += (targetGap - state.tipGap) * blend;
}

function scoreCaughtFly(fly) {
  state.combo += 1;
  state.comboClock = CONFIG.comboWindowSeconds;
  const multiplier = 1 + Math.floor((state.combo - 1) / 4);
  const gained = fly.points * multiplier;
  state.score += gained;
  emitBurst(
    fly.x,
    fly.y,
    fly.type === "gold" ? "247,205,93" : "228,213,174",
    fly.type === "gold" ? 24 : 16,
  );
  const pair = getChopstickPairGeometry();
  addScorePopup(
    "+" + String(gained),
    pair.tipCenterX + rand(-6, 6),
    pair.tipCenterY - 14,
    fly.type === "gold" ? "255,213,103" : "255,241,209",
  );

  if (state.combo > 0 && state.combo % 5 === 0) {
    emitBurst(fly.x, fly.y, "210,79,47", 18);
  }
}

function tryCatchFlies() {
  if (!pointer.active || state.tipGap > CONFIG.tipCatchGapMax) {
    return;
  }

  const pair = getChopstickPairGeometry();
  for (let i = state.flies.length - 1; i >= 0; i -= 1) {
    const fly = state.flies[i];
    const centerDistance = Math.hypot(
      fly.x - pair.tipCenterX,
      fly.y - pair.tipCenterY,
    );
    if (centerDistance <= fly.size + CONFIG.tipCatchRadius) {
      state.flies.splice(i, 1);
      scoreCaughtFly(fly);
    }
  }
}

function handleFlyEscape(x, y) {
  state.lives -= 1;
  state.combo = 0;
  state.comboClock = 0;
  emitBurst(x, y, "210,79,47", 20);
  if (state.lives <= 0) {
    endGame("The flies took over the kitchen.");
  }
}

function updateFlies(dt) {
  const width = state.viewport.width;
  const height = state.viewport.height;
  const ramen = getRamenAnchor();
  const airCenterX = ramen.airCenterX;
  const airCenterY = ramen.airCenterY;
  const escapeX = ramen.airRadiusX + 260;
  const escapeY = ramen.airRadiusY + 220;

  for (let i = state.flies.length - 1; i >= 0; i -= 1) {
    const fly = state.flies[i];
    fly.age += dt;

    if (
      !fly.hasEnteredScene &&
      fly.x > -8 &&
      fly.x < width + 8 &&
      fly.y > -8 &&
      fly.y < height + 8
    ) {
      fly.hasEnteredScene = true;
    }

    let desiredVX = fly.vx;
    let desiredVY = fly.vy;

    if (fly.mode === "approach") {
      const toTargetX = fly.roamTargetX - fly.x;
      const toTargetY = fly.roamTargetY - fly.y;
      const targetDistance = Math.hypot(toTargetX, toTargetY) || 1;
      const dirX = toTargetX / targetDistance;
      const dirY = toTargetY / targetDistance;
      desiredVX = dirX * (fly.baseSpeed * 1.02) + Math.sin(fly.age * 4.1 + fly.wingSeed) * 18;
      desiredVY = dirY * (fly.baseSpeed * 1.02) + Math.cos(fly.age * 3.8 + fly.wingSeed) * 18;

      if (targetDistance < 44) {
        fly.mode = "roam";
        const nextTarget = pickAirspaceTarget(ramen, 0.98);
        fly.roamTargetX = nextTarget.x;
        fly.roamTargetY = nextTarget.y;
        fly.retargetClock = rand(1.1, 2.4);
      }
    } else {
      fly.retargetClock -= dt;
      let toTargetX = fly.roamTargetX - fly.x;
      let toTargetY = fly.roamTargetY - fly.y;
      let targetDistance = Math.hypot(toTargetX, toTargetY) || 1;

      if (targetDistance < 34 || fly.retargetClock <= 0) {
        const nextTarget = pickAirspaceTarget(ramen, 0.98);
        fly.roamTargetX = nextTarget.x;
        fly.roamTargetY = nextTarget.y;
        fly.retargetClock = rand(1.25, 2.8);
        toTargetX = fly.roamTargetX - fly.x;
        toTargetY = fly.roamTargetY - fly.y;
        targetDistance = Math.hypot(toTargetX, toTargetY) || 1;
      }

      const dirX = toTargetX / targetDistance;
      const dirY = toTargetY / targetDistance;
      const cruiseSpeed = fly.baseSpeed * (0.74 + Math.sin(fly.age * 1.7 + fly.wingSeed) * 0.14);
      desiredVX = dirX * cruiseSpeed + Math.sin(fly.age * 3.1 + fly.wingSeed * 1.7) * 22;
      desiredVY = dirY * cruiseSpeed + Math.cos(fly.age * 2.8 + fly.wingSeed) * 14;

      const dxCenter = fly.x - airCenterX;
      const dyCenter = fly.y - airCenterY;
      const ellipsePos =
        (dxCenter * dxCenter) / (ramen.airRadiusX * ramen.airRadiusX) +
        (dyCenter * dyCenter) / (ramen.airRadiusY * ramen.airRadiusY);
      if (ellipsePos > 1) {
        const centerDistance = Math.hypot(dxCenter, dyCenter) || 1;
        desiredVX += (-dxCenter / centerDistance) * fly.baseSpeed * 0.85;
        desiredVY += (-dyCenter / centerDistance) * fly.baseSpeed * 0.9;
      }

      if (fly.y > ramen.y - fly.size * 0.6) {
        desiredVY -= 140;
      }
    }

    let separationX = 0;
    let separationY = 0;
    for (let j = 0; j < state.flies.length; j += 1) {
      if (j === i) {
        continue;
      }

      const other = state.flies[j];
      const dx = fly.x - other.x;
      const dy = fly.y - other.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < 62) {
        const repel = ((62 - distance) / 62) * 210;
        separationX += (dx / distance) * repel;
        separationY += (dy / distance) * repel * 0.9;
      }
    }

    desiredVX += separationX;
    desiredVY += separationY;

    const steering = clamp(dt * (fly.mode === "approach" ? 2.35 : 2.9), 0, 1);
    fly.vx += (desiredVX - fly.vx) * steering;
    fly.vy += (desiredVY - fly.vy) * steering;

    const wobble =
      Math.sin(fly.age * fly.wobbleSpeed + fly.wingSeed) * (fly.mode === "approach" ? 6 : 7);
    const speed = Math.hypot(fly.vx, fly.vy) || 1;
    const normalX = -fly.vy / speed;
    const normalY = fly.vx / speed;
    fly.x += (fly.vx + normalX * wobble) * dt;
    fly.y += (fly.vy + normalY * wobble) * dt;

    fly.vx += rand(-5, 5) * dt;
    fly.vy += rand(-5, 5) * dt;

    const nextSpeed = Math.hypot(fly.vx, fly.vy) || 1;
    const minSpeed = fly.baseSpeed * 0.62;
    const maxSpeed = fly.baseSpeed * 1.25;

    if (nextSpeed < minSpeed) {
      fly.vx = (fly.vx / nextSpeed) * minSpeed;
      fly.vy = (fly.vy / nextSpeed) * minSpeed;
    } else if (nextSpeed > maxSpeed) {
      fly.vx = (fly.vx / nextSpeed) * maxSpeed;
      fly.vy = (fly.vy / nextSpeed) * maxSpeed;
    }

    if (fly.hasEnteredScene) {
      const airDx = fly.x - airCenterX;
      const airDy = fly.y - airCenterY;
      const outOfAirspace = Math.abs(airDx) > escapeX || Math.abs(airDy) > escapeY;
      const outOfView =
        fly.x < -150 ||
        fly.x > width + 150 ||
        fly.y < -170 ||
        fly.y > height + 160;
      const stayedTooLong = fly.age > 22;

      if (outOfAirspace || outOfView || stayedTooLong) {
        state.flies.splice(i, 1);
        handleFlyEscape(fly.x, fly.y);
      }
    }
  }
}

function updateParticlesAndTrail(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 250 * dt;
    p.vx *= 1 - dt * 1.4;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  for (let i = state.slashTrail.length - 1; i >= 0; i -= 1) {
    const point = state.slashTrail[i];
    point.life -= dt * 2.8;
    if (point.life <= 0) {
      state.slashTrail.splice(i, 1);
    }
  }

  for (let i = state.scorePopups.length - 1; i >= 0; i -= 1) {
    const popup = state.scorePopups[i];
    popup.life -= dt;
    popup.x += popup.vx * dt;
    popup.y += popup.vy * dt;
    popup.vx *= 1 - dt * 1.9;
    popup.vy += 36 * dt;

    if (popup.life <= 0) {
      state.scorePopups.splice(i, 1);
    }
  }
}

function updatePointer(dt) {
  const dx = pointer.x - pointer.prevX;
  const dy = pointer.y - pointer.prevY;
  const movement = Math.hypot(dx, dy);
  const rawSpeed = dt > 0 ? movement / dt : 0;

  pointer.speed = pointer.speed * 0.75 + rawSpeed * 0.25;

  if (movement > 0.4) {
    state.lastAngle = Math.atan2(dy, dx);
    if (pointer.active && pointer.speed > 70) {
      addTrailPoint(pointer.x, pointer.y, clamp(pointer.speed / 900, 0.08, 1));
    }
  }

  state.cursorGlow = clamp(pointer.speed / 1000, 0, 1);

  pointer.prevX = pointer.x;
  pointer.prevY = pointer.y;
}

function updateGame(dt) {
  state.elapsed += dt;
  state.timeLeft -= dt;

  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame("Time is up.");
    return;
  }

  if (state.comboClock > 0) {
    state.comboClock -= dt;
    if (state.comboClock <= 0) {
      state.combo = 0;
    }
  }

  state.spawnClock -= dt;

  while (state.spawnClock <= 0) {
    spawnFly();
    state.spawnClock += CONFIG.baseSpawnSeconds;
  }

  updateFlies(dt);
  updateTipGap(dt);
  tryCatchFlies();
  updateHud();
}

function drawBackdrop(width, height) {
  const wallGradient = ctx.createLinearGradient(0, 0, 0, height);
  wallGradient.addColorStop(0, "#d8b485");
  wallGradient.addColorStop(0.58, "#b67f50");
  wallGradient.addColorStop(1, "#8f5f39");
  ctx.fillStyle = wallGradient;
  ctx.fillRect(0, 0, width, height);

  const ceilingHeight = height * 0.12;
  const ceilingGradient = ctx.createLinearGradient(0, 0, 0, ceilingHeight);
  ceilingGradient.addColorStop(0, "rgba(232,199,150,0.98)");
  ceilingGradient.addColorStop(1, "rgba(177,121,77,0.95)");
  ctx.fillStyle = ceilingGradient;
  ctx.fillRect(0, 0, width, ceilingHeight);

  for (let i = 0; i < 7; i += 1) {
    const x = (i / 6) * width;
    ctx.strokeStyle = "rgba(123,78,45,0.45)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 18, ceilingHeight);
    ctx.stroke();
  }

  const panelY = height * 0.14;
  const panelHeight = height * 0.38;
  const panelCount = 4;
  const panelAreaWidth = width * 0.84;
  const panelGap = width * 0.018;
  const panelWidth = (panelAreaWidth - panelGap * (panelCount - 1)) / panelCount;
  const panelStartX = width * 0.08;

  for (let i = 0; i < panelCount; i += 1) {
    const x = panelStartX + i * (panelWidth + panelGap);
    const paperGlow = ctx.createLinearGradient(0, panelY, 0, panelY + panelHeight);
    paperGlow.addColorStop(0, "rgba(255,241,205,0.72)");
    paperGlow.addColorStop(1, "rgba(239,212,157,0.56)");
    ctx.fillStyle = paperGlow;
    ctx.fillRect(x, panelY, panelWidth, panelHeight);

    ctx.strokeStyle = "rgba(116,70,40,0.9)";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, panelY, panelWidth, panelHeight);

    ctx.strokeStyle = "rgba(152,102,67,0.46)";
    ctx.lineWidth = 1;
    for (let c = 1; c <= 3; c += 1) {
      const px = x + (panelWidth * c) / 4;
      ctx.beginPath();
      ctx.moveTo(px, panelY);
      ctx.lineTo(px, panelY + panelHeight);
      ctx.stroke();
    }
    for (let r = 1; r <= 4; r += 1) {
      const py = panelY + (panelHeight * r) / 5;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x + panelWidth, py);
      ctx.stroke();
    }
  }

  const curtainY = panelY + panelHeight + height * 0.02;
  const curtainHeight = height * 0.11;
  ctx.fillStyle = "rgba(143,52,40,0.9)";
  ctx.fillRect(width * 0.08, curtainY, width * 0.84, curtainHeight);

  const drapeCount = 6;
  const drapeWidth = (width * 0.84) / drapeCount;
  for (let i = 0; i < drapeCount; i += 1) {
    const x = width * 0.08 + i * drapeWidth;
    const wobble = Math.sin(state.elapsed * 1.2 + i * 0.6) * 4;
    ctx.fillStyle = "rgba(170,66,52,0.78)";
    ctx.beginPath();
    ctx.moveTo(x, curtainY);
    ctx.lineTo(x + drapeWidth, curtainY);
    ctx.lineTo(x + drapeWidth - 4, curtainY + curtainHeight + wobble);
    ctx.lineTo(x + 4, curtainY + curtainHeight - wobble);
    ctx.closePath();
    ctx.fill();
  }

  const lanternXs = [0.18, 0.5, 0.82];
  for (let i = 0; i < lanternXs.length; i += 1) {
    const lx = width * lanternXs[i] + Math.sin(state.elapsed * 1.3 + i) * 3;
    const ly = height * 0.17 + Math.cos(state.elapsed * 1.1 + i) * 2;
    const glow = ctx.createRadialGradient(lx, ly, 8, lx, ly, 52);
    glow.addColorStop(0, "rgba(255,230,162,0.56)");
    glow.addColorStop(1, "rgba(255,180,86,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 55, ly - 55, 110, 110);

    ctx.fillStyle = "rgba(221,85,52,0.92)";
    ctx.beginPath();
    ctx.ellipse(lx, ly, 17, 23, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,229,176,0.55)";
    ctx.lineWidth = 1;
    for (let b = -2; b <= 2; b += 1) {
      ctx.beginPath();
      ctx.moveTo(lx - 14, ly + b * 6);
      ctx.lineTo(lx + 14, ly + b * 6);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(121,76,43,0.9)";
    ctx.fillRect(lx - 5, ly - 28, 10, 4);
    ctx.fillRect(lx - 5, ly + 24, 10, 4);
    ctx.strokeStyle = "rgba(136,98,67,0.84)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, ly - 28);
    ctx.stroke();
  }

  const ramen = getRamenAnchor();
  const counterTopY = ramen.tableTopY;
  const counterTopHeight = ramen.tableTopHeight;
  const counterFrontHeight = height - counterTopY;

  const topGradient = ctx.createLinearGradient(
    0,
    counterTopY,
    0,
    counterTopY + counterTopHeight,
  );
  topGradient.addColorStop(0, "#e7bb84");
  topGradient.addColorStop(1, "#b57b4a");
  ctx.fillStyle = topGradient;
  ctx.fillRect(0, counterTopY, width, counterTopHeight);

  const frontGradient = ctx.createLinearGradient(
    0,
    counterTopY + counterTopHeight,
    0,
    height,
  );
  frontGradient.addColorStop(0, "#a76b3d");
  frontGradient.addColorStop(1, "#744629");
  ctx.fillStyle = frontGradient;
  ctx.fillRect(0, counterTopY + counterTopHeight, width, counterFrontHeight);

  const tableGlow = ctx.createRadialGradient(
    ramen.x,
    counterTopY + counterTopHeight * 0.5,
    36,
    ramen.x,
    counterTopY + counterTopHeight * 0.5,
    width * 0.48,
  );
  tableGlow.addColorStop(0, "rgba(255,220,166,0.38)");
  tableGlow.addColorStop(1, "rgba(255,220,166,0)");
  ctx.fillStyle = tableGlow;
  ctx.fillRect(0, counterTopY, width, counterTopHeight);

  for (let i = 0; i < 22; i += 1) {
    const y = counterTopY + counterTopHeight + i * (counterFrontHeight / 22);
    ctx.strokeStyle = "rgba(209,156,108," + (0.1 + i * 0.004) + ")";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawRamenBowl() {
  const ramen = getRamenAnchor();
  const x = ramen.x;
  const y = ramen.y;

  ctx.fillStyle = "rgba(84,58,39,0.4)";
  ctx.beginPath();
  ctx.ellipse(x, y + 28, 108, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  const bowlBody = ctx.createLinearGradient(0, y - 24, 0, y + 34);
  bowlBody.addColorStop(0, "#f2f3f7");
  bowlBody.addColorStop(1, "#cfdae9");
  ctx.fillStyle = bowlBody;
  ctx.beginPath();
  ctx.moveTo(x - 92, y - 8);
  ctx.quadraticCurveTo(x - 78, y + 34, x - 48, y + 38);
  ctx.lineTo(x + 48, y + 38);
  ctx.quadraticCurveTo(x + 78, y + 34, x + 92, y - 8);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(93,110,136,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 92, 22, 0, 0, Math.PI * 2);
  ctx.stroke();

  const broth = ctx.createLinearGradient(0, y - 20, 0, y + 8);
  broth.addColorStop(0, "#f8c879");
  broth.addColorStop(1, "#e59a4d");
  ctx.fillStyle = broth;
  ctx.beginPath();
  ctx.ellipse(x, y - 8, 84, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(247,213,132,0.95)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i += 1) {
    const nx = x - 62 + i * 14 + Math.sin(state.elapsed * 1.2 + i) * 2;
    ctx.beginPath();
    ctx.arc(nx, y - 9 + Math.sin(i * 0.6) * 2, 10 + (i % 3), Math.PI * 0.15, Math.PI * 0.9);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(52,74,45,0.9)";
  ctx.beginPath();
  ctx.ellipse(x - 30, y - 13, 16, 10, -0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(142,73,55,0.92)";
  ctx.beginPath();
  ctx.ellipse(x + 28, y - 9, 16, 10, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(245,239,224,0.95)";
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 10, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(239,166,96,0.95)";
  ctx.beginPath();
  ctx.ellipse(x + 2, y - 10, 4.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(94,153,76,0.95)";
  for (let i = 0; i < 9; i += 1) {
    const gx = x - 20 + i * 6 + Math.sin(i) * 2;
    const gy = y - 14 + (i % 3) * 3;
    ctx.beginPath();
    ctx.arc(gx, gy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 5; i += 1) {
    const sx = x - 34 + i * 18 + Math.sin(state.elapsed * 0.9 + i) * 2;
    const sy = y - 28 - i * 2;
    ctx.strokeStyle = "rgba(255,247,232,0.52)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx - 5, sy - 18, sx + 8, sy - 28, sx + 2, sy - 44);
    ctx.stroke();
  }
}

function drawFlies() {
  for (let i = 0; i < state.flies.length; i += 1) {
    const fly = state.flies[i];
    const angle = Math.atan2(fly.vy, fly.vx);
    const flap = Math.sin(state.elapsed * 48 + fly.wingSeed) * 0.68;
    const wingSpread = 3 + flap * 2.7;
    const isGold = fly.type === "gold";
    const abdomenTone = isGold ? "126,111,72" : fly.color;

    ctx.save();
    ctx.translate(fly.x, fly.y);
    ctx.rotate(angle);

    ctx.fillStyle = "rgba(244,246,250,0.5)";
    ctx.beginPath();
    ctx.ellipse(-3.8, -wingSpread, fly.size * 0.92, fly.size * 0.36, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-3.8, wingSpread, fly.size * 0.92, fly.size * 0.36, -0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(150,160,175,0.38)";
    ctx.lineWidth = 1;
    for (let w = -1; w <= 1; w += 1) {
      ctx.beginPath();
      ctx.moveTo(-8, w * wingSpread);
      ctx.lineTo(fly.size * 0.5, w * wingSpread + w * 3.2);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(34,30,28,0.82)";
    ctx.lineWidth = 1.1;
    for (let leg = -1; leg <= 1; leg += 1) {
      ctx.beginPath();
      ctx.moveTo(-1.5, leg * 1.8);
      ctx.lineTo(-fly.size * 0.72, leg * 3.7 + (leg === 0 ? 5 : 1.5));
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(" + abdomenTone + ",0.96)";
    ctx.beginPath();
    ctx.ellipse(-1.5, 0, fly.size * 0.72, fly.size * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(40,36,34,0.6)";
    ctx.lineWidth = 1;
    for (let s = 0; s < 4; s += 1) {
      const sx = -fly.size * 0.55 + s * (fly.size * 0.34);
      ctx.beginPath();
      ctx.moveTo(sx, -fly.size * 0.34);
      ctx.lineTo(sx + 1.3, fly.size * 0.34);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(66,62,64,0.98)";
    ctx.beginPath();
    ctx.ellipse(fly.size * 0.28, 0, fly.size * 0.52, fly.size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(44,42,44,1)";
    ctx.beginPath();
    ctx.arc(fly.size * 0.8, 0, fly.size * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(178,48,43,0.95)";
    ctx.beginPath();
    ctx.ellipse(fly.size * 0.87, -fly.size * 0.14, fly.size * 0.14, fly.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(fly.size * 0.87, fly.size * 0.14, fly.size * 0.14, fly.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (isGold) {
      ctx.strokeStyle = "rgba(255,215,118,0.58)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, fly.size * 1.02 + Math.sin(state.elapsed * 8 + i) * 0.65, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawTrail() {
  if (state.slashTrail.length < 2) {
    return;
  }

  for (let i = 0; i < state.slashTrail.length - 1; i += 1) {
    const a = state.slashTrail[i];
    const b = state.slashTrail[i + 1];
    const alpha = Math.min(a.life, b.life);
    ctx.strokeStyle = "rgba(248,232,196," + clamp(alpha * 1.8, 0, 0.72) + ")";
    ctx.lineWidth = (a.width + b.width) * 0.45 * alpha + 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawParticles() {
  for (let i = 0; i < state.particles.length; i += 1) {
    const p = state.particles[i];
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = "rgba(" + p.color + "," + alpha * 0.92 + ")";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.55 + alpha * 0.75), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawScorePopups() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < state.scorePopups.length; i += 1) {
    const popup = state.scorePopups[i];
    const alpha = clamp(popup.life / popup.maxLife, 0, 1);
    const scale = 0.92 + (1 - alpha) * 0.34;
    ctx.font = "600 " + Math.round(20 * scale) + "px Teko, sans-serif";
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = "rgba(52,24,18," + alpha * 0.62 + ")";
    ctx.fillStyle = "rgba(" + popup.color + "," + alpha * 0.98 + ")";
    ctx.strokeText(popup.text, popup.x, popup.y);
    ctx.fillText(popup.text, popup.x, popup.y);
  }
}

function drawSingleChopstick(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const dirX = dx / length;
  const dirY = dy / length;
  const normalX = -dirY;
  const normalY = dirX;

  const buttHalf = CONFIG.chopstickHandleWidth * 0.5;
  const tipHalf = CONFIG.chopstickTipWidth * 0.5;
  const outline = 1.2;

  ctx.fillStyle = "rgba(8,7,5,0.92)";
  ctx.beginPath();
  ctx.moveTo(x1 + normalX * (buttHalf + outline), y1 + normalY * (buttHalf + outline));
  ctx.lineTo(x1 - normalX * (buttHalf + outline), y1 - normalY * (buttHalf + outline));
  ctx.lineTo(x2 - normalX * (tipHalf + 0.6), y2 - normalY * (tipHalf + 0.6));
  ctx.lineTo(x2 + normalX * (tipHalf + 0.6), y2 + normalY * (tipHalf + 0.6));
  ctx.closePath();
  ctx.fill();

  const grain = ctx.createLinearGradient(x1, y1, x2, y2);
  grain.addColorStop(0, "#3d291d");
  grain.addColorStop(0.45, "#8a5d3d");
  grain.addColorStop(1, "#f2cd9d");
  ctx.fillStyle = grain;
  ctx.beginPath();
  ctx.moveTo(x1 + normalX * buttHalf, y1 + normalY * buttHalf);
  ctx.lineTo(x1 - normalX * buttHalf, y1 - normalY * buttHalf);
  ctx.lineTo(x2 - normalX * tipHalf, y2 - normalY * tipHalf);
  ctx.lineTo(x2 + normalX * tipHalf, y2 + normalY * tipHalf);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(248,228,194,0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + dirX * 12, y1 + dirY * 12);
  ctx.lineTo(x2 - dirX * 5, y2 - dirY * 5);
  ctx.stroke();

  const bandX = x1 + dirX * 9;
  const bandY = y1 + dirY * 9;
  ctx.strokeStyle = "rgba(58,37,25,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bandX + normalX * (buttHalf - 0.5), bandY + normalY * (buttHalf - 0.5));
  ctx.lineTo(bandX - normalX * (buttHalf - 0.5), bandY - normalY * (buttHalf - 0.5));
  ctx.stroke();
}

function drawChopsticks() {
  const pair = getChopstickPairGeometry();
  const top = pair.top;
  const bottom = pair.bottom;

  drawSingleChopstick(top.x1, top.y1, top.x2, top.y2);
  drawSingleChopstick(bottom.x1, bottom.y1, bottom.x2, bottom.y2);

  const tipTone = state.tipGap <= CONFIG.tipCatchGapMax
    ? "rgba(252,230,188,0.98)"
    : "rgba(248,225,182,0.84)";
  const tipRadius = state.tipGap <= CONFIG.tipCatchGapMax ? 1.65 : 1.45;

  ctx.fillStyle = tipTone;
  ctx.beginPath();
  ctx.arc(top.x2, top.y2, tipRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bottom.x2, bottom.y2, tipRadius, 0, Math.PI * 2);
  ctx.fill();

  if (state.tipGap <= CONFIG.tipCatchGapMax) {
    ctx.strokeStyle = "rgba(248,225,182,0.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(pair.tipCenterX, pair.tipCenterY, CONFIG.tipCatchRadius + 3.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCaptureAura() {
  if (!pointer.active || state.phase !== "playing") {
    return;
  }

  if (!Number.isFinite(state.nearestFlyDistance)) {
    return;
  }

  const proximity = 1 - clamp(state.nearestFlyDistance / CONFIG.tipAutoCloseRange, 0, 1);
  if (proximity <= 0.02) {
    return;
  }

  const radius = CONFIG.tipAutoCloseRange * (0.65 + (1 - proximity) * 0.35);
  ctx.strokeStyle = "rgba(210,79,47," + clamp(proximity * 0.46, 0, 0.46) + ")";
  ctx.lineWidth = 1 + proximity * 1.5;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCursorHalo() {
  const pair = getChopstickPairGeometry();
  const cursorX = pair.midX;
  const cursorY = pair.midY;
  const radius = 13 + state.cursorGlow * 16;
  const alpha = pointer.active ? 0.28 : 0.16;

  ctx.strokeStyle = "rgba(246,237,212," + alpha + ")";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cursorX, cursorY, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (pointer.active && pointer.speed > 180) {
    const angle = pair.angle;
    ctx.strokeStyle = "rgba(210,79,47,0.45)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cursorX, cursorY, radius + 6, angle - 0.6, angle + 0.6);
    ctx.stroke();
  }
}

function render() {
  const width = state.viewport.width;
  const height = state.viewport.height;

  ctx.clearRect(0, 0, width, height);
  drawBackdrop(width, height);
  drawRamenBowl();
  drawTrail();
  drawFlies();
  drawParticles();
  drawCaptureAura();
  drawChopsticks();
  drawScorePopups();
  drawCursorHalo();
}

function setPointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = clamp(event.clientX - rect.left, 0, rect.width);
  pointer.y = clamp(event.clientY - rect.top, 0, rect.height);
}

function onPointerDown(event) {
  if (pointer.id !== null && pointer.id !== event.pointerId) {
    return;
  }

  pointer.id = event.pointerId;
  pointer.active = true;
  setPointerFromEvent(event);
  pointer.prevX = pointer.x;
  pointer.prevY = pointer.y;
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (pointer.id !== null && event.pointerId !== pointer.id) {
    return;
  }
  if (pointer.id === null && event.pointerType === "mouse") {
    pointer.active = true;
  }
  setPointerFromEvent(event);
}

function onPointerUp(event) {
  if (pointer.id !== null && event.pointerId !== pointer.id) {
    return;
  }
  pointer.active = event.pointerType === "mouse";
  pointer.id = null;
}

function onKeyDown(event) {
  if (event.code === "Space") {
    event.preventDefault();
    if (state.phase !== "playing") {
      startGame();
    }
  }
}

function frame(timestamp) {
  if (!state.lastTimestamp) {
    state.lastTimestamp = timestamp;
  }

  let dt = (timestamp - state.lastTimestamp) / 1000;
  state.lastTimestamp = timestamp;
  dt = clamp(dt, 0, 0.035);

  updatePointer(dt);
  if (state.phase === "playing") {
    updateGame(dt);
  } else {
    updateTipGap(dt);
  }
  updateParticlesAndTrail(dt);
  render();
  requestAnimationFrame(frame);
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("pointercancel", onPointerUp);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
updateHud();
requestAnimationFrame(frame);
