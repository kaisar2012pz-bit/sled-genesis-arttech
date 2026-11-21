// Requires Playwright. Set PLAYWRIGHT_MODULE and EDGE_PATH to override defaults.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = path.join(__dirname, 'submission');
const media = path.join(__dirname, 'dist', 'media');
const staging = path.join(process.env.TEMP || require('node:os').tmpdir(), 'sled-capture');
fs.mkdirSync(staging,{recursive:true});
const title = 'Осенний парк и тёплое какао';
(async () => {
  const browser = await chromium.launch({executablePath:process.env.EDGE_PATH || undefined, args:['--no-first-run']});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
    async function localAssets(tab) {
      await tab.route('http://127.0.0.1:8765/**',async route=>{
        const uri=new URL(route.request().url());
        const file=uri.pathname==='/'?'index.html':uri.pathname.slice(1);
        await route.fulfill({path:path.join(__dirname,'dist',file)});
      });
    }
    await localAssets(page);
    const base=process.env.SLED_OFFLINE ? require('node:url').pathToFileURL(path.join(__dirname,'Sled.html')).href : 'http://127.0.0.1:8765/';
    await page.goto(base);
    await page.locator('.card').first().waitFor();
    assert.equal(await page.locator('.card').count(),5);
    async function capture(number,caption){
      await page.evaluate(text=>{
        document.querySelector('#video-caption')?.remove();
        const bar=document.createElement('div');
        bar.id='video-caption';
        bar.textContent=text;
        bar.style.cssText='position:fixed;bottom:0;left:0;right:0;padding:13px 28px;min-height:50px;background:#151711;color:#f8efdb;z-index:999;font:600 21px Segoe UI;pointer-events:none;border-top:1px solid #a09b70;text-align:center;';
        (document.querySelector('dialog[open]') || document.body).append(bar);
      },caption);
      await page.screenshot({path:path.join(staging,number+'.png')});
      await page.locator('#video-caption').evaluate(el=>el.remove());
    }
    await capture(1,'СЛЕД · личный дневник ощущений');
    await page.getByRole('button',{name:'Новый день'}).click();
    await page.locator('[name=date]').fill('2026-11-21');
    await page.locator('[name=story]').fill(title+'. Листья хрустели под ногами, а бумажный стакан грел ладони.');
    await page.locator('[name=photos]').setInputFiles([path.join(media,'park.jpg'),path.join(media,'rain.jpg')]);
    await page.locator('[name=audio]').setInputFiles(path.join(media,'park.wav'));
    await page.locator('[name=track]').fill('Какао — мягкая инструментальная пьеса');
    await page.locator('[name=story]').scrollIntoViewIfNeeded();
    await capture(2,'Добавляем текст, два снимка и инструментальную пьесу');
    await page.getByRole('button',{name:'Собрать воспоминание'}).click();
    await page.waitForURL(/#day\//);
    const saved=page.url();
    assert.equal(await page.locator('.detail h1').textContent(),title);
    await capture(3,'Папка получила название из записи. Цвет и движение зависят от снимков и музыки.');
    await page.getByRole('button',{name:'Фотография 2',exact:true}).click();
    assert.equal(await page.locator('.detail .visual').getAttribute('alt'),'Фотография 2 из 2');
    await capture(4,'У каждого снимка своё место в сцене. Кадры можно перелистывать.');
    await page.locator('summary').click();
    await page.locator('.info').scrollIntoViewIfNeeded();
    const duration=await page.locator('audio').evaluate(async a=>{
      if(!Number.isFinite(a.duration)) await new Promise(resolve=>a.addEventListener('loadedmetadata',resolve,{once:true}));
      await a.play();
      const seconds=a.duration;
      a.pause();
      return seconds;
    });
    assert.equal(duration,18);
    assert.match(await page.locator('details').textContent(),/громкость и выраженность/);
    await capture(5,'В папке остались текст и песня. Здесь же видно, какие данные изменили оформление.');
    await page.reload();
    await page.locator('.detail h1').waitFor();
    assert.equal(page.url(),saved);
    await page.getByRole('link',{name:'Все дни'}).click();
    assert.equal(await page.locator('.card').count(),6);
    await page.locator('.sectionhead').scrollIntoViewIfNeeded();
    await capture(6,'Возвращаемся в архив. После перезагрузки новый день остался в дневнике.');
    for (const id of ['park','office','sea','mountain','rain']) {
      await page.goto(base+'#day/'+id);
      await page.locator('.detail h1').waitFor();
      await page.locator('.visual').evaluate(el=>el.decode());
      await page.screenshot({path:path.join(out,'examples',id+'.png'),fullPage:true});
    }
    await page.goto(base+'#day/office');
    await page.locator('.detail h1').waitFor();
    await capture(7,'У ночи перед сдачей резче свет, выше контраст и быстрее движение.');
    await page.goto(base+'#day/sea');
    await page.locator('.detail h1').waitFor();
    await capture(8,'У берега мягче фактура и больше пространства для горизонта.');
    await page.goto(base+'#archive');
    await page.locator('.card').first().waitFor();
    await page.getByRole('button',{name:'Новый день'}).click();
    await page.locator('[name=story]').fill('Мелкий дождь за открытым окном.');
    await page.locator('[name=photos]').setInputFiles(path.join(media,'rain.jpg'));
    await page.locator('[name=url]').fill('https://example.com/song');
    await page.locator('[name=track]').fill('Быстрый техно-трек');
    await page.getByRole('button',{name:'Собрать воспоминание'}).click();
    await page.waitForURL(/#day\//);
    assert.equal(await page.getByRole('link',{name:'Открыть песню'}).getAttribute('href'),'https://example.com/song');
    assert.match(await page.locator('details').textContent(),/86 из 100/);
    async function addTrackLink(url) {
      await page.getByRole('link',{name:'Все дни'}).click();
      await page.getByRole('button',{name:'Новый день'}).click();
      await page.locator('[name=story]').fill('Утро на пустом берегу.');
      await page.locator('[name=photos]').setInputFiles(path.join(media,'sea.jpg'));
      await page.locator('[name=url]').fill(url);
      await page.locator('[name=track]').fill('Тихая песня');
      await page.getByRole('button',{name:'Собрать воспоминание'}).click();
      await page.waitForURL(/#day\//);
    }
    await addTrackLink('https://example.com/music.wav');
    assert.equal(await page.locator('audio').getAttribute('src'),'https://example.com/music.wav');
    await addTrackLink('https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ');
    await page.route('https://open.spotify.com/embed/**',route=>route.fulfill({body:'Spotify embed test'}));
    await page.getByRole('button',{name:'Загрузить плеер Spotify'}).click();
    assert.equal(await page.locator('iframe').getAttribute('src'),'https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ');
    const responsive=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1,hasTouch:true});
    await localAssets(responsive);
    await responsive.goto(base);
    await responsive.locator('.card').first().waitFor();
    assert.equal(await responsive.evaluate(()=>document.documentElement.scrollWidth),390);
    await responsive.getByRole('button',{name:'Новый день'}).click();
    await responsive.locator('dialog[open]').waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS — five examples, file, direct audio and Spotify URL input, audio playback, gallery, reload, archive and mobile layout.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});




