const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const canvas = $('#game'), ctx = canvas.getContext('2d');
const mini = $('#minimap'), mctx = mini.getContext('2d');
const TAU = Math.PI * 2, clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), rand=(a,b)=>a+Math.random()*(b-a);
const STORAGE={save:'hj_tank_checkpoint_v1',records:'hj_tank_records_v1',settings:'hj_tank_settings_v1'};
const DIFF={rookie:{name:'新手',enemyHp:.82,fire:1.28,drop:1.35,xp:1.2},normal:{name:'标准',enemyHp:1,fire:1,drop:1,xp:1},hard:{name:'挑战',enemyHp:1.25,fire:.78,drop:.78,xp:.92}};
const WEAPONS=[
  {id:'shell',name:'制式炮弹',key:'1'}, {id:'laser',name:'贯穿激光',key:'2'},
  {id:'cruise',name:'巡航导弹',key:'3'}, {id:'burst',name:'爆裂弹',key:'4'},
  {id:'air',name:'空对地导弹',key:'5'}
];
const settings=Object.assign({volume:.55,shake:.6,quality:'high'},safeJSON(localStorage.getItem(STORAGE.settings),{}));
let selectedDiff='normal', game=null, last=0, accumulator=0, audio=null;

function safeJSON(s,fallback){try{return s?JSON.parse(s):fallback}catch{return fallback}}
function resize(){const d=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect();canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);canvas.logicalWidth=r.width;canvas.logicalHeight=r.height}
addEventListener('resize',resize); resize();

class Sound {
  constructor(){this.ac=null}
  init(){if(!this.ac)this.ac=new (window.AudioContext||window.webkitAudioContext)()}
  tone(freq=220,dur=.06,type='square',gain=.035,slide=0){if(!settings.volume)return;this.init();const o=this.ac.createOscillator(),g=this.ac.createGain();o.type=type;o.frequency.setValueAtTime(freq,this.ac.currentTime);o.frequency.linearRampToValueAtTime(Math.max(30,freq+slide),this.ac.currentTime+dur);g.gain.setValueAtTime(gain*settings.volume,this.ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ac.currentTime+dur);o.connect(g).connect(this.ac.destination);o.start();o.stop(this.ac.currentTime+dur)}
  shoot(){this.tone(105,.08,'square',.055,-40)} hit(){this.tone(330,.045,'sawtooth',.025,-170)}
  boom(){this.tone(78,.22,'sawtooth',.075,-48)} pickup(){this.tone(520,.12,'sine',.04,260)}
  level(){this.tone(420,.28,'triangle',.045,480)} taunt(){this.tone(165,.22,'square',.04,40)}
}
audio=new Sound();

class Input {
  constructor(){this.keys=new Set();this.mouse={x:innerWidth/2,y:innerHeight/2,down:false};this.just=new Set();
    addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(!this.keys.has(k))this.just.add(k);this.keys.add(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault()});
    addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
    canvas.addEventListener('mousemove',e=>{this.mouse.x=e.clientX;this.mouse.y=e.clientY});
    canvas.addEventListener('mousedown',()=>{this.mouse.down=true;audio.init()});addEventListener('mouseup',()=>this.mouse.down=false);
  }
  consume(k){if(this.just.has(k)){this.just.delete(k);return true}return false}
  end(){this.just.clear()}
}
const input=new Input();

const glyphs={
 '黄':["111111111","001111100","111111111","001010100","111111111","010111010","010111010","111111111","010000010"],
 '俊':["100100000","101011100","110100100","101111110","100010000","101111100","100101000","101010100","110000110"],
 '人':["000010000","000010000","000101000","000101000","001000100","001000100","010000010","100000001","100000001"]
};

class Game {
  constructor(diff,save=null){
    this.diff=diff;this.cfg=DIFF[diff];this.world={w:2600,h:1700};this.camera={x:0,y:0};this.wave=save?.wave||1;this.mapIndex=save?.mapIndex||0;
    this.score=save?.score||0;this.level=save?.level||1;this.xp=save?.xp||0;this.nextXp=save?.nextXp||80;this.kills=save?.kills||0;this.friendly=save?.friendly||0;this.shots=save?.shots||0;this.hits=save?.hits||0;this.started=performance.now();
    this.obstacles=[];this.tanks=[];this.bullets=[];this.pickups=[];this.particles=[];this.missiles=[];this.lasers=[];
    this.phase='playing';this.pending=0;this.spawnTimer=0;this.intermission=0;this.waveCleared=false;this.shake=0;this.toastTimer=0;this.airTarget=null;this.airStrike=null;
    this.upgrades=Object.assign({damage:0,rate:0,speed:0,bounce:0,special:0,taunt:0,hp:0},save?.upgrades||{});
    this.player=this.makePlayer(save);this.tanks.push(this.player);this.buildMap();this.startWave();this.updateHUD();
  }
  makePlayer(s){return {id:'player',team:'player',x:s?.x||1300,y:s?.y||1450,r:22,angle:-Math.PI/2,turret:-Math.PI/2,hp:s?.hp||100,maxHp:s?.maxHp||100,shield:s?.shield||0,speed:230*(1+this.upgrades.speed*.07),cool:0,tauntCd:0,tauntTime:0,weapon:s?.weapon||'shell',ammo:Object.assign({laser:2,cruise:3,burst:4,air:1},s?.ammo||{}),alive:true,color:'#aeba67'} }
  buildMap(){
    this.obstacles=[];const add=(x,y,w,h,type)=>this.obstacles.push({x,y,w,h,type,hp:{brick:5,steel:7,crate:3}[type]||999,maxHp:{brick:5,steel:7,crate:3}[type]||999});
    for(let x=180;x<this.world.w-180;x+=260){if(x%520)add(x,250,110,46,'water');else add(x,280,55,55,'crate')}
    for(let y=480;y<1350;y+=250){add(260,y,70,70,y%500?'brick':'steel');add(this.world.w-330,y,70,70,y%500?'steel':'brick')}
    const ch=['黄','俊','人'][this.mapIndex%3],pattern=glyphs[ch],cell=64,ox=this.world.w/2-pattern[0].length*cell/2,oy=470;
    pattern.forEach((row,gy)=>[...row].forEach((v,gx)=>{if(v==='1'&&(gx+gy)%4!==1)add(ox+gx*cell,oy+gy*cell,52,52,(gx+gy+this.mapIndex)%5===0?'steel':'brick')}));
    // open cover clusters and campus scenery collision
    [[550,480],[730,1100],[1890,520],[2030,1170],[1040,1330],[1540,290]].forEach((p,i)=>{add(p[0],p[1],80,55,i%3===0?'crate':'brick')});
  }
  startWave(){
    const count=Math.min(5+Math.floor(this.wave*1.45),24);this.pending=count;this.spawnTimer=.6;this.phase='playing';this.waveCleared=false;
    toast(`第 ${this.wave} 波 · ${['黄','俊','人'][this.mapIndex%3]}字战区`,2.5);this.checkpoint();
  }
  checkpoint(){const p=this.player;const data={version:1,diff:this.diff,wave:this.wave,mapIndex:this.mapIndex,score:this.score,level:this.level,xp:this.xp,nextXp:this.nextXp,kills:this.kills,friendly:this.friendly,hits:this.hits,shots:this.shots,hp:p.hp,maxHp:p.maxHp,shield:p.shield,weapon:p.weapon,ammo:p.ammo,upgrades:this.upgrades};localStorage.setItem(STORAGE.save,JSON.stringify(data));refreshMenu()}
  spawnEnemy(){
    const elite=this.wave%5===0&&this.pending<=2||Math.random()<Math.min(.08+this.wave*.008,.3);let p;do{const edge=Math.floor(Math.random()*3);p=edge===0?{x:rand(100,2500),y:120}:edge===1?{x:120,y:rand(150,1200)}:{x:2480,y:rand(150,1200)}}while(dist(p,this.player)<650);
    const hp=Math.ceil((elite?52:24)*(1+this.wave*.055)*this.cfg.enemyHp);
    this.tanks.push({id:crypto.randomUUID?.()||Math.random(),team:'enemy',x:p.x,y:p.y,r:elite?25:21,angle:Math.PI/2,turret:Math.PI/2,hp,maxHp:hp,speed:(elite?112:95)+Math.min(this.wave*2,45),cool:rand(.4,1.5),think:0,target:null,elite,taunted:0,alive:true,color:elite?'#d18149':'#a8523e'});this.pending--;
  }
  update(dt){
    if(this.phase==='paused'||this.phase==='levelup'||this.phase==='over')return;
    if(input.consume('p')||input.consume('escape')){if(this.airTarget){this.airTarget=null}else this.pause();return}
    if(this.airTarget){this.updateAir(dt);input.end();return}
    const p=this.player;if(!p.alive)return;
    let dx=(input.keys.has('d')||input.keys.has('arrowright')?1:0)-(input.keys.has('a')||input.keys.has('arrowleft')?1:0),dy=(input.keys.has('s')||input.keys.has('arrowdown')?1:0)-(input.keys.has('w')||input.keys.has('arrowup')?1:0);
    if(dx||dy){const l=Math.hypot(dx,dy);dx/=l;dy/=l;p.angle=Math.atan2(dy,dx);this.moveTank(p,dx*p.speed*dt,dy*p.speed*dt);if(Math.random()<dt*12)this.particle(p.x-dx*20,p.y-dy*20,'dust')}
    const worldMouse=this.screenToWorld(input.mouse.x,input.mouse.y);p.turret=Math.atan2(worldMouse.y-p.y,worldMouse.x-p.x);
    p.cool=Math.max(0,p.cool-dt);p.tauntCd=Math.max(0,p.tauntCd-dt);p.tauntTime=Math.max(0,p.tauntTime-dt);
    ['1','2','3','4','5'].forEach((k,i)=>{if(input.consume(k))this.selectWeapon(WEAPONS[i].id)});
    if(input.consume('t'))this.taunt();
    if(input.mouse.down||input.keys.has('j')||input.keys.has(' '))this.firePlayer();
    if(this.pending>0){this.spawnTimer-=dt;if(this.spawnTimer<=0&&this.tanks.filter(t=>t.team==='enemy'&&t.alive).length<Math.min(7+Math.floor(this.wave/3),15)){this.spawnEnemy();this.spawnTimer=rand(.65,1.35)}}
    this.tanks.filter(t=>t.team==='enemy'&&t.alive).forEach(t=>this.updateEnemy(t,dt));
    this.updateBullets(dt);this.updateMissiles(dt);this.updateLasers(dt);this.updatePickups(dt);this.updateParticles(dt);
    if(this.airStrike){this.airStrike.t-=dt;if(this.airStrike.t<=0){this.explode(this.airStrike.x,this.airStrike.y,125,68,null);this.airStrike=null}}
    this.tanks=this.tanks.filter(t=>t.alive||t===this.player);
    if(this.pending===0&&!this.tanks.some(t=>t.team==='enemy'&&t.alive)&&!this.waveCleared){this.waveCleared=true;this.intermission=3;this.score+=250*this.wave;this.gainXp(42+this.wave*5);if(this.phase!=='levelup')this.phase='intermission';toast('区域净空 · 检查点已记录',2.4)}
    if(this.phase==='intermission'){this.intermission-=dt;if(this.intermission<=0){this.wave++;if((this.wave-1)%4===0){this.mapIndex=(this.mapIndex+1)%3;this.buildMap();p.x=1300;p.y=1450}p.hp=Math.min(p.maxHp,p.hp+18);this.startWave()}}
    this.camera.x+=(clamp(p.x-canvas.logicalWidth/2,0,this.world.w-canvas.logicalWidth)-this.camera.x)*Math.min(1,dt*5);this.camera.y+=(clamp(p.y-canvas.logicalHeight/2,0,this.world.h-canvas.logicalHeight)-this.camera.y)*Math.min(1,dt*5);
    this.shake=Math.max(0,this.shake-dt*15);this.updateHUD();input.end();
  }
  updateAir(dt){const p=this.player;if(!this.airTarget)return;let dx=(input.keys.has('d')||input.keys.has('arrowright')?1:0)-(input.keys.has('a')||input.keys.has('arrowleft')?1:0),dy=(input.keys.has('s')||input.keys.has('arrowdown')?1:0)-(input.keys.has('w')||input.keys.has('arrowup')?1:0);this.airTarget.x=clamp(this.airTarget.x+dx*360*dt,80,this.world.w-80);this.airTarget.y=clamp(this.airTarget.y+dy*360*dt,80,this.world.h-80);const wm=this.screenToWorld(input.mouse.x,input.mouse.y);if(input.mouse.down)this.airTarget={x:wm.x,y:wm.y};if(input.consume('j')||input.consume(' ')){p.ammo.air--;this.airStrike={...this.airTarget,t:1.15};this.airTarget=null;toast('空袭坐标已确认',1.4);audio.tone(600,.3,'sine',.04,-450)}}
  selectWeapon(id){const p=this.player;if(id!=='shell'&&!p.ammo[id]){toast('该武器弹药不足');return}p.weapon=id;this.updateHUD()}
  firePlayer(){const p=this.player;if(p.cool>0)return;const w=p.weapon;if(w!=='shell'&&!p.ammo[w]){p.weapon='shell';toast('特殊弹药耗尽');return}if(w==='air'){this.airTarget={x:p.x,y:p.y-180};toast('移动准星，按 J / 空格确认，ESC 取消',3);input.mouse.down=false;return}p.cool=(.32*(1-this.upgrades.rate*.08));this.shots++;audio.shoot();if(w!=='shell')p.ammo[w]--;
    if(w==='laser'){this.lasers.push({x:p.x,y:p.y,a:p.turret,t:.26,owner:p,hit:new Set()});p.cool=.65}
    else if(w==='cruise'){let target=this.nearestEnemy(this.screenToWorld(input.mouse.x,input.mouse.y),350);this.missiles.push({x:p.x,y:p.y,a:p.turret,speed:270,target,owner:p,t:5})}
    else this.spawnBullet(p,p.turret,w==='burst'?'burst':'normal',10+this.upgrades.damage*2);
  }
  spawnBullet(owner,a,type='normal',damage=10,x=owner.x,y=owner.y){this.bullets.push({x:x+Math.cos(a)*(owner.r+8),y:y+Math.sin(a)*(owner.r+8),vx:Math.cos(a)*520,vy:Math.sin(a)*520,r:type==='fragment'?3:5,owner,team:owner.team,damage,bounces:0,maxBounces:1+this.upgrades.bounce,type,age:0,alive:true})}
  updateEnemy(t,dt){if(!t.alive)return;t.cool-=dt;t.think-=dt;t.taunted=Math.max(0,t.taunted-dt);const p=this.player;let target=p;if(!t.taunted){const candidates=this.tanks.filter(o=>o.alive&&o!==t&&dist(t,o)<520);if(candidates.length&&Math.random()<.008)target=candidates[Math.floor(Math.random()*candidates.length)]}
    const a=Math.atan2(target.y-t.y,target.x-t.x);t.turret=angleLerp(t.turret,a,dt*3);if(t.think<=0){t.think=rand(.35,.9);t.moveAngle=a+rand(-.85,.85)}
    const desired=dist(t,target)>260?1:-.25,dx=Math.cos(t.moveAngle)*t.speed*desired*dt,dy=Math.sin(t.moveAngle)*t.speed*desired*dt;const moved=this.moveTank(t,dx,dy);if(!moved)t.moveAngle+=rand(1,2.8);t.angle=t.moveAngle;
    if(t.cool<=0&&dist(t,target)<700&&this.lineClear(t,target)){this.spawnBullet(t,t.turret,'normal',t.elite?14:9);t.cool=rand(1.05,1.75)*this.cfg.fire;audio.tone(90,.06,'square',.018,-20)}
  }
  lineClear(a,b){for(const o of this.obstacles){if(o.type==='water')continue;if(lineRect(a.x,a.y,b.x,b.y,o))return false}return true}
  moveTank(t,dx,dy){const ox=t.x,oy=t.y;t.x=clamp(t.x+dx,t.r+8,this.world.w-t.r-8);if(this.tankBlocked(t))t.x=ox;t.y=clamp(t.y+dy,t.r+8,this.world.h-t.r-8);if(this.tankBlocked(t))t.y=oy;return t.x!==ox||t.y!==oy}
  tankBlocked(t){return this.obstacles.some(o=>circleRect(t,o))||this.tanks.some(q=>q!==t&&q.alive&&dist(t,q)<t.r+q.r-5)}
  updateBullets(dt){for(const b of this.bullets){if(!b.alive)continue;b.age+=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.x<b.r||b.x>this.world.w-b.r){if(b.bounces<b.maxBounces){b.vx*=-1;b.x=clamp(b.x,b.r,this.world.w-b.r);b.bounces++;this.ricochet(b)}else b.alive=false}
      if(b.y<b.r||b.y>this.world.h-b.r){if(b.bounces<b.maxBounces){b.vy*=-1;b.y=clamp(b.y,b.r,this.world.h-b.r);b.bounces++;this.ricochet(b)}else b.alive=false}
      for(const o of this.obstacles){if(!b.alive||o.type==='water'||!pointRect(b,o,4))continue;o.hp-=b.damage>=20?2:1;this.hitParticles(b.x,b.y,o.type==='steel'?'spark':'debris');if(o.type==='steel'&&o.hp>0&&b.bounces<b.maxBounces){const side=rectSide(b,o);if(side==='x')b.vx*=-1;else b.vy*=-1;b.bounces++;this.ricochet(b)}else{b.alive=false;if(b.type==='burst')this.burst(b.x,b.y,b.owner);if(o.hp<=0)this.destroyObstacle(o)}}
      for(const t of this.tanks){if(!b.alive||!t.alive||b.age<.1&&t===b.owner)continue;if(dist(b,t)<b.r+t.r){b.alive=false;this.damageTank(t,b.damage,b.owner);this.hits++;if(b.type==='burst')this.burst(b.x,b.y,b.owner);break}}
    }this.bullets=this.bullets.filter(b=>b.alive&&b.age<8)}
  ricochet(b){audio.hit();this.hitParticles(b.x,b.y,'spark')}
  burst(x,y,owner){audio.boom();for(let i=0;i<8;i++)this.spawnBullet(owner,i/8*TAU,'fragment',7,x,y)}
  updateMissiles(dt){for(const m of this.missiles){m.t-=dt;if(!m.target?.alive)m.target=this.nearestEnemy(m,500);if(m.target){const ta=Math.atan2(m.target.y-m.y,m.target.x-m.x);m.a=angleLerp(m.a,ta,dt*3.6)}m.x+=Math.cos(m.a)*m.speed*dt;m.y+=Math.sin(m.a)*m.speed*dt;this.particle(m.x,m.y,'smoke');const hit=this.tanks.find(t=>t.alive&&t!==m.owner&&dist(m,t)<t.r+8);if(hit||m.t<=0||m.x<0||m.y<0||m.x>this.world.w||m.y>this.world.h){this.explode(m.x,m.y,80,32,m.owner);m.dead=true}}this.missiles=this.missiles.filter(m=>!m.dead)}
  updateLasers(dt){for(const l of this.lasers){l.t-=dt;const ex=l.x+Math.cos(l.a)*900,ey=l.y+Math.sin(l.a)*900;for(const t of this.tanks){if(t.alive&&!l.hit.has(t)&&distanceToSegment(t.x,t.y,l.x,l.y,ex,ey)<t.r){l.hit.add(t);this.damageTank(t,28+this.upgrades.special*4,l.owner)}}for(const o of this.obstacles){if(o.type!=='water'&&lineRect(l.x,l.y,ex,ey,o)&&!l.hit.has(o)){l.hit.add(o);o.hp-=1;if(o.hp<=0)this.destroyObstacle(o)}}}this.lasers=this.lasers.filter(l=>l.t>0)}
  explode(x,y,r,damage,owner){audio.boom();this.shake=12*settings.shake;for(const t of this.tanks)if(t.alive&&dist(t,{x,y})<r+t.r)this.damageTank(t,damage*(1-dist(t,{x,y})/(r+t.r)*.45),owner);for(let i=0;i<28;i++)this.particle(x,y,'blast')}
  damageTank(t,dmg,owner){if(t.shield>0){const a=Math.min(t.shield,dmg);t.shield-=a;dmg-=a}t.hp-=dmg;this.hitParticles(t.x,t.y,'spark');if(t.hp<=0)this.killTank(t,owner)}
  killTank(t,owner){t.alive=false;audio.boom();this.shake=8*settings.shake;for(let i=0;i<18;i++)this.particle(t.x,t.y,'blast');if(t===this.player){this.endGame();return}this.score+=t.elite?220:80;this.kills++;if(owner&&owner.team==='enemy')this.friendly++;this.gainXp((t.elite?42:22)*this.cfg.xp);if(t.elite||Math.random()<.19*this.cfg.drop)this.drop(t.x,t.y)}
  destroyObstacle(o){const i=this.obstacles.indexOf(o);if(i>=0)this.obstacles.splice(i,1);if(o.type==='crate'&&Math.random()<.65*this.cfg.drop)this.drop(o.x+o.w/2,o.y+o.h/2)}
  drop(x,y){const types=['heal','shield','xp','laser','cruise','burst','air','speed','rate'];const type=types[Math.floor(Math.random()*types.length)];this.pickups.push({x,y,type,t:18,bob:Math.random()*TAU})}
  updatePickups(dt){for(const p of this.pickups){p.t-=dt;p.bob+=dt*3;if(dist(p,this.player)<35){this.collect(p);p.dead=true}}this.pickups=this.pickups.filter(p=>!p.dead&&p.t>0)}
  collect(p){const pl=this.player;audio.pickup();const names={heal:'战地维修',shield:'能量护盾',xp:'经验模块',laser:'激光弹药',cruise:'巡航导弹',burst:'爆裂弹药',air:'空袭授权',speed:'引擎超频',rate:'装填加速'};if(p.type==='heal')pl.hp=Math.min(pl.maxHp,pl.hp+30);else if(p.type==='shield')pl.shield=Math.min(60,pl.shield+30);else if(p.type==='xp')this.gainXp(45);else if(p.type==='speed'){pl.speed*=1.12;setTimeout(()=>pl.speed/=1.12,10000)}else if(p.type==='rate'){this.upgrades.rate=Math.min(6,this.upgrades.rate+1)}else pl.ammo[p.type]=(pl.ammo[p.type]||0)+(p.type==='air'?1:2);toast(`获得：${names[p.type]}`)}
  gainXp(n){this.xp+=n;if(this.xp>=this.nextXp&&this.phase!=='levelup'){this.xp-=this.nextXp;this.level++;this.nextXp=Math.floor(this.nextXp*1.22+15);this.showUpgrades()}}
  showUpgrades(){this.phase='levelup';audio.level();const pool=[
    ['hp','装甲扩容','最大生命 +18，并修复 25 点','▣',5],['damage','穿甲弹芯','普通炮弹伤害 +2','◆',6],['rate','快速装填','射击间隔 -8%','»',6],['speed','强化履带','移动速度 +7%','⌁',5],['bounce','折射弹道','反弹次数 +1','⌁',2],['special','战术弹仓','所有特殊弹药 +1，效果增强','✦',5],['taunt','广域广播','嘲讽范围与持续时间提升','◎',4]
  ].filter(x=>this.upgrades[x[0]]<x[4]);const picks=pool.sort(()=>Math.random()-.5).slice(0,3);const box=$('#upgradeChoices');box.innerHTML='';picks.forEach(u=>{const b=document.createElement('button');b.className='upgrade-card';b.innerHTML=`<i>${u[3]}</i><h3>${u[1]}</h3><p>${u[2]}</p><small>当前等级 ${this.upgrades[u[0]]} / ${u[4]}</small>`;b.onclick=()=>this.chooseUpgrade(u[0]);box.append(b)});$('#levelup').classList.remove('hidden')}
  chooseUpgrade(id){this.upgrades[id]++;const p=this.player;if(id==='hp'){p.maxHp+=18;p.hp=Math.min(p.maxHp,p.hp+25)}if(id==='speed')p.speed*=1.07;if(id==='special')Object.keys(p.ammo).forEach(k=>p.ammo[k]++);p.hp=Math.min(p.maxHp,p.hp+10);$('#levelup').classList.add('hidden');this.phase=this.waveCleared?'intermission':'playing'}
  taunt(){const p=this.player;if(p.tauntCd>0)return;p.tauntCd=12;p.tauntTime=3+this.upgrades.taunt*.7;const range=310+this.upgrades.taunt*45;this.tanks.filter(t=>t.team==='enemy'&&t.alive&&dist(t,p)<range).forEach(t=>t.taunted=p.tauntTime);audio.taunt();toast('来啊！火力都朝我来！',1.5)}
  nearestEnemy(p,r=Infinity){let best=null,d=r;for(const t of this.tanks)if(t.team==='enemy'&&t.alive&&dist(p,t)<d){best=t;d=dist(p,t)}return best}
  particle(x,y,type){if(settings.quality==='low'&&Math.random()<.55)return;const a=Math.random()*TAU,s=type==='blast'?rand(50,240):rand(10,70);this.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:type==='blast'?rand(.3,.8):rand(.2,.6),max:1,type,size:rand(2,7)})}
  hitParticles(x,y,type){for(let i=0;i<6;i++)this.particle(x,y,type)}
  updateParticles(dt){for(const p of this.particles){p.t-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.95;p.vy*=.95}this.particles=this.particles.filter(p=>p.t>0).slice(-500)}
  screenToWorld(x,y){return{x:x+this.camera.x,y:y+this.camera.y}}
  pause(){this.phase='paused';$('#pause').classList.remove('hidden')}
  resume(){this.phase='playing';$('#pause').classList.add('hidden')}
  endGame(){this.phase='over';localStorage.removeItem(STORAGE.save);const seconds=Math.floor((performance.now()-this.started)/1000),accuracy=this.shots?Math.round(this.hits/this.shots*100):0,rec={date:new Date().toLocaleString('zh-CN'),diff:this.diff,wave:this.wave,score:this.score,kills:this.kills,time:seconds,level:this.level};const records=safeJSON(localStorage.getItem(STORAGE.records),[]);records.unshift(rec);localStorage.setItem(STORAGE.records,JSON.stringify(records.slice(0,20)));$('#resultStats').innerHTML=`<div><span>抵达波次</span><b>${this.wave}</b></div><div><span>最终得分</span><b>${this.score}</b></div><div><span>击毁敌军</span><b>${this.kills}</b></div><div><span>敌军误伤</span><b>${this.friendly}</b></div><div><span>命中率</span><b>${accuracy}%</b></div><div><span>生存时间</span><b>${formatTime(seconds)}</b></div>`;$('#gameover').classList.remove('hidden');$('#hud').classList.add('hidden');refreshMenu()}
  updateHUD(){const p=this.player;$('#hpBar').style.width=`${Math.max(0,p.hp/p.maxHp*100)}%`;$('#hpText').textContent=`${Math.ceil(Math.max(0,p.hp))} / ${p.maxHp}`;$('#shieldBar').style.width=`${p.shield/60*100}%`;$('#waveText').textContent=`WAVE ${String(this.wave).padStart(2,'0')}`;$('#enemyText').textContent=`敌军 ${this.pending+this.tanks.filter(t=>t.team==='enemy'&&t.alive).length}`;$('#levelText').textContent=this.level;$('#xpBar').style.width=`${this.xp/this.nextXp*100}%`;$('#scoreText').textContent=String(this.score).padStart(6,'0');const w=WEAPONS.find(w=>w.id===p.weapon);$('#weaponKey').textContent=w.key;$('#weaponName').textContent=w.name;$('#weaponAmmo').textContent=p.weapon==='shell'?'弹药 ∞':`弹药 ${p.ammo[p.weapon]||0}`;$('#tauntBar').style.width=`${(1-p.tauntCd/12)*100}%`}
  render(){const w=canvas.logicalWidth,h=canvas.logicalHeight;ctx.clearRect(0,0,w,h);let sx=this.shake?rand(-this.shake,this.shake):0,sy=this.shake?rand(-this.shake,this.shake):0;ctx.save();ctx.translate(-this.camera.x+sx,-this.camera.y+sy);this.drawGround();this.drawScenery();this.obstacles.forEach(o=>this.drawObstacle(o));this.pickups.forEach(p=>this.drawPickup(p));this.tanks.filter(t=>t.alive).forEach(t=>this.drawTank(t));this.bullets.forEach(b=>this.drawBullet(b));this.missiles.forEach(m=>this.drawMissile(m));this.lasers.forEach(l=>this.drawLaser(l));this.particles.forEach(p=>this.drawParticle(p));if(this.airTarget)this.drawAirTarget(this.airTarget);if(this.airStrike)this.drawAirStrike(this.airStrike);ctx.restore();this.drawMini();if(this.phase==='intermission')this.centerText(`战区净空`,`${Math.ceil(this.intermission)} 秒后进入下一波`)}
  drawGround(){ctx.fillStyle='#28352c';ctx.fillRect(0,0,this.world.w,this.world.h);ctx.strokeStyle='#334139';ctx.lineWidth=1;for(let x=0;x<this.world.w;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,this.world.h);ctx.stroke()}for(let y=0;y<this.world.h;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(this.world.w,y);ctx.stroke()}ctx.fillStyle='#303b30';ctx.fillRect(0,350,this.world.w,120);ctx.fillRect(0,1380,this.world.w,150);ctx.fillStyle='#252d27';for(let x=0;x<this.world.w;x+=80)ctx.fillRect(x,405,45,4);ctx.fillStyle='#171d18';ctx.fillRect(0,0,this.world.w,34);ctx.fillRect(0,this.world.h-34,this.world.w,34);ctx.fillRect(0,0,34,this.world.h);ctx.fillRect(this.world.w-34,0,34,this.world.h)}
  drawScenery(){ctx.fillStyle='#141b18';ctx.fillRect(730,30,1140,190);ctx.fillStyle='#38443d';for(let x=780;x<1840;x+=105)ctx.fillRect(x,65,65,85);ctx.fillStyle='#cfbd6b';for(let x=790;x<1840;x+=210)ctx.fillRect(x,75,45,55);ctx.fillStyle='#cdd776';ctx.font='900 28px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('浩源校园 · 黄俊人原创作战区',1300,205);ctx.textAlign='left';ctx.fillStyle='#202820';for(let x=80;x<2500;x+=210){ctx.beginPath();ctx.arc(x,330,24,0,TAU);ctx.fill();ctx.fillRect(x-4,330,8,45)}}
  drawObstacle(o){if(o.type==='water'){ctx.fillStyle='#284e56';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle='#5c9192';for(let y=o.y+10;y<o.y+o.h;y+=14){ctx.beginPath();ctx.moveTo(o.x+5,y);ctx.lineTo(o.x+o.w-5,y);ctx.stroke()}return}ctx.fillStyle=o.type==='brick'?'#824b38':o.type==='steel'?'#788078':'#9a713d';ctx.fillRect(o.x,o.y,o.w,o.h);ctx.strokeStyle=o.type==='steel'?'#b7bcae':'#3d3028';ctx.lineWidth=2;ctx.strokeRect(o.x+2,o.y+2,o.w-4,o.h-4);if(o.type==='brick'){ctx.strokeStyle='#b06b50';ctx.beginPath();ctx.moveTo(o.x,o.y+o.h/2);ctx.lineTo(o.x+o.w,o.y+o.h/2);ctx.moveTo(o.x+o.w/2,o.y);ctx.lineTo(o.x+o.w/2,o.y+o.h);ctx.stroke()}else if(o.type==='steel'){ctx.fillStyle='#303731';[[7,7],[o.w-7,7],[7,o.h-7],[o.w-7,o.h-7]].forEach(p=>{ctx.beginPath();ctx.arc(o.x+p[0],o.y+p[1],3,0,TAU);ctx.fill()})}else{ctx.strokeStyle='#4c351f';ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);ctx.moveTo(o.x+o.w,o.y);ctx.lineTo(o.x,o.y+o.h);ctx.stroke()}if(o.hp<o.maxHp){ctx.strokeStyle='#181b18';ctx.beginPath();ctx.moveTo(o.x+o.w*.3,o.y);ctx.lineTo(o.x+o.w*.48,o.y+o.h*.48);ctx.lineTo(o.x+o.w*.35,o.y+o.h);ctx.stroke()}}
  drawTank(t){ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.angle);ctx.fillStyle='#151915';ctx.fillRect(-25,-19,50,9);ctx.fillRect(-25,10,50,9);ctx.fillStyle=t.color;roundRect(ctx,-21,-16,42,32,6);ctx.fill();ctx.fillStyle=t.team==='player'?'#d7df86':'#e1aa75';ctx.fillRect(-14,-12,22,4);ctx.restore();ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.turret);ctx.fillStyle=t.color;ctx.beginPath();ctx.arc(0,0,t.elite?15:13,0,TAU);ctx.fill();ctx.fillStyle='#222823';ctx.fillRect(5,-4,32,8);ctx.fillStyle='#d5d99e';ctx.fillRect(31,-2,8,4);ctx.restore();if(t.hp<t.maxHp){ctx.fillStyle='#191d19';ctx.fillRect(t.x-24,t.y-34,48,4);ctx.fillStyle=t.team==='player'?'#cdd978':'#d36b4a';ctx.fillRect(t.x-24,t.y-34,48*Math.max(0,t.hp/t.maxHp),4)}if(t.taunted>0){ctx.fillStyle='#e7bd58';ctx.font='900 16px sans-serif';ctx.textAlign='center';ctx.fillText('!',t.x,t.y-43);ctx.textAlign='left'}if(t===this.player&&t.tauntTime>0){ctx.strokeStyle=`rgba(220,218,100,${.3+t.tauntTime%1*.4})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,310+this.upgrades.taunt*45,0,TAU);ctx.stroke()}}
  drawBullet(b){ctx.fillStyle=b.type==='fragment'?'#ff7c45':'#f2e896';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();ctx.strokeStyle='#f5b260';ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.025,b.y-b.vy*.025);ctx.stroke()}
  drawMissile(m){ctx.save();ctx.translate(m.x,m.y);ctx.rotate(m.a);ctx.fillStyle='#ded9bd';ctx.fillRect(-12,-4,24,8);ctx.fillStyle='#d85f3f';ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(-21,0);ctx.lineTo(-12,5);ctx.fill();ctx.restore()}
  drawLaser(l){ctx.strokeStyle=`rgba(216,241,112,${l.t/.26})`;ctx.lineWidth=8;ctx.shadowColor='#d9ef75';ctx.shadowBlur=20;ctx.beginPath();ctx.moveTo(l.x,l.y);ctx.lineTo(l.x+Math.cos(l.a)*900,l.y+Math.sin(l.a)*900);ctx.stroke();ctx.shadowBlur=0}
  drawPickup(p){const colors={heal:'#77d47a',shield:'#6bc7de',xp:'#d4dc67',laser:'#edfa9c',cruise:'#db805a',burst:'#ecb15c',air:'#e7e5d5',speed:'#83d6ab',rate:'#bc8bd8'},labels={heal:'+',shield:'◇',xp:'XP',laser:'L',cruise:'M',burst:'B',air:'A',speed:'S',rate:'R'};ctx.save();ctx.translate(p.x,p.y+Math.sin(p.bob)*5);ctx.rotate(p.bob*.15);ctx.fillStyle='#121712';ctx.strokeStyle=colors[p.type];ctx.lineWidth=3;ctx.fillRect(-16,-16,32,32);ctx.strokeRect(-16,-16,32,32);ctx.rotate(-p.bob*.15);ctx.fillStyle=colors[p.type];ctx.font='900 13px Consolas';ctx.textAlign='center';ctx.fillText(labels[p.type],0,5);ctx.restore();ctx.textAlign='left'}
  drawParticle(p){ctx.globalAlpha=clamp(p.t*2,0,1);ctx.fillStyle=p.type==='blast'?'#e2683c':p.type==='spark'?'#f5dd73':p.type==='smoke'?'#4b524c':'#766d55';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,TAU);ctx.fill();ctx.globalAlpha=1}
  drawAirTarget(p){ctx.strokeStyle='#f0cf5e';ctx.lineWidth=3;ctx.setLineDash([12,8]);ctx.beginPath();ctx.arc(p.x,p.y,125,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(p.x-160,p.y);ctx.lineTo(p.x+160,p.y);ctx.moveTo(p.x,p.y-160);ctx.lineTo(p.x,p.y+160);ctx.stroke();ctx.fillStyle='#f3d567';ctx.font='700 14px Consolas';ctx.fillText('AIR STRIKE // CONFIRM',p.x+20,p.y-140)}
  drawAirStrike(p){const r=125*(1+p.t*.25);ctx.fillStyle=`rgba(224,80,44,${.18+Math.sin(p.t*15)*.08})`;ctx.strokeStyle='#ed653e';ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.fill();ctx.stroke()}
  drawMini(){mctx.clearRect(0,0,mini.width,mini.height);const sx=mini.width/this.world.w,sy=mini.height/this.world.h;mctx.fillStyle='#29352d';mctx.fillRect(0,0,mini.width,mini.height);for(const o of this.obstacles){mctx.fillStyle=o.type==='water'?'#376a72':o.type==='steel'?'#879086':'#754b38';mctx.fillRect(o.x*sx,o.y*sy,Math.max(2,o.w*sx),Math.max(2,o.h*sy))}for(const t of this.tanks){if(!t.alive)continue;mctx.fillStyle=t.team==='player'?'#e1ec83':'#d96548';mctx.beginPath();mctx.arc(t.x*sx,t.y*sy,t.team==='player'?3:2,0,TAU);mctx.fill()}mctx.strokeStyle='#d7df83';mctx.strokeRect(this.camera.x*sx,this.camera.y*sy,canvas.logicalWidth*sx,canvas.logicalHeight*sy)}
  centerText(a,b){ctx.fillStyle='#0c100de6';ctx.fillRect(canvas.logicalWidth/2-200,canvas.logicalHeight/2-55,400,110);ctx.textAlign='center';ctx.fillStyle='#dbe67d';ctx.font='900 30px Microsoft YaHei';ctx.fillText(a,canvas.logicalWidth/2,canvas.logicalHeight/2-5);ctx.fillStyle='#a5ab9f';ctx.font='14px Microsoft YaHei';ctx.fillText(b,canvas.logicalWidth/2,canvas.logicalHeight/2+25);ctx.textAlign='left'}
}

function angleLerp(a,b,t){let d=((b-a+Math.PI)%(TAU)+TAU)%TAU-Math.PI;return a+d*Math.min(1,t)}
function circleRect(c,r){const x=clamp(c.x,r.x,r.x+r.w),y=clamp(c.y,r.y,r.y+r.h);return (c.x-x)**2+(c.y-y)**2<c.r**2}
function pointRect(p,r,pad=0){return p.x>r.x-pad&&p.x<r.x+r.w+pad&&p.y>r.y-pad&&p.y<r.y+r.h+pad}
function rectSide(p,r){const dx=Math.min(Math.abs(p.x-r.x),Math.abs(p.x-(r.x+r.w))),dy=Math.min(Math.abs(p.y-r.y),Math.abs(p.y-(r.y+r.h)));return dx<dy?'x':'y'}
function lineRect(x1,y1,x2,y2,r){const steps=Math.ceil(Math.hypot(x2-x1,y2-y1)/30);for(let i=1;i<steps;i++){const t=i/steps;if(pointRect({x:x1+(x2-x1)*t,y:y1+(y2-y1)*t},r))return true}return false}
function distanceToSegment(px,py,x1,y1,x2,y2){const l2=(x2-x1)**2+(y2-y1)**2;if(!l2)return Math.hypot(px-x1,py-y1);let t=((px-x1)*(x2-x1)+(py-y1)*(y2-y1))/l2;t=clamp(t,0,1);return Math.hypot(px-(x1+t*(x2-x1)),py-(y1+t*(y2-y1)))}
function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):(c.rect(x,y,w,h))}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function toast(msg,d=1.8){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(game?.toastTimer);if(game)game.toastTimer=setTimeout(()=>el.classList.remove('show'),d*1000)}

function showMenu(){game=null;$('#menu').classList.add('active');$('#menu').classList.remove('hidden');$('#hud').classList.add('hidden');$('#pause').classList.add('hidden');$('#gameover').classList.add('hidden');refreshMenu()}
function startGame(save=null){$('#menu').classList.add('hidden');$$('.drawer').forEach(x=>x.classList.add('hidden'));$('#gameover').classList.add('hidden');$('#hud').classList.remove('hidden');$('#loading').classList.remove('hidden');let n=0;const iv=setInterval(()=>{n+=20;$('#loadPercent').textContent=n+'%';$('.loadbar i').style.width=n+'%';if(n>=100){clearInterval(iv);$('#loading').classList.add('hidden');game=new Game(save?.diff||selectedDiff,save);$('#difficultyLabel').textContent=DIFF[game.diff].name+'行动'}},70)}
function refreshMenu(){const save=safeJSON(localStorage.getItem(STORAGE.save),null),btn=$('#continueGame');btn.disabled=!save;$('#deleteSave').disabled=!save;$('#saveLight').classList.toggle('live',!!save);$('#continueMeta').textContent=save?`${DIFF[save.diff]?.name||'标准'} · 第 ${save.wave} 波`:'暂无存档';renderRecords()}
function renderRecords(){const rs=safeJSON(localStorage.getItem(STORAGE.records),[]),summary=$('#recordSummary'),list=$('#recordList');summary.innerHTML=['rookie','normal','hard'].map(d=>{const r=rs.filter(x=>x.diff===d).sort((a,b)=>b.wave-a.wave||b.score-a.score)[0];return `<article><small>${DIFF[d].name}</small><b>${r?`最高 ${r.wave} 波 · ${r.score} 分`:'暂无记录'}</b></article>`}).join('');list.innerHTML=rs.length?rs.map(r=>`<div class="record-item"><span>${r.date}</span><span>${DIFF[r.diff]?.name}</span><span>波次 ${r.wave}</span><span>${r.score} 分</span><span>${formatTime(r.time)}</span></div>`).join(''):'<p>尚无作战记录。</p>'}

$$('.difficulty button').forEach(b=>b.onclick=()=>{$$('.difficulty button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');selectedDiff=b.dataset.diff});
$('#newGame').onclick=()=>{localStorage.removeItem(STORAGE.save);startGame()};
$('#continueGame').onclick=()=>{const s=safeJSON(localStorage.getItem(STORAGE.save),null);if(s?.version===1)startGame(s);else{localStorage.removeItem(STORAGE.save);refreshMenu()}};
$('#deleteSave').onclick=()=>{if(confirm('确定删除当前波次检查点吗？')){localStorage.removeItem(STORAGE.save);refreshMenu()}};
$$('[data-open]').forEach(b=>b.onclick=()=>$('#'+b.dataset.open).classList.remove('hidden'));
$$('.drawer .close').forEach(b=>b.onclick=()=>b.closest('.drawer').classList.add('hidden'));
$('#resume').onclick=()=>game?.resume();$('#saveExit').onclick=showMenu;$('#resultMenu').onclick=showMenu;$('#retry').onclick=()=>startGame();
$('#masterVolume').value=settings.volume;$('#shakeSetting').value=settings.shake;$('#quality').value=settings.quality;
$('#masterVolume').oninput=e=>{settings.volume=+e.target.value;saveSettings()};$('#shakeSetting').oninput=e=>{settings.shake=+e.target.value;saveSettings()};$('#quality').onchange=e=>{settings.quality=e.target.value;saveSettings()};
function saveSettings(){localStorage.setItem(STORAGE.settings,JSON.stringify(settings))}
addEventListener('blur',()=>{if(game?.phase==='playing')game.pause()});
addEventListener('keydown',e=>{if(e.key==='Enter'&&!game&&!$('#menu').classList.contains('hidden'))$('#newGame').click()});

function loop(t){const dt=Math.min((t-last)/1000,.1);last=t;accumulator+=dt;while(accumulator>=1/60){game?.update(1/60);accumulator-=1/60}if(game)game.render();else drawMenuBackdrop(t);requestAnimationFrame(loop)}
function drawMenuBackdrop(t){const w=canvas.logicalWidth,h=canvas.logicalHeight;ctx.fillStyle='#121813';ctx.fillRect(0,0,w,h);ctx.fillStyle='#1c251e';for(let i=0;i<50;i++){const x=(i*197+t*.008*(i%3+1))%w,y=(i*83)%h;ctx.fillRect(x,y,90,28)}ctx.fillStyle='#2c392f';ctx.beginPath();ctx.moveTo(w*.57,h);ctx.lineTo(w*.75,0);ctx.lineTo(w,0);ctx.lineTo(w,h);ctx.fill();ctx.save();ctx.translate(w*.79,h*.68);ctx.rotate(-.35);ctx.fillStyle='#171c18';ctx.fillRect(-120,-55,240,110);ctx.fillStyle='#6d754e';ctx.fillRect(-95,-45,190,90);ctx.fillStyle='#1c221d';ctx.fillRect(-120,-60,240,22);ctx.fillRect(-120,38,240,22);ctx.rotate(-.15);ctx.fillRect(0,-10,170,20);ctx.restore()}
refreshMenu();requestAnimationFrame(loop);
