import test from 'node:test';import assert from 'node:assert/strict';import {bowOf} from '../src/core/gesture.js';
const line=(n,f)=>Array.from({length:n},(_,i)=>f(i/(n-1)));
test('a straight drag is a straight kick',()=>assert.equal(bowOf(line(20,t=>({x:200,y:500-300*t}))),0));
test('a small wiggle stays straight',()=>assert.equal(bowOf(line(20,t=>({x:200+8*Math.sin(t*9),y:500-300*t}))),0));
test('a drag that bows to the right curls right',()=>assert.equal(bowOf(line(20,t=>({x:200+70*Math.sin(t*Math.PI),y:500-300*t}))),1));
test('a drag that bows to the left curls left',()=>assert.equal(bowOf(line(20,t=>({x:200-70*Math.sin(t*Math.PI),y:500-300*t}))),-1));
test('a tap or a short path is straight',()=>{assert.equal(bowOf([{x:1,y:1}]),0);assert.equal(bowOf(line(10,t=>({x:100+30*Math.sin(t*3),y:100+20*t}))),0)});

import {bowDepth} from '../src/core/gesture.js';
test('bowDepth is 0 for a straight drag and signed for a bowed one',()=>{
  const line=[0,1,2,3,4,5].map(i=>({x:100+i*5,y:500-i*60}));
  assert.equal(bowDepth(line),0);
  const bow=[0,1,2,3,4,5].map(i=>({x:100+i*5+Math.sin(i/5*Math.PI)*60,y:500-i*60}));
  assert.ok(Math.abs(bowDepth(bow))>=24);
});
