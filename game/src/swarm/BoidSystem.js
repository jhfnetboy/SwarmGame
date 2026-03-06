import * as THREE from 'three';

export const STATES = {
  IDLE: 'IDLE',
  DEPLOY: 'DEPLOY',
  BATTLE: 'BATTLE',
  ATTACK: 'ATTACK',
  AVOID: 'AVOID',
  SPLIT: 'SPLIT',
  OVERLOAD: 'OVERLOAD',
  CLIMAX: 'CLIMAX',
};

const _v = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _coh = new THREE.Vector3();
const _ali = new THREE.Vector3();
const _tgt = new THREE.Vector3();

export class BoidSystem {
  constructor(count = 4000) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.groups = new Uint8Array(count); // 0=all, 1=left wing, 2=right wing
    this.state = STATES.IDLE;
    this.targets = [];       // Array of THREE.Vector3 (enemy positions)
    this.splitActive = false;

    // Tunable params
    this.maxSpeed = 18;
    this.minSpeed = 4;
    this.neighborRadius = 6;
    this.sepRadius = 2.5;
    this.bounds = 180;

    this._init();
  }

  _init() {
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      // Start clustered near origin (around commander)
      this.positions[i3]     = (Math.random() - 0.5) * 20;
      this.positions[i3 + 1] = (Math.random() - 0.5) * 20;
      this.positions[i3 + 2] = (Math.random() - 0.5) * 20;
      // Random initial velocity
      const speed = 2 + Math.random() * 3;
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      this.velocities[i3]     = speed * Math.sin(theta) * Math.cos(phi);
      this.velocities[i3 + 1] = speed * Math.sin(theta) * Math.sin(phi);
      this.velocities[i3 + 2] = speed * Math.cos(theta);
      this.groups[i] = 0;
    }
  }

  setState(newState) {
    this.state = newState;
    if (newState === STATES.SPLIT) {
      this.splitActive = true;
      // Assign left/right groups
      for (let i = 0; i < this.count; i++) {
        this.groups[i] = i % 2 === 0 ? 1 : 2;
      }
    } else if (newState !== STATES.SPLIT) {
      this.splitActive = false;
      for (let i = 0; i < this.count; i++) this.groups[i] = 0;
    }
  }

  _getWeights() {
    switch (this.state) {
      case STATES.IDLE:
        return { sep: 2.0, coh: 2.0, ali: 1.0, tgt: 0.1, orbitR: 30 };
      case STATES.DEPLOY:
        return { sep: 3.0, coh: 1.0, ali: 1.0, tgt: 0.4,  orbitR: 120 };
      case STATES.BATTLE:
        return { sep: 5.0, coh: 8.0, ali: 2.0, tgt: 1.0,  orbitR: 0 };
      case STATES.ATTACK:
        return { sep: 4.0, coh: 5.0, ali: 3.0, tgt: 8.0,  orbitR: 0 };
      case STATES.AVOID:
        return { sep: 10.0, coh: 0.0, ali: 0.1, tgt: 0.0,  orbitR: 0 };
      case STATES.SPLIT:
        return { sep: 4.0, coh: 6.0, ali: 2.0, tgt: 4.0,  orbitR: 0 };
      case STATES.OVERLOAD:
        return { sep: 3.0, coh: 8.0, ali: 3.0, tgt: 10.0, orbitR: 0 };
      case STATES.CLIMAX:
        return { sep: 3.0, coh: 6.0, ali: 3.0, tgt: 12.0, orbitR: 0 };
      default:
        return { sep: 2.0, coh: 2.0, ali: 2.0, tgt: 1.0, orbitR: 0 };
    }
  }

  update(dt) {
    const w = this._getWeights();
    const clamped_dt = Math.min(dt, 0.05);

    // Spatial bucket for neighbor search (simple grid)
    // For performance, we sample a subset of neighbors
    const SAMPLE = Math.min(this.count, 80);

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const px = this.positions[i3], py = this.positions[i3+1], pz = this.positions[i3+2];
      const vx = this.velocities[i3], vy = this.velocities[i3+1], vz = this.velocities[i3+2];

      _sep.set(0, 0, 0);
      _coh.set(0, 0, 0);
      _ali.set(0, 0, 0);

      let sepCount = 0, cohCount = 0;

      // Sample random neighbors
      for (let k = 0; k < SAMPLE; k++) {
        const j = (Math.random() * this.count) | 0;
        if (j === i) continue;
        // Only interact with same group in SPLIT mode
        if (this.splitActive && this.groups[j] !== this.groups[i]) continue;

        const j3 = j * 3;
        const dx = this.positions[j3] - px;
        const dy = this.positions[j3+1] - py;
        const dz = this.positions[j3+2] - pz;
        const d2 = dx*dx + dy*dy + dz*dz;
        const d = Math.sqrt(d2) + 0.001;

        if (d < this.neighborRadius) {
          // Cohesion
          _coh.x += this.positions[j3];
          _coh.y += this.positions[j3+1];
          _coh.z += this.positions[j3+2];
          cohCount++;

          // Alignment
          _ali.x += this.velocities[j3];
          _ali.y += this.velocities[j3+1];
          _ali.z += this.velocities[j3+2];

          // Separation (use inverse square to prevent perfect stacking)
          if (d < this.sepRadius) {
            const push = 1.0 / (d * d);
            _sep.x -= (dx / d) * push;
            _sep.y -= (dy / d) * push;
            _sep.z -= (dz / d) * push;
            sepCount++;
          }
        }
      }

      if (cohCount > 0) {
        _coh.divideScalar(cohCount);
        _coh.set(_coh.x - px, _coh.y - py, _coh.z - pz);
        _coh.normalize();
      }
      if (cohCount > 0) {
        _ali.divideScalar(cohCount);
        _ali.normalize();
      }
      // Forcefully remove _sep.normalize() so inverse-square magnitude is preserved
      // if (sepCount > 0) _sep.normalize();

      // Target steering
      _tgt.set(0, 0, 0);
      if (w.orbitR > 0) {
        // Orbit around origin
        const angle = Math.atan2(pz, px) + 0.005;
        _tgt.set(
          w.orbitR * Math.cos(angle) - px,
          (Math.sin(i * 0.1) * 8) - py,
          w.orbitR * Math.sin(angle) - pz
        );
        _tgt.normalize();
      } else if (this.targets.length > 0) {
        // Find nearest target (respect groups in SPLIT mode)
        let bestDist = Infinity, best = null;
        const tgtList = this.splitActive
          ? this.targets.filter((_, ti) => ti % 2 === (this.groups[i] - 1))
          : this.targets;
        const searchList = tgtList.length > 0 ? tgtList : this.targets;
        for (const t of searchList) {
          const d = (t.x-px)*(t.x-px)+(t.y-py)*(t.y-py)+(t.z-pz)*(t.z-pz);
          if (d < bestDist) { bestDist = d; best = t; }
        }
        if (best) {
          _tgt.set(best.x - px, best.y - py, best.z - pz).normalize();
        }
      }

      // Combine forces
      let ax = _sep.x * w.sep + _coh.x * w.coh + _ali.x * w.ali + _tgt.x * w.tgt;
      let ay = _sep.y * w.sep + _coh.y * w.coh + _ali.y * w.ali + _tgt.y * w.tgt;
      let az = _sep.z * w.sep + _coh.z * w.coh + _ali.z * w.ali + _tgt.z * w.tgt;

      // Strong central gravity (prevent drifting off-screen forever)
      const distFromCenter = Math.sqrt(px*px + py*py + pz*pz);
      if (distFromCenter > 80) { // If they drift too far out
        const pullStr = (distFromCenter - 80) * 0.1;
        ax -= (px / distFromCenter) * pullStr;
        ay -= (py / distFromCenter) * pullStr;
        az -= (pz / distFromCenter) * pullStr;
      }

      // Soft boundary repulsion box
      const bx = Math.abs(px) > this.bounds ? -Math.sign(px) * 10 : 0;
      const by = Math.abs(py) > this.bounds ? -Math.sign(py) * 10 : 0;
      const bz = Math.abs(pz) > this.bounds ? -Math.sign(pz) * 10 : 0;
      ax += bx; ay += by; az += bz;

      // Integrate velocity
      this.velocities[i3]   += ax * clamped_dt * 8;
      this.velocities[i3+1] += ay * clamped_dt * 8;
      this.velocities[i3+2] += az * clamped_dt * 8;

      // Clamp speed
      const speed = Math.sqrt(
        this.velocities[i3]**2 + this.velocities[i3+1]**2 + this.velocities[i3+2]**2
      ) + 0.001;
      const maxS = this.state === STATES.OVERLOAD || this.state === STATES.ATTACK
        ? this.maxSpeed * 1.5 : this.maxSpeed;
      if (speed > maxS) {
        const s = maxS / speed;
        this.velocities[i3] *= s; this.velocities[i3+1] *= s; this.velocities[i3+2] *= s;
      }
      if (speed < this.minSpeed) {
        const s = this.minSpeed / speed;
        this.velocities[i3] *= s; this.velocities[i3+1] *= s; this.velocities[i3+2] *= s;
      }

      // Integrate position
      this.positions[i3]   += this.velocities[i3]   * clamped_dt;
      this.positions[i3+1] += this.velocities[i3+1] * clamped_dt;
      this.positions[i3+2] += this.velocities[i3+2] * clamped_dt;
    }
  }
}
