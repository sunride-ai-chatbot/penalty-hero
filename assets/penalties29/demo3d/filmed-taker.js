import {shirtTrack as goalTrack} from './goal-track.js';
import {shirtTrack as missTrack} from './miss-track.js';
import * as T from './vendor/three.js';
// The photographed taker. One filmed motion (highL) serves every aim, with a fixed crop and ground calibration taken
// from motions/clips.json. Name, number and kit belong to the current roster player, never to the source plate.
//
// Kit colours: the plate wears a key yellow shirt (and socks) and key blue shorts. The shader finds those two hues,
// in sRGB so that the thresholds match what was measured on the plates, and repaints them with the club's colours
// while keeping the cloth's own light and folds. Skin, hair and boots are other hues and are left alone.
// Shadow: the same frame, flattened onto the grass along the floodlight, so the feet are tied to the ground in every frame.
const LIGHT={x:.82,z:-.45};          // metres the shadow moves per metre of height (the sun of world.js)
export function filmedTaker(scene){
 const group=new T.Group();group.rotation.y=-Math.PI/2;group.visible=false;scene.add(group);
 const shirtColor=new T.Color(),shortsColor=new T.Color(),refs={value:new T.Vector2(.96,.70)},fringe={value:new T.Vector3(0,0,0)};
 const material=new T.MeshBasicMaterial({transparent:true,alphaTest:.12,toneMapped:false,side:T.DoubleSide,premultipliedAlpha:true});   // premultiplied plates: no colour fringe from the empty texels around the figure
 const actor=new T.Mesh(new T.PlaneGeometry(1,1),material);group.add(actor);
 material.onBeforeCompile=shader=>{
  shader.uniforms.shirtColor={value:shirtColor};shader.uniforms.shortsColor={value:shortsColor};shader.uniforms.kitRef=refs;shader.uniforms.kitFringe=fringe;
  shader.fragmentShader='uniform vec3 shirtColor;uniform vec3 shortsColor;uniform vec2 kitRef;uniform vec3 kitFringe;\nfloat keyYellow(vec4 t){vec3 c=t.rgb/max(t.a,.004);return t.a*smoothstep(.10,.22,min(c.r,c.g)-c.b)*step(.36*c.r,c.g);}\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   diffuseColor.rgb/=max(diffuseColor.a,.004);
   vec3 px=pow(max(diffuseColor.rgb,vec3(0.)),vec3(1./2.2));
   float mx=max(px.r,max(px.g,px.b)),mn=min(px.r,min(px.g,px.b)),dl=mx-mn,hue=0.;
   if(dl>1e-4){if(mx==px.r)hue=mod((px.g-px.b)/dl,6.);else if(mx==px.g)hue=(px.b-px.r)/dl+2.;else hue=(px.r-px.g)/dl+4.;}
   hue*=60.;float sat=mx>0.?dl/mx:0.;
   float lowHue=mix(34.,23.,smoothstep(.80,.88,sat));                       // deep orange folds of the shirt are far more saturated than skin
   float minSat=mix(.62,.30,smoothstep(42.,48.,hue)*smoothstep(.45,.60,mx));  // pale highlights of the shirt: yellow hue, bright
   float shirt=smoothstep(lowHue-3.,lowHue+3.,hue)*(1.-smoothstep(68.,80.,hue))*smoothstep(minSat-.05,minSat+.06,sat)*smoothstep(.10,.22,mx);
   float shorts=smoothstep(190.,205.,hue)*(1.-smoothstep(255.,270.,hue))*smoothstep(.45,.62,sat)*smoothstep(.06,.14,mx);
   if(kitFringe.z>0.&&shirt<.9&&sat>.40&&(hue<42.||hue>325.)){   // the matte's orange-to-red rim around the key-yellow cloth of the reaction plates
    vec2 e=kitFringe.xy*2.;float near=max(max(keyYellow(texture2D(map,vMapUv+vec2(e.x,0.))),keyYellow(texture2D(map,vMapUv-vec2(e.x,0.)))),max(keyYellow(texture2D(map,vMapUv+vec2(0.,e.y))),keyYellow(texture2D(map,vMapUv-vec2(0.,e.y)))));
    shirt=max(shirt,near*smoothstep(.40,.50,sat));}
   diffuseColor.rgb=mix(diffuseColor.rgb,(shirtColor*.94+.035)*pow(clamp(mx/kitRef.x,.16,1.12),2.2),shirt);
   diffuseColor.rgb=mix(diffuseColor.rgb,(shortsColor*.94+.035)*pow(clamp(mx/kitRef.y,.22,1.25),2.2),shorts);
   diffuseColor.rgb*=diffuseColor.a;`);
 };
 // ground shadow: four corners moved every frame, the same texture frame as the body
 const shadowGeometry=new T.BufferGeometry();const sp=new Float32Array(12);shadowGeometry.setAttribute('position',new T.BufferAttribute(sp,3));
 shadowGeometry.setAttribute('uv',new T.BufferAttribute(new Float32Array([0,0,1,0,0,1,1,1]),2));shadowGeometry.setIndex([0,1,2,2,1,3]);
 const shadowMaterial=new T.MeshBasicMaterial({color:0x061006,transparent:true,opacity:.34,depthWrite:false,toneMapped:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const shadow=new T.Mesh(shadowGeometry,shadowMaterial);shadow.frustumCulled=false;shadow.renderOrder=1;shadow.visible=false;scene.add(shadow);
 let shadowFlip=1;
 function castShadow(x,zCentre,w,h,floorY,flip=1){if(flip!==shadowFlip){shadowFlip=flip;shadowGeometry.attributes.uv.array.set(flip<0?[1,0,0,0,1,1,0,1]:[0,0,1,0,0,1,1,1]);shadowGeometry.attributes.uv.needsUpdate=true}
     // the sprite stands in the plane world-x = x, from z = zCentre-w/2 … +w/2, its bottom edge at height floorY (≤0)
  const y0=floorY,y1=floorY+h,zl=zCentre-w/2,zr=zCentre+w/2,put=(i,y,z)=>{sp[i*3]=x+y*LIGHT.x;sp[i*3+1]=.028;sp[i*3+2]=z+y*LIGHT.z};
  put(0,y0,zl);put(1,y0,zr);put(2,y1,zl);put(3,y1,zr);shadowGeometry.attributes.position.needsUpdate=true;shadow.visible=true}
 const canvas=document.createElement('canvas');canvas.width=384;canvas.height=320;const ink=new T.CanvasTexture(canvas);ink.colorSpace=T.SRGBColorSpace;ink.anisotropy=4;
 const label=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:ink,transparent:true,depthWrite:false,toneMapped:false}));group.add(label);
 /* The print is cloth, not a sticker: it takes the light and the folds of the shirt behind it (the same film frame, sampled where the print lies),
    it wraps round at the sides of the back, and it fades into the seams. */
 const plate={tex:{value:null},ro:{value:new T.Vector4(1,1,0,0)},actorS:{value:new T.Vector2(1,1)},lm:{value:label.matrix}};
 label.material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{plateTex:plate.tex,plateRO:plate.ro,actorS:plate.actorS,lm:plate.lm,kitRef2:refs});
  shader.vertexShader='uniform mat4 lm;uniform vec2 actorS;varying vec2 vPlate;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vec4 gp=lm*vec4(position,1.0);vPlate=vec2(gp.x/actorS.x+.5,gp.y/actorS.y+.5);');
  shader.fragmentShader='uniform sampler2D plateTex;uniform vec4 plateRO;uniform vec2 kitRef2;varying vec2 vPlate;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
   vec2 q=vMapUv;float xx=(q.x-.5)*2.;xx=asin(clamp(xx*.6,-.99,.99))/asin(.6);q.x=xx*.5+.5;
   vec4 sampledDiffuseColor=texture2D(map,q);diffuseColor*=sampledDiffuseColor;
   vec4 pl=texture2D(plateTex,vPlate*plateRO.xy+plateRO.zw);
   vec3 pc=pow(max(pl.rgb/max(pl.a,.01),vec3(0.)),vec3(1./2.2));float mxp=max(pc.r,max(pc.g,pc.b));
   float shade=pl.a>.3?clamp(mxp/kitRef2.x,.5,1.1):1.;
   diffuseColor.rgb*=mix(1.,shade,.92);diffuseColor.a*=1.-.4*smoothstep(.78,1.,abs(xx));`)};
 let data=null,pages=[],dead=false,identity={},shown={clip:null,frame:-1};const reactions={};const waits=[],later=[];
 for(const [name,track] of Object.entries({goal:goalTrack,miss:missTrack})){
  const near=i=>track[Math.max(0,Math.min(track.length-1,i))],smooth=track.map((_,i)=>[0,1].map(k=>(near(i-2)[k]+2*near(i-1)[k]+3*near(i)[k]+2*near(i+1)[k]+near(i+2)[k])/9));
  const rows=Math.ceil(track.length/12);reactions[name]={texture:null,track,smooth,rows,ready:false};
  // the two reactions are not needed until a kick has ended: they load behind the first kick and never hold it up.
  // (.webp: the source PNG atlases re-encoded at the same size — 0.8 MB each instead of 7 MB)
  later.push(new T.TextureLoader().loadAsync(new URL('../taker/'+name+'.webp',import.meta.url).href).then(texture=>{if(dead){texture.dispose();return}
   texture.colorSpace=T.SRGBColorSpace;texture.premultiplyAlpha=true;texture.repeat.set(1/12,1/rows);texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;Object.assign(reactions[name],{texture,ready:true})}));
 }
 const sync=()=>{const m=material.map;if(!m)return;plate.tex.value=m;plate.ro.value.set(m.repeat.x,m.repeat.y,m.offset.x,m.offset.y);plate.actorS.value.set(actor.scale.x,actor.scale.y)};
 const api={group,contact:2.35,duration:3.95,ready:null,flip:false,
  /** not in this picture (the replay camera): taker and shadow out of sight until the next pose() */
  hide(){group.visible=false;shadow.visible=false},get loaded(){return !!data},get shown(){return shown},
  identify(o){identity=o||{};shirtColor.set(identity.kit||'#ead03f');shortsColor.set(identity.trim||'#204987');
   const c=canvas.getContext('2d');c.clearRect(0,0,384,320);const light=shirtColor.getHSL({}).l>.36;c.fillStyle=light?'#152139':'#fffdf2';c.strokeStyle=light?'rgba(255,255,255,.35)':'rgba(0,0,0,.4)';c.lineJoin='round';
   c.textAlign='center';c.textBaseline='top';c.direction='rtl';const name=String(identity.name||'');const font=s=>'800 '+s+'px "Heebo","Arial Hebrew",Arial,sans-serif';
   // the canvas is the back panel of the shirt: the top eighth is the collar and stays empty, the name sits under it, the number fills the rest
   let size=62;do{c.font=font(size);if(c.measureText(name).width<=330)break;size-=2}while(size>28);
   c.lineWidth=5;c.strokeText(name,192,44+(62-size)*.5,336);c.fillText(name,192,44+(62-size)*.5,336);
   c.font='900 196px "Heebo",Arial,sans-serif';c.direction='ltr';c.lineWidth=8;const no=String(identity.number??'');c.strokeText(no,192,112,330);c.fillText(no,192,112,330);ink.needsUpdate=true},
  /** time: seconds into the kick clip. reaction: null | 'goal' | 'miss', elapsed seconds into it. x: world x of the sprite plane. */
  pose(time,x,z,reaction,elapsed){if(dead)return;const m=api.flip?-1:1;
   const take=reactions[reaction];if(take?.ready&&data){group.visible=true;const h=3.15,w=h*208/376,i=Math.min(take.track.length-1,Math.max(0,Math.floor(elapsed*16)));
    material.map=take.texture;shadowMaterial.map=take.texture;refs.value.set(.93,.50);fringe.value.set(1/2496,1/3384,1);take.texture.offset.set(i%12/12,1-(Math.floor(i/12)+1)/take.rows);actor.scale.set(w*m,h,1);
    const kw=data.worldHeight*data.width/data.height,last=data.labels[data.frames-1];   // he reacts where the strike left him: same spot, no jump
    const zc=-(data.contactX-.5)*kw+(last.x-.5)*kw-(take.track[0][0]/208-.5)*w;
    group.position.set(x,h*(.872-.5),zc*m);castShadow(x,zc*m,w,h,-h*.128,m);
    const [sx,sy]=take.smooth[i];label.position.set((sx/208-.5)*w*m,(.5-sy/376)*h-.11,.008);label.scale.set(.46,.37,1);label.rotation.z=0;/* the tracked point is the top of the back: the panel hangs below it */shown={clip:reaction,frame:i};sync();return}
   if(!data)return;group.visible=true;
   const i=Math.min(data.frames-1,Math.max(0,Math.floor(time*data.fps))),p=pages.findLast(p=>p.start<=i),f=i-p.start;
   p.texture.offset.set(f%p.cols/p.cols,1-(Math.floor(f/p.cols)+1)/p.rows);material.map=p.texture;shadowMaterial.map=p.texture;refs.value.set(.96,.70);fringe.value.z=0;
   const h=data.worldHeight,w=h*data.width/data.height,zc=-(data.contactX-.5)*w*m;actor.scale.set(w*m,h,1);
   group.position.set(x,h*(data.floors[i]-.5),zc);castShadow(x,zc,w,h,h*(data.floors[i]-1),m);
   const q=data.labels[i];label.position.set((q.x-.5)*w*m,(.5-q.y)*h,.008);label.scale.set(q.width*w,q.height*h,1);label.rotation.z=q.angle*Math.PI/180*m;shown={clip:'highL',frame:i};sync()},
  dispose(){dead=true;scene.remove(group,shadow);pages.forEach(p=>p.texture.dispose());Object.values(reactions).forEach(r=>r.texture?.dispose());ink.dispose();material.dispose();shadowMaterial.dispose();shadowGeometry.dispose();actor.geometry.dispose();label.geometry.dispose();label.material.dispose()}};
 waits.push(fetch(new URL('../motions/clips.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('motion '+r.status);return r.json()}).then(async all=>{
  const d=all.highL;if(!d||d.floors.length!==d.frames||d.labels.length!==d.frames||d.pages.reduce((t,p)=>t+p.frames,0)!==d.frames)throw Error('clips.json does not match its atlas');
  const loaded=await Promise.all(d.pages.map(async p=>{const filename=p.url.split('/').pop();const texture=await new T.TextureLoader().loadAsync(new URL('../motions/'+filename,import.meta.url).href);texture.colorSpace=T.SRGBColorSpace;texture.premultiplyAlpha=true;texture.repeat.set(1/p.cols,1/p.rows);texture.generateMipmaps=false;texture.minFilter=texture.magFilter=T.LinearFilter;return {...p,texture}}));
  const raw=d.labels,at=i=>raw[Math.max(0,Math.min(raw.length-1,i))],avg=(i,k,w)=>w.reduce((t,wt,j)=>t+wt*at(i+j-(w.length>>1))[k],0)/w.reduce((t,x)=>t+x,0);
  d.labels=raw.map((q,i)=>({x:avg(i,'x',[1,2,1]),y:avg(i,'y',[1,2,1]),width:avg(i,'width',[1,2,3,2,1]),height:avg(i,'height',[1,2,3,2,1]),angle:avg(i,'angle',[1,2,3,2,1])}));
  if(dead){loaded.forEach(p=>p.texture.dispose());return}pages=loaded;data=d;api.contact=d.contact;api.duration=d.frames/d.fps;api.identify(identity)}));
 api.ready=Promise.all(waits).then(()=>true);api.ready.catch(()=>{});Promise.all(later).catch(e=>console.warn('reaction plates unavailable: the taker holds his last frame',e));
 /** upload every page to the GPU now, so the first kick does not stall on a 4-megapixel texture */
 api.warm=renderer=>{try{pages.forEach(p=>renderer.initTexture(p.texture))}catch(e){}};
 return api;
}
