// Offline renderer: runs the exact same GLSL as the TD network in headless Chromium (WebGL2).
// usage: node render.js <framesDir> <signals.json> <outDir> [start] [end]
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
const [,, FR, SIG, OUT, S0, S1]=process.argv;
const sig=JSON.parse(fs.readFileSync(SIG));
const p1=fs.readFileSync(path.join(__dirname,'shaders/pass1_dust_grade.glsl'),'utf8');
const p2=fs.readFileSync(path.join(__dirname,'shaders/pass2_finish.glsl'),'utf8');
const files=fs.readdirSync(FR).filter(f=>f.endsWith('.jpg')).sort();
const a=+(S0||0), z=Math.min(+(S1||files.length),files.length);
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const pg=await b.newPage();
await pg.setContent('<canvas id=c width=720 height=720></canvas>');
await pg.evaluate(([p1,p2])=>{
 const c=document.getElementById('c'),gl=c.getContext('webgl2',{preserveDrawingBuffer:true});window.gl=gl;
 const W=720,H=720;
 const VS='#version 300 es\nin vec2 p;out vec2 vUV;void main(){vUV=p*.5+.5;gl_Position=vec4(p,0,1);}';
 const mk=(fs)=>{const pr=gl.createProgram();for(const [t,s] of [[gl.VERTEX_SHADER,VS],[gl.FRAGMENT_SHADER,fs]]){const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));gl.attachShader(pr,sh);}
  gl.bindAttribLocation(pr,0,'p');gl.linkProgram(pr);return pr;};
 const H1='#version 300 es\nprecision highp float;in vec2 vUV;out vec4 o;uniform sampler2D s0;uniform float uTime,uBurst,uDissolve;uniform vec2 uRes;vec4 T0(vec2 u){return texture(s0,vec2(u.x,1.-u.y));}\n';
 const H2='#version 300 es\nprecision highp float;in vec2 vUV;out vec4 o;uniform sampler2D s0;uniform float uTime,uBurst,uDissolve;uniform vec2 uRes;vec4 S(vec2 u,float l){return textureLod(s0,u,l);}\n';
 window.P1=mk(H1+p1+'\nvoid main(){o=pass1(vUV);}');window.P2=mk(H2+p2+'\nvoid main(){o=pass2(vUV);}');
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
 const tex=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
 window.src=tex();gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 window.sc=tex();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 window.fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sc,0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 window.draw=(pr,t,u)=>{gl.useProgram(pr);gl.uniform1i(gl.getUniformLocation(pr,'s0'),0);for(const k in u){const l=gl.getUniformLocation(pr,k);if(l)gl.uniform1f(l,u[k]);}gl.uniform2f(gl.getUniformLocation(pr,'uRes'),W,H);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);gl.viewport(0,0,W,H);gl.drawArrays(gl.TRIANGLES,0,3);};
},[p1,p2]);
for(let i=a;i<z;i++){
 const t=i/sig.fps, burst=sig.burst[i];
 const dis=Math.max(0,.30+.22*Math.sin(t*1.1)+.12*Math.sin(t*2.3+1));
 const b64=fs.readFileSync(path.join(FR,files[i])).toString('base64');
 const url=await pg.evaluate(async ([b64,t,burst,dis])=>{
  const im=new Image();im.src='data:image/jpeg;base64,'+b64;await im.decode();
  gl.bindTexture(gl.TEXTURE_2D,src);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
  const u={uTime:t,uBurst:burst,uDissolve:dis};
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);draw(P1,src,u);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.bindTexture(gl.TEXTURE_2D,sc);gl.generateMipmap(gl.TEXTURE_2D);
  draw(P2,sc,u);return document.getElementById('c').toDataURL('image/png');
 },[b64,t,burst,dis]);
 fs.writeFileSync(path.join(OUT,'o_'+String(i+1).padStart(4,'0')+'.png'),Buffer.from(url.split(',')[1],'base64'));
 if(i%50==0)console.log(i,'/',z);
}
await b.close();})();
