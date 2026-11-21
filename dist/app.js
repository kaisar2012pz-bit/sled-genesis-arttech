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
  section.append(image,element('div','shading'),element('div','grain'),content);
  if(!detail) content.append(link('Открыть воспоминание ↗','#day/'+day.id,'open'));
  if(detail && day.photos.length>1){
    const photos=day.photos.map(source);
    const controls=element('div','frames');
    const activate=index=>{
      frame=index;
      image.src=photos[index];
      image.alt='Фотография '+(index+1)+' из '+photos.length;
      image.getAnimations().forEach(animation=>animation.cancel());
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches) image.animate([{transform:'scale('+day.design.zoom+')'},{transform:'scale(1)'}],{duration:day.design.duration*1000});
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
      voice.rate=.76+day.design.energy*.42;
      voice.pitch=day.design.pitch;
      const russian=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('ru'));
      if(russian) voice.voice=russian;
      voice.onend=voice.onerror=()=>speak.setAttribute('aria-pressed','false');
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
  sound.append(disclosure);
  info.append(words,sound);
  root.append(info);
  app.append(root);
}

function render(){
  clearInterval(playTimer);
  playTimer=undefined;
  window.speechSynthesis?.cancel();
  urls.forEach(URL.revokeObjectURL);
  urls=[];
  frame=0;
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

