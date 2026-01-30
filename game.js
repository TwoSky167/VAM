(function () {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const WORLD_SIZE = 4000;
  const WALL_THICKNESS = 80;
  const HALF = WORLD_SIZE / 2;
  const TILE = 32;
  const MAGNET_RADIUS = 120;
  const PLAYER_SPEED = 180;
  const PLAYER_RADIUS = 14;
  const MAX_WEAPON_LEVEL = 10;
  const BOSS_XP_GEMS = 55;
  const BOSS_XP_BONUS = 35;

  let gameState = 'menu';
  let gameTime = 0;
  let player = null;
  let enemies = [];
  let projectiles = [];
  let xpGems = [];
  let weapons = [];
  let orbs = [];
  let keys = {};
  let camera = { x: 0, y: 0 };
  let xp = 0;
  let xpToLevel = 30;
  let level = 1;
  let lastSpawn = 0;
  let spawnInterval = 2.5;
  let lastFrame = 0;

  const WEAPON_DEFS = {
    wand: { id: 'wand', name: '마법봉', icon: '✨', desc: '가장 가까운 적 유도 탄환', cooldown: 1.3, damage: 1.5, speed: 280 },
    garlic: { id: 'garlic', name: '마늘', icon: '🧄', desc: '주변 적 지속 데미지', cooldown: 0, damage: 1, radius: 50, tick: 0.5 },
    bible: { id: 'bible', name: '성경', icon: '📖', desc: '회전하는 성스러운 오브', cooldown: 0, damage: 1.5, radius: 60, speed: 2 },
    axe: { id: 'axe', name: '도끼', icon: '🪓', desc: '부메랑 도끼', cooldown: 1.8, damage: 3, range: 200 },
    fireball: { id: 'fireball', name: '화염구', icon: '🔥', desc: '적 관통 화염', cooldown: 1.6, damage: 2.5, speed: 240 },
  };

  function weaponLevelMult(lv) {
    const L = Math.min(lv, MAX_WEAPON_LEVEL);
    return 0.35 + 0.08 * L;
  }
  function weaponCooldownMult(lv) {
    const L = Math.min(lv, MAX_WEAPON_LEVEL);
    return Math.max(0.82, 1.18 - 0.036 * L);
  }
  function bibleOrbCount(lv) {
    if (lv >= 8) return 3;
    if (lv >= 5) return 2;
    return 1;
  }
  function wandFireballProjectileCount(lv) {
    let n = 1;
    if (lv >= 3) n++;
    if (lv >= 5) n++;
    if (lv >= 8) n++;
    return n;
  }

  const UPGRADE_DEFS = {
    maxHp: { name: '최대 체력 +20', icon: '❤️', desc: '체력 20 증가', type: 'stat', stat: 'maxHp', value: 20 },
    speed: { name: '이동 속도', icon: '👟', desc: '이동 속도 15% 증가', type: 'stat', stat: 'speed', value: 1.15 },
    magnet: { name: '자석', icon: '🧲', desc: '젬 흡수 범위 30% 증가', type: 'stat', stat: 'magnet', value: 1.3 },
    armor: { name: '방어력', icon: '🛡️', desc: '받는 데미지 10% 감소', type: 'stat', stat: 'armor', value: 0.9 },
  };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }

  function initPlayer() {
    player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      radius: PLAYER_RADIUS,
      speed: PLAYER_SPEED,
      magnetScale: 1,
      armorScale: 1,
      facing: { x: 1, y: 0 },
      lastWhip: 0,
      lastWand: 0,
      lastAxe: 0,
      lastFireball: 0,
      garlicAcc: 0,
      bibleAngle: 0,
    };
  }

  function addWeapon(id) {
    const def = WEAPON_DEFS[id];
    if (!def || weapons.some(w => w.id === id)) return;
    weapons.push({
      ...def,
      lastFire: 0,
      level: 1,
    });
    updateWeaponSlots();
  }

  function levelUpWeapon(id) {
    const w = weapons.find(w => w.id === id);
    if (!w || w.level >= MAX_WEAPON_LEVEL) return;
    w.level++;
    updateWeaponSlots();
  }

  function updateWeaponSlots() {
    const el = document.getElementById('weapon-slots');
    el.innerHTML = '';
    weapons.forEach(w => {
      const d = document.createElement('div');
      d.className = 'weapon-slot';
      d.title = `${w.name} Lv.${w.level}`;
      d.textContent = `${w.icon} Lv.${w.level}`;
      el.appendChild(d);
    });
  }

  function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 400 + Math.random() * 200;
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    const types = [
      { hp: 3, speed: 32, xp: 1, color: '#2d3d4d', r: 8, icon: '🦇' },
      { hp: 6, speed: 28, xp: 2, color: '#4a3d35', r: 10, icon: '💀' },
      { hp: 11, speed: 24, xp: 4, color: '#3d2d2d', r: 12, icon: '👻' },
      { hp: 18, speed: 20, xp: 6, color: '#2d1b2e', r: 14, icon: '😈' },
    ];
    const tier = Math.min(Math.floor((level - 1) / 2), types.length - 1);
    const t = types[Math.max(0, tier)];
    enemies.push({
      x, y, hp: t.hp, maxHp: t.hp, speed: t.speed, xp: t.xp,
      color: t.color, radius: t.r, icon: t.icon, boss: false,
    });
  }

  function spawnBoss() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 450 + Math.random() * 150;
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    const hp = 180 + Math.floor(gameTime / 30) * 25;
    enemies.push({
      x, y,
      hp, maxHp: hp,
      speed: 24,
      xp: 0,
      color: '#4a1520',
      radius: 22,
      icon: '👹',
      boss: true,
    });
  }

  function spawnXp(x, y, amount) {
    for (let i = 0; i < amount; i++) {
      const offset = (i - amount / 2) * 8;
      xpGems.push({
        x: x + offset,
        y: y,
        vx: 0,
        vy: 0,
        value: 1,
        radius: 6,
      });
    }
  }

  function hitEnemy(e, damage) {
    e.hp -= damage;
    if (e.hp <= 0) {
      if (e.boss) {
        spawnXp(e.x, e.y, BOSS_XP_GEMS);
        xp += BOSS_XP_BONUS;
      } else {
        spawnXp(e.x, e.y, e.xp);
      }
      const idx = enemies.indexOf(e);
      if (idx > -1) enemies.splice(idx, 1);
    }
  }

  function getNearestEnemy(x, y, maxDist = 9999) {
    let nearest = null;
    let dMin = maxDist;
    for (const e of enemies) {
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d < dMin) {
        dMin = d;
        nearest = { e, dx, dy, d };
      }
    }
    return nearest;
  }

  function getKNearestEnemies(x, y, k, maxDist = 9999) {
    const list = [];
    for (const e of enemies) {
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d <= maxDist) list.push({ e, dx, dy, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, k);
  }

  function fireWand() {
    const w = weapons.find(w => w.id === 'wand');
    const cd = (w.cooldown || 1) * weaponCooldownMult(w.level);
    if (!w || gameTime - w.lastFire < cd) return;
    const count = wandFireballProjectileCount(w.level);
    const targets = getKNearestEnemies(player.x, player.y, count, 400);
    if (!targets.length) return;
    w.lastFire = gameTime;
    const spd = (w.speed || 280) * (1 + 0.02 * (w.level - 1));
    const dmg = (w.damage || 4) * weaponLevelMult(w.level);
    for (let i = 0; i < count; i++) {
      const t = targets[i] || targets[0];
      const nx = t.dx / t.d;
      const ny = t.dy / t.d;
      projectiles.push({
        type: 'wand',
        x: player.x,
        y: player.y,
        vx: nx * spd,
        vy: ny * spd,
        damage: dmg,
        radius: 8,
        homing: true,
      });
    }
  }

  function fireAxe() {
    const w = weapons.find(w => w.id === 'axe');
    const cd = (w.cooldown || 1.4) * weaponCooldownMult(w.level);
    if (!w || gameTime - w.lastFire < cd) return;
    w.lastFire = gameTime;
    const dx = player.facing.x || 1;
    const dy = player.facing.y || 0;
    const mag = Math.hypot(dx, dy) || 1;
    const nx = dx / mag;
    const ny = dy / mag;
    const dmg = (w.damage || 8) * weaponLevelMult(w.level);
    projectiles.push({
      type: 'axe',
      x: player.x,
      y: player.y,
      vx: nx * 380,
      vy: ny * 380,
      damage: dmg,
      radius: 14,
      life: 1.2,
      maxLife: 1.2,
      returnPhase: false,
      ox: player.x,
      oy: player.y,
    });
  }

  function fireFireball() {
    const w = weapons.find(w => w.id === 'fireball');
    const cd = (w?.cooldown ?? 1.4) * weaponCooldownMult(w?.level ?? 1);
    if (!w || gameTime - w.lastFire < cd) return;
    const count = wandFireballProjectileCount(w.level);
    const targets = getKNearestEnemies(player.x, player.y, count, 500);
    let dirs = [];
    if (targets.length) {
      for (let i = 0; i < count; i++) {
        const t = targets[i] || targets[0];
        dirs.push({ nx: t.dx / t.d, ny: t.dy / t.d });
      }
    } else {
      let fx = player.facing.x || 1, fy = player.facing.y || 0;
      const m = Math.hypot(fx, fy) || 1;
      fx /= m;
      fy /= m;
      for (let i = 0; i < count; i++) dirs.push({ nx: fx, ny: fy });
    }
    w.lastFire = gameTime;
    const spd = (w.speed || 240) * (1 + 0.02 * (w.level - 1));
    const dmg = (w.damage || 6) * weaponLevelMult(w.level);
    for (const d of dirs) {
      projectiles.push({
        type: 'fireball',
        x: player.x,
        y: player.y,
        vx: d.nx * spd,
        vy: d.ny * spd,
        damage: dmg,
        radius: 6 + (w.level - 1) * 1.2,
        pierce: true,
      });
    }
  }

  function updateGarlic(dt) {
    const w = weapons.find(w => w.id === 'garlic');
    if (!w) return;
    w.garlicAcc = (w.garlicAcc || 0) + dt;
    if (w.garlicAcc < (w.tick || 0.5)) return;
    w.garlicAcc = 0;
    const r = (w.radius || 50) + (w.level - 1) * 5;
    const dmg = (w.damage || 1) * weaponLevelMult(w.level);
    for (const e of enemies) {
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < r + e.radius) hitEnemy(e, dmg);
    }
  }

  function updateBible(dt) {
    const w = weapons.find(w => w.id === 'bible');
    if (!w) return;
    const count = bibleOrbCount(w.level);
    const r = (w.radius || 60) + (w.level - 1) * 6;
    const spd = (w.speed || 2) + (w.level - 1) * 0.12;
    w.bibleAngle = (w.bibleAngle || 0) + spd * dt;
    const dmg = (w.damage || 1.5) * weaponLevelMult(w.level) * dt * 2.5;
    for (let i = 0; i < count; i++) {
      const a = w.bibleAngle + (i / count) * Math.PI * 2;
      const ox = player.x + Math.cos(a) * r;
      const oy = player.y + Math.sin(a) * r;
      for (const e of enemies) {
        const d = Math.hypot(e.x - ox, e.y - oy);
        if (d < 20 + e.radius) hitEnemy(e, dmg);
      }
    }
  }

  function levelUp() {
    level++;
    xp = 0;
    if (level === 2) xpToLevel = 18;
    else if (level === 3) xpToLevel = 24;
    else if (level === 4) xpToLevel = 30;
    else xpToLevel = Math.floor(28 + (level - 1) * 6 + Math.pow(level, 1.35));
    const pool = [];
    const weaponIds = Object.keys(WEAPON_DEFS);
    const upgradeIds = Object.keys(UPGRADE_DEFS);
    for (const id of weaponIds) {
      if (!weapons.some(w => w.id === id)) pool.push({ type: 'weapon', id });
    }
    for (const w of weapons) {
      if (w.level < MAX_WEAPON_LEVEL) pool.push({ type: 'weaponLevel', id: w.id });
    }
    for (const id of upgradeIds) pool.push({ type: 'upgrade', id });
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const choices = shuffled.slice(0, 3);
    spawnBoss();
    showLevelUpChoices(choices);
  }

  function showLevelUpChoices(choices) {
    gameState = 'levelup';
    const modal = document.getElementById('level-up-modal');
    const container = document.getElementById('level-up-choices');
    container.innerHTML = '';
    choices.forEach(c => {
      const opt = document.createElement('div');
      opt.className = 'level-up-option';
      let name, icon, desc;
      if (c.type === 'weapon') {
        const d = WEAPON_DEFS[c.id];
        name = d.name;
        icon = d.icon;
        desc = d.desc;
      } else if (c.type === 'weaponLevel') {
        const w = weapons.find(w => w.id === c.id);
        const d = WEAPON_DEFS[c.id];
        name = `${d.name} Lv.${(w?.level ?? 1) + 1}`;
        icon = d.icon;
        desc = `데미지·사거리 강화 (Lv.${(w?.level ?? 1) + 1})`;
      } else {
        const d = UPGRADE_DEFS[c.id];
        name = d.name;
        icon = d.icon;
        desc = d.desc;
      }
      opt.innerHTML = `<span class="icon">${icon}</span><span class="name">${name}</span><span class="desc">${desc}</span>`;
      opt.onclick = () => {
        if (c.type === 'weapon') addWeapon(c.id);
        else if (c.type === 'weaponLevel') levelUpWeapon(c.id);
        else applyUpgrade(c.id);
        modal.classList.add('hidden');
        gameState = 'play';
      };
      container.appendChild(opt);
    });
    modal.classList.remove('hidden');
  }

  function applyUpgrade(id) {
    const u = UPGRADE_DEFS[id];
    if (!u || u.type !== 'stat') return;
    if (u.stat === 'maxHp') {
      player.maxHp += u.value;
      player.hp = Math.min(player.hp + u.value, player.maxHp);
    } else if (u.stat === 'speed') player.speed *= u.value;
    else if (u.stat === 'magnet') player.magnetScale *= u.value;
    else if (u.stat === 'armor') player.armorScale *= u.value;
  }

  function update(dt) {
    if (gameState !== 'play') return;
    gameTime += dt;

    const ax = (keys['KeyA'] || keys['ArrowLeft'] ? -1 : 0) + (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0);
    const ay = (keys['KeyW'] || keys['ArrowUp'] ? -1 : 0) + (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
    const mag = Math.hypot(ax, ay) || 1;
    player.vx = (ax / mag) * player.speed;
    player.vy = (ay / mag) * player.speed;
    if (mag > 0) {
      player.facing.x = ax / mag;
      player.facing.y = ay / mag;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, player.x));
    player.y = Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, player.y));

    camera.x = player.x;
    camera.y = player.y;

    if (gameTime - lastSpawn > spawnInterval) {
      lastSpawn = gameTime;
      let num;
      if (level <= 2) num = 3 + Math.floor(gameTime / 25);
      else num = 1 + Math.floor(gameTime / 40);
      for (let i = 0; i < num; i++) spawnEnemy();
    }
    let interval;
    if (level <= 2) interval = 1.0;
    else interval = Math.max(0.6, 2.5 - gameTime * 0.008);
    spawnInterval = interval;

    const speedMult = (1 + gameTime * 0.004) * 1.5;
    for (const e of enemies) {
      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const spd = e.speed * speedMult;
      e.x += (dx / d) * spd * dt;
      e.y += (dy / d) * spd * dt;
      const dist = Math.hypot(player.x - e.x, player.y - e.y);
      if (dist < player.radius + e.radius) {
        const baseDmg = e.boss ? 14 : 5;
        const dmg = baseDmg * dt * (1 / player.armorScale);
        player.hp -= dmg;
        const knock = e.boss ? 55 : 40;
        player.x -= (dx / d) * knock * dt;
        player.y -= (dy / d) * knock * dt;
      }
    }

    for (const g of xpGems) {
      const dx = player.x - g.x, dy = player.y - g.y;
      const d = Math.hypot(dx, dy) || 1;
      const magnetR = MAGNET_RADIUS * player.magnetScale;
      if (d < magnetR) {
        const pull = 320 * (1 - d / magnetR);
        g.vx += (dx / d) * pull * dt;
        g.vy += (dy / d) * pull * dt;
      }
      g.vx *= 0.92;
      g.vy *= 0.92;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < player.radius + g.radius + 10) {
        xp += g.value;
        xpGems.splice(xpGems.indexOf(g), 1);
      }
    }

    if (xp >= xpToLevel) levelUp();

    weapons.forEach(w => {
      if (w.id === 'wand') fireWand();
      else if (w.id === 'axe') fireAxe();
      else if (w.id === 'fireball') fireFireball();
    });
    updateGarlic(dt);
    updateBible(dt);

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life !== undefined && p.type !== 'axe') {
        p.life -= dt;
        if (p.life <= 0) {
          projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.type === 'axe' && p.life !== undefined) {
        p.life -= dt;
        if (p.life < (p.maxLife || 1.2) * 0.5 && !p.returnPhase) {
          p.returnPhase = true;
          const dx = player.x - p.x, dy = player.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx = (dx / d) * 400;
          p.vy = (dy / d) * 400;
        }
        if (p.life <= 0) {
          projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.type === 'wand' && p.homing) {
        const near = getNearestEnemy(p.x, p.y, 120);
        if (near) {
          const spd = Math.hypot(p.vx, p.vy);
          const nx = near.dx / near.d;
          const ny = near.dy / near.d;
          p.vx = nx * spd;
          p.vy = ny * spd;
        }
      }
      for (const e of enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < e.radius + (p.radius || 10)) {
          hitEnemy(e, p.damage);
          if (!p.pierce) {
            projectiles.splice(i, 1);
            break;
          }
        }
      }
    }

    if (player.hp <= 0) {
      gameState = 'gameover';
      document.getElementById('game-over-modal').classList.remove('hidden');
      const m = Math.floor(gameTime / 60);
      const s = Math.floor(gameTime % 60);
      document.getElementById('final-time').textContent = `생존 시간: ${m}:${s.toString().padStart(2, '0')}`;
    }
  }

  function worldToScreen(x, y) {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    return {
      x: cw / 2 + (x - camera.x),
      y: ch / 2 + (y - camera.y),
    };
  }

  function draw() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    ctx.fillStyle = '#0f0c12';
    ctx.fillRect(0, 0, cw, ch);

    if (gameState !== 'play' && gameState !== 'levelup' && gameState !== 'paused') return;
    if (!player) return;

    const sx = cw / 2 - camera.x;
    const sy = ch / 2 - camera.y;

    const gridSize = TILE * 4;
    let gx0 = Math.floor((camera.x - cw) / gridSize) * gridSize;
    let gy0 = Math.floor((camera.y - ch) / gridSize) * gridSize;
    ctx.strokeStyle = 'rgba(60,50,70,0.4)';
    ctx.lineWidth = 1;
    for (let gx = gx0; gx < camera.x + cw + gridSize; gx += gridSize) {
      ctx.beginPath();
      ctx.moveTo(gx + sx, 0);
      ctx.lineTo(gx + sx, ch);
      ctx.stroke();
    }
    for (let gy = gy0; gy < camera.y + ch + gridSize; gy += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, gy + sy);
      ctx.lineTo(cw, gy + sy);
      ctx.stroke();
    }

    ctx.fillStyle = '#1e1825';
    ctx.fillRect(-HALF - WALL_THICKNESS + sx, -HALF - WALL_THICKNESS + sy, WORLD_SIZE + WALL_THICKNESS * 2, WALL_THICKNESS);
    ctx.fillRect(-HALF - WALL_THICKNESS + sx, HALF + sy, WORLD_SIZE + WALL_THICKNESS * 2, WALL_THICKNESS);
    ctx.fillRect(-HALF - WALL_THICKNESS + sx, -HALF + sy, WALL_THICKNESS, WORLD_SIZE);
    ctx.fillRect(HALF + sx, -HALF + sy, WALL_THICKNESS, WORLD_SIZE);
    ctx.strokeStyle = '#8b1538';
    ctx.lineWidth = 4;
    ctx.strokeRect(-HALF + sx, -HALF + sy, WORLD_SIZE, WORLD_SIZE);

    for (const g of xpGems) {
      const px = g.x + sx;
      const py = g.y + sy;
      if (px < -50 || px > cw + 50 || py < -50 || py > ch + 50) continue;
      ctx.fillStyle = 'rgba(74, 159, 217, 0.25)';
      ctx.beginPath();
      ctx.arc(px, py, g.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(123, 196, 239, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💎', px, py);
    }

    for (const e of enemies) {
      const px = e.x + sx;
      const py = e.y + sy;
      if (px < -100 || px > cw + 100 || py < -100 || py > ch + 100) continue;
      if (e.boss) {
        ctx.fillStyle = 'rgba(180,40,50,0.25)';
        ctx.beginPath();
        ctx.arc(px, py, e.radius + 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = e.color;
      ctx.globalAlpha = e.boss ? 0.7 : 0.5;
      ctx.beginPath();
      ctx.arc(px, py, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = e.boss ? 'rgba(200,60,60,0.9)' : 'rgba(0,0,0,0.7)';
      ctx.lineWidth = e.boss ? 3 : 2;
      ctx.stroke();
      const icon = e.icon || '👾';
      ctx.font = `${Math.round(e.radius * 1.6)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, px, py);
      if (e.boss) {
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#e85a5a';
        ctx.fillText('BOSS', px, py - e.radius - 8);
      }
      const showHp = e.boss || e.hp < e.maxHp;
      if (showHp) {
        const w = e.radius * 2;
        const barY = py - e.radius - (e.boss ? 18 : 10);
        ctx.fillStyle = '#333';
        ctx.fillRect(px - e.radius, barY, w, 4);
        ctx.fillStyle = e.boss ? '#c23a3a' : '#c23a3a';
        ctx.fillRect(px - e.radius, barY, w * (e.hp / e.maxHp), 4);
      }
    }

    const PROJ_ICONS = { wand: '✨', axe: '🪓', fireball: '🔥' };
    const PROJ_GLOW = {
      wand: 'rgba(155,125,219,0.4)',
      axe: 'rgba(139,115,85,0.35)',
      fireball: 'rgba(232,106,58,0.5)',
    };
    for (const p of projectiles) {
      const px = p.x + sx;
      const py = p.y + sy;
      if (px < -50 || px > cw + 50 || py < -50 || py > ch + 50) continue;
      const icon = PROJ_ICONS[p.type] || '●';
      const glow = PROJ_GLOW[p.type] || 'rgba(255,255,255,0.3)';
      const r = p.radius || 12;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, r + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${Math.round(r * 2.2)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(icon, px, py);
    }

    const wGarlic = weapons.find(w => w.id === 'garlic');
    if (wGarlic) {
      const r = (wGarlic.radius || 50) + (wGarlic.level - 1) * 5;
      const px = player.x + sx;
      const py = player.y + sy;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(100,180,100,0.15)');
      grad.addColorStop(0.6, 'rgba(80,140,80,0.08)');
      grad.addColorStop(1, 'rgba(60,100,60,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(100,180,100,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const wBible = weapons.find(w => w.id === 'bible');
    if (wBible) {
      const count = bibleOrbCount(wBible.level);
      const r = (wBible.radius || 60) + (wBible.level - 1) * 6;
      const base = wBible.bibleAngle || 0;
      const px = player.x + sx;
      const py = player.y + sy;
      for (let i = 0; i < count; i++) {
        const a = base + (i / count) * Math.PI * 2;
        const ox = px + Math.cos(a) * r;
        const oy = py + Math.sin(a) * r;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('📖', ox, oy);
      }
    }

    const px = player.x + sx;
    const py = player.y + sy;
    ctx.fillStyle = '#8b1538';
    ctx.beginPath();
    ctx.arc(px, py, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧛', px, py - 1);
  }

  function updateUI() {
    if (!player) return;
    const m = Math.floor(gameTime / 60);
    const s = Math.floor(gameTime % 60);
    document.getElementById('timer-value').textContent = `${m}:${s.toString().padStart(2, '0')}`;
    document.getElementById('level-num').textContent = level;
    const hw = document.getElementById('health-bar-wrap');
    const hf = document.getElementById('health-fill');
    const ht = document.getElementById('health-text');
    const pct = (player.hp / player.maxHp) * 100;
    hf.style.width = pct + '%';
    ht.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    const xpPct = (xp / xpToLevel) * 100;
    document.getElementById('xp-fill').style.width = xpPct + '%';
  }

  function gameLoop(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    update(dt);
    draw();
    updateUI();
    requestAnimationFrame(gameLoop);
  }

  function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-modal').classList.add('hidden');
    document.getElementById('level-up-modal').classList.add('hidden');
    document.getElementById('pause-overlay').classList.add('hidden');
    gameState = 'play';
    gameTime = 0;
    level = 1;
    xp = 0;
    xpToLevel = 10;
    enemies = [];
    projectiles = [];
    xpGems = [];
    orbs = [];
    weapons = [];
    lastSpawn = 0;
    spawnInterval = 2.5;
    initPlayer();
    addWeapon('wand');
    addWeapon('garlic');
    updateWeaponSlots();
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && gameState === 'gameover') startGame();
    if (e.repeat) return;
    if ((e.code === 'KeyP' || e.code === 'Escape') && gameState === 'play') {
      gameState = 'paused';
      document.getElementById('pause-overlay').classList.remove('hidden');
    } else if ((e.code === 'KeyP' || e.code === 'Escape') && gameState === 'paused') {
      gameState = 'play';
      document.getElementById('pause-overlay').classList.add('hidden');
    }
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(gameLoop);
})();
