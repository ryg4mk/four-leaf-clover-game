(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const fieldWrap = document.getElementById('fieldWrap');
  const missLayer = document.getElementById('missLayer');
  const startScreen = document.getElementById('startScreen');
  const resultScreen = document.getElementById('resultScreen');
  const startButton = document.getElementById('startButton');
  const retryButton = document.getElementById('retryButton');
  const timeValue = document.getElementById('timeValue');
  const bestValue = document.getElementById('bestValue');
  const resultTime = document.getElementById('resultTime');
  const resultTaps = document.getElementById('resultTaps');
  const resultBest = document.getElementById('resultBest');
  const recordText = document.getElementById('recordText');

  const BEST_KEY = 'four-leaf-clover-game-best-v2';
  const DPR_CAP = 2;
  const TAU = Math.PI * 2;

  const state = {
    width: 540,
    height: 820,
    dpr: 1,
    running: false,
    found: false,
    startTime: 0,
    elapsed: 0,
    taps: 0,
    best: loadBest(),
    clovers: [],
    target: null,
    grass: [],
    speckles: [],
    assets: null,
    ready: false
  };

  const rand = (a,b) => a + Math.random() * (b-a);
  const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
  const dist2 = (ax,ay,bx,by) => {
    const dx=ax-bx, dy=ay-by;
    return dx*dx + dy*dy;
  };

  function loadBest() {
    try {
      const n = Number(localStorage.getItem(BEST_KEY));
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch (_) {
      return null;
    }
  }

  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) {}
    state.best = v;
  }

  function fmt(v) {
    return Number.isFinite(v) ? v.toFixed(2) : '--.--';
  }

  async function loadB64Image(path) {
    const res = await fetch(path, {cache:'force-cache'});
    if (!res.ok) throw new Error(path);
    const b64 = (await res.text()).trim();
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = 'data:image/webp;base64,' + b64;
    });
  }

  async function loadAssets() {
    const [fourA, fourB, three] = await Promise.all([
      loadB64Image('assets/fourleaf_a.b64'),
      loadB64Image('assets/fourleaf_b.b64'),
      loadB64Image('assets/threeleaf.b64')
    ]);
    state.assets = {fourA, fourB, three};
    state.ready = true;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.width = Math.max(320, Math.round(rect.width));
    state.height = Math.max(520, Math.round(rect.height));
    state.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);

    buildGround();
    if (state.ready && !state.running && !state.found) buildRound();
  }

  function buildGround() {
    state.grass = [];
    state.speckles = [];

    const grassCount = Math.min(1600, Math.floor(state.width * state.height / 380));
    for (let i=0;i<grassCount;i++) {
      state.grass.push({
        x:rand(0,state.width),
        y:rand(0,state.height),
        len:rand(8,31),
        lean:rand(-.65,.65),
        w:rand(.45,1.4),
        hue:rand(92,132),
        light:rand(16,39),
        alpha:rand(.12,.35)
      });
    }

    const dotCount = Math.min(1300, Math.floor(state.width * state.height / 500));
    for (let i=0;i<dotCount;i++) {
      state.speckles.push({
        x:rand(0,state.width),
        y:rand(0,state.height),
        r:rand(.35,1.8),
        a:rand(.025,.10)
      });
    }
  }

  function buildRound() {
    if (!state.assets) return;

    state.clovers = [];
    state.target = null;
    state.elapsed = 0;
    state.taps = 0;
    state.found = false;
    timeValue.textContent = '0.00';

    const topSafe = 96;
    const bottomSafe = 48;
    const targetImage = Math.random() < .5 ? state.assets.fourA : state.assets.fourB;

    const targetW = clamp(state.width * rand(.105,.135), 44, 76);
    const targetH = targetW * targetImage.naturalHeight / targetImage.naturalWidth;
    const target = {
      img:targetImage,
      x:rand(targetW*.75, state.width-targetW*.75),
      y:rand(topSafe+targetH*.75, state.height-bottomSafe-targetH*.75),
      w:targetW,
      h:targetH,
      rot:rand(-.65,.65)
    };

    // 四つ葉の周辺は少し空ける。難しいが、三つ葉で隠れることはない。
    const exclusion = Math.max(targetW,targetH) * 1.05;
    const count = clamp(Math.floor(state.width*state.height/1250), 280, 500);

    let attempts=0;
    while (state.clovers.length<count && attempts<count*12) {
      attempts++;
      const w=rand(25,52);
      const h=w*state.assets.three.naturalHeight/state.assets.three.naturalWidth;
      const c={
        x:rand(w*.45,state.width-w*.45),
        y:rand(topSafe+h*.45,state.height-bottomSafe-h*.45),
        w,h,
        rot:rand(0,TAU),
        alpha:rand(.84,1),
        z:rand(0,1)
      };
      const gap=exclusion+w*.28;
      if (dist2(c.x,c.y,target.x,target.y)<gap*gap) continue;
      state.clovers.push(c);
    }

    state.clovers.sort((a,b)=>a.z-b.z);
    state.target=target;
  }

  function drawGround() {
    const g=ctx.createLinearGradient(0,0,state.width,state.height);
    g.addColorStop(0,'#244f28');
    g.addColorStop(.42,'#1f4725');
    g.addColorStop(1,'#183a1f');
    ctx.fillStyle=g;
    ctx.fillRect(0,0,state.width,state.height);

    for (const s of state.speckles) {
      ctx.fillStyle='rgba(224,235,190,'+s.a+')';
      ctx.beginPath();
      ctx.arc(s.x,s.y,s.r,0,TAU);
      ctx.fill();
    }

    for (const b of state.grass) {
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.rotate(b.lean);
      ctx.strokeStyle='hsla('+b.hue+',45%,'+b.light+'%,'+b.alpha+')';
      ctx.lineWidth=b.w;
      ctx.lineCap='round';
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.quadraticCurveTo(b.len*.12,-b.len*.48,0,-b.len);
      ctx.stroke();
      ctx.restore();
    }

    const light=ctx.createRadialGradient(
      state.width*.38,state.height*.30,0,
      state.width*.38,state.height*.30,Math.max(state.width,state.height)*.68
    );
    light.addColorStop(0,'rgba(255,246,199,.12)');
    light.addColorStop(.52,'rgba(255,255,255,.015)');
    light.addColorStop(1,'rgba(0,0,0,.25)');
    ctx.fillStyle=light;
    ctx.fillRect(0,0,state.width,state.height);
  }

  function drawSprite(img,x,y,w,h,rot,alpha=1) {
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(rot);
    ctx.globalAlpha=alpha;
    ctx.drawImage(img,-w/2,-h/2,w,h);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0,0,state.width,state.height);
    drawGround();

    if (!state.assets) return;

    // 三つ葉を先に全部描く。
    for (const c of state.clovers) {
      drawSprite(state.assets.three,c.x,c.y,c.w,c.h,c.rot,c.alpha);
    }

    // 四つ葉は必ず最後＝最前面。
    if (state.target) {
      const t=state.target;
      drawSprite(t.img,t.x,t.y,t.w,t.h,t.rot,1);
    }
  }

  function hitTarget(x,y) {
    const t=state.target;
    if (!t) return false;

    const dx=x-t.x, dy=y-t.y;
    const cs=Math.cos(-t.rot), sn=Math.sin(-t.rot);
    const lx=dx*cs-dy*sn;
    const ly=dx*sn+dy*cs;
    const rx=t.w*.45;
    const ry=t.h*.45;

    return (lx*lx)/(rx*rx)+(ly*ly)/(ry*ry)<=1;
  }

  function showMiss(clientX,clientY) {
    const rect=fieldWrap.getBoundingClientRect();
    const el=document.createElement('span');
    el.className='miss';
    el.textContent='×';
    el.style.left=(clientX-rect.left)+'px';
    el.style.top=(clientY-rect.top)+'px';
    missLayer.appendChild(el);
    setTimeout(()=>el.remove(),600);
  }

  function startGame() {
    if (!state.ready) return;
    buildRound();
    state.running=true;
    state.found=false;
    state.startTime=performance.now();
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
  }

  function finishGame() {
    state.running=false;
    state.found=true;

    const finalTime=Number(state.elapsed.toFixed(2));
    const isBest=state.best==null || finalTime<state.best;
    if (isBest) saveBest(finalTime);

    resultTime.textContent=finalTime.toFixed(2);
    resultTaps.textContent=state.taps+'回';
    resultBest.textContent=fmt(state.best)+'秒';
    recordText.textContent=isBest?'★ NEW BEST! ★':'';
    bestValue.textContent=fmt(state.best);

    setTimeout(()=>resultScreen.classList.remove('hidden'),320);
  }

  function onPointer(e) {
    if (!state.running || state.found) return;

    state.taps++;

    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left)*state.width/rect.width;
    const y=(e.clientY-rect.top)*state.height/rect.height;

    if (hitTarget(x,y)) {
      state.elapsed=(performance.now()-state.startTime)/1000;
      finishGame();
    } else {
      showMiss(e.clientX,e.clientY);
    }
  }

  function frame() {
    if (state.running && !state.found) {
      state.elapsed=(performance.now()-state.startTime)/1000;
      timeValue.textContent=state.elapsed.toFixed(2);
    }
    draw();
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown',onPointer,{passive:true});
  startButton.addEventListener('click',startGame);
  retryButton.addEventListener('click',startGame);
  window.addEventListener('resize',resize);

  bestValue.textContent=fmt(state.best);

  loadAssets()
    .then(()=>{
      resize();
      startButton.disabled=false;
      requestAnimationFrame(frame);
    })
    .catch(()=>{
      startButton.disabled=true;
      startButton.textContent='画像読み込みエラー';
    });
})();