import * as THREE from 'three';
import { BoidSystem, STATES } from './swarm/BoidSystem.js';
import { SwarmRenderer } from './swarm/SwarmRenderer.js';
import { BackgroundStars } from './fx/BackgroundStars.js';
import { HUD } from './hud/HUD.js';
import { CommandReceiver } from './net/CommandReceiver.js';
import { LaserFX } from './fx/LaserFX.js';
import { AudioManager } from './audio/AudioManager.js';

// ─── Renderer & Scene ────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.getElementById('canvas-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(0, 10, 35);
camera.lookAt(0, 0, -20);

// Ambient light (subtle)
scene.add(new THREE.AmbientLight(0x111133, 2));

// ─── Core Systems ────────────────────────────────────────────────────────────
const stars = new BackgroundStars(scene);
const boids = new BoidSystem(4000);
const swarmRenderer = new SwarmRenderer(scene, boids);
const hud = new HUD(() => endGame(false, 'TIME UP — MISSION FAILED'));
const net = new CommandReceiver('ws://localhost:8765', (type, data) => {
  // Backwards compatibility with mouse fallback
  if (typeof data === 'string') {
    onCommand(type, { cmd: data });
  } else {
    onCommand(type, data);
  }
});
const lasers = new LaserFX(scene, 1000);
const audio = new AudioManager();

// ─── Enemy Pool ──────────────────────────────────────────────────────────────
const enemies = []; // { mesh, hp, maxHp, type, velocity }
let homeworldMesh = null, homeworldHp = 0;

function spawnAsteroid() {
  const geo = new THREE.IcosahedronGeometry(3 + Math.random() * 4, 1);
  // Deform for rocky look
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) * (0.8 + Math.random() * 0.4),
      pos.getY(i) * (0.8 + Math.random() * 0.4),
      pos.getZ(i) * (0.8 + Math.random() * 0.4)
    );
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x886644, roughness: 0.9, metalness: 0.1 });
  const mesh = new THREE.Mesh(geo, mat);
  // Spawn from deep space (negative Z)
  const angle = Math.random() * Math.PI * 2;
  const r = 50 + Math.random() * 30;
  // Spawn far away in negative Z
  mesh.position.set(r * Math.cos(angle), (Math.random()-0.5)*30, -180 - Math.random()*40);
  mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
  scene.add(mesh);
  const speed = 4 + Math.random() * 6;
  const vel = new THREE.Vector3(-mesh.position.x, 0, -mesh.position.z).normalize().multiplyScalar(speed);
  vel.y = (Math.random()-0.5) * 2;
  enemies.push({ mesh, hp: 60, maxHp: 60, type: 'asteroid', velocity: vel, rotSpeed: (Math.random()-0.5)*1.5 });
  return mesh;
}

function spawnWarship() {
  // Fractal geometry warship
  const group = new THREE.Group();
  const bodyGeo = new THREE.OctahedronGeometry(6, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x220033, emissive: 0x660022, emissiveIntensity: 0.6, roughness: 0.3 });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));
  // Add appendages
  for (let i = 0; i < 4; i++) {
    const wing = new THREE.Mesh(
      new THREE.TetrahedronGeometry(3 + Math.random()*2, 0),
      new THREE.MeshStandardMaterial({ color: 0x440044, emissive: 0x880033, emissiveIntensity: 0.8 })
    );
    wing.position.set(Math.cos(i*Math.PI/2)*7, 0, Math.sin(i*Math.PI/2)*7);
    group.add(wing);
  }
  // Warships come from deep Z as well
  const angle = Math.random() * Math.PI; // upper hemisphere mostly
  const r = 70 + Math.random() * 40;
  group.position.set(r * Math.cos(angle), 10 + Math.random()*30, -160 - Math.random()*50);
  scene.add(group);
  const speed = 5 + Math.random() * 4;
  const vel = new THREE.Vector3(-group.position.x, 0, -group.position.z).normalize().multiplyScalar(speed);
  enemies.push({ mesh: group, hp: 200, maxHp: 200, type: 'warship', velocity: vel, rotSpeed: (Math.random()-0.5)*0.8 });
  return group;
}

function spawnHomeworld() {
  const group = new THREE.Group();

  // Core: lumpy deformed dark alien sphere
  const coreGeo = new THREE.IcosahedronGeometry(20, 4);
  // Randomly deform vertices for lumpy alien look
  const pos = coreGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const noise = 1 + (Math.random() - 0.5) * 0.4;
    pos.setXYZ(i, x * noise, y * noise, z * noise);
  }
  coreGeo.computeVertexNormals();
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x0a0f33,
    emissive: 0x001177,
    emissiveIntensity: 1.2,
    roughness: 0.9, metalness: 0.3,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // Wireframe shell - gives alien textured feel
  const wireGeo = new THREE.IcosahedronGeometry(21, 3);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x003399, wireframe: true, transparent: true, opacity: 0.35 });
  group.add(new THREE.Mesh(wireGeo, wireMat));

  // Outer glow halo
  const haloGeo = new THREE.SphereGeometry(25, 16, 16);
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x0044ff, transparent: true, opacity: 0.08, side: THREE.BackSide });
  group.add(new THREE.Mesh(haloGeo, haloMat));

  homeworldMesh = group;
  homeworldMesh.position.set(0, 0, -100);
  scene.add(homeworldMesh);
  homeworldHp = 8000;

  // Pulsing point light
  const light = new THREE.PointLight(0x3366ff, 5, 280);
  group.add(light);
}

// ─── Laser / Explosion FX ────────────────────────────────────────────────────
const explosions = []; // { points, life, maxLife }

// Create a visual aim cursor for gesture (Robust Red Crosshair - using BoxGeometry for thickness)
const aimGroup = new THREE.Group();
const crossMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

// Vertical bar (thick)
const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 1.0), crossMat);
aimGroup.add(vBar);

// Horizontal bar (thick)
const hBar = new THREE.Mesh(new THREE.BoxGeometry(8, 0.8, 1.0), crossMat);
aimGroup.add(hBar);

// Center ring (pulsing color)
const ringGeo = new THREE.TorusGeometry(1.6, 0.15, 12, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
const ring = new THREE.Mesh(ringGeo, ringMat);
aimGroup.add(ring);

const aimCursor = aimGroup;
aimCursor.position.set(0, 0, -65);
aimCursor.visible = false;
scene.add(aimCursor);

function spawnExplosion(pos, color = 0xff6600, count = 80) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocitiesArr = [];
  for (let i = 0; i < count; i++) {
    positions[i*3] = pos.x; positions[i*3+1] = pos.y; positions[i*3+2] = pos.z;
    const v = new THREE.Vector3((Math.random()-0.5),(Math.random()-0.5),(Math.random()-0.5)).normalize();
    v.multiplyScalar(5 + Math.random() * 20);
    velocitiesArr.push(v);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color, size: 1.2, sizeAttenuation: true, transparent: true });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  explosions.push({ points: pts, positions: geo.attributes.position, velocities: velocitiesArr, life: 1.5, maxLife: 1.5, mat });
  audio.playSFX('explosion');
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life -= dt;
    if (e.life <= 0) {
      scene.remove(e.points);
      e.points.geometry.dispose(); e.mat.dispose();
      explosions.splice(i, 1);
      continue;
    }
    const posArr = e.positions.array;
    for (let k = 0; k < e.velocities.length; k++) {
      posArr[k*3]   += e.velocities[k].x * dt;
      posArr[k*3+1] += e.velocities[k].y * dt;
      posArr[k*3+2] += e.velocities[k].z * dt;
      e.velocities[k].multiplyScalar(0.95); // drag
    }
    e.positions.needsUpdate = true;
    e.mat.opacity = e.life / e.maxLife;
  }
}

// ─── Game State Machine ────────────────────────────────────────────────────
let gameState = 'MENU'; // MENU | RUNNING | GAMEOVER
let phaseTimer = 0;
let currentBoidState = STATES.IDLE;
let autoAttackTimer = 0;
let homeworldSpawned = false;

function startGame() {
  audio.init();
  audio.playBGM('BATTLE');
  audio.playSFX('ui');
  
  gameState = 'RUNNING';
  phaseTimer = 0;
  autoAttackTimer = 0;
  homeworldSpawned = false;

  // Clear old enemies
  enemies.forEach(e => { scene.remove(e.mesh); });
  enemies.length = 0;
  if (homeworldMesh) { scene.remove(homeworldMesh); homeworldMesh = null; }
  explosions.forEach(e => { scene.remove(e.points); });
  explosions.length = 0;
  lasers.count = 0; // Clear lasers

  // Reset boids
  boids._init();
  setBoidState(STATES.IDLE);
  hud.start();

  // Hide overlay
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('result-screen').classList.remove('show');

  // Spawn initial wave
  for (let i = 0; i < 8; i++) spawnAsteroid();
  for (let i = 0; i < 3; i++) spawnWarship();
}

function endGame(victory, msg) {
  if (gameState === 'GAMEOVER') return;
  gameState = 'GAMEOVER';
  hud.stop();
  setBoidState(STATES.IDLE);
  audio.playBGM('GAMEOVER');

  const rs = document.getElementById('result-screen');
  const rt = document.getElementById('result-title');
  const rm = document.getElementById('result-msg');
  rt.textContent = victory ? 'VICTORY' : 'DEFEAT';
  rt.className = victory ? 'victory' : 'defeat';
  rm.textContent = msg || '';
  rs.classList.add('show');
}

function setBoidState(s) {
  currentBoidState = s;
  boids.setState(s);
  hud.updateState(s);
}

// ─── Command Handler ─────────────────────────────────────────────────────────
// Global target cast from hand coordinates
const gestureTarget = new THREE.Vector3(0, 0, -65); 

function onCommand(type, data) {
  const cmd = data.cmd;
  
  if (gameState === 'MENU' && (cmd === 'start' || cmd === 'attack' || cmd === 'overload')) {
    startGame(); return;
  }
  if (gameState !== 'RUNNING') return;

  if (type === 'gesture' && data.x !== undefined && data.y !== undefined) {
    // Map normalized hand coords (0~1) to world space
    // Mirrored tracking: user moves hand left -> physical screen left
    const tx = -(data.x - 0.5) * 160; 
    const ty = -(data.y - 0.5) * 80;
    // Smooth interpolation
    gestureTarget.x += (tx - gestureTarget.x) * 0.2;
    gestureTarget.y += (ty - gestureTarget.y) * 0.2;
    console.log(`[Aim] target mapped to x:${gestureTarget.x.toFixed(1)} y:${gestureTarget.y.toFixed(1)}`);
  }

  // Only flash/voice UI if command ACTUALLY changed distinctively
  if (cmd && cmd !== currentBoidState.toLowerCase()) {
    swarmRenderer.flash();
  }

  switch (cmd) {
    case 'start':
      setBoidState(STATES.DEPLOY);
      hud.showCommand('START / 起飞');
      break;
    case 'attack':
      setBoidState(STATES.ATTACK);
      hud.showCommand('ATTACK / 攻击');
      autoAttackTimer = 3;
      break;
    case 'avoid':
      setBoidState(STATES.AVOID);
      hud.showCommand('AVOID / 躲避');
      setTimeout(() => {
        if (gameState === 'RUNNING') setBoidState(STATES.BATTLE);
      }, 2500);
      break;
    case 'split':
      setBoidState(STATES.SPLIT);
      hud.showCommand('SPLIT ✋');
      aimCursor.visible = false;
      break;
    case 'overload':
      setBoidState(STATES.OVERLOAD);
      hud.showCommand('OVERLOAD 🔥');
      aimCursor.visible = true;
      autoAttackTimer = 4;
      break;
    case 'gather':
      setBoidState(STATES.BATTLE);
      hud.showCommand('GATHER ✊');
      // Reset target to center
      gestureTarget.set(0, 0, -65);
      aimCursor.visible = false;
      break;
  }
}

// ─── Mouse Gesture Fallback ──────────────────────────────────────────────────
let mouseDown = false, mouseButton = -1;
let lastDblClick = 0;

renderer.domElement.addEventListener('mousedown', (e) => {
  mouseDown = true; mouseButton = e.button;
  if (e.button === 2) {
    onCommand('gesture', 'split');
  } else if (e.button === 0 && gameState === 'MENU') {
    // 左键点击任意区域启动游戏
    startGame();
  }
});
renderer.domElement.addEventListener('mouseup', () => {
  mouseDown = false;
  if (mouseButton === 2 && gameState === 'RUNNING') {
    // End split after right-button released (extend duration slightly)
    setTimeout(() => {
      if (gameState === 'RUNNING' && currentBoidState === STATES.SPLIT) {
        setBoidState(STATES.BATTLE);
      }
    }, 2500);
  }
  mouseButton = -1;
});
renderer.domElement.addEventListener('dblclick', (e) => {
  if (e.button !== 0) return; // 仅左键双击触发 超载
  const now = Date.now();
  if (now - lastDblClick < 200) return;
  lastDblClick = now;
  onCommand('gesture', 'overload');
  setTimeout(() => {
    if (gameState === 'RUNNING' && currentBoidState === STATES.OVERLOAD) {
      setBoidState(STATES.BATTLE);
    }
  }, 4000);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

// ─── Threat Avoidance ────────────────────────────────────────────────────────
const _drone = new THREE.Vector3();
const _enemy = new THREE.Vector3();

function updateCombat(dt) {
  if (gameState !== 'RUNNING') return;

  autoAttackTimer -= dt;
  if (autoAttackTimer < 0 && currentBoidState === STATES.ATTACK) {
    setBoidState(STATES.BATTLE);
  }

  // Build target list for boids
  const targets = enemies.map(e => {
    if (e.mesh.isGroup) return e.mesh.position;
    return e.mesh.position;
  });
  // Aim slightly in front of the homeworld so drones don't fly inside/behind it
  if (homeworldMesh) targets.push(homeworldMesh.position.clone().add(new THREE.Vector3(0, 0, 35)));
  boids.targets = targets;

  // Move enemies toward origin
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.mesh.position.addScaledVector(e.velocity, dt);
    e.mesh.rotation.y += e.rotSpeed * dt;
    if (e.mesh.children) e.mesh.children.forEach(c => { c.rotation.x += e.rotSpeed * dt * 0.5; });

    // Check if enemy breached defense perimeter (Z > -30)
    // Destroy enemy immediately so they NEVER fly past the camera and drones never shoot backward!
    if (e.mesh.position.z > -30) {
      spawnExplosion(e.mesh.position.clone(), 0xff2200, 40);
      scene.remove(e.mesh);
      enemies.splice(i, 1);
      // To-do: Add Base Damage logic to HUD
      continue;
    }

    // Check drone vs enemy proximity (damage enemy via laser)
    const epos = e.mesh.position;
    let hit = false;
    // Base damage and fire rate changes based on state
    const isOverload = currentBoidState === STATES.OVERLOAD;
    const isAttack = currentBoidState === STATES.ATTACK;
    const canFire = isOverload || isAttack || currentBoidState === STATES.CLIMAX || currentBoidState === STATES.SPLIT;
    
    // Check if drone can fire laser
    if (canFire) {
      // Overload fires way more often
      const divisor = isOverload ? 80 : 300;
      const step = Math.max(1, (boids.count / divisor) | 0);
      
      for (let k = 0; k < boids.count; k += step) {
        if (Math.random() > (isOverload ? 0.9 : 0.4)) continue;
        
        const k3 = k * 3;
        _drone.set(boids.positions[k3], boids.positions[k3+1], boids.positions[k3+2]);
        
        // Safety lock: NEVER shoot backwards to the screen!
        if (epos.z > _drone.z + 5) continue;
        
        // In overload mode, shoot toward gestureTarget area rather than just nearest enemy
        // Allow a wide cone of damage near the gesture point
        let isHit = false;
        let shootDir = new THREE.Vector3();
        
        if (isOverload) {
           // Provide some scatter to the thick laser
           const scatter = new THREE.Vector3((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15);
           const pointObj = homeworldMesh ? homeworldMesh.position : gestureTarget;
           const targetPoint = pointObj.clone().add(scatter);
           shootDir.copy(targetPoint).sub(_drone).normalize();
           
           // Check if it's generally in the direction of this specific enemy
           const dirToEnemy = epos.clone().sub(_drone).normalize();
           if (shootDir.dot(dirToEnemy) > 0.7 && _drone.distanceTo(epos) < 80) {
             isHit = true;
           }
           lasers.fire(_drone, shootDir, 250, true); // Overload laser
           audio.playSFX('laser_overload');
        } else {
           // Normal mode: precise auto-aim
           const dist = _drone.distanceTo(epos);
           if (dist < 40) {
             isHit = true;
             shootDir.copy(epos).sub(_drone).normalize();
             // Safety: never fire toward camera (positive Z)
             if (shootDir.z > -0.05) shootDir.z = -0.15;
             shootDir.normalize();
             lasers.fire(_drone, shootDir, 160, false); // Normal laser
             audio.playSFX('laser_normal');
           }
        }
        
        if (isHit) {
          const dmg = isOverload ? (3 + Math.random()*5) : (0.5 + Math.random()*1);
          e.hp -= dmg;
          hit = true;
          if (e.hp <= 0) break;
        }
      }
    }

    if (e.hp <= 0) {
      spawnExplosion(e.mesh.position.clone(),
        e.type === 'warship' ? 0xff0066 : 0xff6600, 120);
      scene.remove(e.mesh);
      if (e.mesh.geometry) e.mesh.geometry.dispose();
      enemies.splice(i, 1);
      continue;
    }
    // Pulse emissive on hit
    if (hit && e.mesh.material) {
      e.mesh.material.emissiveIntensity = 1.5;
      setTimeout(() => { if (e.mesh.material) e.mesh.material.emissiveIntensity = 0.5; }, 80);
    }
  }

  // Normal enemies combat loop finished...
  
  // Independent firing for OVERLOAD (allows shooting into empty space)
  if (currentBoidState === STATES.OVERLOAD) {
    const step = Math.max(1, (boids.count / 80) | 0);
    for (let k = 0; k < boids.count; k += step) {
      if (Math.random() > 0.8) continue;
      const k3 = k * 3;
      _drone.set(boids.positions[k3], boids.positions[k3+1], boids.positions[k3+2]);
      
      const scatter = new THREE.Vector3((Math.random()-0.5)*20, (Math.random()-0.5)*20, (Math.random()-0.5)*10);
      const targetPoint = gestureTarget.clone().add(scatter);
      
      // Safety lock: target must always be in front of the drone (negative Z relative)
      if (targetPoint.z >= _drone.z - 5) continue;
      
      const shootDir = new THREE.Vector3().copy(targetPoint).sub(_drone).normalize();
      // Final safety: never fire toward camera
      if (shootDir.z > -0.05) continue;
      lasers.fire(_drone, shootDir, 250, true);
      audio.playSFX('laser_overload');
    }
  }

  // Homeworld combat (CLIMAX phase)
  // Use a single accumulator so damage is frame-rate independent
  if (homeworldMesh && homeworldHp > 0) {
    let dronesInRange = 0;
    const step = Math.max(1, (boids.count / 100) | 0);
    for (let k = 0; k < boids.count; k += step) {
      const k3 = k * 3;
      _drone.set(boids.positions[k3], boids.positions[k3+1], boids.positions[k3+2]);
      if (_drone.distanceTo(homeworldMesh.position) < 45) {
        dronesInRange++;
      }
    }
    if (dronesInRange > 0) {
      // DPS: normal ~400 → 8000hp / 20s, overload ~1200 → 8000hp / 7s
      const fraction = Math.min(dronesInRange / 100, 1.0);
      const dps = currentBoidState === STATES.OVERLOAD ? 1200 : 400;
      homeworldHp -= dps * fraction * dt;
    }
    if (homeworldHp <= 0) {
      gameState = 'VICTORY_ANIM';
      // Chain of dramatic explosions
      const p = homeworldMesh.position.clone();
      scene.remove(homeworldMesh); homeworldMesh = null; homeworldHp = 0;
      
      spawnExplosion(p, 0x0066ff, 300);
      setTimeout(() => spawnExplosion(p.clone().add(new THREE.Vector3(10, 10, 5)), 0xffffff, 200), 500);
      setTimeout(() => spawnExplosion(p.clone().add(new THREE.Vector3(-15, -5, 0)), 0xffaadd, 200), 1200);
      setTimeout(() => spawnExplosion(p.clone().add(new THREE.Vector3(0, 0, 15)), 0x00ffff, 400), 2000);
      
      setTimeout(() => endGame(true, 'HOMEWORLD DESTROYED — HUMANITY SAVED'), 3500);
    }
  }

  // Phase progression
  phaseTimer += dt;
  
  // Update HUD's visual meaning - it's a countdown to the Boss
  if (phaseTimer >= 60 && !homeworldSpawned && gameState === 'RUNNING') {
    homeworldSpawned = true;
    spawnHomeworld();
    setBoidState(STATES.CLIMAX);
    
    // Clear regular enemies
    enemies.forEach(e => { scene.remove(e.mesh); if(e.mesh.geometry) e.mesh.geometry.dispose(); });
    enemies.length = 0;
    
    audio.playBGM('CLIMAX');
    hud.showCommand('⚠️ WARNING: ALIEN HOMEWORLD APPROACHING');
    document.getElementById('timer').style.color = '#ff2266';
  }

  // Spawn more enemies as time passes (before boss)
  if (!homeworldSpawned) {
    if (enemies.filter(e => e.type === 'asteroid').length < 4) spawnAsteroid();
    if (phaseTimer > 15 && enemies.filter(e => e.type === 'warship').length < 5) spawnWarship();
  }

  // Update HUD enemy counts
  hud.updateEnemies(
    enemies.filter(e => e.type === 'asteroid').length,
    enemies.filter(e => e.type === 'warship').length,
    homeworldMesh ? Math.max(0, Math.round(homeworldHp)) : null
  );

  // Camera slow sway (keep z fixed so homeworld at z=-100 stays dead center)
  const t2 = performance.now() * 0.0005;
  camera.position.x = Math.sin(t2) * 8;
  camera.position.y = 10 + Math.sin(t2 * 1.5) * 3;
  camera.position.z = 35;
  camera.lookAt(0, Math.sin(t2 * 0.8) * 3, -40);
}

// ─── Main Loop ───────────────────────────────────────────────────────────────
let lastTime = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  stars.update(dt);
  
  if (gameState === 'RUNNING' || gameState === 'MENU' || gameState === 'VICTORY_ANIM') {
    boids.update(dt);
    swarmRenderer.update(dt);
    updateExplosions(dt);
    lasers.update(dt);

    // Animate homeworld shader time
    if (homeworldMesh && homeworldMesh.material.uniforms) {
      homeworldMesh.material.uniforms.time.value += dt;
      homeworldMesh.rotation.y += dt * 0.15;
    } else if (homeworldMesh && homeworldMesh.material.emissive) {
      // Fallback emissive pulse
      homeworldMesh.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(now * 0.002);
      homeworldMesh.rotation.y += dt * 0.15;
    }
    
    if (aimCursor.visible) {
      aimCursor.position.copy(gestureTarget);
      aimCursor.rotation.z += 2 * dt;
    }

    if (gameState === 'RUNNING') {
      hud.update(now);
      updateCombat(dt);
    }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Global hooks for HTML buttons ──────────────────────────────────────────
window._gameStart   = () => startGame();
window._gameRestart = () => startGame();
window._toggleMute  = () => audio.toggleMute();
