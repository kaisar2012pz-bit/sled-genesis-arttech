import {audioProfile,designFor,demos,titleFor} from './engine.js';

const app=document.querySelector('#app');
const editor=document.querySelector('#editor');
const form=document.querySelector('#entry');
const message=document.querySelector('#message');
const submit=document.querySelector('#submit');
const dates=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const dateLabel=date=>dates.format(new Date(date+'T12:00:00Z')).replace(' г.','');
const dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('sled-diary',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('days',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
let days=[];
let frame=0;
let urls=[];
let playTimer;
let currentDay;
let activeMemory;

function dbOperation(db, mode, run) {
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('days',mode);
    const request=run(transaction.objectStore('days'));
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error);
    transaction.onerror=()=>reject(transaction.error);
  });
}

function element(tag,cls,text){
  const el=document.createElement(tag);
  if(cls) el.className=cls;
  if(text) el.textContent=text;
  return el;
}

function source(value){
  if(typeof value==='string') return value;
  const url=URL.createObjectURL(value);
  urls.push(url);
  return url;
}

function styleScene(el,d){
  const properties={filter:d.filter,tone:'rgb('+d.tone+' / .46)',position:d.position+'%',angle:d.angle+'deg',grain:d.grain,duration:d.duration+'s',zoom:d.zoom,tracking:(-.049-.027*d.energy).toFixed(3)+'em'};
  Object.entries(properties).forEach(([key,value])=>el.style.setProperty('--'+key,value));
}

function link(text,href,cls){
  const a=element('a',cls,text);
  a.href=href;
  return a;
}

function animateMemory(section, stage, day) {
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const listeners=new AbortController();
  const options={signal:listeners.signal};
  let pointerX=0,pointerY=0,x=0,y=0,pulse=0,frameId=0;
  let audio,context,analyser,spectrum;
  let visible=false;
  const style=stage.style;
  function draw(){
    frameId=0;
    if(!visible || document.hidden || reduce.matches) return;
    const rect=stage.getBoundingClientRect();
    const scroll=Math.max(-1,Math.min(1,(innerHeight/2-rect.top-rect.height/2)/innerHeight));
    x+=(pointerX-x)*.095;
    y+=(pointerY-y)*.095;
    let level=0;
    if(analyser && !audio.paused && !audio.ended){
      analyser.getByteFrequencyData(spectrum);
      const step=context.sampleRate/analyser.fftSize;
      const first=Math.max(1,Math.ceil(45/step));
      const last=Math.floor(350/step);
      for(let bin=first;bin<=last;bin++) level+=spectrum[bin];
      level=Math.min(1,level/(Math.max(1,last-first+1)*195));
    }else if(audio && !audio.paused && !audio.ended){
      const beat=60/(day.design.bpm || 58+day.design.energy*82);
      level=Math.exp(-((audio.currentTime%beat)/beat)*4)*.25;
    }
    pulse+=(level-pulse)*(level > pulse ? .31 : (.05 + day.design.energy*.2) * (day.design.lad==='minor' ? .65 : 1));
    style.setProperty('--memory-rx',(-y*10+scroll*9).toFixed(2)+'deg');
    style.setProperty('--memory-ry',(-8+x*15).toFixed(2)+'deg');
    style.setProperty('--memory-pulse',pulse.toFixed(3));
    style.setProperty('--memory-travel',(Math.max(0,scroll)*28+pulse*(17+day.design.energy*31)).toFixed(2)+'px');
    frameId=requestAnimationFrame(draw);
  }
  function sync(){
    cancelAnimationFrame(frameId);
    frameId=0;
    if(visible && !document.hidden && !reduce.matches) frameId=requestAnimationFrame(draw);
  }
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();});
  observer.observe(stage);
  reduce.addEventListener('change',sync,options);
  document.addEventListener('visibilitychange',sync,options);
  stage.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch') return;
    const rect=stage.getBoundingClientRect();
    pointerX=(event.clientX-rect.left)/rect.width*2-1;
    pointerY=(event.clientY-rect.top)/rect.height*2-1;
  },options);
  stage.addEventListener('pointerleave',()=>{pointerX=pointerY=0;},options);
  return {
    bindAudio(player,canAnalyze){
      audio=player;
      if(canAnalyze && window.AudioContext){
        const enableSpectrum=()=>{
          if(!context){
            context=new AudioContext();
            analyser=context.createAnalyser();
            analyser.fftSize=2048;
            spectrum=new Uint8Array(analyser.frequencyBinCount);
            context.createMediaElementSource(player).connect(analyser);
            analyser.connect(context.destination);
          }
          context.resume().catch(()=>{});
        };
        player.addEventListener('play',enableSpectrum,options);
        section.querySelector('.memory-listen')?.addEventListener('click',enableSpectrum,options);
      }
    },
    destroy(){
      listeners.abort();
      observer.disconnect();
      cancelAnimationFrame(frameId);
      audio?.pause();
      if(context) context.close().catch(()=>{});
    }
  };
}

function scene(day,detail){
  const section=element('section','scene');
  styleScene(section,day.design);
  const image=element('img','visual');
  image.src=source(day.photos[0]);
  image.alt='Фотография дня';
  const content=element('div','scene-content');
  content.append(element('p','label',detail ? dateLabel(day.date) : 'Последняя запись · '+dateLabel(day.date)),
    element(detail?'h1':'h2','',day.title),
    element('p','caption',day.story.split(/[.!?\n]/).map(s=>s.trim()).filter(Boolean).slice(1,2)[0]?.concat('.') || day.story.slice(0,145)));
  const stage=element('div','memory-stage');
  const layers=element('div','memory-layers');
  const backing=element('div','memory-back');
  const glass=element('div','memory-glass');
  backing.setAttribute('aria-hidden','true');
  glass.setAttribute('aria-hidden','true');
  layers.append(backing,image,glass);
  stage.append(layers);
  const strength=day.design.energy;
  section.style.setProperty('--memory-color','rgb('+day.design.tone+')');
  section.style.setProperty('--memory-gap',(31+strength*58).toFixed(0)+'px');
  section.style.setProperty('--memory-radius',(22-strength*20).toFixed(0)+'px');
  section.dataset.lad=day.design.lad || '';
  section.style.setProperty('--memory-grain',day.design.grain);
  const lights={'Чёткий ритм':'line','Открытый горизонт':'horizon','Высокий воздух':'rise','Тихая пауза':'mist'};
  section.dataset.light=lights[day.design.name] || 'soft';
  if(detail && day.audio) content.append(element('button','memory-listen','Включить музыку'));
  section.append(content,stage);
  activeMemory=animateMemory(section,stage,day);
  if(!detail) content.append(link('Открыть воспоминание ↗','#day/'+day.id,'open'));
  if(detail && day.photos.length>1){
    const photos=day.photos.map(source);
    const controls=element('div','frames');
    const activate=index=>{
      frame=index;
      image.src=photos[index];
      image.alt='Фотография '+(index+1)+' из '+photos.length;
      image.getAnimations().forEach(animation=>animation.cancel());
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches) image.animate([{opacity:.5},{opacity:1}],{duration:240});
      controls.querySelectorAll('button[data-frame]').forEach((button,i)=>button.setAttribute('aria-pressed',i===index));
    };
    photos.forEach((_,i)=>{
      const button=element('button','',String(i+1));
      button.dataset.frame=i;
      button.setAttribute('aria-label','Фотография '+(i+1));
      button.setAttribute('aria-pressed',i===0);
      button.onclick=()=>activate(i);
      controls.append(button);
    });
    const play=element('button','','Авто');
    play.setAttribute('aria-pressed','false');
    play.setAttribute('aria-label','Автоматическая смена фотографий');
    play.onclick=()=>{
      if(playTimer){clearInterval(playTimer);playTimer=undefined;play.setAttribute('aria-pressed','false');return;}
      playTimer=setInterval(()=>activate((frame+1)%photos.length),day.design.duration*1000);
      play.setAttribute('aria-pressed','true');
    };
    controls.append(play);
    section.append(controls);
  }
  return section;
}

function archive(){
  const intro=element('section','intro');
  intro.append(element('h1','','Архив'),element('p','','Текст, фотографии и песня сохраняют то, как ощущался ваш день.'));
  app.append(intro);
  if(days.length) app.append(scene(days[0],false));
  const head=element('div','sectionhead');
  head.append(element('h2','','Все дни'),element('p','label',String(days.length).padStart(2,'0')));
  const grid=element('div','grid');
  for(const day of days){
    const card=link('','#day/'+day.id,'card');
    styleScene(card,day.design);
    const img=element('img');
    img.src=source(day.photos[0]);
    img.alt='';
    img.loading='lazy';
    card.append(img,element('span','label',dateLabel(day.date)+(day.demo?' · пример':'')),element('h3','',day.title));
    grid.append(card);
  }
  app.append(head,grid);
}

function detail(day){
  const root=element('article','detail');
  root.append(link('← Все дни','#archive','back'),scene(day,true));
  const info=element('div','info');
  const words=element('section','panel');
  words.append(element('h2','','Запись дня'),element('p','',day.story));
  if('speechSynthesis' in window){
    const speak=element('button','plain','Озвучить запись');
    speak.setAttribute('aria-pressed','false');
    speak.onclick=()=>{
      if(speechSynthesis.speaking){speechSynthesis.cancel();speak.setAttribute('aria-pressed','false');return;}
      const voice=new SpeechSynthesisUtterance(day.story);
      voice.lang='ru-RU';
      voice.rate=.78+day.design.energy*.2;
      voice.pitch=day.design.pitch;
      const available=speechSynthesis.getVoices();
      const russian=available.filter(item=>item.lang.toLowerCase().startsWith('ru'));
      const selected=russian.find(item=>/irina|dmitry|dmitri|yuri|russian/i.test(item.name))
        || russian.find(item=>item.default)
        || russian[0];
      if(selected) voice.voice=selected;
      speak.textContent=selected ? 'Озвучка · '+selected.name : 'Озвучка · голос браузера';
      voice.onend=voice.onerror=()=>{
        speak.setAttribute('aria-pressed','false');
        speak.textContent='Озвучить запись';
      };
      speak.setAttribute('aria-pressed','true');
      speechSynthesis.speak(voice);
    };
    words.append(speak);
  }
  const sound=element('section','panel');
  sound.append(element('h2','','Песня дня'));
  if(day.track) sound.append(element('p','',day.track));
  const remote = day.url ? new URL(day.url) : null;
  const directAudio = remote?.protocol === 'https:' && /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac)$/i.test(remote.pathname);
  const spotifyTrack = remote?.hostname === 'open.spotify.com'
    ? remote.pathname.match(/^\/(?:intl-[a-z-]+\/)?(?:embed\/)?track\/([a-zA-Z0-9]{22})\/?$/)?.[1]
    : null;
  if(day.audio || directAudio){
    const audio=element('audio');
    audio.controls=true;
    audio.preload=day.audio?'metadata':'none';
    audio.src=day.audio?source(day.audio):remote.href;
    audio.setAttribute('aria-label','Песня дня');
    sound.append(audio);
    activeMemory.bindAudio(audio, Boolean(day.audio));
    const listen=root.querySelector('.memory-listen');
    if(listen){
      listen.type='button';
      listen.onclick=()=>{
        if(!audio.paused){audio.pause();return;}
        audio.play().catch(()=>{listen.textContent='Повторить запуск музыки';});
      };
      audio.addEventListener('play',()=>{listen.textContent='Пауза';});
      for(const event of ['pause','ended']){
        audio.addEventListener(event,()=>{listen.textContent='Включить музыку';});
      }
    }
  } else if(spotifyTrack) {
    const activate=element('button','plain','Загрузить плеер Spotify');
    activate.onclick=()=>{
      const player=element('iframe','track-player');
      player.title='Песня дня в Spotify';
      player.src='https://open.spotify.com/embed/track/'+spotifyTrack;
      player.allow='autoplay; encrypted-media; picture-in-picture';
      player.height='152';
      activate.replaceWith(player);
    };
    sound.append(activate);
  }
  if(day.url){
    const a=link('Открыть песню ↗',day.url,'musiclink');
    a.target='_blank';
    a.rel='noopener noreferrer';
    sound.append(a);
  }
  const disclosure=element('details');
  const d=day.design;
  disclosure.append(element('summary','','Почему день выглядит так'),
    element('p','',d.name+'. '+d.reason),
    element('p','','Средний оттенок снимков RGB '+d.tone+' задаёт цвет тени. Яркость снимков влияет на контраст.'),
    element('p','','Источник ритма — '+d.basis+'. Энергия '+Math.round(d.energy*100)+' из 100. Движение кадра длится '+d.duration+' с. Энергия также влияет на масштаб, насыщенность и контраст.'));
  if(d.bpm || d.lad) disclosure.append(element('p','',
    [d.bpm ? 'Указанный темп — '+d.bpm+' BPM, используется для движения без доступа к спектру.' : '',
      d.lad ? (d.lad==='minor' ? 'Минор смягчает свет и продлевает затухание.' : 'Мажор усиливает свет.') : ''].filter(Boolean).join(' ')));
  sound.append(disclosure);
  info.append(words,sound);
  root.append(info);
  app.append(root);
}

function render(){
  activeMemory?.destroy();
  activeMemory=undefined;
  clearInterval(playTimer);
  playTimer=undefined;
  window.speechSynthesis?.cancel();
  urls.forEach(URL.revokeObjectURL);
  urls=[];
  frame=0;
  document.body.classList.add('ready');
  app.replaceChildren();
  const id=location.hash.startsWith('#day/')?location.hash.slice(5):null;
  currentDay=days.find(day=>day.id===id);
  if(currentDay) detail(currentDay);
  else archive();
  window.scrollTo(0,0);
}

function validUrl(raw){
  if(!raw) return '';
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)) throw new Error('Вставьте ссылку, начинающуюся с https://.');
  return url.href;
}

document.querySelector('#new').onclick=()=>{
  form.reset();
  message.textContent='';
  const now=new Date();
  form.elements.date.value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
  editor.showModal();
};
document.querySelector('#close').onclick=()=>editor.close();
editor.addEventListener('cancel',e=>{if(submit.disabled)e.preventDefault();});
form.onsubmit=async event=>{
  event.preventDefault();
  const data=new FormData(form);
  const story=String(data.get('story')).trim();
  const photos=data.getAll('photos').filter(file=>file.size);
  const audio=data.get('audio').size?data.get('audio'):null;
  const track=String(data.get('track')).trim();
  const temp=[];
  submit.disabled=true;
  document.querySelector('#close').disabled=true;
  message.textContent='Собираем воспоминание…';
  try{
    const url=validUrl(data.get('url').trim());
    if(!story || !photos.length || (!audio && !url)) throw new Error('Добавьте текст, фотографию и аудиофайл или ссылку.');
    if(!audio && data.get('energy')==='auto' && !track) throw new Error('Для ссылки опишите звучание песни или выберите её ритм.');
    if(photos.length>8 || photos.some(p=>p.size>15e6)) throw new Error('Добавьте до 8 фотографий, каждая до 15 МБ.');
    if(audio && audio.size>40e6) throw new Error('Выберите аудиофайл до 40 МБ.');
    photos.forEach(photo=>temp.push(URL.createObjectURL(photo)));
    const profile=await audioProfile(audio,track,data.get('energy'));
    const design=await designFor(story,temp,profile).catch(()=>{throw new Error('Не удалось прочитать снимок. Попробуйте JPG, PNG или WebP.');});
    design.bpm=Number(data.get('bpm')) || null;
    design.lad=data.get('lad') || '';
    const day={id:crypto.randomUUID(),date:data.get('date'),story,title:titleFor(story),photos,audio,url,track,design};
    await dbOperation(await dbPromise,'readwrite',store=>store.put(day));
    days.push(day);
    sortDays();
    editor.close();
    location.hash='day/'+day.id;
  }catch(error){
    message.textContent=error.name==='QuotaExceededError'?'В хранилище браузера недостаточно места. Выберите файлы меньшего размера.':error.message;
  }finally{
    temp.forEach(URL.revokeObjectURL);
    submit.disabled=false;
    document.querySelector('#close').disabled=false;
  }
};
function sortDays(){days.sort((a,b)=>b.date.localeCompare(a.date) || Number(Boolean(a.demo))-Number(Boolean(b.demo)));}

try{
  const saved=await dbOperation(await dbPromise,'readonly',store=>store.getAll());
  const examples=await Promise.all(demos.map(async item=>{
    const photos=item.photos.map(name=>'media/'+name+'.jpg');
    const audio='media/'+item.id+'.wav';
    const profile=await audioProfile(null,item.track,item.energy);
    return {...item,photos,audio,demo:true,title:titleFor(item.story),design:await designFor(item.story,photos,profile)};
  }));
  days=[...saved,...examples];
  sortDays();
  addEventListener('hashchange',render);
  render();
}catch(error){
  app.append(document.querySelector('#error').content.cloneNode(true));
  console.error(error);
}
