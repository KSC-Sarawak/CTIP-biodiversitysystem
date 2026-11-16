"""Original soundtrack and sound effects for the demo video, synthesised from scratch.
Nothing is sampled, so there is nothing to license. Run: python3 audio/make_audio.py
Writes public/audio/music.wav and public/audio/sfx/*.wav
"""
import os, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
os.makedirs(os.path.join(OUT, "sfx"), exist_ok=True)
rs = np.random.RandomState(7)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def t_(d): return np.arange(int(d * SR)) / SR
def filt(x, kind, f, order=2):
    return sosfilt(butter(order, np.array(f) / (SR / 2), kind, output="sos"), x)
def env(n, a, r, hold=1.0):
    e = np.ones(n) * hold
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na: e[:na] *= np.linspace(0, 1, na) ** 1.5
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e
def save(name, x, peak=0.9):
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1: x = np.stack([x, x], 1)
    x = x / max(1e-9, np.abs(x).max()) * peak
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())
def reverb_ir(dur=2.6, bright=5000):
    n = int(dur * SR)
    ir = np.stack([rs.randn(n), rs.randn(n)], 1) * np.exp(-np.arange(n) / (dur * SR / 5.5))[:, None]
    ir[:, 0] = filt(ir[:, 0], "low", bright); ir[:, 1] = filt(ir[:, 1], "low", bright)
    return ir / np.sqrt((ir ** 2).sum())
IR = reverb_ir()
def reverb(st, wet=0.3):
    out = np.stack([fftconvolve(st[:, c], IR[:, c])[: len(st)] for c in (0, 1)], 1)
    return st + out * wet * 3.0

class Track:
    def __init__(self, dur): self.b = np.zeros((int(dur * SR), 2))
    def add(self, t, x, vol=1.0, pan=0.0):
        i = int(t * SR)
        if i >= len(self.b) or i < 0: return
        x = x[: len(self.b) - i]
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.b[i:i + len(x), 0] += x * vol * l; self.b[i:i + len(x), 1] += x * vol * r

# ---------- instruments ----------
def marimba(m, dur=0.9):
    t = t_(dur); f = hz(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 5.5) + 0.35 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 22) + 0.12 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t * 60)
    return x * env(len(t), 0.002, 0.05)
def pad(m, dur):
    t = t_(dur); f = hz(m); x = np.zeros(len(t))
    for det in (-0.006, 0.0, 0.007):
        for h in range(1, 7):
            x += np.sin(2 * np.pi * f * (1 + det) * h * t + rs.rand() * 6) / (h ** 1.7)
    return filt(x, "low", 1800) * env(len(t), 0.7, 0.9) * 0.2
def bass(m, dur):
    t = t_(dur); f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
    return x * env(len(t), 0.008, 0.08) * np.exp(-t * 1.2)
def kick():
    t = t_(0.32); f = 46 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) + 0.25 * filt(rs.randn(len(t)), "low", 3000) * np.exp(-t * 180)
def snap():
    t = t_(0.18); n = filt(rs.randn(len(t)), "band", [1300, 4200])
    return n * (np.exp(-t * 38) + 0.5 * np.exp(-np.abs(t - 0.012) * 300))
def shaker(acc=1.0):
    t = t_(0.07); return filt(rs.randn(len(t)), "high", 6500) * np.exp(-t * 70) * acc
def flute(m, dur):
    t = t_(dur + 0.25); f = hz(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t * 3))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph) + 0.03 * filt(rs.randn(len(t)), "band", [2000, 6000])
    return x * env(len(t), 0.05, 0.25)
def bell(m, dur=1.8):
    t = t_(dur); f = hz(m)
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ((1, 1, 2.5), (2.76, 0.4, 5), (5.4, 0.2, 9), (8.9, 0.1, 14)))
    return x * env(len(t), 0.002, 0.2)
def chirp(base, n=3):
    out = np.zeros(int(0.6 * SR))
    for k in range(n):
        d = 0.05 + rs.rand() * 0.05; t = t_(d); f = base * (1 + 0.25 * np.sin(np.pi * t / d) * (1 if k % 2 else -1))
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
        i = int((k * 0.11 + rs.rand() * 0.02) * SR); out[i:i + len(s)] += s
    return out

# ---------- music ----------
# A calm bed: warm sine pads, a soft electric piano and a light pulse. No bright noise,
# no saturation and plain triads, so it sits under the picture without tiring the ear.
BPM = 100; BEAT = 60 / BPM; BAR = 4 * BEAT
CH = [(47, [59, 62, 66]), (43, [59, 62, 67]), (50, [57, 62, 66]), (45, [57, 61, 64])]   # Bm, G, D, A
ARP = [0, 2, 1, 3, 2, 1, 3, 2]
LEAD = [[(0, 78, 1), (1, 76, .5), (1.5, 74, .5), (2, 71, 1.5)], [(0, 74, 1), (1, 76, .5), (1.5, 78, .5), (2, 81, 1.5)],
        [(0, 78, 1.5), (1.5, 81, .5), (2, 78, 2)], [(0, 76, 1.5), (1.5, 73, .5), (2, 76, 2)]]
BARS = 80
def soft_pad(m, dur):
    t = t_(dur); f = hz(m); x = np.zeros(len(t))
    for det in (-0.0015, 0.0015):
        ph = 2 * np.pi * f * (1 + det) * t
        x += np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    return x * env(len(t), 0.9, 1.1) * 0.25
def epiano(m, dur=1.6):
    t = t_(dur); f = hz(m)
    x = np.sin(2 * np.pi * f * t + 0.6 * np.sin(2 * np.pi * f * t) * np.exp(-t * 6)) * np.exp(-t * 2.6) + 0.12 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 5)
    return x * env(len(t), 0.006, 0.25)
def glass(m, dur):
    t = t_(dur + 0.6); f = hz(m)
    x = np.sin(2 * np.pi * f * t) + 0.15 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 4)
    return x * np.exp(-t * 1.6) * env(len(t), 0.02, 0.4)
def soft_kick():
    t = t_(0.3); f = 44 + 50 * np.exp(-t * 26)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 12) * env(len(t), 0.004, 0.05)
def brush(acc=1.0):
    t = t_(0.09); return filt(rs.randn(len(t)), "band", [1800, 4200]) * np.sin(np.pi * t / 0.09) ** 2 * acc
def sect(bar):  # which layers play in each part of the video
    if bar < 6: return dict(keys=.5)                                   # opening
    if bar < 10: return dict(keys=.8, bass=.7)                         # overview
    if bar < 35: return dict(keys=1, bass=1, pulse=1, lead=(18 <= bar < 26))   # field app
    if bar < 63: return dict(keys=1, bass=1, pulse=1, lead=(43 <= bar < 51) or (55 <= bar < 63))  # web portal
    if bar < 72: return dict(keys=.6, bass=.6)                         # public site (breakdown)
    return dict(keys=1, bass=1, pulse=1, lead=1)                       # recap

dur = BARS * BAR + 6
P, A, Bs, D, L = (Track(dur) for _ in range(5))
duck = np.ones(int(dur * SR))
for bar in range(BARS):
    s = sect(bar); t0 = bar * BAR; root, notes = CH[bar % 4]; last = bar == BARS - 1
    for i, m in enumerate(notes):
        P.add(t0, soft_pad(m, BAR + 1.2 + (4 if last else 0)), 0.5, pan=(i - 1) * 0.45)
    P.add(t0, soft_pad(notes[0] - 12, BAR + 1.2 + (4 if last else 0)), 0.3)
    four = notes + [notes[0] + 12]
    if s.get("keys"):
        for k in range(8):   # eighth notes
            A.add(t0 + k * BEAT / 2, epiano(four[ARP[k]] + 12), 0.2 * s["keys"] * (1.0 if k % 4 == 0 else 0.6 + 0.15 * rs.rand()), pan=np.sin(k * 0.9) * 0.4)
    if s.get("bass"):
        for b_, d_ in ((0, 1.8), (2.5, 1.4)):
            Bs.add(t0 + b_ * BEAT, bass(root - (12 if root > 46 else 0), d_ * BEAT), 0.42 * s["bass"])
    if s.get("pulse"):
        for b_ in (0, 2):
            D.add(t0 + b_ * BEAT, soft_kick(), 0.5)
            i = int((t0 + b_ * BEAT) * SR); n = int(0.25 * SR); duck[i:i + n] = np.minimum(duck[i:i + n], np.linspace(0.7, 1, n))
        for k in range(8):
            D.add(t0 + k * BEAT / 2, brush(1.0 if k % 2 else 0.5), 0.035, pan=0.25)
    if s.get("lead"):
        for b_, m, d_ in LEAD[bar % 4]: L.add(t0 + b_ * BEAT, glass(m - 12, d_ * BEAT), 0.16, pan=0.15)
dl = int(0.45 * SR); echo = np.zeros_like(A.b); echo[dl:] = A.b[:-dl][:, ::-1] * 0.22
A.b += echo
mix = (P.b * 0.75 + Bs.b * 0.8) * duck[:, None] + reverb(A.b, 0.3) + D.b + reverb(L.b, 0.45)
mix = np.stack([filt(filt(mix[:, c], "low", 7000), "high", 35) for c in (0, 1)], 1)
tt = np.arange(len(mix)) / SR
mix *= (np.clip(tt / 2.0, 0, 1) * np.clip((dur - tt) / 5.0, 0, 1))[:, None]
save("music.wav", mix, 0.7)   # normalised only: no clipping or saturation
print("music", round(dur, 1), "s")

# ---------- sound effects ----------
def whoosh(d=0.55, up=True):
    n = int(d * SR); x = filt(rs.randn(n), "band", [500, 5000]); t = np.arange(n) / n
    car = np.sin(np.pi * t) ** 2
    lp = filt(rs.randn(n), "low", 900)
    y = x * car * (t if up else 1 - t) + lp * car * (1 - t if up else t) * 1.5
    return np.stack([y * (1 - t * 0.6), y * (0.4 + t * 0.6)], 1)
sfx = {}
sfx["whoosh"] = whoosh(0.5); sfx["whoosh2"] = whoosh(0.7, False)
t = t_(0.05); sfx["click"] = (np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 160) + filt(rs.randn(len(t)), "high", 3000) * np.exp(-t * 400) * 0.6)
t = t_(0.035); sfx["key"] = filt(rs.randn(len(t)), "band", [1800, 5200]) * np.exp(-t * 190)
t = t_(0.16); f = 420 + 560 * (t / 0.16) ** 0.6; sfx["pop"] = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 20) * env(len(t), 0.004, 0.05)
x = Track(1.9); [x.add(i * 0.1, bell(m, 1.5), 0.6, pan=p) for i, (m, p) in enumerate(((81, -0.3), (86, 0.1), (90, 0.4)))]; sfx["success"] = reverb(x.b, 0.3)
x = Track(1.4); [x.add(i * 0.13, bell(m, 1.1), 0.6) for i, m in enumerate((88, 93))]; sfx["notify"] = reverb(x.b, 0.25)
t = t_(0.09); bp = np.sin(2 * np.pi * 1480 * t) * env(len(t), 0.004, 0.02); x = Track(0.4); x.add(0, bp, 0.6); x.add(0.13, np.sin(2 * np.pi * 1976 * t) * env(len(t), 0.004, 0.02), 0.6); sfx["scan"] = x.b
t = t_(0.06); c1 = filt(rs.randn(len(t)), "band", [900, 6000]) * np.exp(-t * 110); x = Track(0.3); x.add(0, c1, 1); x.add(0.085, c1[::-1] * 0.8, 1); t2 = t_(0.2); x.add(0, np.sin(2 * np.pi * 150 * t2) * np.exp(-t2 * 40), 0.4); sfx["shutter"] = x.b
x = Track(1.3)
for k in range(2):
    t = t_(0.24); x.add(k * 0.34, (np.sin(2 * np.pi * 622 * t) + 0.5 * np.sin(2 * np.pi * 932 * t)) * env(len(t), 0.01, 0.1), 0.6)
sfx["alert"] = reverb(x.b, 0.2)
t = t_(1.3); f = 300 * (4.0 ** (t / 1.3)); sh = sum(np.sin(2 * np.pi * np.cumsum(f * r) / SR) / (i + 1) for i, r in enumerate((1, 1.5, 2, 3)))
sfx["swell"] = reverb(np.stack([sh, sh], 1) * (env(len(t), 1.0, 0.25) * 0.5)[:, None] + whoosh(1.3) * 0.5, 0.3)
t = t_(0.9); sfx["impact"] = reverb(np.stack([np.sin(2 * np.pi * np.cumsum(38 + 70 * np.exp(-t * 14)) / SR) * np.exp(-t * 4.5) + filt(rs.randn(len(t)), "low", 1400) * np.exp(-t * 16) * 0.5] * 2, 1), 0.35)
n = int(0.5 * SR); tt = np.arange(n) / n; pr = filt(rs.randn(n), "high", 2500) * (np.abs(np.sin(tt * 34 + rs.rand(n) * 0.5)) ** 6) * np.sin(np.pi * tt) ** 0.5; sfx["paper"] = pr
t = t_(0.5); f = 700 * (0.35 ** (t / 0.5)); sfx["drop"] = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.01, 0.3) * 0.8
t = t_(0.22); sfx["tick"] = bell(96, 0.22) * 0.7
x = Track(0.5); [x.add(i * 0.045, marimba(m, 0.35), 0.5) for i, m in enumerate((74, 78, 81, 86))]; sfx["rise"] = reverb(x.b, 0.2)
for k, v in sfx.items(): save(f"sfx/{k}.wav", v, 0.8)
print("sfx", ", ".join(sfx))
