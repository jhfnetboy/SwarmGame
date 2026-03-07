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
      if (t - this.lastLaserTime < 0.05) return;
      this.lastLaserTime = t;
    }

    const dualPlay = (freq1, freq2, endFreq, dur, wave1, wave2, vol) => {
      try {
        const o1 = this.ctx.createOscillator();
        const o2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        o1.type = wave1; o2.type = wave2;
        o1.frequency.setValueAtTime(freq1, t);
        o2.frequency.setValueAtTime(freq2, t);
        if (endFreq) {
          o1.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
          o2.frequency.exponentialRampToValueAtTime(endFreq * 0.98, t + dur);
        }
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o1.connect(gain); o2.connect(gain); gain.connect(this.sfxGain);
        o1.start(t); o1.stop(t + dur);
        o2.start(t); o2.stop(t + dur);
      } catch(e) {}
    };

    if (type === 'laser_normal') {
      dualPlay(800 + Math.random()*200, 810 + Math.random()*200, 100, 0.15, 'square', 'sawtooth', 0.04);
    } else if (type === 'laser_overload') {
      dualPlay(300 + Math.random()*100, 150 + Math.random()*50, 40, 0.3, 'sawtooth', 'square', 0.08);
    } else if (type === 'explosion') {
      // Noise burst with deep kick
      try {
        // Kick
        const o = this.ctx.createOscillator();
        const g1 = this.ctx.createGain();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(20, t + 0.5);
        g1.gain.setValueAtTime(0.3, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(g1); g1.connect(this.sfxGain);
        o.start(t); o.stop(t + 0.6);
        
        // Noise
        const bufSize = this.ctx.sampleRate * 0.5;
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(1200, t);
        flt.frequency.exponentialRampToValueAtTime(100, t + 0.4);
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.4, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        src.connect(flt); flt.connect(g2); g2.connect(this.sfxGain);
        src.start(t);
      } catch(e) {}
    } else if (type === 'smartbomb') {
      // Massive screen-clearing explosion (heavy impact + long tail)
      try {
        // Deep Impact Kick
        const o = this.ctx.createOscillator();
        const g1 = this.ctx.createGain();
        o.frequency.setValueAtTime(250, t);
        o.frequency.exponentialRampToValueAtTime(10, t + 1.2);
        g1.gain.setValueAtTime(0.8, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        o.connect(g1); g1.connect(this.sfxGain);
        o.start(t); o.stop(t + 1.5);
        
        // Massive Rumble Noise
        const bufSize = this.ctx.sampleRate * 2.0; // 2 seconds of noise
        const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        
        // Dynamic Filter for "WHOOSH" into rumble
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(3000, t);
        flt.frequency.exponentialRampToValueAtTime(50, t + 2.0);
        
        const g2 = this.ctx.createGain();
        g2.gain.setValueAtTime(0.001, t);
        g2.gain.linearRampToValueAtTime(0.6, t + 0.1); // Fast attack
        g2.gain.exponentialRampToValueAtTime(0.001, t + 2.0); // Long decay
        
        src.connect(flt); flt.connect(g2); g2.connect(this.sfxGain);
        src.start(t);
      } catch(e) { console.error('smartbomb error:', e); }
    } else if (type === 'ui') {
      dualPlay(1400, 2100, 1800, 0.1, 'sine', 'sine', 0.1);
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
        if (i % 8 === 0) note(55, 0.35, 0.14, 'square');
        i++;
      }, 220);
    } else if (state === 'CLIMAX') {
      let i = 0;
      this.bgmInterval = setInterval(() => {
        // High tension sawtooth arps
        note(110 + (i%2)*20, 0.12, 0.12, 'sawtooth');
        note(82, 0.18, 0.15, 'square');
        // Deep sub-bass pulse every beat
        if (i % 4 === 0) note(41, 0.8, 0.2, 'sine');
        i++;
      }, 140);
    } else if (state === 'GAMEOVER') {
      note(110, 2.0, 0.18, 'sine');
      note(55, 3.0, 0.2, 'sine'); // Sub drop
      setTimeout(() => note(82, 2.5, 0.15, 'sine'), 200);
    }
  }
}
