/* =========================================
   CONSTANTS & CONFIG
   ========================================= */
const CANVAS_W = 900;
const CANVAS_H = 600;
const GROUND_Y = 500;
const GRAVITY = 0.6;
const JUMP_STRENGTH = -15.0;

// Asset manifest
const ASSETS_PATH = "./assets/";
const IMAGES_TO_LOAD = {
    bg: "bg1.png",
    cover: "cover.png",
    shield: "shield.png"
};
const AUDIO_TO_LOAD = {
    bgmusic: "bgmusic.mp3",
    jump: "jumpw.mp3",
    splash: "splash1.mp3",
    gameover: "gameover.mp3",
    shield: "shield.wav", // optional
    hit: "hit.wav"        // optional
};

// Sequences
const SEQ_SWIM = ["swim1.png", "swim2.png", "swim3.png", "swim4.png"];
const SEQ_JUMP = ["jump1.png", "jump2.png", "jump3.png", "jump4.png", "jump5.png", "jump6.png"];
const SEQ_WATER = ["water1.png", "water2.png", "water3.png", "water4.png"];
const SEQ_ICE = ["ice1.png", "ice2.png", "ice3.png", "ice4.png", "ice5.png", "ice6.png"];
const SEQ_CLOUD = ["cloud1.png", "cloud2.png", "cloud3.png", "cloud4.png", "cloud5.png", "cloud6.png"];

/* =========================================
   GLOBAL STATE
   ========================================= */
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let assets = { images: {}, audio: {} };
let loadedCount = 0;
let totalAssets = 0;

let gameState = {
    mode: "LOADING", // LOADING, COVER, PLAY, OVER
    score: 0,
    best: parseInt(localStorage.getItem("jumper_highscore") || "0"),
    frames: 0,
    shake: 0,
    audioUnlocked: false
};

// Game Objects
let dolphin = {
    x: 100,
    y: GROUND_Y,
    vy: 0,
    isJumping: false,
    landingHold: 0
};

let clouds = [];
let ice = {
    active: false,
    x: 0,
    y: 450,
    img: null,
    passed: false
};
let powerup = {
    active: false,
    x: 0,
    y: 0,
    speed: 0,
    shieldOn: false
};

// Buttons
const btnW = 220, btnH = 70;
const startBtn = { x: (CANVAS_W - btnW)/2, y: 480, w: btnW, h: btnH, text: "START" };
const restartBtn = { x: (CANVAS_W - btnW)/2, y: 360, w: btnW, h: btnH, text: "RESTART" };

/* =========================================
   ASSET LOADING
   ========================================= */
function initLoad() {
    let imgList = [
        ...Object.values(IMAGES_TO_LOAD),
        ...SEQ_SWIM, ...SEQ_JUMP, ...SEQ_WATER, ...SEQ_ICE, ...SEQ_CLOUD
    ];
    let audList = Object.values(AUDIO_TO_LOAD);
    
    totalAssets = imgList.length + audList.length;
    const loadingBar = document.getElementById("loading-bar");
    const loadingText = document.getElementById("loading-text");

    function updateProgress(name) {
        loadedCount++;
        let pct = Math.floor((loadedCount / totalAssets) * 100);
        loadingBar.style.width = pct + "%";
        loadingText.innerText = `Loaded: ${name}`;
        
        if (loadedCount >= totalAssets) {
            setTimeout(() => {
                document.getElementById("loading-screen").style.display = "none";
                gameState.mode = "COVER";
                loop();
            }, 500);
        }
    }

    // Load Images
    imgList.forEach(fname => {
        let img = new Image();
        img.src = ASSETS_PATH + fname;
        img.onload = () => {
            assets.images[fname] = img;
            updateProgress(fname);
        };
        img.onerror = () => {
            console.warn("Missing image:", fname);
            // Create placeholder
            assets.images[fname] = createPlaceholder(fname);
            updateProgress(fname);
        };
    });

    // Load Audio
    Object.keys(AUDIO_TO_LOAD).forEach(key => {
        let fname = AUDIO_TO_LOAD[key];
        let aud = new Audio();
        aud.src = ASSETS_PATH + fname;
        aud.oncanplaythrough = () => {
            if (!assets.audio[key]) { // prevent double count
                assets.audio[key] = aud;
                updateProgress(fname);
            }
        };
        aud.onerror = () => {
            console.warn("Missing audio:", fname);
            assets.audio[key] = null; // Mark as missing
            updateProgress(fname);
        };
        // Fallback if browser doesn't trigger canplaythrough for small files quickly
        setTimeout(() => {
            if (!assets.audio[key] && assets.audio[key] !== null) {
                assets.audio[key] = aud;
                updateProgress(fname);
            }
        }, 2000);
    });
}

function createPlaceholder(text) {
    let c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    let x = c.getContext("2d");
    x.fillStyle = "red";
    x.fillRect(0,0,64,64);
    x.fillStyle = "white";
    x.font = "10px Arial";
    x.fillText(text, 5, 30, 50);
    let i = new Image();
    i.src = c.toDataURL();
    return i;
}

function playSound(key, loop=false, vol=1.0) {
    if (!gameState.audioUnlocked) return;
    let aud = assets.audio[key];
    if (aud) {
        try {
            // Clone node to allow overlapping sounds (except music)
            if (!loop) {
                let clone = aud.cloneNode();
                clone.volume = vol;
                clone.play().catch(e=>{});
            } else {
                if (aud.paused) {
                    aud.loop = true;
                    aud.volume = vol;
                    aud.play().catch(e=>{});
                }
            }
        } catch(e) {}
    }
}

/* =========================================
   GAME LOGIC
   ========================================= */

function resetGame() {
    gameState.score = 0;
    gameState.shake = 0;
    
    // Dolphin reset
    dolphin.x = 100;
    dolphin.y = GROUND_Y;
    dolphin.vy = 0;
    dolphin.isJumping = false;
    dolphin.landingHold = 0;

    // Obstacle reset
    ice.x = 1100;
    ice.y = 450;
    ice.active = true;
    ice.passed = false;
    ice.img = getRandomImage(SEQ_ICE);

    // Powerup reset
    powerup.active = false;
    powerup.shieldOn = false;
    powerup.x = CANVAS_W + 600;
    powerup.y = 390;

    // Clouds
    clouds = [];
    for(let i=0; i<12; i++) spawnCloud();

    gameState.mode = "PLAY";
    
    // Music
    playSound("bgmusic", true, 0.35);
}

function spawnCloud(startOffScreen=false) {
    let imgName = SEQ_CLOUD[Math.floor(Math.random() * SEQ_CLOUD.length)];
    let img = assets.images[imgName];
    if (!img) return;

    let scale = 0.45 + Math.random() * 0.55;
    let w = img.width * scale;
    let h = img.height * scale;
    
    // Position
    let x = startOffScreen 
        ? CANVAS_W + Math.random() * 700 
        : Math.random() * (CANVAS_W + 700);
        
    let y = 10 + Math.random() * 200;
    let speed = 0.8 + Math.random() * 1.4;

    clouds.push({ img, x, y, w, h, speed });
}

function triggerJump() {
    if (gameState.mode !== "PLAY") return;
    if (!dolphin.isJumping) {
        dolphin.isJumping = true;
        dolphin.vy = JUMP_STRENGTH;
        dolphin.landingHold = 0;
        playSound("jump", false, 0.9);
    }
}

function update() {
    gameState.frames++;

    // Shake decay
    if (gameState.shake > 0) gameState.shake--;

    if (gameState.mode === "PLAY") {
        
        // --- Difficulty Scaling ---
        let iceSpeed = Math.min(18, 10 + Math.floor(gameState.score / 4));

        // --- Clouds ---
        clouds.forEach(c => {
            c.x -= c.speed;
        });
        // Remove and Respawn clouds
        clouds = clouds.filter(c => c.x > -c.w - 100);
        while (clouds.length < 12) spawnCloud(true);

        // --- Ice Obstacle ---
        ice.x -= iceSpeed;
        if (ice.x <= -200) {
            // Respawn
            let hi = Math.max(950, 1400 - gameState.score * 10);
            let lo = Math.max(800, 1100 - gameState.score * 10);
            let gap = lo + Math.random() * (hi - lo);
            
            ice.x = gap; // Actually logic says random gap, simplified to just reset to far right + random
            // Pygame logic: S["ice_x"] = random.randint(lo, hi) -- this sets absolute X pos?
            // Wait, Pygame sets absolute X. Let's do:
            // If x < -200, move it to right.
            ice.x = lo + Math.random() * (hi - lo); // This acts as distance from 0? No, from left edge?
            // In Pygame: if ice_x <= -200: ice_x = random(lo, hi).
            // This means it jumps back to screen right + delay.
            
            ice.passed = false;
            ice.img = getRandomImage(SEQ_ICE);
            
            // Chance for powerup
            if (!powerup.active && Math.random() < 0.18 && assets.images["shield.png"]) {
                powerup.active = true;
                powerup.x = CANVAS_W + 200 + Math.random() * 700;
                powerup.y = 350 + Math.random() * 140;
                powerup.speed = 1.6 + Math.random() * 1.0;
            }
        }

        // Score update
        let iceW = ice.img ? ice.img.width : 50;
        if (!ice.passed && (ice.x + iceW < dolphin.x)) {
            gameState.score++;
            ice.passed = true;
        }

        // --- Powerup Update ---
        if (powerup.active) {
            powerup.x -= powerup.speed;
            
            // Collision with dolphin
            let pRect = {x: powerup.x + 10, y: powerup.y + 10, w: 40, h: 40}; // approximate
            let dImg = dolphin.isJumping ? assets.images["jump6.png"] : assets.images["swim1.png"];
            let dRect = {x: dolphin.x + 10, y: dolphin.y + 5, w: dImg.width-20, h: dImg.height-10};

            if (rectIntersect(pRect, dRect)) {
                powerup.shieldOn = true;
                powerup.active = false;
                playSound("shield", false, 0.9);
            }

            if (powerup.x < -200) powerup.active = false;
        }

        // --- Dolphin Physics ---
        if (dolphin.isJumping) {
            dolphin.vy += GRAVITY;
            dolphin.y += dolphin.vy;

            // Landing
            if (dolphin.y >= GROUND_Y) {
                dolphin.y = GROUND_Y;
                dolphin.vy = 0;
                
                // First frame of landing
                if (dolphin.landingHold === 0) {
                    playSound("splash", false, 0.8);
                    startShake(8);
                }

                if (dolphin.landingHold < 8) {
                    dolphin.landingHold++;
                } else {
                    dolphin.landingHold = 0;
                    dolphin.isJumping = false;
                }
            }
        } else {
            dolphin.y = GROUND_Y;
        }

        // --- Collision (Ice) ---
        if (ice.img) {
            let dImg = dolphin.isJumping ? assets.images["jump6.png"] : assets.images["swim1.png"];
            // Hitbox Shrink
            let dRect = {x: dolphin.x + 20, y: dolphin.y + 10, w: dImg.width - 40, h: dImg.height - 20};
            let iRect = {x: ice.x + 10, y: ice.y + 10, w: ice.img.width - 20, h: ice.img.height - 10};

            if (rectIntersect(dRect, iRect)) {
                if (powerup.shieldOn) {
                    powerup.shieldOn = false;
                    startShake(18);
                    playSound("hit", false, 0.8);
                    ice.x += 180; // push away
                } else {
                    gameOver();
                }
            }
        }
    }
}

function gameOver() {
    gameState.mode = "OVER";
    startShake(24);
    if (gameState.score > gameState.best) {
        gameState.best = gameState.score;
        localStorage.setItem("jumper_highscore", gameState.best);
    }
    playSound("gameover", false, 0.9);
}

function startShake(frames) {
    gameState.shake = frames;
}

function getRandomImage(list) {
    let name = list[Math.floor(Math.random() * list.length)];
    return assets.images[name];
}

function rectIntersect(r1, r2) {
    return !(r2.x > r1.x + r1.w || 
             r2.x + r2.w < r1.x || 
             r2.y > r1.y + r1.h || 
             r2.y + r2.h < r1.y);
}


/* =========================================
   DRAWING
   ========================================= */
function draw() {
    // Canvas resizing handled by CSS, but we must clear internal resolution
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // -- Shake Offset --
    ctx.save();
    if (gameState.shake > 0) {
        let intensity = (gameState.shake > 10) ? 6 : 3;
        let ox = (Math.random() * intensity * 2) - intensity;
        let oy = (Math.random() * intensity * 2) - intensity;
        ctx.translate(ox, oy);
    }

    // 1. Background
    if (assets.images["bg1.png"]) {
        ctx.drawImage(assets.images["bg1.png"], 0, 0);
    } else {
        ctx.fillStyle = "#050a1e";
        ctx.fillRect(0,0, CANVAS_W, CANVAS_H);
    }

    // 2. Clouds
    if (gameState.mode === "PLAY" || gameState.mode === "OVER") {
        clouds.forEach(c => {
            ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
        });
    }

    // 3. Water Animation
    let waterIdx = Math.floor((gameState.frames % 40) / 10); // 10 frames per image
    let waterImg = assets.images[SEQ_WATER[waterIdx]];
    if (waterImg) ctx.drawImage(waterImg, 0, 400);

    // 4. Ice
    if ((gameState.mode === "PLAY" || gameState.mode === "OVER") && ice.img) {
        ctx.drawImage(ice.img, ice.x, ice.y);
    }

    // 5. Powerup
    if (gameState.mode === "PLAY" && powerup.active && assets.images["shield.png"]) {
        ctx.drawImage(assets.images["shield.png"], powerup.x, powerup.y);
    }

    // 6. Dolphin
    if (gameState.mode === "PLAY" || gameState.mode === "OVER") {
        let dImg = null;
        if (gameState.mode === "PLAY" && dolphin.isJumping) {
            let dy = GROUND_Y - dolphin.y;
            // Logic from python
            if (dolphin.vy < 0 && dy <= 2) dImg = assets.images["jump1.png"];
            else if (dolphin.vy < 0) dImg = (dy < 60) ? assets.images["jump2.png"] : assets.images["jump3.png"];
            else if (dolphin.y >= GROUND_Y - 2) dImg = assets.images["jump6.png"];
            else dImg = (dy > 60) ? assets.images["jump4.png"] : assets.images["jump5.png"];
        } else {
            // Swim animation
            let swimIdx = Math.floor((gameState.frames % 40) / 10);
            dImg = assets.images[SEQ_SWIM[swimIdx]];
        }
        if (dImg) ctx.drawImage(dImg, dolphin.x, dolphin.y);
    }

    ctx.restore(); // End shake

    // --- UI OVERLAYS (No shake) ---

    // HUD
    if (gameState.mode === "PLAY" || gameState.mode === "OVER") {
        ctx.fillStyle = "gold";
        ctx.font = "bold 26px Arial";
        ctx.fillText(`Score: ${gameState.score}`, 20, 30);
        ctx.fillStyle = "white";
        ctx.fillText(`Best: ${gameState.best}`, 20, 60);

        if (gameState.mode === "PLAY" && powerup.shieldOn) {
            ctx.fillStyle = "#78dcff";
            ctx.font = "bold 18px Arial";
            ctx.fillText("SHIELD", CANVAS_W - 90, 40);
        }
    }

    // COVER
    if (gameState.mode === "COVER") {
        if (assets.images["cover.png"]) {
            ctx.drawImage(assets.images["cover.png"], 0, 0);
        } else {
            ctx.fillStyle = "#050a1e";
            ctx.fillRect(0,0,CANVAS_W,CANVAS_H);
        }
        
        drawTextCentered("Jump over ice, keep swimming.", 440, "bold 26px Arial", "gold");
        drawButton(startBtn);
        
        ctx.fillStyle = "white";
        ctx.font = "bold 18px Arial";
        ctx.fillText(`Best: ${gameState.best}`, 20, 30);
    }

    // OVER
    if (gameState.mode === "OVER") {
        // Dark overlay
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.fillRect(0,0,CANVAS_W, CANVAS_H);

        drawTextCentered("GAME OVER", 220, "bold 56px Arial", "gold");
        drawButton(restartBtn);
        drawTextCentered("Click RESTART or press R", 450, "bold 18px Arial", "white");
    }
}

function drawTextCentered(text, y, font, color) {
    ctx.fillStyle = color;
    ctx.font = font;
    let w = ctx.measureText(text).width;
    ctx.fillText(text, (CANVAS_W - w)/2, y);
}

function drawButton(btn) {
    let mx = mouse.x; 
    let my = mouse.y;
    // Check hover (scaled coordinates needed? No, canvas is 900x600 internal)
    // We need to convert screen mouse pos to canvas internal pos
    
    let hover = (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h);
    
    ctx.fillStyle = hover ? "#1eaa ff" : "#1478dc";
    ctx.beginPath();
    ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 14);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "white";
    ctx.stroke();

    ctx.fillStyle = "white";
    ctx.font = "bold 26px Arial";
    let tw = ctx.measureText(btn.text).width;
    ctx.fillText(btn.text, btn.x + (btn.w - tw)/2, btn.y + 45);
}


/* =========================================
   INPUT & LOOP
   ========================================= */
let mouse = { x: 0, y: 0, clicked: false };

function getCanvasPos(evt) {
    let rect = canvas.getBoundingClientRect();
    let clientX = evt.clientX;
    let clientY = evt.clientY;
    if (evt.touches && evt.touches.length > 0) {
        clientX = evt.touches[0].clientX;
        clientY = evt.touches[0].clientY;
    }
    return {
        x: (clientX - rect.left) * (CANVAS_W / rect.width),
        y: (clientY - rect.top) * (CANVAS_H / rect.height)
    };
}

// Mouse / Touch Move
['mousemove', 'touchmove'].forEach(etype => {
    window.addEventListener(etype, e => {
        let pos = getCanvasPos(e);
        mouse.x = pos.x;
        mouse.y = pos.y;
    }, {passive: false});
});

// Click / Tap
['mousedown', 'touchstart'].forEach(etype => {
    window.addEventListener(etype, e => {
        // Unlock audio context on first interaction
        if (!gameState.audioUnlocked) {
            gameState.audioUnlocked = true;
            // Try resuming audio context if it exists (for web audio api), 
            // but here we use HTML5 Audio elements which just need a user interaction trigger.
        }

        let pos = getCanvasPos(e);
        mouse.x = pos.x;
        mouse.y = pos.y;
        
        if (gameState.mode === "COVER") {
            if (isInside(mouse, startBtn)) {
                resetGame();
            }
        } else if (gameState.mode === "OVER") {
            if (isInside(mouse, restartBtn)) {
                resetGame();
            }
        } else if (gameState.mode === "PLAY") {
            triggerJump();
        }
    }, {passive: false});
});

// Keyboard
window.addEventListener("keydown", e => {
    if (e.code === "Space") {
        if (gameState.mode === "PLAY") triggerJump();
    }
    if (e.code === "KeyR" && gameState.mode === "OVER") {
        resetGame();
    }
});

function isInside(m, btn) {
    return (m.x >= btn.x && m.x <= btn.x + btn.w && m.y >= btn.y && m.y <= btn.y + btn.h);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Start
initLoad();