(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const fieldWrap = document.getElementById('fieldWrap');
  const missLayer = document.getElementById('missLayer');
  const foundMarker = document.getElementById('foundMarker');
  const hud = document.querySelector('.hud');
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
  const DEV_MODE = true; // 開発確認用。公開時は false に戻す。

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
    ready: false,
    highlighting: false,
    highlightStart: 0
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
    const [fourB, three] = await Promise.all([
      loadB64Image('assets/fourleaf_b.b64'),
      loadB64Image('assets/threeleaf.b64')
    ]);
    state.assets = {fourB, three};
    state.ready = true;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    // Canvas内部座標とCSS表示サイズを1:1にする。
    // 短い横画面を含め、HUD位置・タップ位置・四つ葉の安全範囲がずれないようにする。
    state.width = Math.max(1, Math.round(rect.width));
    state.height = Math.max(1, Math.round(rect.height));
    state.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);

    buildGround();
    if (state.ready && !state.running && !state.found) buildRound();
    draw();
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

  function rotatedHalfExtents(w,h,rot) {
    const c=Math.abs(Math.cos(rot));
    const s=Math.abs(Math.sin(rot));
    return {
      x:(w*c+h*s)/2,
      y:(w*s+h*c)/2
    };
  }

  function placeTargetInsidePlayArea(target, topSafe, bottomSafe) {
    const e=rotatedHalfExtents(target.w,target.h,target.rot);
    const margin=10;
    const minX=e.x+margin;
    const maxX=state.width-e.x-margin;
    const minY=topSafe+e.y+margin;
    const maxY=state.height-bottomSafe-e.y-margin;

    target.x=minX<=maxX ? rand(minX,maxX) : state.width/2;
    target.y=minY<=maxY ? rand(minY,maxY) : clamp((minY+maxY)/2,e.y+margin,state.height-e.y-margin);

    // 最終ガード。回転後の外接矩形まで必ず画面内。
    target.x=clamp(target.x,e.x+margin,state.width-e.x-margin);
    target.y=clamp(target.y,Math.max(e.y+margin,topSafe+e.y+margin),state.height-bottomSafe-e.y-margin);

    if (DEV_MODE) {
      const ok=target.x-e.x>=0 && target.x+e.x<=state.width &&
        target.y-e.y>=topSafe && target.y+e.y<=state.height-bottomSafe;
      if (!ok) console.warn('Target bounds guard failed', {target,e,topSafe,bottomSafe,width:state.width,height:state.height});
    }
  }

  function buildRound() {
    if (!state.assets) return;

    state.clovers = [];
    state.target = null;
    state.elapsed = 0;
    state.taps = 0;
    state.found = false;
    state.highlighting = false;
    state.highlightStart = 0;
    timeValue.textContent = '0.00';

    const canvasRect = canvas.getBoundingClientRect();
    const hudRect = hud.getBoundingClientRect();
    const topSafe = Math.max(96, hudRect.bottom - canvasRect.top + 18);
    const bottomSafe = 28;

    // 四つ葉はユーザー指定の2枚目だけを使用。
    const targetImage = state.assets.fourB;
    const targetW = clamp(state.width * rand(.09,.105), 38, 54);
    const targetH = targetW * targetImage.naturalHeight / targetImage.naturalWidth;
    const target = {
      img:targetImage,
      x:0,
      y:0,
      w:targetW,
      h:targetH,
      rot:rand(-.50,.50)
    };
    placeTargetInsidePlayArea(target,topSafe,bottomSafe);

    const aspect = state.assets.three.naturalHeight / state.assets.three.naturalWidth;

    // ランダムだけだと空白ができるため、まず画面全体を格子状＋ジッターで埋める。
    const spacing = clamp(state.width / 11.5, 28, 36);
    for (let row = -1, y = -spacing; y < state.height + spacing; row++, y += spacing) {
      for (let col = -1, x = -spacing; x < state.width + spacing; col++, x += spacing) {
        const w = rand(spacing * 1.28, spacing * 1.85);
        state.clovers.push({
          x: x + rand(-spacing*.36, spacing*.36) + (row % 2 ? spacing*.42 : 0),
          y: y + rand(-spacing*.36, spacing*.36),
          w,
          h:w*aspect,
          rot:rand(0,TAU),
          alpha:rand(.86,1),
          z:rand(0,.7)
        });
      }
    }

    // 2層目を追加して隙間をほぼなくす。
    const spacing2 = spacing * 1.28;
    for (let y = -spacing2*.5; y < state.height + spacing2; y += spacing2) {
      for (let x = -spacing2*.5; x < state.width + spacing2; x += spacing2) {
        const w = rand(spacing * .92, spacing * 1.48);
        state.clovers.push({
          x:x + spacing2*.5 + rand(-spacing*.45, spacing*.45),
          y:y + spacing2*.5 + rand(-spacing*.45, spacing*.45),
          w,
          h:w*aspect,
          rot:rand(0,TAU),
          alpha:rand(.78,.96),
          z:rand(.15,.9)
        });
      }
    }

    // 小さめの三つ葉も散らし、背景が見える穴を埋める。
    const extras = clamp(Math.floor(state.width * state.height / 1300), 180, 420);
    for (let i=0;i<extras;i++) {
      const w=rand(spacing*.62, spacing*1.15);
      state.clovers.push({
        x:rand(-w*.15,state.width+w*.15),
        y:rand(-w*.15,state.height+w*.15),
        w,
        h:w*aspect,
        rot:rand(0,TAU),
        alpha:rand(.76,.96),
        z:rand(.25,1)
      });
    }

    // 四つ葉の周囲も普通に三つ葉を置く。四つ葉自体だけ最後に描画して隠れないようにする。
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

      // 四つ葉そのものは常に本来の色で表示する。
      drawSprite(t.img,t.x,t.y,t.w,t.h,t.rot,1);

      if (DEV_MODE && !state.found) {
        // 開発者モード：見た目を変えず、位置確認用の円だけ表示する。
        // 円の内側で実際の四つ葉の色・サイズ・周囲との馴染み方を確認できる。
        const radius=Math.max(t.w,t.h)*.72;
        ctx.save();
        ctx.translate(t.x,t.y);
        ctx.shadowColor='rgba(0,0,0,.85)';
        ctx.shadowBlur=4;
        ctx.strokeStyle='rgba(255,235,70,.98)';
        ctx.lineWidth=3;
        ctx.beginPath();
        ctx.arc(0,0,radius,0,TAU);
        ctx.stroke();
        ctx.shadowBlur=0;
        ctx.strokeStyle='rgba(255,255,255,.88)';
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.arc(0,0,radius+4,0,TAU);
        ctx.stroke();
        ctx.restore();
      }

      if (state.highlighting) {
        const elapsed=(performance.now()-state.highlightStart)/1000;
        const pulse=(Math.sin(elapsed*10)+1)/2;
        const base=Math.max(t.w,t.h)*.72;
        ctx.save();
        ctx.translate(t.x,t.y);
        for (let i=0;i<3;i++) {
          const r=base*(1.10+i*.34+pulse*.12);
          ctx.strokeStyle='rgba(255,245,80,'+(0.95-i*.22)+')';
          ctx.lineWidth=Math.max(3,5-i);
          ctx.beginPath();
          ctx.arc(0,0,r,0,TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
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
    draw();
    state.running=true;
    state.found=false;
    state.startTime=performance.now();
    foundMarker.classList.add('hidden');
    state.highlighting=false;
    startScreen.classList.add('hidden');
    resultScreen.classList.add('hidden');
  }

  function finishGame() {
    state.running=false;
    state.found=true;
    state.highlighting=true;
    state.highlightStart=performance.now();

    const finalTime=Number(state.elapsed.toFixed(2));
    const isBest=state.best==null || finalTime<state.best;
    if (isBest) saveBest(finalTime);

    resultTime.textContent=finalTime.toFixed(2);
    resultTaps.textContent=state.taps+'回';
    resultBest.textContent=fmt(state.best)+'秒';
    recordText.textContent=isBest?'★ NEW BEST! ★':'';
    bestValue.textContent=fmt(state.best);

  if (DEV_MODE) {
    window.__CLOVER_DEV__={
      getState:()=>({width:state.width,height:state.height,target:state.target}),
      sample:(n=1000)=>{
        if (!state.assets) return {ok:false,reason:'assets-not-ready'};
        let failures=0;
        const canvasRect=canvas.getBoundingClientRect();
        const hudRect=hud.getBoundingClientRect();
        const topSafe=Math.max(96,hudRect.bottom-canvasRect.top+18);
        const bottomSafe=28;
        const img=state.assets.fourB;
        for(let i=0;i<n;i++){
          const w=clamp(state.width*rand(.09,.105),38,54);
          const h=w*img.naturalHeight/img.naturalWidth;
          const t={w,h,rot:rand(-.50,.50),x:0,y:0};
          placeTargetInsidePlayArea(t,topSafe,bottomSafe);
          const e=rotatedHalfExtents(w,h,t.rot);
          if(t.x-e.x<0||t.x+e.x>state.width||t.y-e.y<topSafe||t.y+e.y>state.height-bottomSafe) failures++;
        }
        return {ok:failures===0,failures,n,width:state.width,height:state.height,topSafe,bottomSafe};
      }
    };
  }

    // DOMマーカーもバックアップとして同時表示。
    const rect=canvas.getBoundingClientRect();
    const fieldRect=fieldWrap.getBoundingClientRect();
    const x=rect.left + state.target.x * rect.width / state.width;
    const y=rect.top + state.target.y * rect.height / state.height;
    foundMarker.style.left=(x-fieldRect.left)+'px';
    foundMarker.style.top=(y-fieldRect.top)+'px';
    const markerSize=Math.max(90,Math.min(130,state.target.w*2.5));
    foundMarker.style.width=markerSize+'px';
    foundMarker.style.height=markerSize+'px';
    foundMarker.classList.remove('hidden');

    draw();

    setTimeout(()=>{
      state.highlighting=false;
      foundMarker.classList.add('hidden');
      draw();
      resultScreen.classList.remove('hidden');
    },1500);
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
    if (state.highlighting) draw();
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