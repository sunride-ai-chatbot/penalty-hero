// The club catalog and squads (built by scripts/build-catalog.mjs from the source repository's squad files).
// Three things are kept apart everywhere in the game:
//   participant  the human who typed a name on the opening screen
//   club         a fixed id, name, country, league, colours and squad
//   player       one footballer of that squad: stable id, name, position, shirt number, ratings
import {colDist} from '../ui/crest.js';
let catalog=null;const squads=new Map();let base=new URL('../../data/',import.meta.url);
export function setDataBase(url){base=new URL(url)}
export async function loadCatalog(fetchImpl=globalThis.fetch){if(catalog)return catalog;const r=await fetchImpl(new URL('catalog.json',base));if(!r.ok)throw new Error('catalog '+r.status);
  const c=await r.json();for(const country of c.countries)for(const league of country.leagues)for(const id of league.clubs){const club=c.clubs[id];if(club&&!club.country&&!country.cup){club.country=country.id;club.league=league.id}}
  return catalog=c}
export const getCatalog=()=>catalog;
export const clubById=id=>catalog?.clubs[String(id||'')]||null;
let bundle=null;
export async function loadSquad(clubId,fetchImpl=globalThis.fetch){const club=clubById(clubId);if(!club)return null;if(squads.has(club.id))return squads.get(club.id);
  let sq;if(catalog.bundle){   /* a build may ship every squad in one file (hosts that limit the number of files) */
    if(!bundle)bundle=fetchImpl(new URL(catalog.bundle,base)).then(r=>{if(!r.ok)throw new Error('squads '+r.status);return r.json()}).catch(e=>{bundle=null;throw e});sq=(await bundle)[club.id];if(!sq)throw new Error('squad missing: '+club.id)}
  else{const r=await fetchImpl(new URL(club.squad,base));if(!r.ok)throw new Error('squad '+r.status);sq=await r.json()}
  if(!Array.isArray(sq.players)||!Array.isArray(sq.order)||sq.order.some(i=>!sq.players[i])||!sq.players[sq.gk])throw new Error('squad file is broken: '+club.squad);
  squads.set(club.id,sq);return sq}
/** The surname for the shirt when the full name is long (the full name stays on the player card). */
export const shirtName=p=>{const he=p.he||'';if(he.length<=13)return he;const parts=he.split(/\s+/);return parts.length>1?parts.slice(1).join(' '):he};
/**
 * A side of a duel. `twin` marks the second copy when both participants chose the same club: its own id, the same squad.
 * order: the takers in kicking order (best finishers of the best eleven first, the keeper last); it repeats after everyone kicked.
 */
export function buildSide(club,squad,{twin=false,participant=''}={}){const players=squad.players;
  return {id:club.id+(twin?'#2':''),club,twin,participant,players,order:squad.order.map(i=>players[i]),keeper:players[squad.gk],hash:club.hash}}
/** Kits for a kick: the taker's shirt/shorts, the other club's colour for the stand, a keeper colour neither side wears. */
export function kitsFor(takerSide,keeperSide){let kit=takerSide.club.c1,trim=takerSide.club.c2;if(colDist(kit,trim)<60)trim=colDist(kit,'#10151d')>120?'#10151d':'#f2f2f2';
  const oppKit=keeperSide.club.c1;const gkKit=['#f2b233','#39c3d6','#b06cf0','#3ddc84','#ff7a59'].find(c=>colDist(c,kit)>120&&colDist(c,oppKit)>120&&colDist(c,'#2f7a3a')>90)||'#f2b233';
  return {kit,trim,oppKit,gkKit}}
/** A club of about the same strength, never the same club; `random` is injectable. */
export function similarOpponent(clubId,random=Math.random){const me=clubById(clubId);const all=Object.values(catalog.clubs).filter(c=>c.id!==clubId);
  for(const span of [2,4,7,99]){const pool=all.filter(c=>Math.abs(c.str-me.str)<=span);if(pool.length>=4||span===99)return pool[Math.floor(random()*pool.length)]}}
export const leagueOf=club=>{for(const country of catalog.countries)for(const league of country.leagues)if(!country.cup&&league.clubs.includes(club.id))return {country,league};return null};
/* ---- portraits ----
   A player with an approved photograph carries face:[pack, id]. A pack is one file per club (assets/facepacks), loaded
   when that club plays. Players without one, and any pack that fails to load, get the designed fallback instead. */
const packs=new Map(),shards=new Map();let faceBase=new URL('../../assets/facepacks/',import.meta.url);
export function loadFace(player,fetchImpl=globalThis.fetch){if(!player?.face)return Promise.resolve(null);const [pack,id]=player.face;
  const shard=catalog?.faceShards?.[pack];   /* a build may group the packs into about thirty larger files (hosts that limit the number of files) */
  if(!packs.has(pack)){if(shard){if(!shards.has(shard))shards.set(shard,fetchImpl(new URL(shard,faceBase)).then(r=>{if(!r.ok)throw new Error('shard '+r.status);return r.json()}).catch(e=>{shards.delete(shard);return null}));packs.set(pack,shards.get(shard).then(d=>{if(!d)packs.delete(pack);return d?d[pack]:null}))}
    else packs.set(pack,fetchImpl(new URL(encodeURIComponent(pack)+'.json',faceBase)).then(r=>{if(!r.ok)throw new Error('pack '+r.status);return r.json()}).catch(e=>{packs.delete(pack);return null}))}
  return packs.get(pack).then(d=>{const src=d?.images?.[id];if(!src||!/^data:image\/(webp|jpeg|png);base64,/.test(src))return null;const c=d.credits?.[id];return {src,credit:c?{author:c.a||'',license:c.l||'',url:c.u||''}:null}})}
/** warm the packs of both clubs before the first kick, so a face never pops in late */
export const preloadFaces=sides=>Promise.all(sides.flatMap(s=>s.order.slice(0,1)).map(p=>loadFace(p))).catch(()=>{});
