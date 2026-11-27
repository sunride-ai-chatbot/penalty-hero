// What playing earns. Medals count what the player has done (from the stats kept on the phone); some of them open a ball or a
// stadium for the look of the duel. Pure functions: the screens only show it, the scene only paints what it is told.
export const BALLS=[
  {id:'classic',name:'קלאסי',skin:{base:'#f4f3e8',patch:'#1a2633',line:'#afb4ac',rough:.65,metal:0,glow:0}},
  {id:'neon',name:'ניאון',skin:{base:'#eef8ee',patch:'#19e65a',line:'#13b8ff',rough:.5,metal:0,glow:.5}},
  {id:'gold',name:'זהב',skin:{base:'#e8c35a',patch:'#6a4710',line:'#fff0a8',rough:.32,metal:.75,glow:.08}},
  {id:'retro',name:'רטרו',skin:{base:'#cf9f70',patch:'#5b3a20',line:'#8c6a44',rough:.85,metal:0,glow:0}},
  {id:'fire',name:'להבה',skin:{base:'#2a1511',patch:'#ff6a1a',line:'#ffd24a',rough:.55,metal:0,glow:.55}},
  {id:'ice',name:'קרח',skin:{base:'#e9f6ff',patch:'#3d9fe6',line:'#c4e8ff',rough:.22,metal:.1,glow:.12}},
  {id:'champ',name:'אלופים',skin:{base:'#f8f3df',patch:'#c9a227',line:'#6a1b9a',rough:.4,metal:.35,glow:.1}}];
/** the look of the stadium; "auto" keeps the old way: each club's ground has its own night */
export const FIELDS=[
  {id:'auto',name:'לפי הקבוצה',swatch:['#0a111c','#3a5a7a']},{id:'night',name:'לילה',swatch:['#070c15','#3a5a7a']},{id:'dusk',name:'בין ערביים',swatch:['#1a1223','#ff9a62']},
  {id:'mist',name:'ערפל',swatch:['#0e1620','#8aa6bf']},{id:'golden',name:'שקיעה זהובה',swatch:['#3b2410','#ffc27a']},{id:'rain',name:'גשם',swatch:['#0a0f16','#6f8aa6']}];
const FREE={balls:['classic'],fields:['auto','night']};
const daily=st=>Math.max(st.daily?.bestStreak||0,st.daily?.streak||0);
/** need: the number to reach; of(stats): where the player stands; opens: the prize, if any */
export const MEDALS=[
  {id:'wins1',title:'ניצחון ראשון',need:1,of:s=>s.wins,opens:{ball:'neon'}},
  {id:'wins3',title:'שלושה ניצחונות',need:3,of:s=>s.wins,opens:{field:'dusk'}},
  {id:'wins10',title:'עשרה ניצחונות',need:10,of:s=>s.wins,opens:{ball:'gold'}},
  {id:'wins25',title:'25 ניצחונות',need:25,of:s=>s.wins},
  {id:'goals25',title:'25 שערים',need:25,of:s=>s.goals,opens:{ball:'retro'}},
  {id:'goals100',title:'מאה שערים',need:100,of:s=>s.goals},
  {id:'run5',title:'חמישה שערים ברצף',need:5,of:s=>s.bestGoalRun,opens:{ball:'fire'}},
  {id:'saves10',title:'עשר הצלות',need:10,of:s=>s.saves,opens:{ball:'ice'}},
  {id:'saves30',title:'30 הצלות',need:30,of:s=>s.saves},
  {id:'shutout',title:'ניצחון בלי ספיגה',need:1,of:s=>s.shutouts,opens:{field:'golden'}},
  {id:'streak3',title:'שלושה ניצחונות ברצף',need:3,of:s=>s.bestStreak},
  {id:'daily3',title:'שלושה ימים ברצף באתגר היומי',need:3,of:daily,opens:{field:'mist'}},
  {id:'daily7',title:'שבוע ברצף באתגר היומי',need:7,of:daily},
  {id:'daily5',title:'אתגר יומי מושלם: 5 מתוך 5',need:5,of:s=>s.daily?.best||0},
  {id:'surv5',title:'הישרדות: חמישה שערים',need:5,of:s=>s.survBest,opens:{field:'rain'}},
  {id:'surv10',title:'הישרדות: עשרה שערים',need:10,of:s=>s.survBest},
  {id:'sniper',title:'צלף: חמישה בולים בסבב תרגול אחד',need:5,of:s=>s.pracBestBulls},
  {id:'cup1',title:'השתתפת בליגת חברים',need:1,of:s=>s.cupPlayed},
  {id:'champion',title:'אלוף: זכית בגביע או בליגה',need:1,of:s=>s.tourWins+s.cupWins,opens:{ball:'champ'}}];
export const ballById=id=>BALLS.find(b=>b.id===id)||BALLS[0];
export const fieldById=id=>FIELDS.find(f=>f.id===id)||FIELDS[0];
/** every medal with where the player stands on it */
export function medalsOf(st){return MEDALS.map(m=>{const value=Math.max(0,Math.floor(+m.of(st)||0));return {...m,value:Math.min(value,m.need),done:value>=m.need,pct:Math.min(1,value/m.need)}})}
/** the balls and fields that are open */
export function ownedOf(st){const balls=new Set(FREE.balls),fields=new Set(FREE.fields);for(const m of medalsOf(st))if(m.done&&m.opens){if(m.opens.ball)balls.add(m.opens.ball);if(m.opens.field)fields.add(m.opens.field)}return {balls,fields}}
/** what the medal that opens this prize asks for, in words */
export const askOf=(kind,id)=>{const m=MEDALS.find(m=>m.opens&&m.opens[kind]===id);return m?m.title:''};
export const prizeName=m=>m.opens?(m.opens.ball?'כדור '+ballById(m.opens.ball).name:'אצטדיון '+fieldById(m.opens.field).name):'';
/** the medals earned that the player was not told about yet */
export const freshMedals=(st,seen)=>medalsOf(st).filter(m=>m.done&&!seen.includes(m.id));
export function parseSeen(raw){try{const a=JSON.parse(raw||'[]');return Array.isArray(a)?a.filter(x=>MEDALS.some(m=>m.id===x)):[]}catch(e){return[]}}
/** the saved choice, kept only if it is still open (stats can be reset) */
export function parseLook(raw,own){let o={};try{o=JSON.parse(raw||'{}')||{}}catch(e){}return {ball:own.balls.has(o.ball)?o.ball:'classic',field:own.fields.has(o.field)?o.field:'auto'}}
