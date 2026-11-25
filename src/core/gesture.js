// The curve of a kick is read from the finger's own path: a clear bow to one side between where the drag began and where it was released.
// Returns -1 (left), 0 (straight) or 1 (right). The thresholds keep ordinary aiming wiggles straight.
export function bowOf(path){
  if(!path||path.length<4)return 0;
  const a=path[0],b=path[path.length-1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<50)return 0;
  let best=0,bx=0;
  for(const q of path){const off=((q.x-a.x)*dy-(q.y-a.y)*dx)/len;if(Math.abs(off)>Math.abs(best)){best=off;bx=dy/len*off}}
  return Math.abs(best)>=24&&Math.abs(best)/len>=.18&&Math.abs(bx)>=14?(bx>0?1:-1):0;
}
