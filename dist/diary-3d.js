const days = {
  park: {
    date:'2026-10-18', title:'Осенний парк и тёплое какао', track:'Какао',
    caption:'Листья хрустели под ногами, а бумажный стакан грел ладони.',
    alt:'Осенняя дорога среди деревьев',
    reason:'Рассеянный свет и небольшой зазор между слоями оставляют в кадре ощущение близости. Низкие частоты слегка разводят пластины, свет плавно возвращается.',
    release:0.045, depth:15
  },
  office: {
    date:'2026-10-12', title:'Ночь в офисе перед сдачей', track:'Сдача',
    caption:'Остались только свет экрана, стук клавиатуры и минута до дедлайна.',
    alt:'Офис с рабочими столами',
    reason:'Холодный контровой свет и резкая диагональ напоминают о свете монитора. Быстрое затухание подчёркивает отдельные удары и делает глубину сцены ощутимее.',
    release:0.23, depth:32
  }
};

const exhibit = document.querySelector('.exhibit');
const stage = document.querySelector('#stage');
const audio = document.querySelector('#song');
const listen = document.querySelector('#listen');
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('[data-day]')];
const dateFormat = new Intl.DateTimeFormat('ru', {dateStyle:'long', timeZone:'UTC'});
const motion = matchMedia('(prefers-reduced-motion: reduce)');

let day = days.park;
let context, analyser, spectrum;
let pointerX = 0, pointerY = 0;
let x = 0, y = 0, pulse = 0;
let frame = 0;
let inView = true;

function setDay(id) {
  day = days[id];
  audio.pause();
  audio.src = 'media/' + id + '.wav';
  audio.load();
  exhibit.dataset.day = id;
  const date = document.querySelector('#date');
  date.dateTime = day.date;
  date.textContent = dateFormat.format(new Date(day.date + 'T12:00:00Z')).replace(' г.','');
  document.querySelector('#title').textContent = day.title;
  document.querySelector('#caption').textContent = day.caption;
  document.querySelector('#track').textContent = day.track;
  document.querySelector('#reason').textContent = day.reason;
  document.querySelector('#folder').href = 'index.html#day/' + id;
  const photo = document.querySelector('#photo');
  photo.alt = day.alt;
  photo.src = 'media/' + id + '.jpg';
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.day === id)));
  status.textContent = '';
  pulse = 0;
}

function frequencies(lowHz, highHz) {
  const binSize = context.sampleRate / analyser.fftSize;
  const start = Math.max(1, Math.ceil(lowHz / binSize));
  const end = Math.min(spectrum.length - 1, Math.floor(highHz / binSize));
  let sum = 0;
  for (let bin = start; bin <= end; bin++) sum += spectrum[bin];
  return sum / (Math.max(1, end - start + 1) * 255);
}

function draw() {
  frame = 0;
  if (!inView || document.hidden || motion.matches) return;
  let bass = 0;
  let mids = 0;
  if (analyser && !audio.paused && !audio.ended) {
    analyser.getByteFrequencyData(spectrum);
    bass = frequencies(45, 350);
    mids = frequencies(350, 2000);
  }
  const impulse = Math.min(1, bass * 1.3 + mids * .3);
  pulse += (impulse - pulse) * (impulse > pulse ? .3 : day.release);
  const bounds = stage.getBoundingClientRect();
  const progress = Math.max(-1, Math.min(1, (innerHeight / 2 - bounds.top - bounds.height / 2) / innerHeight));
  x += (pointerX - x) * .085;
  y += (pointerY - y) * .085;
  exhibit.style.setProperty('--rx', (-y * 9 + progress * 7).toFixed(2) + 'deg');
  exhibit.style.setProperty('--ry', (-8 + x * 15).toFixed(2) + 'deg');
  exhibit.style.setProperty('--pulse', pulse.toFixed(3));
  exhibit.style.setProperty('--depth', (Math.max(0, progress) * 24 + pulse * day.depth).toFixed(1) + 'px');
  frame = requestAnimationFrame(draw);
}

function syncAnimation() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  if (inView && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
}

buttons.forEach(button => button.addEventListener('click', () => setDay(button.dataset.day)));
stage.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  const bounds = stage.getBoundingClientRect();
  pointerX = 2 * (event.clientX - bounds.left) / bounds.width - 1;
  pointerY = 2 * (event.clientY - bounds.top) / bounds.height - 1;
});
stage.addEventListener('pointerleave', () => { pointerX = pointerY = 0; });
audio.addEventListener('play', () => { listen.textContent = 'Пауза'; });
for (const event of ['pause', 'ended', 'emptied']) {
  audio.addEventListener(event, () => { listen.textContent = 'Включить музыку'; });
}

listen.addEventListener('click', async () => {
  if (!audio.paused) {
    audio.pause();
    return;
  }
  listen.disabled = true;
  status.textContent = '';
  try {
    if (!context && window.AudioContext) {
      context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = .56;
      spectrum = new Uint8Array(analyser.frequencyBinCount);
      context.createMediaElementSource(audio).connect(analyser);
      analyser.connect(context.destination);
    }
    await Promise.all([context?.resume(), audio.play()]);
  } catch {
    status.textContent = 'Не удалось запустить трек. Попробуйте ещё раз.';
  } finally {
    listen.disabled = false;
  }
});

new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  syncAnimation();
}).observe(stage);
document.addEventListener('visibilitychange', syncAnimation);
motion.addEventListener('change', syncAnimation);
setDay('park');
