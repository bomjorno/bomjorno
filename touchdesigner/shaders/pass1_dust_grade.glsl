// PASS 1: camera drift + dissolve into particles + emerald grade.
// Host provides: vec4 T0(vec2 uv) = source frame; float uTime, uBurst, uDissolve; vec2 uRes.
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+7.1;a*=.5;}return s;}
vec2 curl(vec2 p){float e=.03;
  float a=fbm(p+vec2(0,e)),b=fbm(p-vec2(0,e)),c=fbm(p+vec2(e,0)),d=fbm(p-vec2(e,0));
  return vec2(a-b,-(c-d))/(2.*e);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 pal(float L){
  vec3 c0=vec3(0.),c1=vec3(.008,.085,.05),c2=vec3(.10,.52,.29),c3=vec3(.52,.94,.64),c4=vec3(.92,1.,.88);
  vec3 c=mix(c0,c1,smoothstep(0.,.25,L));
  c=mix(c,c2,smoothstep(.25,.55,L));
  c=mix(c,c3,smoothstep(.55,.85,L));
  return mix(c,c4,smoothstep(.85,1.1,L));}
vec4 pass1(vec2 uv){
  float t=uTime, B=uBurst, D=clamp(uDissolve+B*.9,0.,1.2);
  // camera: slow push + roll + drift, kicked by bursts
  vec2 q=uv-.5;
  float z=1.07+.035*sin(t*.5)+.07*B;
  float r=.025*sin(t*.37)+.03*B*sin(t*9.);
  q=mat2(cos(r),-sin(r),sin(r),cos(r))*q/z;
  q+=vec2(.012*sin(t*.31),.01*cos(t*.43));
  vec2 cuv=clamp(q+.5,0.,1.);
  vec2 wind=normalize(vec2(-1.,.55));
  vec2 flow=curl(cuv*2.2+vec2(t*.15,-t*.1));
  vec3 base=T0(cuv).rgb;
  float L0=lum(base);
  // dissolve mask: bright areas rot first, driven by noise front
  float front=fbm(cuv*2.6+vec2(t*.12,t*.05))+L0*.38;
  float m=smoothstep(1.15-D*.9,1.15-D*.9+.22,front);
  // smeared streaks pulled from upstream
  vec3 sm=vec3(0.);float ws=0.;
  for(int k=0;k<7;k++){float f=float(k)/6.;
    vec2 o=(wind*.05+flow*.03)*D*f;
    float w=1.-f*.8;sm+=T0(clamp(cuv-o,0.,1.)).rgb*w;ws+=w;}
  sm/=ws;
  // discrete sparks
  vec2 cell=floor(cuv*uRes/2.);
  float hr=h21(cell+floor(t*14.));
  float hs=h21(cell*1.37+3.1);
  vec2 po=(wind*.06+flow*.05)*D*(hs+.3);
  vec3 ps=T0(clamp(cuv-po,0.,1.)).rgb;
  float spark=step(1.-.20*D,hr)*pow(lum(ps),1.4)*3.2;
  vec3 col=base*(1.-m*.88)+sm*m*.75+vec3(spark)*m;
  // emerald grade
  float L=lum(col);
  L=clamp((L-.04)*1.3,0.,1.2);L=pow(L,1.9);
  return vec4(pal(L)*.95,1.);}
