import * as T from './vendor/three.js';
// The photographed goalkeeper: three filmed motions (ready stance, jump on the spot, dive to the left) keyed off a green screen
// and packed as sprite sheets. The game's own keeper logic (where he goes, when, how far) still drives him: the sprite is only the picture.
// Lateral position is taken from the game (z), not from the footage, so the glove lands on the aimed point whatever the clip's own travel was.
// The dive footage goes to the picture's left; the other side is the same footage mirrored. Shirt and shorts are repainted with the club's kit.
export function keeperFilm(scene,{base='keeper',grounded=false,white=false}={}){
 const group=new T.Group();group.rotation.y=-Math.PI/2;group.visible=false;scene.add(group);
 const shirt=new T.Color(),shorts=new T.Color();
 const material=new T.MeshBasicMaterial({transparent:true,alphaTest:.12,toneMapped:false,side:T.DoubleSide,premultipliedAlpha:true});
 const actor=new T.Mesh(new T.PlaneGeometry(1,1),material);group.add(actor);
  material.customProgramCacheKey=()=>white?'film-white':'film-kit';
 material.onBeforeCompile=shader=>{shader.uniforms.shirtColor={value:shirt};shader.uniforms.shortsColor={value:shorts};shader.uniforms.kitRef={value:new T.Vector2(.94,.80)};
  if(white){shader.vertexShader='varying vec2 vLoc;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vLoc=uv;');
   shader.fragmentShader='uniform vec3 shirtColor;uniform vec3 shortsColor;varying vec2 vLoc;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    diffuseColor.rgb/=max(diffuseColor.a,.004);
    vec3 px=pow(max(diffuseColor.rgb,vec3(0.)),vec3(1./2.2));float mx=max(px.r,max(px.g,px.b)),mn=min(px.r,min(px.g,px.b));float sat=mx>0.?(mx-mn)/mx:0.;
    float cloth=(1.-smoothstep(.10,.20,sat))*smoothstep(.42,.60,mx);
    float f=1.-vLoc.y;
    float tShirt=smoothstep(.10,.13,f)*(1.-smoothstep(.49,.53,f)),tShorts=smoothstep(.49,.53,f)*(1.-smoothstep(.72,.76,f)),tSocks=smoothstep(.72,.76,f);
    vec3 shade=diffuseColor.rgb/.86;
    vec3 tint=shirtColor*(tShirt+tSocks)+shortsColor*tShorts;float amt=cloth*clamp(tShirt+tShorts+tSocks,0.,1.);
    diffuseColor.rgb=mix(diffuseColor.rgb,clamp(tint*shade,0.,1.2),amt);
    diffuseColor.rgb*=diffuseColor.a;`);return}

  shader.fragmentShader='uniform vec3 shirtColor;uniform vec3 shortsColor;uniform vec2 kitRef;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   diffuseColor.rgb/=max(diffuseColor.a,.004);
   vec3 px=pow(max(diffuseColor.rgb,vec3(0.)),vec3(1./2.2));
   float mx=max(px.r,max(px.g,px.b)),mn=min(px.r,min(px.g,px.b)),dl=mx-mn,hue=0.;
   if(dl>1e-4){if(mx==px.r)hue=mod((px.g-px.b)/dl,6.);else if(mx==px.g)hue=(px.b-px.r)/dl+2.;else hue=(px.r-px.g)/dl+4.;}
   hue*=60.;float sat=mx>0.?dl/mx:0.;
   float yel=smoothstep(34.,40.,hue)*(1.-smoothstep(68.,80.,hue))*smoothstep(.45,.58,sat)*smoothstep(.10,.22,mx);
   float blu=smoothstep(190.,205.,hue)*(1.-smoothstep(255.,270.,hue))*smoothstep(.40,.55,sat)*smoothstep(.06,.14,mx);
   diffuseColor.rgb=mix(diffuseColor.rgb,(shirtColor*.94+.035)*pow(clamp(mx/kitRef.x,.16,1.12),2.2),yel);
   diffuseColor.rgb=mix(diffuseColor.rgb,(shortsColor*.94+.035)*pow(clamp(mx/kitRef.y,.22,1.25),2.2),blu);
   diffuseColor.rgb*=diffuseColor.a;`)};
 const shadow=new T.Mesh(new T.CircleGeometry(.5,24),new T.MeshBasicMaterial({color:0x061006,transparent:true,opacity:.3,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 shadow.rotation.x=-Math.PI/2;shadow.visible=false;shadow.renderOrder=1;scene.add(shadow);
 let data=null,tex={},dead=false;
 const load=async n=>{const t=await new T.TextureLoader().loadAsync(new URL('../'+base+'/'+n+'.webp',import.meta.url).href);if(dead){t.dispose();return}
  t.colorSpace=T.SRGBColorSpace;t.premultiplyAlpha=true;t.generateMipmaps=false;t.minFilter=t.magFilter=T.LinearFilter;const c=data.clips[n];t.repeat.set(c.cw/t.image.width,c.ch/t.image.height);tex[n]=t};
 const api={group,ready:false,get shown(){return api._shown||null},
  identify(kit,trim){shirt.set(kit||'#f2b233');shorts.set(trim||'#10151d')},
  hide(){group.visible=false;shadow.visible=false},
  /** clip: 'idle'|'centre'|'dive'|'diveLow'|'diveHigh'|'sad'; f: frame (fractional ok, clamped); z: where the body is (world z); side: -1 picture left, 1 mirrored;
   *  reach 0…1: how far the anchor has moved from the body centre to the glove tip; lift: metres; yaw: face this point (replay camera) */
  pose({clip,f,x,z,side=-1,reach=0,lift=0,face=null}){
   if(!api.ready||!tex[clip]){api.hide();return false}
   const c=data.clips[clip],i=Math.max(0,Math.min(c.n-1,Math.round(f))),fr=c.frames[i],k=data.mPerPx/data.sc*(c.scale||1),m=side>0?-1:1;
   const w=c.cw*k,h=c.ch*k,cellMid=c.X0+c.cw/2,tip=fr.x0,anchor=fr.cx*(1-reach)+tip*reach;
   const dx=(cellMid-anchor)*k*m;                                   // plane centre relative to the anchor, picture-right positive
   const floorY=grounded?(fr.y1-(c.Y0+c.ch))*k:(c.floor-(c.Y0+c.ch))*k;               // bottom edge of the cell relative to the grass
   const t=tex[clip];material.map=t;const col=i%c.cols,row=Math.floor(i/c.cols),W=t.image.width,H=t.image.height;t.offset.set(col*c.cw/W,1-(row+1)*c.ch/H);
   group.visible=true;group.position.set(x,floorY+h/2+lift,z);actor.position.x=dx;actor.scale.set(w*m,h,1);
   group.rotation.y=face?Math.atan2(face.x-x,face.z-z):-Math.PI/2;
   const onGrass=grounded?1:1-Math.max(0,Math.min(1,(c.floor-fr.y1-lift/k)/(60*data.sc)));
   shadow.visible=true;shadow.position.set(x,.03,z);shadow.scale.set(Math.max(.7,(fr.x1-fr.x0)*k*.7),Math.max(.5,Math.min(1.1,(fr.x1-fr.x0)*k*.3)),1);shadow.material.opacity=.3*onGrass;
   api._shown={clip,frame:i};return true},
  count:clip=>data?.clips[clip]?.n||0,split:clip=>data?.clips[clip]?.split||1,
  dispose(){dead=true;scene.remove(group,shadow);Object.values(tex).forEach(t=>t.dispose());material.dispose();actor.geometry.dispose();shadow.geometry.dispose();shadow.material.dispose()}};
 fetch(new URL('../'+base+'/'+base+'.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('keeper '+r.status);return r.json()}).then(async d=>{data=d;await Promise.all(Object.keys(d.clips).map(load));if(!dead)api.ready=true}).catch(e=>console.warn('keeper footage unavailable: the 3D keeper plays instead',e));
 return api;
}
