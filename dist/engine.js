const themes = [
  {name:'Тёплый свет', words:/осен|листь|какао|уют|тёпл|тепл|закат|золот/giu, position:52, sepia:.32, contrast:1.03, grain:.26, angle:80, pitch:1.02, reason:'Тёплые полутона и плёночная фактура сохраняют ощущение света и близости.'},
  {name:'Чёткий ритм', words:/офис|сдач|сроч|проект|дедлайн|экран|ночь|беж/giu, position:52, sepia:.07, contrast:1.26, grain:.32, angle:118, pitch:.92, reason:'Контраст и диагональная тень напоминают о напряжении и резком свете.'},
  {name:'Открытый горизонт', words:/мор[еяю]|берег|вет[ер]|горизонт|вол[н]|солнц|песок/giu, position:53, sepia:.04, contrast:1.02, grain:.12, angle:90, pitch:1.06, reason:'Мягкая тень и спокойная фактура оставляют пространство для горизонта.'},
  {name:'Высокий воздух', words:/гор[ыуе]|вершин|подъ[её]м|троп|над обла|рассвет/giu, position:40, sepia:.06, contrast:1.14, grain:.13, angle:68, pitch:1, reason:'Высокая точка кадрирования и ясный контраст подчёркивают высоту и рельеф.'},
  {name:'Тихая пауза', words:/дожд|луж|окн|тих|пуст|сумерк|один|одна/giu, position:47, sepia:.02, contrast:.9, grain:.2, angle:99, pitch:.96, reason:'Сдержанный контраст и лёгкая фактура передают тишину и рассеянный свет.'}
];

const common = /^(я|мы|вы|они|она|он|это|было|были|был|была|сегодня|вчера|очень|просто|когда|тогда|который|после|потом|пока|через|долго|ещё|что|как|так|всё|все|там|здесь|для|или|уже|меня|мне|время|день)$/iu;
export function titleFor(story) {
  const phrases = (story.match(/[^.!?\n;]+/gu) || [story]).map(s => s.trim());
  const candidates = phrases.flatMap(phrase => {
    const words = phrase.match(/[\p{L}\p{N}]+(?:[-–][\p{L}\p{N}]+)*/gu) || [];
    if (words.length < 3) return [];
    const length = Math.min(5, words.length);
    return words.slice(0, words.length - length + 1).map((_, start) => words.slice(start, start+length));
  });
  const score = words => words.reduce((sum, word) => sum + (common.test(word) ? -1 : word.length > 3 ? 2 : 0), 0)
    - (words[0].length < 2 || common.test(words[0]) ? 2 : 0)
    - (words.at(-1).length < 3 || common.test(words.at(-1)) ? 3 : 0);
  const first = phrases[0]?.match(/[\p{L}\p{N}]+(?:[-–][\p{L}\p{N}]+)*/gu) || [];
  const best = first.length >= 3 && first.length <= 7 ? first : candidates.sort((a,b) => score(b) - score(a))[0];
  const short = (story.match(/[\p{L}\p{N}]+/gu) || []).slice(0,2);
  const title = best?.join(' ') || (short.length ? 'День в деталях — ' + short.join(' ') : 'День в деталях');
  return title[0].toLocaleUpperCase('ru') + title.slice(1);
}

async function inspectPhoto(source) {
  const img = new Image();
  img.src = source;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img,0,0,40,40);
  const {data} = ctx.getImageData(0,0,40,40);
  let r=0,g=0,b=0,n=0, light=0;
  for (let i=0;i<data.length;i+=4) {
    if(data[i+3]<100) continue;
    const [red,green,blue] = [data[i],data[i+1],data[i+2]];
    const luma = .2126*red+.7152*green+.0722*blue;
    light += luma;
    const weight = 1+(Math.max(red,green,blue)-Math.min(red,green,blue))/70;
    r+=red*weight; g+=green*weight; b+=blue*weight; n+=weight;
  }
  return {r:r/(n||1),g:g/(n||1),b:b/(n||1),light:light/1600};
}

export async function audioProfile(file, description, override) {
  if(override !== 'auto') return {level:{soft:.14,mid:.48,fast:.87}[override], basis:'указанное звучание'};
  if(file) {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      const signal = decoded.getChannelData(0);
      const stride=Math.max(1,Math.floor(decoded.sampleRate/8000));
      const block=Math.round(decoded.sampleRate*.05);
      const end=Math.min(signal.length,decoded.sampleRate*45);
      let previous=0, delta=0, total=0, windows=0;
      for(let start=0;start+block<end;start+=block) {
        let sum=0,count=0;
        for(let i=start;i<start+block;i+=stride) {sum+=signal[i]**2;count++;}
        const rms=Math.sqrt(sum/count);
        total+=rms; delta+=Math.max(0,rms-previous);previous=rms;windows++;
      }
      if(windows) return {level:Math.min(.98, total/windows*2.8 + delta/windows*9),basis:'громкость и выраженность звуковых атак файла'};
    } catch {
      // Encoding support varies between browsers. The supplied description is still usable.
    } finally {await context.close();}
  }
  if(/эмбиент|колыбель|медлен|тих|джаз|ambient|slow|acoustic/iu.test(description)) return {level:.19,basis:'описание песни'};
  if(/рок|техно|электрон|быстр|энерг|techno|rock|dance/iu.test(description)) return {level:.86,basis:'описание песни'};
  return {level:.48,basis:'средний ритм по умолчанию'};
}

export async function designFor(story, sources, music) {
  const theme = themes.map((item,index) => ({item,index,score:[...story.matchAll(item.words)].length}))
    .sort((a,b) => b.score-a.score || a.index-b.index)[0];
  const mood = theme.score ? theme.item : themes[4];
  const photos = await Promise.all(sources.map(inspectPhoto));
  const avg = key => photos.reduce((sum,p) => sum+p[key],0)/photos.length;
  const energy = music.level;
  const contrast = mood.contrast + (energy-.5)*.2 + (avg('light')-110)/1800;
  const tone = [avg('r'),avg('g'),avg('b')].map(Math.round).join(' ');
  return {name:mood.name, reason:mood.reason, tone, basis:music.basis, energy, position:mood.position, pitch:mood.pitch,
    duration:Math.round(14-9*energy), grain:mood.grain, angle:mood.angle, zoom:1.035+.05*energy,
    filter:'sepia('+mood.sepia+') contrast('+contrast.toFixed(2)+') saturate('+(.85+.44*energy).toFixed(2)+')'};
}

export const demos = [
  {id:'park',date:'2026-10-18',story:'Осенний парк и тёплое какао. Скамейка была холодной, зато бумажный стакан грел ладони. Мы слушали, как ветер гоняет золотые листья через дорожку.', photos:['park'], track:'Какао — мягкая инструментальная пьеса', energy:'soft'},
  {id:'office',date:'2026-10-12',story:'Ночь в офисе перед сдачей. Остались только свет экрана и стук клавиатуры. Проект ушёл за минуту до дедлайна.',photos:['office'],track:'Сдача — электронный пульс',energy:'fast'},
  {id:'sea',date:'2026-09-02',story:'Длинное утро на пустом берегу. Волны доходили до ног, на горизонте медленно поднималось солнце. В карманах остался песок.',photos:['sea'],track:'Отлив — ровная мелодия',energy:'mid'},
  {id:'mountain',date:'2026-08-23',story:'Первый рассвет над горной тропой. Подъём начался в темноте. У вершины облака остались внизу, и стало слышно только дыхание.',photos:['mountain'],track:'Подъём — лёгкое арпеджио',energy:'mid'},
  {id:'rain',date:'2026-07-05',story:'Мелкий дождь за открытым окном. Вода стекала по стеклу тихими ручейками. На подоконнике остывал чай.',photos:['rain'],track:'Окно — тихий эмбиент',energy:'soft'}
];
