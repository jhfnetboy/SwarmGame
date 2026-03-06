/**
 * HUD.js - HTML Overlay HUD controller
 * 90-second countdown, swarm count, enemy count, command feedback
 */
export class HUD {
  constructor(onTimeout) {
    this.onTimeout = onTimeout;
    this.totalTime = 90;
    this.remaining = 90;
    this.running = false;

    this.$timer      = document.getElementById('timer');
    this.$droneCount = document.getElementById('drone-count');
    this.$droneTotal = document.getElementById('drone-total');
    this.$droneBar   = document.getElementById('drone-bar');
    this.$dronePct   = document.getElementById('drone-pct');
    this.$stateLabel = document.getElementById('state-label');
    this.$asteroids  = document.getElementById('asteroid-count');
    this.$warships   = document.getElementById('warship-count');
    this.$homeworld  = document.getElementById('homeworld-hp');
    this.$feedback   = document.getElementById('cmd-feedback');

    this._feedbackTimer = null;
    this._lastUpdate = 0;
  }

  start() {
    this.remaining = this.totalTime;
    this.running = true;
    this._lastUpdate = performance.now();
  }

  stop() { this.running = false; }

  reset() {
    this.remaining = this.totalTime;
    this.running = false;
    this.$timer.classList.remove('danger');
    this._render();
  }

  update(nowMs) {
    if (!this.running) return;
    const dt = (nowMs - this._lastUpdate) / 1000;
    this._lastUpdate = nowMs;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.running = false;
      this.onTimeout();
    }
    this._render();
  }

  _render() {
    const s = Math.max(0, Math.ceil(this.remaining));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.$timer.textContent = `${mm}:${ss}`;
    this.$timer.classList.toggle('danger', this.remaining <= 15);
  }

  updateSwarm(alive, total) {
    this.$droneCount.textContent = alive;
    this.$droneTotal.textContent = total;
    const pct = total > 0 ? ((alive / total) * 100).toFixed(0) : 0;
    this.$droneBar.style.width = `${pct}%`;
    this.$dronePct.textContent = `${pct}%`;
    // Color shifts red as drones die
    const g = Math.floor((alive / total) * 255);
    const r = 255 - g;
    this.$droneBar.style.background = `rgb(${r},${g},${Math.floor(g*0.67)})`;
  }

  updateEnemies(asteroids, warships, homeworldHp) {
    this.$asteroids.textContent = asteroids;
    this.$warships.textContent = warships;
    this.$homeworld.textContent = homeworldHp !== null ? `${homeworldHp}%` : '—';
  }

  updateState(state) {
    this.$stateLabel.textContent = state;
    const colors = {
      IDLE: '#ffcc00', DEPLOY: '#00ccff', BATTLE: '#00ff88',
      ATTACK: '#ff4422', AVOID: '#ff88ff', SPLIT: '#ffaa00',
      OVERLOAD: '#ffffff', CLIMAX: '#ff2266',
    };
    this.$stateLabel.style.color = colors[state] || '#fff';
  }

  showCommand(text) {
    this.$feedback.textContent = `▶ ${text}`;
    this.$feedback.classList.add('show');
    clearTimeout(this._feedbackTimer);
    this._feedbackTimer = setTimeout(() => {
      this.$feedback.classList.remove('show');
    }, 1800);
  }
}
