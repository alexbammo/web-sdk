// Procedural audio: store muzak, horror drones and stingers, and the self-checkout voice.
export class Audio {
	constructor() {
		this.ctx = null;
		this.muted = false;
	}

	start() {
		if (this.ctx) return;
		try {
			this.ctx = new AudioContext();
		} catch {
			return;
		}
		const c = this.ctx;
		this.master = c.createGain();
		this.master.gain.value = 0.7;
		this.master.connect(c.destination);
		// muzak bus
		this.muzak = c.createGain();
		this.muzak.gain.value = 0.12;
		this.muzakFilter = c.createBiquadFilter();
		this.muzakFilter.type = 'lowpass';
		this.muzakFilter.frequency.value = 2400;
		this.muzak.connect(this.muzakFilter).connect(this.master);
		// drone bus
		this.drone = c.createGain();
		this.drone.gain.value = 0;
		const lp = c.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 220;
		this.drone.connect(lp).connect(this.master);
		for (const f of [41.2, 43.65, 61.7]) {
			const o = c.createOscillator();
			o.type = 'sawtooth';
			o.frequency.value = f;
			o.start();
			o.connect(this.drone);
		}
		this.hum = c.createOscillator();
		this.hum.frequency.value = 100; // fluorescent hum
		this.humGain = c.createGain();
		this.humGain.gain.value = 0.012;
		this.hum.connect(this.humGain).connect(this.master);
		this.hum.start();
		this.nextNote = c.currentTime + 0.2;
		this.step = 0;
		this.detune = 0;
	}

	// Muzak: a slow, cheerful Imaj7 - vi7 - ii7 - V7 loop that decays into something wrong.
	tick(phase, haunt) {
		const c = this.ctx;
		if (!c) return;
		const dark = phase === 'lockdown' || phase === 'finale' || phase === 'ended';
		this.muzak.gain.setTargetAtTime(dark ? 0.035 : 0.11, c.currentTime, 1.5);
		this.muzakFilter.frequency.setTargetAtTime(dark ? 700 : 2400, c.currentTime, 2);
		this.drone.gain.setTargetAtTime(dark ? 0.05 + haunt * 0.012 : 0, c.currentTime, 2);
		this.humGain.gain.setTargetAtTime(dark ? 0 : 0.01, c.currentTime, 0.3);
		this.detune = dark ? Math.min(80, this.detune + 0.2) : 0;
		const chords = [
			[60, 64, 67, 71],
			[57, 60, 64, 67],
			[62, 65, 69, 72],
			[55, 59, 62, 65]
		];
		while (this.nextNote < c.currentTime + 0.3) {
			const beat = dark ? 0.62 : 0.42;
			const chord = chords[Math.floor(this.step / 8) % 4];
			const n = this.step % 8 === 0 ? chord : [chord[[0, 2, 1, 3, 2, 1, 3, 2][this.step % 8]] + 12];
			for (const m of n) this.note(m, this.nextNote, this.step % 8 === 0 ? 1.6 : 0.35, this.step % 8 === 0 ? 0.25 : 0.35);
			this.nextNote += beat;
			this.step++;
		}
	}

	note(midi, t, len, vol) {
		const c = this.ctx;
		const o = c.createOscillator();
		const g = c.createGain();
		o.type = 'triangle';
		o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
		o.detune.value = (Math.random() - 0.5) * this.detune;
		g.gain.setValueAtTime(0, t);
		g.gain.linearRampToValueAtTime(vol, t + 0.02);
		g.gain.exponentialRampToValueAtTime(0.001, t + len);
		o.connect(g).connect(this.muzak);
		o.start(t);
		o.stop(t + len + 0.05);
	}

	blip(freq, len = 0.12, type = 'square', vol = 0.15, slide = 0) {
		const c = this.ctx;
		if (!c) return;
		const t = c.currentTime;
		const o = c.createOscillator();
		const g = c.createGain();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + len);
		o.connect(g).connect(this.master);
		o.start(t);
		o.stop(t + len + 0.02);
	}

	noiseBurst(len = 0.3, freq = 1200, q = 1, vol = 0.3) {
		const c = this.ctx;
		if (!c) return;
		const t = c.currentTime;
		const buf = c.createBuffer(1, c.sampleRate * len, c.sampleRate);
		const d = buf.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
		const s = c.createBufferSource();
		s.buffer = buf;
		const f = c.createBiquadFilter();
		f.type = 'bandpass';
		f.frequency.value = freq;
		f.Q.value = q;
		const g = c.createGain();
		g.gain.value = vol;
		s.connect(f).connect(g).connect(this.master);
		s.start(t);
	}

	sfx(kind, dist = 0) {
		if (!this.ctx) return;
		const att = Math.max(0.08, 1 - dist / 40);
		switch (kind) {
			case 'beep':
				this.blip(1760, 0.12, 'square', 0.12 * att);
				break;
			case 'pickup':
				this.blip(660, 0.08, 'sine', 0.15);
				setTimeout(() => this.blip(990, 0.1, 'sine', 0.12), 70);
				break;
			case 'squeak':
				this.blip(1400, 0.25, 'sine', 0.2 * att, 1.6);
				break;
			case 'glass':
				this.noiseBurst(0.25, 4200, 3, 0.4 * att);
				break;
			case 'hit':
				this.noiseBurst(0.35, 180, 0.8, 0.9);
				this.blip(90, 0.3, 'sawtooth', 0.3, 0.5);
				break;
			case 'stinger':
				for (const f of [233, 247, 311, 466]) this.blip(f, 1.8, 'sawtooth', 0.05 * att, 0.97);
				break;
			case 'blackout':
				this.noiseBurst(1.2, 90, 0.5, 1.2);
				this.blip(55, 2.5, 'sawtooth', 0.25, 0.5);
				break;
			case 'groan':
				this.blip(110 + Math.random() * 40, 0.9, 'sawtooth', 0.06 * att, 0.7);
				break;
			case 'banish':
				this.blip(880, 0.8, 'sine', 0.15 * att, 0.25);
				break;
			case 'receipt':
				for (let i = 0; i < 10; i++) setTimeout(() => this.noiseBurst(0.05, 3000, 2, 0.2), i * 60);
				break;
			case 'shutter':
				this.noiseBurst(2.5, 300, 0.4, 0.6);
				break;
		}
	}

	say(text, eerie) {
		if (!('speechSynthesis' in window) || this.muted) return;
		try {
			const u = new SpeechSynthesisUtterance(text);
			u.rate = eerie ? 0.85 : 1;
			u.pitch = eerie ? 0.6 : 1.1;
			u.volume = 0.8;
			speechSynthesis.speak(u);
		} catch {
			/* speech is optional */
		}
	}
}
