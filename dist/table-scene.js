"use strict";
// Lightweight local WebGL renderer: no network or CDN dependency.
window.tableScene = (() => {
  const get=id=>document.getElementById(id);
  const canvas=get("table-canvas"), dialog=get("table-preview");
  let gl,program,buffer,count=0,frame=0,last=0,auto=false;
  let angle=0,pitch=.46,distance=5.4,target=[0,0.7,0],vertices=[];
  let labels=[],wallRanges=[],sceneCount=0;
  let initialized=false,pointers=new Map(),pinch=0;
  const colors={wood:[.39,.22,.12],edge:[.22,.13,.08],seat:[.16,.28,.23],metal:[.65,.49,.26],white:[.94,.92,.82],wall:[.79,.74,.65],floor:[.37,.31,.24]};
  function vertex(p,n,c){vertices.push(...p,...n,...c);}
  function triangle(a,b,c,n,color){vertex(a,n,color);vertex(b,n,color);vertex(c,n,color);}
  function box(x,y,z,w,h,d,color,yaw=0){
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const transform=p=>[x+c*p[0]+s*p[2],y+p[1],z-s*p[0]+c*p[2]];
    const faces=[[[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]],[[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],[[0,1,0],[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]],[[0,-1,0],[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]],[[0,0,1],[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]],[[0,0,-1],[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]]];
    for(const [normal,points] of faces){
      const n=[c*normal[0]+s*normal[2],normal[1],-s*normal[0]+c*normal[2]];
      const p=points.map(q=>transform([q[0]*w/2,q[1]*h/2,q[2]*d/2]));
      triangle(p[0],p[1],p[2],n,color);triangle(p[0],p[2],p[3],n,color);
    }
  }
  function cylinder(x,y,z,r,h,color){
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2,b=(i+1)/24*Math.PI*2;
      const p=[x+r*Math.cos(a),y-h/2,z+r*Math.sin(a)],q=[x+r*Math.cos(b),y-h/2,z+r*Math.sin(b)];
      const t=[p[0],y+h/2,p[2]],u=[q[0],y+h/2,q[2]],n=[Math.cos((a+b)/2),0,Math.sin((a+b)/2)];
      triangle(p,q,u,n,color);triangle(p,u,t,n,color);triangle([x,y+h/2,z],t,u,[0,1,0],color);
    }
  }
  function tableMesh(x,z,capacity,active){
    const radius=capacity>6 ? 1.03 : .78;
    cylinder(x,.94,z,radius,.13,active?[.58,.34,.16]:colors.wood);
    cylinder(x,.48,z,.14,.84,colors.edge);cylinder(x,.07,z,.45,.08,colors.metal);
    for(let i=0;i<Math.min(capacity,20);i++){
      const a=i/capacity*Math.PI*2;
      const cx=x+Math.cos(a)*(radius+.48),cz=z+Math.sin(a)*(radius+.48);
      box(cx,.47,cz,.43,.12,.43,active?colors.seat:[.28,.30,.25],-a);
      box(cx+Math.cos(a)*.19,.75,cz+Math.sin(a)*.19,.09,.50,.47,colors.seat,-a);
      for(const offset of [-.14,.14])box(cx+offset,.23,cz,.04,.44,.04,colors.metal);
      if(active){
        const px=x+Math.cos(a)*(radius-.22),pz=z+Math.sin(a)*(radius-.22);
        cylinder(px,1.025,pz,.15,.025,colors.white);
        cylinder(px,1.04,pz,.11,.012,[.84,.82,.73]);
        cylinder(x+Math.cos(a+.20)*(radius-.14),1.10,z+Math.sin(a+.20)*(radius-.14),.045,.18,[.58,.70,.68]);
      }
    }
    if(active){cylinder(x,1.10,z,.09,.22,colors.metal);box(x,1.36,z,.27,.38,.015,colors.seat);}
  }
  function hallOf(t){return t.hall==="vip" || (t.hall!=="main" && t.id===10) ? "vip" : "main";}
  function build(selected,tables){
    vertices=[];
    const hall=tables.filter(t=>hallOf(t)===hallOf(selected));
    // Match the six-track floor map: first six booths span three tracks,
    // subsequent booths span two tracks. VIP has a single column.
    const vip=hallOf(selected)==="vip",spacing=3.6,track=1.3;
    const rows=vip ? hall.length : Math.ceil(Math.min(6,hall.length)/2)+Math.ceil(Math.max(0,hall.length-6)/3);
    const width=vip ? 5.6 : 6*track+2,depth=Math.max(rows*spacing+2,7);
    const locations=hall.map((t,i)=>{
      const row=vip ? i : i<6 ? Math.floor(i/2) : 3+Math.floor((i-6)/3);
      const x=vip ? 0 : i<6 ? ((i%2)*3-1.5)*track : (((i-6)%3)*2-2)*track;
      return {table:t,row,x,z:row*spacing-(rows-1)*spacing/2};
    });
    get("scene-labels").replaceChildren();
    labels=locations.map(p=>{
      const label=document.createElement("span");label.className="scene-table-label"+(p.table.id===selected.id?" selected":"");
      label.textContent=p.table.name+"-stol";get("scene-labels").append(label);return {...p,label};
    });
    const seat=locations.find(p=>p.table.id===selected.id) || {x:0,z:0,row:0};target=[seat.x,.7,seat.z];
    box(0,-.10,0,width,.18,depth,colors.floor);
    for(let x=-width/2;x<width/2;x+=.65)box(x,0,0,.012,.008,depth,[.28,.23,.18]);
    box(0,.012,depth/2-1,1.7,.018,1.2,[.58,.46,.29]);
    for(const p of locations)tableMesh(p.x,p.z,p.table.capacity,p.table.id===selected.id);
    for(const x of [-width/2+1,width/2-1]){
      cylinder(x,.25,-depth/2+.7,.25,.48,[.46,.38,.29]);
      cylinder(x,.8,-depth/2+.7,.045,.9,colors.wood);
      for(let j=0;j<5;j++)box(x+Math.cos(j)*.18,1+Math.sin(j)*.12,-depth/2+.7+Math.sin(j)*.18,.4,.07,.25,colors.seat,j);
    }
    // Hide the near wall when the orbit camera moves outside it, as in a
    // dollhouse view, so the selected table remains visible through 360°.
    sceneCount=vertices.length/9;
    wallRanges=[];
    let first=sceneCount;
    box(0,1.7,-depth/2,width,3.4,.14,colors.wall);
    wallRanges.push({axis:2,bound:-depth/2,first,count:vertices.length/9-first});
    first=vertices.length/9;
    box(-width/2,1.7,0,.14,3.4,depth,[.67,.65,.57]);
    for(let z=-depth/2+1.4;z<depth/2;z+=2.6){
      box(-width/2+.09,1.9,z,.04,1.7,1.8,[.48,.65,.69]);
      box(-width/2+.12,1.9,z,.06,1.8,.07,colors.wood);
      box(-width/2+.12,1.9,z,.06,.07,1.9,colors.wood);
    }
    wallRanges.push({axis:0,bound:-width/2,first,count:vertices.length/9-first});
    count=vertices.length/9;
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    get("scene-hint").textContent=(hallOf(selected)==="vip" ? "VIP zal" : "Asosiy zal")+" · "+(seat.row+1)+"-qator · Tanlangan stol och rangda. Aylantirish uchun suring.";
  }
  function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function init(){
    gl=canvas.getContext("webgl",{antialias:true,alpha:false});if(!gl)throw Error("WebGL unavailable");
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 aPosition,aNormal,aColor;uniform mat4 uMatrix;varying vec3 normal,color,position;void main(){position=aPosition;normal=aNormal;color=aColor;gl_Position=uMatrix*vec4(aPosition,1.0);}`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec3 normal,color,position;uniform vec3 uEye;void main(){vec3 n=normalize(normal);vec3 light=normalize(vec3(-3.0,6.0,3.0)-position);float diffuse=max(dot(n,light),0.0);float shine=pow(max(dot(reflect(-light,n),normalize(uEye-position)),0.0),24.0)*.15;float grain=sin(position.x*85.0+sin(position.z*20.0))*0.012;vec3 lit=color*(.52+diffuse*.58)+shine+grain;float fog=clamp(length(uEye-position)/30.0,0.0,.5);gl_FragColor=vec4(mix(lit,vec3(.12,.15,.14),fog),1.0);}`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error("Shader link failed");
    gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    for(const [name,offset] of [["aPosition",0],["aNormal",12],["aColor",24]]){const i=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,3,gl.FLOAT,false,36,offset);}
    gl.enable(gl.DEPTH_TEST);gl.clearColor(.12,.15,.14,1);initialized=true;
  }
  const norm=a=>{const len=Math.hypot(...a);return a.map(n=>n/len);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
  function multiply(a,b){const result=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)result[c*4+r]+=a[k*4+r]*b[c*4+k];return result;}
  function draw(now){
    if(!dialog.open){frame=0;return;}
    if(auto && last)angle+=(now-last)*.00014;last=now;
    const ratio=Math.min(devicePixelRatio || 1,2),w=Math.max(1,Math.floor(canvas.clientWidth*ratio)),h=Math.max(1,Math.floor(canvas.clientHeight*ratio));
    if(canvas.width!==w || canvas.height!==h){canvas.width=w;canvas.height=h;}
    gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const eye=[target[0]+distance*Math.cos(pitch)*Math.sin(angle),target[1]+distance*Math.sin(pitch),target[2]+distance*Math.cos(pitch)*Math.cos(angle)];
    const z=norm(eye.map((n,i)=>n-target[i])),x=norm(cross([0,1,0],z)),y=cross(z,x);
    const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
    const f=1/Math.tan(Math.PI/7),near=.05,far=80;
    const projection=[f/(w/h),0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
    const matrix=multiply(projection,view);
    for(const p of labels){
      const point=[p.x,1.6,p.z,1],clip=[0,0,0,0];
      for(let r=0;r<4;r++)for(let k=0;k<4;k++)clip[r]+=matrix[k*4+r]*point[k];
      const x=clip[0]/clip[3],y=clip[1]/clip[3];
      p.label.hidden=clip[3]<=0 || Math.abs(x)>1 || Math.abs(y)>1;
      p.label.style.left=((x+1)*50)+"%";p.label.style.top=((1-y)*50)+"%";
    }
    gl.uniformMatrix4fv(gl.getUniformLocation(program,"uMatrix"),false,matrix);gl.uniform3fv(gl.getUniformLocation(program,"uEye"),eye);
    gl.drawArrays(gl.TRIANGLES,0,sceneCount);
    for(const wall of wallRanges)if(eye[wall.axis]>=wall.bound+.08)gl.drawArrays(gl.TRIANGLES,wall.first,wall.count);
    const degrees=Math.round(((angle*180/Math.PI)%360+360)%360);get("table-rotation").value=degrees;get("rotation-value").textContent=degrees+"°";
    frame=requestAnimationFrame(draw);
  }
  function stopAuto(){auto=false;get("scene-auto").setAttribute("aria-pressed","false");}
  function zoom(step){distance=Math.max(2.6,Math.min(9,distance+step));}
  canvas.addEventListener("pointerdown",e=>{pointers.set(e.pointerId,[e.clientX,e.clientY]);canvas.setPointerCapture(e.pointerId);stopAuto();pinch=0;});
  canvas.addEventListener("pointermove",e=>{
    const old=pointers.get(e.pointerId);if(!old)return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);
    if(pointers.size===2){const [a,b]=[...pointers.values()],length=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoom((pinch-length)*.012);pinch=length;}
    else{angle-=(e.clientX-old[0])*.008;pitch=Math.max(.15,Math.min(1.2,pitch+(e.clientY-old[1])*.006));}
  });
  for(const name of ["pointerup","pointercancel","lostpointercapture"])canvas.addEventListener(name,e=>{pointers.delete(e.pointerId);pinch=0;});
  canvas.addEventListener("wheel",e=>{e.preventDefault();zoom(e.deltaY*.005);},{passive:false});
  get("table-rotation").oninput=()=>{stopAuto();angle=Number(get("table-rotation").value)*Math.PI/180;};
  get("scene-zoom-in").onclick=()=>zoom(-.5);get("scene-zoom-out").onclick=()=>zoom(.5);
  get("scene-auto").onclick=()=>{auto=!auto;get("scene-auto").setAttribute("aria-pressed",String(auto));};
  get("scene-reset").onclick=()=>{angle=0;pitch=.46;distance=5.4;stopAuto();};
  get("scene-full").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await dialog.requestFullscreen();}catch{get("scene-hint").textContent="Bu qurilmada to‘liq ekran mavjud emas. Suring va aylantiring.";}};
  canvas.addEventListener("webglcontextlost",e=>{e.preventDefault();cancelAnimationFrame(frame);frame=0;initialized=false;get("scene-error").hidden=false;get("scene-error").textContent="3D ko‘rinish to‘xtadi. Oynani yopib qayta oching.";});
  dialog.addEventListener("close",()=>{cancelAnimationFrame(frame);frame=0;last=0;pointers.clear();stopAuto();});
  return {open(table,tables){
    try{get("scene-error").hidden=true;if(!initialized)init();build(table,tables);angle=0;pitch=.46;distance=5.4;last=0;stopAuto();if(!frame)frame=requestAnimationFrame(draw);}
    catch(error){get("scene-error").hidden=false;get("scene-error").textContent="Qurilmada 3D ko‘rinishni ochib bo‘lmadi. Zal xaritasidan joylashuvni ko‘rishingiz mumkin.";}
  }};
})();
