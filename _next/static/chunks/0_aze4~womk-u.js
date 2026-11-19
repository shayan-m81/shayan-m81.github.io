(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,69056,e=>{"use strict";var t=e.i(55805),a=e.i(92695);let r=3*Math.sqrt(3)/2,o=2*Math.PI/10,i={omega:5,zeta:1},l={width:256,height:128},s=`#version 300 es
precision highp float;

uniform vec2 u_size;          // viewport, CSS px
uniform float u_dpr;
uniform vec2 u_hole;          // centre, CSS px from the top left
uniform float u_radius;       // shadow radius, CSS px
uniform float u_rhoOut;       // disk's outer edge, r_s
uniform float u_light;        // disk brightness, 0..1 (and a little more while flaring)
uniform float u_spin;         // +1 / −1
uniform float u_omega;        // inner-edge angular speed, rad/s
uniform vec3 u_flowA;         // flow layer A: seconds into its cycle, pattern offset, weight
uniform vec3 u_flowB;
uniform vec4 u_clumps[8]; // rho (r_s), phi (rad), age (s), brightness
uniform sampler2D u_streaks;  // R8, x: angle (repeats), y: radius 3..11 r_s
uniform float u_page;         // 0..1: the overlay draws the page and the desktop
uniform float u_pull;         // 0..1: the window is pulled in
uniform vec4 u_warp;          // inward shift (px), its falloff length (px), swirl K (rad\xb7px\xb2), swirl core (px)
uniform float u_dark;         // 1 on the night theme
uniform vec3 u_paper;
uniform vec3 u_signal;
uniform vec3 u_grid;
uniform vec2 u_gridAlpha;     // minor, major
uniform vec4 u_rule;          // straight (not premultiplied) rgba
uniform float u_gridOffset;

out vec4 outColour;

const float BC = 2.598076;    // shadow radius in r_s: 3√3/2
const float SE = 0.198669;
const float CE = 0.980067;
const float PI = 3.14159265;
const float TAU = 6.28318531;

float sq(float x) { return x * x; }
vec4 over(vec4 top, vec4 under) { return top + (1.0 - top.a) * under; }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/**
 * Light of intensity L as a premultiplied layer. At night: additive light, tone-mapped (alpha is
 * its brightest channel, so "over" adds it to the dark page). On paper: a warm pigment whose
 * opacity grows with L (light cannot be brighter than white paper; colour can be more saturated).
 */
vec4 light(vec3 colour, float L) {
  if (u_dark > 0.5) {
    vec3 c = 1.0 - exp(-colour * L);
    return vec4(c, max(c.r, max(c.g, c.b)));
  }
  float a = 1.0 - exp(-L);
  return vec4(colour * a, a);
}

/** Blackbody-ish ramp, hotter inwards: sienna, the site's signal orange, amber, pale gold. */
vec3 palette(float heat) {
  vec3 sienna = u_dark > 0.5 ? vec3(0.55, 0.12, 0.03) : vec3(0.42, 0.12, 0.04);
  vec3 gold = u_dark > 0.5 ? vec3(1.0, 0.93, 0.80) : vec3(1.0, 0.80, 0.45);
  vec3 c = mix(sienna, u_signal, smoothstep(0.25, 0.6, heat));
  c = mix(c, vec3(1.0, 0.62, 0.22), smoothstep(0.6, 0.95, heat));
  return mix(c, gold, smoothstep(0.95, 1.35, heat));
}

/** The streak pattern at (rho, phi), flowing at the local orbital speed (two cross-faded copies). */
float streaks(float rho, float phi, float omega) {
  float y = (rho - 3.0) / 8.0;
  float a = textureLod(u_streaks, vec2((phi - u_spin * omega * u_flowA.x) / TAU + u_flowA.y, y), 0.0).r;
  float b = textureLod(u_streaks, vec2((phi - u_spin * omega * u_flowB.x) / TAU + u_flowB.y, y), 0.0).r;
  return a * u_flowA.z + b * u_flowB.z;
}

/**
 * The grid lines' coverage at uv (in cells), constant width in device px (Ben Golus's pristine
 * grid). d holds uv's screen derivatives, taken by the caller before any per-pixel branch.
 */
float pristine(vec2 uv, vec4 d, float widthPx) {
  vec2 deriv = vec2(length(d.xz), length(d.yw));
  vec2 target = widthPx * deriv;
  vec2 draw = clamp(target, deriv, vec2(0.5));
  vec2 aa = deriv * 1.5;
  vec2 g = 1.0 - abs(fract(uv) * 2.0 - 1.0);
  vec2 line = smoothstep(draw + aa, draw - aa, g);
  line *= clamp(target / draw, 0.0, 1.0);
  line = mix(line, target, clamp(deriv * 2.0 - 1.0, 0.0, 1.0));
  return mix(line.x, 1.0, line.y);
}

/** The desktop round the window: near black with a sparse, static starfield (so motion shows). */
vec3 desktop(vec2 at, float px) {
  vec3 base = u_dark > 0.5 ? vec3(0.016, 0.017, 0.021) : vec3(0.05, 0.052, 0.06);
  vec2 cell = floor(at / 38.0);
  vec2 h = hash22(cell);
  vec2 centre = (cell + 0.15 + 0.7 * h) * 38.0;
  float present = step(0.58, hash12(cell + 17.0));
  float size = 0.35 + 0.75 * hash12(cell + 3.0);
  float star = present * smoothstep(size + px, size - px, length(at - centre)) * (0.35 + 0.6 * h.x);
  return base + star * vec3(0.85, 0.88, 1.0);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr; // CSS px, y down
  vec2 q = frag - u_hole;
  float R = max(u_radius, 1e-3);
  float toRs = BC / R;                     // r_s per CSS px
  vec2 p = vec2(q.x, -q.y) * toRs;         // r_s, y up
  float b = max(length(p), 1e-4);
  vec2 d = p / b;
  float aa = 0.75 / u_dpr * toRs;          // half of a 1.5 device px edge

  // ---- The page and the desktop behind the hole (uniform branch: derivatives stay defined) ----
  vec4 colour = vec4(0.0);
  if (u_page > 0.0) {
    // A point lens: each pixel sees what lies closer to the hole, so the background is pushed out
    // into an Einstein ring at θ_E.
    float thetaE = 1.2 * R;
    vec2 lensed = q * (1.0 - thetaE * thetaE / max(dot(q, q), 1e-2));
    // The window falls in: a pixel at distance r shows what was further out (r + shift), turned
    // back by the swirl. The shift is nearly the same everywhere, so it is a larger part of the way
    // for the middles of the edges than for the corners: the edges bow in. The swirl is a vortex's,
    // angle ∝ 1/r\xb2 far out: a spiral near the hole, a slight twist of the corners.
    float r = max(length(lensed), 1e-3);
    float shift = u_pull * u_warp.x * (0.6 + 0.4 * u_warp.y / (r + u_warp.y));
    float swirl = -u_spin * u_pull * u_warp.z / (r * r + u_warp.w * u_warp.w);
    vec2 v = lensed * ((r + shift) / r);
    float cs = cos(swirl), sn = sin(swirl);
    vec2 src = u_hole + vec2(cs * v.x - sn * v.y, sn * v.x + cs * v.y);

    // Screen derivatives first, while every pixel of the quad is still on the same path.
    vec2 gridAt = src + vec2(0.0, u_gridOffset) + 0.5;
    vec4 gridD = vec4(dFdx(gridAt), dFdy(gridAt));
    vec2 half_ = u_size * 0.5;
    vec2 e = abs(src - half_) - half_;
    float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);   // to the window's edge, window px
    float sdPx = sd / max(length(vec2(dFdx(sd), dFdy(sd))), 1e-4);  // ... in device px, through the warp
    vec2 starAt = u_hole + lensed;
    float starPx = 0.7 * length(fwidth(starAt));

    float edgeOn = smoothstep(0.0, 0.12, u_pull);
    float inside = 1.0 - smoothstep(-0.5, 0.5, sdPx);
    vec3 page = u_paper;
    if (inside > 0.0) {
      // The empty page and its graph paper (as the page draws it), dimmed a little round
      // the hole, and the window's edge as a rule line.
      float lines = max(pristine(gridAt / 24.0, gridD / 24.0, u_dpr) * u_gridAlpha.x, pristine(gridAt / 120.0, gridD / 120.0, u_dpr) * u_gridAlpha.y);
      float dim = u_page * u_light * (u_dark > 0.5 ? 0.25 : 0.10) * exp(-max(b - BC, 0.0) / (3.0 * BC));
      page = mix(u_paper, u_grid, lines) * (1.0 - dim);
      float rule = smoothstep(-u_dpr - 0.5, -u_dpr + 0.5, sdPx) * u_rule.a * edgeOn;
      page = mix(page, u_rule.rgb, rule * 1.6);
    }
    vec3 desk = vec3(0.0);
    if (inside < 1.0) {
      // The desktop, with the window's soft shadow on it.
      desk = desktop(starAt, starPx) * (1.0 - 0.75 * edgeOn * exp(-max(sdPx, 0.0) / (18.0 * u_dpr)));
    }
    colour = vec4(mix(desk, page, inside), 1.0) * u_page;
  }

  // ---- Everything the hole itself draws lies within 7 b_c (the scissor box, without a page) ----
  if (b < 7.0 * BC) {
    // Where on the disk's plane each pixel looks (Beloborodov; see the header). Solved beyond the
    // disk too: on paper the disk's footprint also shapes the dark round it.
    float rho = 1e4;
    vec3 n = vec3(0.0);
    if (b < 1.6 * u_rhoOut + 2.0) {
      float k = inversesqrt(d.y * d.y * CE * CE + SE * SE);
      float cpsi = -d.y * CE * k;               // ψ: angle at the hole between us and the disk point
      float spsi = SE * k;
      float c = 1.0 - cpsi;
      float B2 = b * b;
      float D = c * (c * c * c - 4.0 * B2 * c + 8.0 * B2);
      float w = (2.0 * B2 - c * c - sqrt(max(D, 0.0))) / (2.0 * B2);
      rho = 1.0 / max(1.0 - w, 1e-4);
      // The disk point, in the plane of the line of sight and the screen direction.
      n = cpsi * vec3(0.0, SE, CE) + spsi * vec3(d.x, d.y * CE, -d.y * SE);
    }

    // Its own night, and a glow in it (soft falloffs, no blur). On paper the hole brings the dark
    // with it, shaped like the lensed disk (a dome over the top, wings to the sides) and round
    // close to the shadow: without it the gap between the shadow and the arch shows paper and the
    // whole thing reads as an eye. At night the page is dark already.
    float x = max(b - BC, 0.0) / BC;
    if (u_dark < 0.5) {
      float night = max(1.0 - smoothstep(0.7 * u_rhoOut, 1.3 * u_rhoOut, rho), 1.0 - smoothstep(1.05 * BC, 2.0 * BC, b));
      colour = over(vec4(0.04, 0.032, 0.03, 1.0) * (0.95 * u_light * night), colour);
    }
    float glow = u_dark > 0.5 ? 0.35 * max(exp(-x / 1.4) - exp(-6.0 / 1.4), 0.0) : 0.1 * exp(-x);
    colour = over(light(vec3(1.0, 0.45, 0.16), u_light * glow), colour);

    if (b < 1.3 * BC) {
      // Photon ring and the secondary arch under the shadow; the approaching side is brighter.
      float beam = 1.0 + 0.6 * u_spin * d.x;
      float ringW = max(0.012 * BC, aa);
      float ring = exp(-sq((b - 1.015 * BC) / ringW)) * (0.012 * BC / ringW + 0.4);
      float underBand = exp(-sq((b - 1.07 * BC) / max(0.035 * BC, aa))) * smoothstep(0.2, -0.8, d.y);
      float under = 0.0;
      if (underBand > 0.002) {
        // Lit by the far side's underside: the same streaks, seen upside down.
        under = underBand * (0.3 + 0.9 * streaks(4.2, PI - atan(d.y, d.x), u_omega * 0.62));
      }
      colour = over(light(palette(1.0 + 0.2 * u_spin * d.x), u_light * beam * (1.1 * ring + 0.5 * under)), colour);

      // The shadow: warm black, never #000.
      float shadow = 1.0 - smoothstep(BC - aa, BC + aa, b);
      vec3 shadowColour = u_dark > 0.5 ? vec3(0.010, 0.008, 0.007) : vec3(0.040, 0.030, 0.026);
      colour = over(vec4(shadowColour, 1.0) * shadow, colour);
    }

    // The disk, seen from ELEVATION above its plane and lensed (drawn over the shadow).
    if (rho > 3.0 && rho < u_rhoOut) {
      float phi = atan(n.z, n.x);
      float u = 1.0 / rho;
      float beta = sqrt(u / (2.0 * (1.0 - u)));     // Keplerian speed seen by a static observer
      float mu = u_spin * n.x * CE;                   // its component towards us
      float g = sqrt(1.0 - 1.5 * u) / (1.0 - beta * mu);
      // Powers of 3/ρ from square roots (no pow): Ω ∝ ρ^−1.5; the temperature (∝ ρ^−3/4) sets the
      // colour; the emission falls off faster (∝ ρ^−2), so the inner edge is the bright part and
      // the outer disk is translucent streaks.
      float in3 = 3.0 * u;
      float in15 = in3 * sqrt(in3);
      float omega = u_omega * in15;
      float T = sqrt(in15);
      float emit = in3 * in3 * smoothstep(3.0, 3.3, rho) * (1.0 - smoothstep(0.55 * u_rhoOut, u_rhoOut, rho));

      float clumps = 0.0;
      for (int i = 0; i < 8; i++) {
        vec4 cl = u_clumps[i];
        if (cl.w <= 0.0) continue;
        // Ahead of the clump it is sharp; behind, smeared along the orbit as it ages.
        float along = (mod(phi - cl.y + PI, TAU) - PI) * u_spin;
        float spread = along > 0.0 ? 0.15 : 0.2 + 1.3 * cl.z;
        clumps += cl.w * exp(-sq(along / spread) - sq((rho - cl.x) / (0.4 + 0.3 * cl.z)));
      }

      // Beaming as g\xb9 instead of the physical g⁴: a 2–3\xd7 difference between the sides, not 30–80\xd7.
      float beaming = g;
      float s = streaks(rho, phi, omega);
      float L = u_light * emit * beaming * (0.35 + 1.3 * s) + 3.4 * clumps * beaming;
      colour = over(light(palette(T * g * (0.85 + 0.4 * s) + 0.35 * clumps), 3.2 * L), colour);
    }
  }

  outColour = colour;
}`,n=["u_size","u_dpr","u_hole","u_radius","u_rhoOut","u_light","u_spin","u_omega","u_flowA","u_flowB","u_clumps","u_streaks","u_page","u_pull","u_warp","u_dark","u_paper","u_signal","u_grid","u_gridAlpha","u_rule","u_gridOffset"],h=null;function u(e){let a=getComputedStyle(document.documentElement),r=/rgba?\(([^)]+)\)/.exec(a.getPropertyValue("--rule"))?.[1]?.split(",").map(e=>Number(e.trim())),o=r&&4===r.length&&r.every(e=>Number.isFinite(e));return{dark:e,paper:(0,t.cssColour)("--paper",e?[.051,.055,.063]:[.953,.945,.925]),signal:(0,t.cssColour)("--signal",[1,.3,.12]),grid:(0,t.cssColour)("--grid-rgb",e?[.55,.67,.82]:[.27,.43,.63]),gridAlpha:[parseFloat(a.getPropertyValue("--grid-alpha"))||.09,parseFloat(a.getPropertyValue("--grid-strong-alpha"))||.16],rule:o?[r[0]/255,r[1]/255,r[2]/255,r[3]]:e?[.91,.9,.87,.12]:[.086,.09,.1,.14]}}let d=e=>Math.min(1,Math.max(0,e)),p=e=>{let t=43758.5453*Math.sin(12.9898*e);return t-Math.floor(t)};e.s(["createHoleView",0,function(e,f={}){let c=f.reduced??!1,g=f.maxRadius??(innerWidth<640?28:36),m=f.gridOffset??0,v={x:e.x,y:e.y},x=document.createElement("canvas");x.setAttribute("aria-hidden","true"),x.dataset.hole="",Object.assign(x.style,{position:"fixed",inset:"0",width:"100%",height:"100%",display:"block",pointerEvents:"none",zIndex:String(f.zIndex??69)}),document.body.appendChild(x);let _={fed:0,page:0,pull:0},w={x:3*!!c,v:0},b={x:3.2,v:0},y={x:0,v:0},E={x:0,v:0},T={x:0,v:0},k=[],A=0,C=null,M=null,B=!1,P=!1,R=()=>3+(g-3)*_.fed,S=()=>3.2+7*Math.sqrt(_.fed),L=()=>Math.pow(d(1.6*_.fed),.8),O=e=>o*Math.pow(e/3,-1.5),I=matchMedia("(prefers-color-scheme: dark)"),z=u(I.matches),q=1,U=!1,F=0,D=0,N=()=>{},X=()=>{},V=new Promise(e=>X=e),W=1,G=e=>{if(F=0,P)return;let t=D?Math.min(.05,Math.max(0,(e-D)/1e3)):1/60;if(D=e,c||(e=>{if(A+=e,C){let t;C.t+=e;let a=1-((t=d(C.t/.4))<.5?4*t*t*t:1-(-2*t+2)**3/2),r=1-d(C.t/.45)**3,o=1-d((C.t-.1)/.6)**2;y={x:C.from.light*r,v:0},E={x:C.from.page*a,v:0},T={x:C.from.pull*a,v:0},w={x:C.from.radius*o,v:0}}else w=(0,a.stepSpring)(w,R(),e,i),b=(0,a.stepSpring)(b,S(),e,i),y=(0,a.stepSpring)(y,L(),e,i),E=(0,a.stepSpring)(E,_.page,e,i),T=(0,a.stepSpring)(T,_.pull,e,i);for(let t of k)t.age+=e,t.phi+=-1*O(t.rho)*e,t.rho=Math.max(3.4,t.rho-.45*e*(t.rho-3));for(let e=k.length-1;e>=0;e--)k[e].age>1.5&&k.splice(e,1)})(t*W),N(),C&&C.t>=.7){let e=C.done;C=null,B=!0,N(),e();return}c||B||(F=requestAnimationFrame(G))},K=()=>{P||F||document.hidden||(!B||C)&&(F=requestAnimationFrame(G))},j=()=>{document.hidden?(cancelAnimationFrame(F),F=0,D=0,C&&(C.t=.7,G(performance.now()))):K()},H=()=>{z=u(I.matches),K()},Y=new ResizeObserver(()=>{U=!1,K()});Y.observe(x),document.addEventListener("visibilitychange",j),I.addEventListener("change",H);let J=(0,t.withContext)(x,{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,failIfMajorPerformanceCaveat:!0},e=>{let a=!1,i=()=>{};return(0,t.createProgram)(e,t.FULLSCREEN_VERTEX,s,n).then(({program:s,uniform:n})=>{if(a)return void e.deleteProgram(s);let u=e.createTexture();e.bindTexture(e.TEXTURE_2D,u),e.pixelStorei(e.UNPACK_ALIGNMENT,1),e.texImage2D(e.TEXTURE_2D,0,e.R8,l.width,l.height,0,e.RED,e.UNSIGNED_BYTE,function(){if(h)return h;let{width:e,height:t}=l,a=20251,r=()=>(a=16807*a%0x7fffffff)/0x7fffffff,o=e=>e*e*(3-2*e),i=(e,t)=>{let a=Float32Array.from({length:e*(t+1)},r);return(r,i)=>{let l=r*e,s=i*t,n=Math.floor(l),h=Math.min(Math.floor(s),t-1),u=o(l-n),d=o(s-h),p=(t,r)=>a[r*e+(t%e+e)%e],f=p(n,h)+(p(n+1,h)-p(n,h))*u;return f+(p(n,h+1)+(p(n+1,h+1)-p(n,h+1))*u-f)*d}},s=[{n:i(4,10),a:.35},{n:i(9,22),a:.3},{n:i(19,46),a:.22},{n:i(37,90),a:.13}],n=i(1,30),u=new Uint8Array(e*t);for(let a=0;a<t;a++){let r=a/(t-1);for(let t=0;t<e;t++){let i=t/e,l=0;for(let e of s)l+=e.a*e.n(i,r);let h=Math.min(1,Math.max(0,((l=.6*l+.4*n(0,r))-.25)/.5));u[a*e+t]=Math.round(255*Math.pow(o(h),1.4))}}return h=u,u}()),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);let f=e.createVertexArray(),c=new Float32Array(32);N=()=>{if(!U){let e=Math.min(devicePixelRatio||1,1.5);q=innerWidth*innerHeight*e*e>25e5?1:e,(0,t.fitCanvas)(x,q),U=!0}let a=x.width/q,i=x.height/q;if(e.viewport(0,0,x.width,x.height),e.disable(e.SCISSOR_TEST),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),B||w.x<.05)return;if(E.x<.001){let t=w.x*Math.max((1.12*b.x+.6)/r,7)+4,a=Math.floor((v.x-t)*q),o=Math.floor((i-v.y-t)*q),l=Math.ceil(2*t*q);e.enable(e.SCISSOR_TEST),e.scissor(a,o,l,l)}e.useProgram(s),e.bindVertexArray(f),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,u),e.uniform1i(n.u_streaks,0),e.uniform2f(n.u_size,a,i),e.uniform1f(n.u_dpr,q),e.uniform2f(n.u_hole,v.x,v.y),e.uniform1f(n.u_radius,w.x),e.uniform1f(n.u_rhoOut,Math.max(3,b.x)),e.uniform1f(n.u_light,Math.max(0,y.x)),e.uniform1f(n.u_spin,-1),e.uniform1f(n.u_omega,o);let l=A/3,h=l-Math.floor(l),g=l+.5-Math.floor(l+.5),_=1-Math.abs(2*h-1);e.uniform3f(n.u_flowA,3*h,p(Math.floor(l)),_),e.uniform3f(n.u_flowB,3*g,p(Math.floor(l+.5)+.5),1-_),c.fill(0),k.slice(0,8).forEach((e,t)=>{let a=d(e.age/.08)*(1-d(e.age/1.5))**2,r=e.phi-2*Math.PI*Math.floor((e.phi+Math.PI)/(2*Math.PI));c.set([e.rho,r,e.age,e.strength*a],4*t)}),e.uniform4fv(n.u_clumps,c);let C=Math.max(40,Math.min(v.x,a-v.x,v.y,i-v.y));e.uniform1f(n.u_page,d(E.x)),e.uniform1f(n.u_pull,Math.max(0,T.x));let M=.28*C;e.uniform4f(n.u_warp,.27*C,.6*C,1.4*M*M,M),e.uniform1f(n.u_dark,+!!z.dark),e.uniform3fv(n.u_paper,z.paper),e.uniform3fv(n.u_signal,z.signal),e.uniform3fv(n.u_grid,z.grid),e.uniform2fv(n.u_gridAlpha,z.gridAlpha),e.uniform4fv(n.u_rule,z.rule),e.uniform1f(n.u_gridOffset,m),e.drawArrays(e.TRIANGLES,0,3),X(!0)},i=()=>{e.deleteTexture(u),e.deleteVertexArray(f),e.deleteProgram(s)},U=!1,K()},e=>{console.warn("hole: shader did not compile",e),X(!1)}),()=>{a=!0,N=()=>{},i()}});if(!J)return Y.disconnect(),document.removeEventListener("visibilitychange",j),I.removeEventListener("change",H),x.remove(),null;let Q=()=>!P&&!C&&!B,Z=()=>{c&&(w={x:R(),v:0},b={x:S(),v:0},y={x:L(),v:0},E={x:_.page,v:0},T={x:_.pull,v:0}),K()};return{ready:V,grow(e){Q()&&(_.fed=d(e),Z())},flare(e,t=1){if(!Q()||c)return;let a=Math.atan2(Math.sin(e)/.19866933079506122,Math.cos(e)),r=d(t);k.push({rho:3+(Math.max(b.x,4)-3)*(.45+.35*Math.random()),phi:a,age:0,strength:r}),k.length>8&&k.splice(0,k.length-8),y={x:y.x,v:y.v+1.6*r},K()},page(e){Q()&&(_.page=d(e),Z())},pull(e){Q()&&(_.pull=d(e),Z())},radius:()=>w.x,timeScale(e){W=Math.max(.05,Math.min(1,e))},close:()=>M||(M=new Promise(e=>{if(P||c){B=!0,k.length=0,N(),e();return}C={t:0,from:{radius:w.x,light:Math.max(0,y.x),page:E.x,pull:T.x},done:e},K()})),destroy(){P||(P=!0,cancelAnimationFrame(F),F=0,C?.done(),C=null,Y.disconnect(),document.removeEventListener("visibilitychange",j),I.removeEventListener("change",H),J(),x.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext(),x.remove(),X(!1))}}}])}]);