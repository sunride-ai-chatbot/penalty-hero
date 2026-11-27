import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULTS,VOLUMES,parseSettings,qualityLevel,levelName,createHaptics,BUZZ,pulseTimes,switchTick} from '../src/core/settings.js';

test('settings read back safely: junk and unknown values fall to the defaults',()=>{
  assert.deepEqual(parseSettings(''),DEFAULTS);assert.deepEqual(parseSettings('not json'),DEFAULTS);assert.deepEqual(parseSettings('null'),DEFAULTS);
  const s=parseSettings(JSON.stringify({voice:false,sfx:'no',crowd:false,haptics:false,vol:1.4,quality:'low',extra:1}));
  assert.deepEqual(s,{quality:'low',voice:false,sfx:true,crowd:false,vol:1.4,haptics:false});
  assert.equal(parseSettings(JSON.stringify({vol:9,quality:'ultra'})).vol,1);assert.equal(parseSettings(JSON.stringify({quality:'ultra'})).quality,'auto');
  assert.ok(VOLUMES.some(v=>v.v===DEFAULTS.vol))});
test('the picture level: high is always full, low is always light, auto starts where the last session ended and is clamped',()=>{
  assert.equal(qualityLevel('high',2),0);assert.equal(qualityLevel('low',0),2);
  assert.equal(qualityLevel('auto',0),0);assert.equal(qualityLevel('auto',1),1);assert.equal(qualityLevel('auto','2'),2);assert.equal(qualityLevel('auto',7),2);assert.equal(qualityLevel('auto',-3),0);assert.equal(qualityLevel('auto','x'),0);
  assert.deepEqual([0,1,2].map(levelName),['מלאה','קלה','חסכונית'])});
test('the buzz goes to the phone only when on, and survives a phone without vibration',()=>{
  const got=[];const h=createHaptics({vibrate:p=>{got.push(p);return true}});
  assert.ok(h.supported);assert.ok(h.goal(true));assert.ok(h.goal(false));h.save();h.post();h.miss();h.win();h.tap();h.start();h.kick();
  assert.deepEqual(got,[BUZZ.goal,BUZZ.conceded,BUZZ.save,BUZZ.post,BUZZ.miss,BUZZ.win,BUZZ.tap,BUZZ.start,BUZZ.kick]);
  h.configure({haptics:false});got.length=0;assert.equal(h.goal(true),false);assert.equal(got.length,0,'off means silent');assert.ok(h.preview(),'but the settings screen can still try it');assert.equal(got.length,1);
  h.configure({});assert.equal(h.enabled,false,'a setting that is not about the buzz does not turn it back on');h.configure({haptics:true});assert.ok(h.goal(true));
  const none=createHaptics({vibrate:null});assert.equal(none.supported,false);assert.equal(none.goal(true),false);assert.equal(none.preview(),false);
  const boom=createHaptics({vibrate:()=>{throw new Error('no')}});assert.equal(boom.goal(true),false)});
test('no part of the game buzzes the phone behind the setting\'s back',async()=>{const fs=await import('node:fs');const path=await import('node:path');
  const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
  const hits=walk(new URL('../src',import.meta.url).pathname).filter(f=>f.endsWith('.js')&&!f.endsWith('core/settings.js')&&/navigator\.vibrate/.test(fs.readFileSync(f,'utf8')));assert.deepEqual(hits,[])});

test('a phone without the Vibration API (an iPhone) taps through the switch trick: the first pulse at once, the rest on the pattern\'s own clock',()=>{
  assert.deepEqual(pulseTimes([35,40,90]),[0,75]);assert.deepEqual(pulseTimes([110]),[0]);assert.deepEqual(pulseTimes([70,50,70,50,160]),[0,120,240]);
  const ticks=[],later=[];const h=createHaptics({vibrate:null,tick:()=>{ticks.push(1);return true},schedule:(fn,ms)=>later.push([fn,ms])});
  assert.ok(h.supported);assert.equal(h.native,false);assert.ok(h.goal(true));assert.equal(ticks.length,1,'the first tap is immediate');assert.deepEqual(later.map(x=>x[1]),[75]);later.forEach(x=>x[0]());assert.equal(ticks.length,2);
  ticks.length=0;later.length=0;h.win();assert.equal(ticks.length,1);assert.deepEqual(later.map(x=>x[1]),[120,240]);
  h.configure({haptics:false});ticks.length=0;assert.equal(h.goal(true),false);assert.equal(ticks.length,0);assert.ok(h.preview(),'the test button works while it is off');assert.equal(ticks.length,1);
  assert.equal(createHaptics({vibrate:null,tick:null}).supported,false)});
test('the switch trick exists only on iOS, clicks a hidden switch label once and cleans up after itself',()=>{
  const made=[];const doc={createElement:t=>{const el={t,style:{},children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v},appendChild(c){this.children.push(c)},click(){made.push(this)},remove(){this.gone=true}};return el},head:{appendChild(c){c.parent=true}}};
  assert.equal(switchTick(doc,{userAgent:'Mozilla/5.0 (Linux; Android 14)',platform:'Linux armv8l',maxTouchPoints:5}),null,'not on Android');assert.equal(switchTick(null,{}),null);
  const tick=switchTick(doc,{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',platform:'iPhone',maxTouchPoints:5});assert.equal(typeof tick,'function');assert.ok(tick());
  assert.equal(made.length,1);assert.equal(made[0].children[0].attrs.switch,'');assert.equal(made[0].children[0].type,'checkbox');assert.ok(made[0].gone);
  assert.equal(typeof switchTick(doc,{userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5}),'function','an iPad that presents itself as a Mac')});
