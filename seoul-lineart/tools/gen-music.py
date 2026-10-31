"""Synthesises assets/music/seoul-morning.wav: a 30 s, 120 BPM city-pop/house bed
timed to the drawing (groove in at 2 s, drop at 16 s as Lotte World Tower rises,
big hit at 24 s under the final message). Deterministic: fixed seed.
Run: python -I tools/gen-music.py <project dir>
"""
import sys
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
LEN = 30.0
N = int(SR * LEN)
rng = np.random.default_rng(1031)

out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else ".") / "assets" / "music"
out_dir.mkdir(parents=True, exist_ok=True)

L = np.zeros(N)
R = np.zeros(N)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def add(sig, t, gain=1.0, pan=0.0, bus=None):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    gl = gain * np.cos((pan + 1) * np.pi / 4)
    gr = gain * np.sin((pan + 1) * np.pi / 4)
    tl, tr = (L, R) if bus is None else bus
    tl[i : i + len(sig)] += sig * gl
    tr[i : i + len(sig)] += sig * gr


def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR))
    e[:na] *= np.linspace(0, 1, na)
    return e


# ---------- instruments ----------
def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.28)
    click = hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004) * 0.25
    return np.tanh((body + click) * 1.6)


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for k, off in enumerate([0, 0.009, 0.018]):
        i = int(off * SR)
        e[i:] += np.exp(-(t[: n - i]) / (0.012 if k < 2 else 0.11))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.4
    return (noise * e + tone) * 0.8


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 7000, 4)
    return x * np.exp(-t / (0.07 if open_ else 0.012))


def crash():
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4500, 2) * np.exp(-t / 0.7) * 0.6


def bass(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 7))
    x = lp(x, 650) + 0.5 * np.sin(2 * np.pi * f * t)
    return np.tanh(x * 1.2) * env(n, 0.004, dur * 0.9)


def epiano(m, dur, bright=1.0):
    # two-operator FM: bell-ish attack that mellows, like a Rhodes stab
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    idx = (1.8 * bright) * np.exp(-t / 0.18)
    mod = np.sin(2 * np.pi * f * t) * idx
    x = np.sin(2 * np.pi * f * t + mod) + 0.15 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.08)
    return x * env(n, 0.003, 0.5)


def pluck(m, dur=0.22):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t)
    return x * env(n, 0.002, 0.07)


def pad(ms, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for m in ms:
        for det in (-0.12, 0.0, 0.11):
            f = mtof(m + det)
            x += 2 * ((f * t + rng.random()) % 1) - 1
    x = lp(x / (len(ms) * 3), 1400)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6)
    return x * a


def lead(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.2))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph)
    return lp(x, 3200) * env(n, 0.01, dur * 0.8) * np.minimum(1, (dur - t) / 0.03 + 0.001)


# ---------- harmony: Bbmaj7 | Am7 | Dm7 | C(add9), in F major ----------
CHORDS = [
    (46, [58, 62, 65, 69]),  # Bbmaj7
    (45, [57, 60, 64, 67]),  # Am7
    (50, [57, 60, 62, 65]),  # Dm7
    (48, [55, 60, 62, 64]),  # C add9
]

bars = int(LEN / BAR)  # 15 bars
K, C, H = kick(), clap(), hat()
HO = hat(True)
duck = np.ones(N)  # sidechain envelope from the kick

fx_L = np.zeros(N)
fx_R = np.zeros(N)
FX = (fx_L, fx_R)

for b in range(bars + 1):
    t0 = b * BAR
    if t0 >= LEN:
        break
    root, notes = CHORDS[b % 4]
    groove = 1 <= b <= 13  # bars 2..14
    full = 8 <= b <= 11  # 16 s .. 24 s
    outro = b >= 12

    # pad: intro, outro and under everything quietly
    add(pad(notes, BAR + 0.1), t0, 0.10 if (b == 0 or outro) else 0.05, 0.0)

    for beat in range(4):
        tb = t0 + beat * BEAT
        if groove and not (b == 7 and beat >= 2):  # drop the kick for the riser
            add(K, tb, 0.9)
            i = int(tb * SR)
            m = min(N - i, int(0.25 * SR))
            duck[i : i + m] = np.minimum(duck[i : i + m], 0.35 + 0.65 * np.linspace(0, 1, m) ** 0.6)
        if b >= 4 and groove and beat in (1, 3):
            add(C, tb, 0.55, 0.05)
        # hats on 8ths, open hat on the off-beat
        if b >= 1:
            add(H, tb, 0.10, -0.3)
            add(HO if b >= 4 else H, tb + BEAT / 2, 0.16 if b >= 4 else 0.10, 0.3)
        if full:
            add(H, tb + BEAT * 0.25, 0.05, -0.5)
            add(H, tb + BEAT * 0.75, 0.05, 0.5)

    # bass: off-beat octave bounce
    if groove:
        pattern = [(0, 0, 0.22), (0.5, 12, 0.18), (1.0, 0, 0.22), (1.5, 12, 0.18), (2.0, 0, 0.22), (2.5, 12, 0.18), (3.0, 7, 0.22), (3.5, 12, 0.18)]
        for off, iv, d in pattern:
            add(bass(root + iv - 12 if iv == 12 else root + iv, d * 1.6), t0 + off * BEAT, 0.42 if full else 0.34, 0.0, (fx_L * 0 + L, R) if False else None)

    # chord stabs: syncopated city-pop rhythm
    if b >= 1:
        stabs = [0.0, 1.5, 2.5, 3.25] if b >= 4 else [0.0, 2.5]
        for s in stabs:
            for j, m in enumerate(notes):
                add(epiano(m, 0.6, 1.2 if full else 0.9), t0 + s * BEAT + j * 0.004, 0.09, -0.35 + j * 0.23)
                add(epiano(m, 0.6, 0.9), t0 + s * BEAT + j * 0.004, 0.035, 0.0, FX)

    # 16th arpeggio from bar 5
    if 4 <= b <= 12:
        seq = notes + [notes[1] + 12, notes[2] + 12, notes[3] + 12, notes[2] + 12]
        for i16 in range(16):
            m = seq[(i16 * 3) % len(seq)] + 12
            add(pluck(m), t0 + i16 * BEAT / 4, 0.06 if not full else 0.075, 0.6 * np.sin(i16), None)
            if i16 % 2 == 0:
                add(pluck(m), t0 + i16 * BEAT / 4, 0.025, 0.0, FX)

# lead hook over the drop (bars 9-12): a rising, sunny phrase
hook = [
    (0.0, 72, 0.5), (0.5, 74, 0.5), (1.0, 77, 1.0), (2.0, 76, 0.5), (2.5, 74, 0.5), (3.0, 72, 1.0),
    (4.0, 69, 0.5), (4.5, 72, 0.5), (5.0, 74, 1.5), (6.5, 72, 0.5), (7.0, 69, 1.0),
]
for rep in range(2):
    for off, m, d in hook:
        t = 8 * BAR + rep * 2 * BAR + off * BEAT
        add(lead(m, d * BEAT * 0.95), t, 0.11, -0.1)
        add(lead(m, d * BEAT * 0.95), t, 0.05, 0.0, FX)

# riser into the drop (bar 8, 14 s -> 16 s)
n = int(2 * BAR * SR / 2)
t = np.arange(n) / SR
noise = rng.standard_normal(n)
rise = bp(noise, 600, 6000) * (t / t[-1]) ** 2 * 0.35
sweep = np.sin(2 * np.pi * np.cumsum(200 + 900 * (t / t[-1]) ** 2) / SR) * (t / t[-1]) ** 2 * 0.08
add(rise + sweep, 7 * BAR, 1.0)
# snare roll on the last beats before the drop
for i in range(8):
    add(C, 7 * BAR + 2 * BEAT + i * BEAT / 4, 0.18 + i * 0.05, 0.0)

# crashes on the drop and on the final message
add(crash(), 8 * BAR, 0.5)
add(crash(), 12 * BAR, 0.6)
add(K, 12 * BAR, 0.4)
# final ringing chord from 26 s
for j, m in enumerate([53, 57, 60, 64, 67]):
    add(epiano(m, 4.0, 0.8), 13 * BAR + j * 0.01, 0.10, -0.4 + j * 0.2)

# ---------- effects and mix ----------
# ping-pong dotted-eighth delay on the FX bus
dly = int(BEAT * 0.75 * SR)
eL, eR = fx_L.copy(), fx_R.copy()
for k in range(1, 6):
    g = 0.5 ** k
    sh = dly * k
    if k % 2:
        eR[sh:] += fx_L[: N - sh] * g
    else:
        eL[sh:] += fx_R[: N - sh] * g
eL, eR = lp(eL, 5000), lp(eR, 5000)

# sidechain everything except drums by approximating: duck the whole bed lightly
mixL = (L + eL * 0.8) * (0.55 + 0.45 * duck)
mixR = (R + eR * 0.8) * (0.55 + 0.45 * duck)

# gentle glue + tame lows that a phone can't play
mixL, mixR = hp(mixL, 30), hp(mixR, 30)
fade = np.ones(N)
fi = int(0.05 * SR)
fade[:fi] = np.linspace(0, 1, fi)
fo = int(2.0 * SR)
fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mixL *= fade
mixR *= fade
peak = max(np.abs(mixL).max(), np.abs(mixR).max())
mixL = np.tanh(mixL / peak * 1.3) * 0.85
mixR = np.tanh(mixR / peak * 1.3) * 0.85

data = (np.stack([mixL, mixR], axis=1) * 32767).astype(np.int16)
path = out_dir / "seoul-morning.wav"
with wave.open(str(path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())
print(path, f"{LEN:.1f}s")
