export class AudioManager {
  constructor() {
    this.ctx = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.currentBGMState = null;
    this.bgmInterval = null;
    this.lastLaserTime = 0;
    this._initialized = false;
  }

  init() {
    if (this._initialized) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this._initialized = true;

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.3;
      this.bgmGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.ctx.destination);

      console.log('[Audio] AudioContext initialized');
    } catch(e) {
      console.warn('[Audio] Failed to init AudioContext:', e);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      if (this.bgmGain)  this.bgmGain.gain.value  = this.muted ? 0 : 0.3;
      if (this.sfxGain)  this.sfxGain.gain.value   = this.muted ? 0 : 0.6;
    }
    const btn = document.getElementById('mute-btn');
    if (btn) {
      btn.textContent = this.muted ? '🔇' : '🔊';
      btn.classList.toggle('muted', this.muted);
    }
    return this.muted;
  }

  playSFX(type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;

    // Throttle laser sounds
    if (type.startsWith('laser')) {
      if (t - this.lastLaserTime < 0.06) return;
      this.lastLaserTime = t;
    }

    const play = (freq, endFreq, duration, wavetype, vol = 0.05) => {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = wavetype;
        osc.frequency.setValueAtTime(freq, t);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(t); osc.stop(t + duration);
      } catch(e) {}
    };

    if (type === 'laser_normal') {
      play(600 + Math.random()*200, 80, 0.12, 'square', 0.03);
    } else if (type === 'laser_overload') {
      play(250 + Math.random()*80, 40, 0.25, 'sawtooth', 0.07);
    } else if (type === 'explosion') {
      // Noise burst
      try {
        const bufSize = this.ctx.sampleRate * 0.5;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(800, t);
        flt.frequency.exponentialRampToValueAtTime(80, t + 0.4);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        src.connect(flt); flt.connect(g); g.connect(this.sfxGain);
        src.start(t);
      } catch(e) {}
    } else if (type === 'ui') {
      play(1400, 1800, 0.08, 'sine', 0.12);
    }
  }

  playBGM(state) {
    if (!this.ctx) return;
    if (this.currentBGMState === state) return;
    this.currentBGMState = state;

    if (this.bgmInterval) { clearInterval(this.bgmInterval); this.bgmInterval = null; }

    const note = (freq, dur, vol = 0.08, type = 'sine') => {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      try {
        const osc = this.ctx.createOscillator();
        const g   = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g); g.connect(this.bgmGain);
        osc.start(t); osc.stop(t + dur);
      } catch(e) {}
    };

    if (state === 'MENU') {
      let i = 0;
      const seq = [220, 277, 330, 440];
      this.bgmInterval = setInterval(() => { note(seq[i++ % 4] * 0.5, 0.9, 0.07, 'sine'); }, 1000);
    } else if (state === 'BATTLE') {
      let i = 0;
      const seq = [110, 130, 146, 130];
      this.bgmInterval = setInterval(() => {
        note(seq[i % 4], 0.18, 0.09, 'triangle');
        if (i % 8 === 0) note(55, 0.35, 0.12, 'square');
        i++;
      }, 220);
    } else if (state === 'CLIMAX') {
      let i = 0;
      this.bgmInterval = setInterval(() => {
        note(110, 0.12, 0.14, 'sawtooth');
        note(82, 0.18, 0.12, 'square');
        i++;
      }, 140);
    } else if (state === 'GAMEOVER') {
      note(110, 2.0, 0.18, 'sine');
      setTimeout(() => note(82, 2.5, 0.15, 'sine'), 200);
    }
  }
}
