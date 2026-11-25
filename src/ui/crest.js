// Club crests and flags. The crest generator is the source game's own (src/js/35d-crest.js): an original crest drawn
// as SVG from a shield shape, a division of the field, the club's two colours and one emblem. Real clubs' badges are
// trademarks and are never used or imitated. crestSVG(spec) is pure: the same spec always draws the same crest.
import {hash32} from '../core/rules.js';
export const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function hexRGB(h){h=String(h||'#888').replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16)||0;return [(n>>16)&255,(n>>8)&255,n&255]}
export function inkFor(hex){const [r,g,b]=hexRGB(hex);return (r*299+g*587+b*114)/1000>150?'#0b1020':'#ffffff'}
export const colDist=(a,b)=>{const x=hexRGB(a),y=hexRGB(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])};
const CREST_SHAPES=['shield','kite','block','disc'];
const CREST_DIVS=['solid','half','pale','quarter','bend','chevron','stripes'];
const CREST_EMBLEMS=['ball','star','crown','anchor','bolt','flame','tower','bridge','wave','lion'];
/* Palettes a kit could plausibly use: a strong colour, a second, and an ink that stays readable on both. */
const CREST_PALETTES=[
 ['#c8102e','#f4f1e8','#1b1b1f'],['#0b3d91','#f4f1e8','#0b1020'],['#0f7a4a','#f4f1e8','#07231a'],
 ['#f2b705','#1b1b1f','#1b1b1f'],['#5b2a86','#f0e9f6','#1a0f24'],['#e35205','#102030','#141414'],
 ['#1b1b1f','#f2b705','#1b1b1f'],['#00897b','#fdf6e3','#04312c'],['#8c1d40','#e8d9b5','#2a0a16'],
 ['#1e6091','#9fd3e8','#07202e'],['#b23a48','#f6e7d8','#2b0c11'],['#2d6a4f','#d8f3dc','#0b2016']];

export function crestDefault(seed){const r=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n};
 const p=CREST_PALETTES[r(CREST_PALETTES.length)];
 return {shape:CREST_SHAPES[r(CREST_SHAPES.length)],div:CREST_DIVS[r(CREST_DIVS.length)],
  c1:p[0],c2:p[1],ink:p[2],emblem:CREST_EMBLEMS[r(CREST_EMBLEMS.length)],tier:'free'}}

/* the outline of the field, in a 100×120 box */
function crestOutline(shape){switch(shape){
 case 'kite':  return 'M50 3 L95 19 V56 L50 117 L5 56 V19 Z';
 case 'block': return 'M14 3 H86 A9 9 0 0 1 95 12 V68 C95 95 75 110 50 117 C25 110 5 95 5 68 V12 A9 9 0 0 1 14 3 Z';
 case 'disc':  return 'M50 4 A46 46 0 1 1 49.99 4 Z';
 default:      return 'M50 3 L95 16 V60 C95 91 73 108 50 117 C27 108 5 91 5 60 V16 Z'}}

/* the second colour laid over the field; everything is clipped to the outline by the caller */
function crestDivision(div){switch(div){
 case 'half':    return '<rect x="0" y="0" width="50" height="120"/>';
 case 'pale':    return '<rect x="36" y="0" width="28" height="120"/>';
 case 'quarter': return '<rect x="0" y="0" width="50" height="60"/><rect x="50" y="60" width="50" height="60"/>';
 case 'bend':    return '<path d="M-10 86 L74 -10 L108 18 L24 118 Z"/>';
 case 'chevron': return '<path d="M50 28 L104 80 V112 L50 60 L-4 112 V80 Z"/>';
 case 'stripes': return [12,38,64,90].map(x=>`<rect x="${x}" y="0" width="13" height="120"/>`).join('');
 default:        return ''}}

/* Emblems, drawn in a 40×40 box whose centre is (0,0). Bold and simple: a crest is read at 32 px on a table
   long before anyone opens it large. */
function crestEmblem(k){switch(k){
 case 'star':   return '<path d="M0 -19 L5.6 -5.9 19.8 -4.7 9 4.7 12.2 18.5 0 11.2 -12.2 18.5 -9 4.7 -19.8 -4.7 -5.6 -5.9 Z"/>';
 case 'crown':  return '<path d="M-18 8 L-14 -12 L-7 -2 L0 -15 L7 -2 L14 -12 L18 8 Z"/><rect x="-18" y="10" width="36" height="6" rx="2"/>';
 case 'anchor': return '<circle cx="0" cy="-14" r="4.6" fill="none" stroke-width="3.4"/><rect x="-1.9" y="-10" width="3.8" height="24"/><rect x="-11" y="-6" width="22" height="3.4" rx="1.7"/><path d="M-15 4 C-15 14 -7 18 0 18 C7 18 15 14 15 4" fill="none" stroke-width="3.4" stroke-linecap="round"/>';
 case 'bolt':   return '<path d="M5 -21 L-11 2.5 H-1.5 L-6 21 L12 -3.5 H2.5 Z"/>';
 case 'flame':  return '<path d="M3 -20 C3 -13 -1 -10 -4 -6 C-5 -10 -5 -13 -4 -16 C-11 -11 -14 -4 -14 3 C-14 12 -8 19 1 19 C10 19 15 12 15 3 C15 -4 11 -9 7 -14 C7 -11 6 -9 4 -8 C5 -13 5 -17 3 -20 Z"/><path d="M1 -1 C4 3 6 6 6 9 C6 13 4 15.5 1 15.5 C-2 15.5 -4 13 -4 9 C-4 5 -2 3 1 -1 Z" fill="#fff" opacity=".5"/>';
 case 'tower':  return '<path d="M-14 -11 H-9 V-18 H-3.5 V-11 H3.5 V-18 H9 V-11 H14 V19 H-14 Z"/><path d="M-4.6 19 V9.5 A4.6 4.6 0 0 1 4.6 9.5 V19 Z" fill="#fff"/><rect x="-2" y="-6" width="4" height="8" rx="2" fill="#fff"/><rect x="-16" y="19" width="32" height="4" rx="1.6"/>';
 case 'bridge': return '<rect x="-19" y="12" width="38" height="5" rx="2"/><path d="M-19 12 C-19 -2 -9 -8 0 -8 C9 -8 19 -2 19 12" fill="none" stroke-width="3.6"/><rect x="-1.8" y="-18" width="3.6" height="22"/><path d="M-16 11 L0 -14 L16 11" fill="none" stroke-width="2.2"/>';
 case 'wave':   return '<path d="M-19 2 C-13 -6 -7 -6 -1 2 C5 10 11 10 19 2 V10 C11 18 5 18 -1 10 C-7 2 -13 2 -19 10 Z"/><path d="M-19 -10 C-13 -17 -7 -17 -1 -10 C5 -3 11 -3 19 -10 V-4 C11 3 5 3 -1 -4 C-7 -11 -13 -11 -19 -4 Z" opacity=".65"/>';
 case 'lion':   return '<path d="M0.0 -19.0 L5.8 -14.0 L13.4 -13.4 L14.0 -5.8 L19.0 0.0 L14.0 5.8 L13.4 13.4 L5.8 14.0 L0.0 19.0 L-5.8 14.0 L-13.4 13.4 L-14.0 5.8 L-19.0 0.0 L-14.0 -5.8 L-13.4 -13.4 L-5.8 -14.0 Z"/><path d="M-10 -5 C-10 -9 -8 -12 -4 -13 L-8 -17 L-2 -15 H2 L8 -17 L4 -13 C8 -12 10 -9 10 -5 V1 C10 8 6 12 0 12 C-6 12 -10 8 -10 1 Z" fill="#fff"/><path d="M-6.4 -5.4 C-5 -7 -3 -7 -1.8 -5.4 C-3 -4 -5 -4 -6.4 -5.4 Z"/><path d="M6.4 -5.4 C5 -7 3 -7 1.8 -5.4 C3 -4 5 -4 6.4 -5.4 Z"/><path d="M-3.4 1.4 H3.4 L0 5.2 Z"/><path d="M0 5.2 V8.4 M0 8.4 C-1.6 8.4 -3.4 7.8 -4.6 6.6 M0 8.4 C1.6 8.4 3.4 7.8 4.6 6.6" fill="none" stroke-width="1.5" stroke-linecap="round"/>';
 default:       return '<circle cx="0" cy="0" r="17"/><path d="M0 -10 L8.6 -3.8 5.3 6.4 -5.3 6.4 -8.6 -3.8 Z" fill="#fff"/><path d="M0 -17 V-10 M17 -3 L8.6 -3.8 M10.5 13.8 L5.3 6.4 M-10.5 13.8 L-5.3 6.4 M-17 -3 L-8.6 -3.8" stroke="#fff" stroke-width="2.4" fill="none"/>'}}

/* `spec.name` is drawn on a band; a disc gets a ring instead, which is what a round badge wants. */
export function crestSVG(spec,opts){spec=spec||{};opts=opts||{};
 const s=Object.assign({},crestDefault(7),spec);
 const id=opts.id||('cr'+Math.random().toString(36).slice(2,8));
 const gold=s.tier==='premium',outline=crestOutline(s.shape),div=crestDivision(s.div);
 const name=(opts.name||s.name||'').toString().slice(0,22),year=opts.year||s.year||'';
 /* The band sits where every shape is still wide (a kite has pulled in to x 18..82 by y 74) and the name is
     squeezed to fit it rather than clipped, so a long Hebrew name still reads. */
 /* a kite has pulled in to x 29..71 by y 89, so a band at 74 has its corners outside the shape; it sits higher there,
    where the kite is still as wide as the band, and the emblem moves up and shrinks to make room */
 const kite=s.shape==='kite',bandY=s.shape==='disc'?70:kite?58:74;
 const band=name?`<rect x="18" y="${bandY}" width="64" height="15" rx="3.5" fill="${s.ink}" opacity=".92"/><rect x="18" y="${bandY}" width="64" height="15" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".35"/><text x="50" y="${bandY+11}" text-anchor="middle" font-size="9.5" fill="#fff" font-weight="700" textLength="${Math.min(56,name.length*5.4).toFixed(0)}" lengthAdjust="spacingAndGlyphs">${esc(name)}</text>`:'';
 return `<svg class="crest" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" role="img"${opts.label?` aria-label="${esc(opts.label)}"`:' aria-hidden="true"'}>
 <defs><clipPath id="cl${id}"><path d="${outline}"/></clipPath>
  <linearGradient id="gl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
  ${gold?`<linearGradient id="gd${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e2a0"/><stop offset=".45" stop-color="#c8a23c"/><stop offset=".7" stop-color="#fff3c4"/><stop offset="1" stop-color="#9d7a24"/></linearGradient>`:''}</defs>
 <g clip-path="url(#cl${id})">
  <rect width="100" height="120" fill="${s.c1}"/>
  <g fill="${s.c2}">${div}</g>
  <g transform="translate(50 ${name?(s.shape==='disc'?42:kite?33:45):(kite?48:56)}) scale(${name?(kite?.98:1.22):(kite?1.25:1.4)})" fill="${s.ink}" stroke="${s.ink}">${crestEmblem(s.emblem)}</g>
  ${band}
  ${year?`<text x="50" y="${s.shape==='disc'?17:15}" text-anchor="middle" font-size="7.5" fill="${s.ink}" opacity=".75">${esc(String(year))}</text>`:''}
  <rect width="100" height="120" fill="url(#gl${id})"/>
 </g>
 <path d="${outline}" fill="none" stroke="${gold?`url(#gd${id})`:s.ink}" stroke-width="${gold?5:3}"/>
 ${gold?`<path d="${outline}" fill="none" stroke="#fff8dc" stroke-width="1" opacity=".55"/>`:''}
</svg>`}

/* what a tier is allowed to change: free takes what it is given, custom chooses everything, premium adds the
   metal. The server charges for the tier (`lg_set_identity`); this only decides what the picker offers. */
function crestTierParts(tier){return tier==='free'?[]:tier==='custom'||tier==='premium'?['shape','div','colour','emblem']:[]}

/** The crest of a catalog club: shape, division and emblem by the club's name (always the same), its own two colours. */
export function clubCrest(club){const spec={...crestDefault(hash32(club.name)),c1:club.c1,c2:club.c2,tier:'premium'};return crestSVG(spec,{name:club.short||club.name})}
export function flagSVG(id){const R=(x,y,w,h,f)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`,V=(a,b,c)=>R(0,0,12,24,a)+R(12,0,12,24,b)+R(24,0,12,24,c),H=(a,b,c)=>R(0,0,36,8,a)+R(0,8,36,8,b)+R(0,16,36,8,c);
  const F={il:R(0,0,36,24,'#fff')+R(0,3,36,3.4,'#0038b8')+R(0,17.6,36,3.4,'#0038b8')+'<path d="M18 7.6l3.5 6h-7zM18 16.4l-3.5-6h7z" fill="none" stroke="#0038b8" stroke-width="1.1"/>',
    en:R(0,0,36,24,'#fff')+R(15,0,6,24,'#ce1124')+R(0,9,36,6,'#ce1124'),es:R(0,0,36,24,'#aa151b')+R(0,6,36,12,'#f1bf00'),it:V('#009246','#fff','#ce2b37'),de:H('#111','#dd0000','#ffce00'),fr:V('#0055a4','#fff','#ef4135'),
    nl:H('#ae1c28','#fff','#21468b'),pt:R(0,0,14.4,24,'#046a38')+R(14.4,0,21.6,24,'#da291c')+'<circle cx="14.4" cy="12" r="4.4" fill="#ffe900" stroke="#fff" stroke-width=".6"/>',be:V('#111','#fae042','#ed2939')};
  return `<svg class="bflag" viewBox="0 0 36 24" aria-hidden="true">${F[id]||(id==='cl'?R(0,0,36,24,'#0b2a6f')+'<circle cx="18" cy="12" r="7" fill="none" stroke="#ffd84a" stroke-width="1.6" stroke-dasharray="1.4 2.2"/>':R(0,0,36,24,'#1f5f8b')+'<circle cx="18" cy="12" r="8" fill="#2f9e6e" stroke="#dff3ff" stroke-width="1"/><path d="M10 12h16M18 4c-5 5-5 11 0 16M18 4c5 5 5 11 0 16" fill="none" stroke="#dff3ff" stroke-width=".9"/>')}</svg>`}
