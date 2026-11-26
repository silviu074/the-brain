# Synthesizes The Brain's background techno loop (110 BPM, 8 bars) to techno_loop.wav.
# Run with Blender's Python (has numpy), then encode: ffmpeg -i techno_loop.wav -c:a libvorbis -q:a 5 techno_loop.ogg
import os, wave
import numpy as np

SR, BPM, BARS = 44100, 110, 8
beat = 60 / BPM
N = int(round(SR * beat * 4 * BARS))
rng = np.random.default_rng(3)

def env(n, decay):
    return np.exp(-np.arange(n) / (SR * decay))

def lowpass(x, cutoff):
    # one-pole lowpass; cutoff may be a per-sample array
    a = np.exp(-2 * np.pi * np.broadcast_to(cutoff, x.shape) / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s; y[i] = s
    return y

def place(buf, sound, t):
    i = int(t * SR) % len(buf)
    end = min(len(buf), i + len(sound)); buf[i:end] += sound[:end - i]
    if i + len(sound) > len(buf): buf[:i + len(sound) - len(buf)] += sound[end - i:]  # wrap so the loop is seamless

kick, hats, clap, bass, stab = (np.zeros(N) for _ in range(5))
duck = np.ones(N)

# kick: sine sweeping 150 -> 48 Hz with a short click
n = int(0.42 * SR); tt = np.arange(n) / SR
freq = 48 + 102 * np.exp(-tt / 0.045)
k = np.sin(2 * np.pi * np.cumsum(freq) / SR) * env(n, 0.16)
k[:200] += rng.uniform(-1, 1, 200) * np.linspace(0.5, 0, 200)
k = np.tanh(k * 1.6)
side = 1 - 0.75 * env(n, 0.12)  # sidechain: bass and stab duck under each kick

def hat(decay, n):
    x = np.diff(rng.uniform(-1, 1, n + 1))  # crude highpass
    return x * env(n, decay)

def clap_hit():
    n = int(0.25 * SR); x = rng.uniform(-1, 1, n)
    x = x - lowpass(x, 900)  # remove lows
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        j = int(off * SR); e[j:] = np.maximum(e[j:], env(n - j, 0.012 if off < 0.02 else 0.07))
    return x * e

def saw(f, n):
    ph = (np.arange(n) * f / SR) % 1.0
    return 2 * ph - 1

notes = [55.0, 55.0, 65.41, 49.0]  # A1, A1, C2, G1: one note per two bars
sixteenth = beat / 4
for bar in range(BARS):
    for b in range(4):
        t = (bar * 4 + b) * beat
        place(kick, k, t)
        d = np.ones(N); place(d, side - 1, t); duck *= d
        place(hats, hat(0.09, int(0.2 * SR)) * 0.55, t + beat / 2)          # open hat on the off-beat
        for s16 in range(4):
            place(hats, hat(0.018, int(0.05 * SR)) * (0.22 if s16 % 2 else 0.12), t + s16 * sixteenth)
        if b in (1, 3): place(clap, clap_hit() * 0.7, t)
        # rolling bass on the three 16ths after each kick
        f = notes[bar // 2]
        for s16 in (1, 2, 3):
            n = int(sixteenth * SR * 0.9)
            tone = saw(f, n) + 0.5 * saw(f * 2.005, n)
            tone = lowpass(tone, 180 + 1400 * env(n, 0.03)) * env(n, 0.09)
            place(bass, tone * 0.8, t + s16 * sixteenth)
    if bar % 2 == 1:  # minor chord stab on the "and" of beat 4, every two bars
        root = notes[bar // 2] * 4
        n = int(0.6 * SR)
        ch = sum(saw(root * r, n) for r in (1, 1.189, 1.498, 2.0))
        ch = lowpass(ch, 400 + 2600 * env(n, 0.08)) * env(n, 0.22)
        place(stab, ch * 0.22, (bar * 4 + 3.5) * beat)

# echo on the stab (3/16 delay), wrapped so it loops cleanly
dl = int(3 * sixteenth * SR); echo = stab.copy()
wet = np.zeros(N); x = echo.copy()
for i in range(1, 6): x = np.roll(x, dl) * 0.45; wet += x
stab = echo + lowpass(wet, 2500)

mix = 0.9 * kick + 0.45 * hats + 0.4 * clap + 0.55 * bass * duck + 0.6 * stab * duck
mix = np.tanh(mix * 1.1) * 0.9
mix /= np.max(np.abs(mix)) / 0.89

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'techno_loop.wav')
with wave.open(out, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(out, round(N / SR, 2), 's')
