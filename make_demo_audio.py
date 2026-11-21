"""Produce the five original, CC0 demo tracks using standard-library synthesis."""
from array import array
from math import exp, pi, sin
from pathlib import Path
import wave

tracks = {
    "park": (72, (60, 64, 67, 71, 69, 67, 64, 62), .17),
    "office": (132, (36, 36, 43, 36, 39, 36, 46, 43), .27),
    "sea": (90, (57, 60, 64, 67, 64, 60, 55, 59), .17),
    "mountain": (98, (55, 62, 67, 71, 74, 71, 67, 62), .2),
    "rain": (58, (62, 65, 69, 72, 67, 65, 60, 65), .13),
}
rate = 22050
out = Path(__file__).resolve().parent / "dist" / "media"
for name, (bpm, notes, volume) in tracks.items():
    beat = 60 / bpm
    length = 18
    samples = array("h")
    for index in range(rate * length):
        t = index / rate
        step = int(t / beat)
        offset = t - step * beat
        note = notes[step % len(notes)]
        frequency = 440 * 2 ** ((note - 69) / 12)
        envelope = min(offset * 55, 1) * exp(-offset * (7 if name == "office" else 3))
        lead = sin(2 * pi * frequency * offset) + .24 * sin(4 * pi * frequency * offset)
        bass = sin(pi * frequency * offset)
        fade = min(1, t * 6, (length - t) * .8)
        samples.append(int(32760 * volume * fade * envelope * (.66 * lead + .28 * bass)))
    with wave.open(str(out / (name + ".wav")), "wb") as file:
        file.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        file.writeframes(samples.tobytes())
