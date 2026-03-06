export class AudioManager {
  constructor() {
    this.ctx = null;
    this.bgmGain = null;
    this.currentState = 'MENU';
    this.bgmInterval = null;
    this.lastLaserTime = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.4;
    this.bgmGain.connect(this.ctx.destination);
    
    this.playBGM('MENU');
  }

  playSFX(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Throttle laser sounds to avoid deafening ear-rape
    if (type.startsWith('laser')) {
      if (t - this.lastLaserTime < 0.05) return;
      this.lastLaserTime = t;
    }
    
    if (type === 'laser_normal') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800 + Math.random()*200, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    }
    else if (type === 'laser_overload') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300 + Math.random()*100, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);
      
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    }
    else if (type === 'explosion') {
      // Noise burst synthesis
      const bufferSize = this.ctx.sampleRate * 0.6; 
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000 + Math.random()*500, t);
      filter.frequency.exponentialRampToValueAtTime(100, t + 0.5);
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(t);
    }
    else if (type === 'ui') {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, t);
      
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.1);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  playBGM(state) {
    if (!this.ctx) return;
    if (this.currentState === state && this.bgmInterval) return;
    this.currentState = state;
    
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    
    const playNote = (freq, duration, vol=0.1, type='sine') => {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(t);
      osc.stop(t + duration);
    };

    if (state === 'MENU') {
      let step = 0;
      this.bgmInterval = setInterval(() => {
        const notes = [220, 277.18, 329.63, 440];
        playNote(notes[step % 4] / 2, 0.8, 0.08, 'sine');
        step++;
      }, 1000);
    } else if (state === 'BATTLE') {
      let step = 0;
      this.bgmInterval = setInterval(() => {
        const notes = [110, 130.81, 146.83, 164.81]; 
        playNote(notes[step % 4], 0.2, 0.1, 'triangle');
        if (step % 8 === 0) playNote(55, 0.4, 0.15, 'square'); 
        step++;
      }, 250);
    } else if (state === 'CLIMAX') {
      let step = 0;
      this.bgmInterval = setInterval(() => {
        const notes = [110, 116.54, 110, 116.54]; 
        playNote(notes[step % 4], 0.15, 0.15, 'sawtooth');
        playNote(82.41, 0.2, 0.15, 'square'); 
        step++;
      }, 150);
    } else if (state === 'GAMEOVER') {
      playNote(110, 2.0, 0.2, 'sine');
      playNote(82.41, 3.0, 0.2, 'sine');
    }
  }
}
