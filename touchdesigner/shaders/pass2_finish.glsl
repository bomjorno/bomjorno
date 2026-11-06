// PASS 2: bloom + local exposure + DOF + chroma + vignette + grain.
// Host provides: vec4 S(vec2 uv, float lod) = pass-1 image at blur level lod; uTime, uBurst, uRes.
float g21(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p+19.19);return fract(p.x*p.y);}
vec4 pass2(vec2 uv){
  vec2 c=uv-.5;float rr=dot(c,c);
  float B=uBurst;
  vec2 ca=c*(.010+.02*B);
  float lod=rr*3.2+B*1.2;
  vec3 s=vec3(S(uv+ca,lod).r,S(uv,lod).g,S(uv-ca,lod).b);
  vec3 bloom=(S(uv,3.)*.34+S(uv,4.)*.30+S(uv,5.)*.24+S(uv,6.)*.18+S(uv,7.)*.12).rgb;
  float low=dot(S(uv,6.).rgb,vec3(.3,.59,.11));
  float expo=mix(.40,1.35,smoothstep(.01,.20,low));
  vec3 col=s*expo+bloom*(.85+.5*B);
  col*=smoothstep(.95,.18,sqrt(rr)*1.25);
  col*=1.-.5*smoothstep(.0,.9,rr*2.);
  col=1.-exp(-col*1.1);
  col+=(g21(uv*uRes+fract(uTime*7.))-.5)*.035*(.4+col);
  return vec4(max(col,0.),1.);}
