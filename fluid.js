(() => {
'use strict';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function detectFluidProfile() {
  const forced = new URLSearchParams(location.search).get('fluid');
  if (forced === 'lite') return { level: 'lite', renderer: 'canvas', mobile: true, fps: 18, scale: .38, particles: 52, ambient: 2.2 };
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 820;
  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = Boolean(connection?.saveData);
  const slowNetwork = /(^|-)2g$/.test(connection?.effectiveType || '');

  if (saveData || slowNetwork || memory <= 2 || cores <= 2) {
    return { level: 'lite', renderer: 'canvas', mobile, fps: 18, scale: .38, particles: 52, ambient: 2.2 };
  }
  if (mobile && (memory <= 4 || cores <= 4)) {
    return { level: 'low', renderer: 'webgl', mobile, fps: 24, sim: 64, dye: 128, iterations: 6, dpr: 1, ambient: 1.9 };
  }
  if (mobile) {
    return { level: 'mobile', renderer: 'webgl', mobile, fps: 30, sim: 80, dye: 192, iterations: 8, dpr: 1, ambient: 1.65 };
  }
  if (memory <= 4 || cores <= 4) {
    return { level: 'balanced', renderer: 'webgl', mobile, fps: 45, sim: 112, dye: 256, iterations: 9, dpr: 1.2, ambient: 1.45 };
  }
  return { level: 'high', renderer: 'webgl', mobile, fps: 60, sim: 160, dye: 384, iterations: 12, dpr: 1.5, ambient: 1.25 };
}

function createShader(gl, type, source) {
  const result = gl.createShader(type);
  gl.shaderSource(result, source);
  gl.compileShader(result);
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) || 'Fluid shader compile failed');
  return result;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const handle = gl.createProgram();
  gl.attachShader(handle, createShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(handle, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle) || 'Fluid program link failed');
  const uniforms = {};
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index += 1) {
    const name = gl.getActiveUniform(handle, index).name;
    uniforms[name] = gl.getUniformLocation(handle, name);
  }
  return { handle, uniforms };
}

class WebGLFluidRenderer {
  constructor(canvas, profile) {
    this.canvas = canvas;
    this.profile = profile;
    this.iterations = profile.iterations;
    this.gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    });
    const gl = this.gl;
    if (!gl || !gl.getExtension('EXT_color_buffer_float') || !gl.getExtension('OES_texture_float_linear')) throw new Error('WebGL2 floating-point targets unavailable');

    const vertex = `#version 300 es
      precision highp float;
      out vec2 vUv;
      void main(){
        vec2 position=vec2(gl_VertexID==1?3.0:-1.0,gl_VertexID==2?3.0:-1.0);
        vUv=position*.5+.5;
        gl_Position=vec4(position,0,1);
      }`;
    const header = `#version 300 es
      precision highp float;
      precision highp sampler2D;
      in vec2 vUv;
      out vec4 fragColor;`;

    this.programs = {
      clear: createProgram(gl, vertex, `${header}
        uniform sampler2D uTexture; uniform float uValue;
        void main(){fragColor=texture(uTexture,vUv)*uValue;}`),
      splat: createProgram(gl, vertex, `${header}
        uniform sampler2D uTarget; uniform vec2 uPoint; uniform vec4 uValue; uniform float uRadius; uniform float uAspect;
        void main(){vec2 p=vUv-uPoint;p.x*=uAspect;float influence=exp(-dot(p,p)/uRadius);fragColor=texture(uTarget,vUv)+uValue*influence;}`),
      advect: createProgram(gl, vertex, `${header}
        uniform sampler2D uVelocity; uniform sampler2D uSource; uniform float uDt; uniform float uDissipation;
        void main(){vec2 velocity=texture(uVelocity,vUv).xy;vec2 coord=clamp(vUv-uDt*velocity,vec2(.001),vec2(.999));fragColor=texture(uSource,coord)*uDissipation;}`),
      curl: createProgram(gl, vertex, `${header}
        uniform sampler2D uVelocity; uniform vec2 uTexel;
        void main(){float l=texture(uVelocity,vUv-vec2(uTexel.x,0)).y;float r=texture(uVelocity,vUv+vec2(uTexel.x,0)).y;float b=texture(uVelocity,vUv-vec2(0,uTexel.y)).x;float t=texture(uVelocity,vUv+vec2(0,uTexel.y)).x;fragColor=vec4(.5*(r-l-t+b),0,0,1);}`),
      vorticity: createProgram(gl, vertex, `${header}
        uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform vec2 uTexel; uniform float uDt; uniform float uStrength; uniform float uTime;
        void main(){
          float l=abs(texture(uCurl,vUv-vec2(uTexel.x,0)).x);float r=abs(texture(uCurl,vUv+vec2(uTexel.x,0)).x);
          float b=abs(texture(uCurl,vUv-vec2(0,uTexel.y)).x);float t=abs(texture(uCurl,vUv+vec2(0,uTexel.y)).x);
          float c=texture(uCurl,vUv).x;vec2 force=.5*vec2(t-b,r-l);force/=length(force)+.0001;force*=uStrength*c;
          vec2 ambient=vec2(sin(vUv.y*17.0+uTime*.21)+cos(vUv.y*7.0-uTime*.13),-cos(vUv.x*13.0-uTime*.18)+sin(vUv.x*5.0+uTime*.11))*.00042;
          vec2 velocity=texture(uVelocity,vUv).xy+force*uDt+ambient*uDt;
          fragColor=vec4(clamp(velocity,vec2(-2.0),vec2(2.0)),0,1);
        }`),
      divergence: createProgram(gl, vertex, `${header}
        uniform sampler2D uVelocity; uniform vec2 uTexel;
        void main(){vec2 l=texture(uVelocity,vUv-vec2(uTexel.x,0)).xy;vec2 r=texture(uVelocity,vUv+vec2(uTexel.x,0)).xy;vec2 b=texture(uVelocity,vUv-vec2(0,uTexel.y)).xy;vec2 t=texture(uVelocity,vUv+vec2(0,uTexel.y)).xy;fragColor=vec4(.5*(r.x-l.x+t.y-b.y),0,0,1);}`),
      pressure: createProgram(gl, vertex, `${header}
        uniform sampler2D uPressure; uniform sampler2D uDivergence; uniform vec2 uTexel;
        void main(){float l=texture(uPressure,vUv-vec2(uTexel.x,0)).x;float r=texture(uPressure,vUv+vec2(uTexel.x,0)).x;float b=texture(uPressure,vUv-vec2(0,uTexel.y)).x;float t=texture(uPressure,vUv+vec2(0,uTexel.y)).x;float d=texture(uDivergence,vUv).x;fragColor=vec4((l+r+b+t-d)*.25,0,0,1);}`),
      gradient: createProgram(gl, vertex, `${header}
        uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 uTexel;
        void main(){float l=texture(uPressure,vUv-vec2(uTexel.x,0)).x;float r=texture(uPressure,vUv+vec2(uTexel.x,0)).x;float b=texture(uPressure,vUv-vec2(0,uTexel.y)).x;float t=texture(uPressure,vUv+vec2(0,uTexel.y)).x;vec2 velocity=texture(uVelocity,vUv).xy-.5*vec2(r-l,t-b);fragColor=vec4(velocity,0,1);}`),
      display: createProgram(gl, vertex, `${header}
        uniform sampler2D uDye; uniform vec2 uTexel; uniform float uDark; uniform float uIntensity;
        void main(){
          float d=texture(uDye,vUv).x;float l=texture(uDye,vUv-vec2(uTexel.x,0)).x;float r=texture(uDye,vUv+vec2(uTexel.x,0)).x;
          float b=texture(uDye,vUv-vec2(0,uTexel.y)).x;float t=texture(uDye,vUv+vec2(0,uTexel.y)).x;
          float edge=smoothstep(.02,.16,length(vec2(r-l,t-b)));float density=1.0-exp(-max(d,0.0)*1.08);
          vec3 ink=mix(vec3(.025,.03,.025),vec3(.76,.78,.74),uDark);vec3 lime=vec3(.851,1.0,.263);
          vec3 color=mix(ink,lime,edge*(.3+.16*density));float alpha=density*mix(.48,.4,uDark)*uIntensity;
          fragColor=vec4(color,alpha);
        }`)
    };
    this.resize();
  }

  dimensions(base) {
    const aspect = innerWidth / Math.max(1, innerHeight);
    return aspect >= 1 ? [Math.round(base * aspect), base] : [base, Math.round(base / aspect)];
  }

  createTarget(width, height, filter = this.gl.LINEAR) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Fluid framebuffer incomplete');
    return { texture, fbo, width, height };
  }

  createPair(width, height, filter) {
    const pair = { read: this.createTarget(width, height, filter), write: this.createTarget(width, height, filter) };
    pair.swap = () => { const current = pair.read; pair.read = pair.write; pair.write = current; };
    return pair;
  }

  disposeTarget(target) {
    if (!target) return;
    this.gl.deleteTexture(target.texture);
    this.gl.deleteFramebuffer(target.fbo);
  }

  resize() {
    const width = Math.max(1, Math.round(innerWidth * Math.min(devicePixelRatio || 1, this.profile.dpr)));
    const height = Math.max(1, Math.round(innerHeight * Math.min(devicePixelRatio || 1, this.profile.dpr)));
    if (this.canvas.width === width && this.canvas.height === height && this.velocity) return;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.velocity) {
      [this.velocity.read, this.velocity.write, this.dye.read, this.dye.write, this.pressure.read, this.pressure.write, this.divergence, this.curl].forEach((target) => this.disposeTarget(target));
    }
    const [simWidth, simHeight] = this.dimensions(this.profile.sim);
    const [dyeWidth, dyeHeight] = this.dimensions(this.profile.dye);
    this.velocity = this.createPair(simWidth, simHeight, this.gl.LINEAR);
    this.dye = this.createPair(dyeWidth, dyeHeight, this.gl.LINEAR);
    this.pressure = this.createPair(simWidth, simHeight, this.gl.NEAREST);
    this.divergence = this.createTarget(simWidth, simHeight, this.gl.NEAREST);
    this.curl = this.createTarget(simWidth, simHeight, this.gl.NEAREST);
    this.simTexel = [1 / simWidth, 1 / simHeight];
    this.dyeTexel = [1 / dyeWidth, 1 / dyeHeight];
    this.clear();
  }

  use(program, destination, width, height) {
    const gl = this.gl;
    gl.useProgram(program.handle);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
    gl.viewport(0, 0, width, height);
  }

  bind(target, unit, location) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.uniform1i(location, unit);
  }

  draw() { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); }

  clearPair(pair) {
    const gl = this.gl;
    const program = this.programs.clear;
    for (let index = 0; index < 2; index += 1) {
      this.use(program, pair.write.fbo, pair.write.width, pair.write.height);
      this.bind(pair.read, 0, program.uniforms.uTexture);
      gl.uniform1f(program.uniforms.uValue, 0);
      this.draw();
      pair.swap();
    }
  }

  clear() {
    this.clearPair(this.velocity);
    this.clearPair(this.dye);
    this.clearPair(this.pressure);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergence.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.curl.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  splat(x, y, dx, dy, amount = 1, radius = .0028) {
    const gl = this.gl;
    const program = this.programs.splat;
    const aspect = innerWidth / Math.max(1, innerHeight);
    this.use(program, this.velocity.write.fbo, this.velocity.write.width, this.velocity.write.height);
    this.bind(this.velocity.read, 0, program.uniforms.uTarget);
    gl.uniform2f(program.uniforms.uPoint, x, y);
    gl.uniform4f(program.uniforms.uValue, dx, dy, 0, 0);
    gl.uniform1f(program.uniforms.uRadius, radius);
    gl.uniform1f(program.uniforms.uAspect, aspect);
    this.draw();
    this.velocity.swap();
    this.use(program, this.dye.write.fbo, this.dye.write.width, this.dye.write.height);
    this.bind(this.dye.read, 0, program.uniforms.uTarget);
    gl.uniform2f(program.uniforms.uPoint, x, y);
    gl.uniform4f(program.uniforms.uValue, amount, 0, 0, 0);
    gl.uniform1f(program.uniforms.uRadius, radius * 1.45);
    gl.uniform1f(program.uniforms.uAspect, aspect);
    this.draw();
    this.dye.swap();
  }

  bloom(x, y, intensity = 1) {
    this.splat(x, y, 0, 0, 1.1 * intensity, .0065);
    for (let index = 0; index < 7; index += 1) {
      const angle = index / 7 * Math.PI * 2;
      this.splat(x + Math.cos(angle) * .011, y + Math.sin(angle) * .011, Math.cos(angle) * .25, Math.sin(angle) * .25, .1 * intensity, .0016);
    }
  }

  step(dt, time, dark, intensity) {
    const gl = this.gl;
    const texel = this.simTexel;
    let program = this.programs.advect;
    this.use(program, this.velocity.write.fbo, this.velocity.write.width, this.velocity.write.height);
    this.bind(this.velocity.read, 0, program.uniforms.uVelocity);
    this.bind(this.velocity.read, 1, program.uniforms.uSource);
    gl.uniform1f(program.uniforms.uDt, dt);
    gl.uniform1f(program.uniforms.uDissipation, Math.pow(.992, dt * 60));
    this.draw();
    this.velocity.swap();

    program = this.programs.curl;
    this.use(program, this.curl.fbo, this.curl.width, this.curl.height);
    this.bind(this.velocity.read, 0, program.uniforms.uVelocity);
    gl.uniform2f(program.uniforms.uTexel, ...texel);
    this.draw();

    program = this.programs.vorticity;
    this.use(program, this.velocity.write.fbo, this.velocity.write.width, this.velocity.write.height);
    this.bind(this.velocity.read, 0, program.uniforms.uVelocity);
    this.bind(this.curl, 1, program.uniforms.uCurl);
    gl.uniform2f(program.uniforms.uTexel, ...texel);
    gl.uniform1f(program.uniforms.uDt, dt);
    gl.uniform1f(program.uniforms.uStrength, this.profile.mobile ? 7 : 10);
    gl.uniform1f(program.uniforms.uTime, time);
    this.draw();
    this.velocity.swap();

    program = this.programs.divergence;
    this.use(program, this.divergence.fbo, this.divergence.width, this.divergence.height);
    this.bind(this.velocity.read, 0, program.uniforms.uVelocity);
    gl.uniform2f(program.uniforms.uTexel, ...texel);
    this.draw();

    program = this.programs.clear;
    this.use(program, this.pressure.write.fbo, this.pressure.write.width, this.pressure.write.height);
    this.bind(this.pressure.read, 0, program.uniforms.uTexture);
    gl.uniform1f(program.uniforms.uValue, .78);
    this.draw();
    this.pressure.swap();

    program = this.programs.pressure;
    for (let index = 0; index < this.iterations; index += 1) {
      this.use(program, this.pressure.write.fbo, this.pressure.write.width, this.pressure.write.height);
      this.bind(this.pressure.read, 0, program.uniforms.uPressure);
      this.bind(this.divergence, 1, program.uniforms.uDivergence);
      gl.uniform2f(program.uniforms.uTexel, ...texel);
      this.draw();
      this.pressure.swap();
    }

    program = this.programs.gradient;
    this.use(program, this.velocity.write.fbo, this.velocity.write.width, this.velocity.write.height);
    this.bind(this.pressure.read, 0, program.uniforms.uPressure);
    this.bind(this.velocity.read, 1, program.uniforms.uVelocity);
    gl.uniform2f(program.uniforms.uTexel, ...texel);
    this.draw();
    this.velocity.swap();

    program = this.programs.advect;
    this.use(program, this.dye.write.fbo, this.dye.write.width, this.dye.write.height);
    this.bind(this.velocity.read, 0, program.uniforms.uVelocity);
    this.bind(this.dye.read, 1, program.uniforms.uSource);
    gl.uniform1f(program.uniforms.uDt, dt);
    gl.uniform1f(program.uniforms.uDissipation, Math.pow(.9945, dt * 60));
    this.draw();
    this.dye.swap();

    program = this.programs.display;
    this.use(program, null, this.canvas.width, this.canvas.height);
    this.bind(this.dye.read, 0, program.uniforms.uDye);
    gl.uniform2f(program.uniforms.uTexel, ...this.dyeTexel);
    gl.uniform1f(program.uniforms.uDark, dark);
    gl.uniform1f(program.uniforms.uIntensity, intensity);
    this.draw();
  }

  degrade() { this.iterations = Math.max(5, this.iterations - 2); }
}

class CanvasFluidRenderer {
  constructor(canvas, profile) {
    this.canvas = canvas;
    this.profile = profile;
    this.context = canvas.getContext('2d', { alpha: true });
    this.particles = [];
    this.resize();
  }

  resize() {
    this.canvas.width = Math.max(1, Math.round(innerWidth * this.profile.scale));
    this.canvas.height = Math.max(1, Math.round(innerHeight * this.profile.scale));
  }

  clear() {
    this.particles.length = 0;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  splat(x, y, dx, dy, amount = 1, radius = .003) {
    const count = Math.max(2, Math.round(5 * amount));
    for (let index = 0; index < count; index += 1) {
      if (this.particles.length >= this.profile.particles) this.particles.shift();
      this.particles.push({
        x: x * this.canvas.width,
        y: (1 - y) * this.canvas.height,
        vx: dx * this.canvas.width * .17 + (Math.random() - .5) * .25,
        vy: -dy * this.canvas.height * .17 + (Math.random() - .5) * .25,
        size: (14 + Math.random() * 22) * (1 + radius * 26),
        life: 1,
        seed: Math.random() * 10
      });
    }
  }

  bloom(x, y, intensity = 1) {
    this.splat(x, y, 0, 0, 1.8 * intensity, .008);
    for (let index = 0; index < 6; index += 1) {
      const angle = index / 6 * Math.PI * 2;
      this.splat(x, y, Math.cos(angle) * .25, Math.sin(angle) * .25, .25 * intensity, .003);
    }
  }

  step(dt, time, dark, intensity) {
    const context = this.context;
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.clearRect(0, 0, width, height);
    for (const particle of this.particles) {
      const angle = Math.sin(particle.y * .018 + time * .55 + particle.seed) + Math.cos(particle.x * .014 - time * .42);
      particle.vx += Math.cos(angle) * dt * 6;
      particle.vy += Math.sin(angle) * dt * 6;
      particle.vx *= .992;
      particle.vy *= .992;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= dt * .115;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0 && particle.x > -90 && particle.x < width + 90 && particle.y > -90 && particle.y < height + 90);
    context.filter = `blur(${this.profile.mobile ? 6 : 9}px)`;
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life) * .17 * intensity;
      const size = particle.size * (1.15 + (1 - particle.life) * .8);
      context.beginPath();
      context.arc(particle.x, particle.y, size * 1.18, 0, Math.PI * 2);
      context.fillStyle = `rgba(217,255,67,${alpha * .48})`;
      context.fill();
      context.beginPath();
      context.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      context.fillStyle = dark > .5 ? `rgba(198,202,193,${alpha})` : `rgba(12,14,12,${alpha})`;
      context.fill();
    }
    context.filter = 'none';
  }

  degrade() {
    this.profile.particles = Math.max(34, Math.round(this.profile.particles * .75));
  }
}

function createFluidEffect({ canvas, onStatus = () => {} } = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Fluid canvas is required');
  const profile = detectFluidProfile();
  let renderer;
  let rendererName;
  try {
    if (profile.renderer === 'canvas') throw new Error('Lightweight profile selected');
    renderer = new WebGLFluidRenderer(canvas, profile);
    rendererName = 'GPU';
  } catch (error) {
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    const fallbackProfile = profile.renderer === 'canvas' ? profile : { level: 'lite', renderer: 'canvas', mobile: profile.mobile, fps: Math.min(22, profile.fps), scale: profile.mobile ? .38 : .52, particles: profile.mobile ? 52 : 90, ambient: 2.1 };
    renderer = new CanvasFluidRenderer(canvas, fallbackProfile);
    Object.assign(profile, fallbackProfile);
    rendererName = 'LITE';
  }

  const abortController = new AbortController();
  const signal = abortController.signal;
  const queue = [];
  let enabled = true;
  let raf = 0;
  let lastFrame = performance.now();
  let lastRender = 0;
  let ambientClock = 0;
  let pointer = null;
  let theme = 0;
  let targetTheme = 0;
  let intensity = 1;
  let targetIntensity = 1;
  let themeDirty = true;
  let slowFrames = 0;
  let downgraded = false;

  canvas.dataset.fluidProfile = profile.level;
  canvas.dataset.fluidRenderer = rendererName.toLowerCase();
  canvas.classList.add('fluid-ready');
  onStatus({ profile: profile.level, renderer: rendererName, fps: profile.fps });

  const interactiveSelector = 'a,button,input,select,textarea,[role="button"],[data-preview-src]';
  const isInteractive = (target) => target instanceof Element && Boolean(target.closest(interactiveSelector));
  const localIntensity = (target) => {
    const zone = target instanceof Element ? target.closest('[data-fluid-intensity]') : null;
    return clamp(Number(zone?.dataset.fluidIntensity || 1), .35, 1);
  };

  function refreshTheme() {
    themeDirty = false;
    const element = document.elementFromPoint(innerWidth * .5, innerHeight * .5);
    const section = element?.closest('[data-fluid-theme]');
    targetTheme = section?.dataset.fluidTheme === 'dark' ? 1 : 0;
    targetIntensity = clamp(Number(section?.dataset.fluidIntensity || 1), .35, 1);
    canvas.dataset.fluidTheme = targetTheme > .5 ? 'dark' : 'light';
  }

  function addAmbient(time) {
    if (time - ambientClock < profile.ambient) return;
    ambientClock = time;
    const side = Math.floor(Math.random() * 4);
    let x; let y; let dx; let dy;
    if (side === 0) { x = .012; y = .16 + Math.random() * .68; dx = .1 + Math.random() * .07; dy = (Math.random() - .5) * .05; }
    else if (side === 1) { x = .988; y = .16 + Math.random() * .68; dx = -(.1 + Math.random() * .07); dy = (Math.random() - .5) * .05; }
    else if (side === 2) { x = .16 + Math.random() * .68; y = .012; dx = (Math.random() - .5) * .05; dy = .1 + Math.random() * .05; }
    else { x = .16 + Math.random() * .68; y = .988; dx = (Math.random() - .5) * .05; dy = -(.1 + Math.random() * .05); }
    queue.push({ type: 'splat', x, y, dx, dy, amount: .11 + Math.random() * .06, radius: .0024 });
  }

  function consumeInputs() {
    const limit = profile.mobile ? 3 : 6;
    for (let index = 0; index < limit && queue.length; index += 1) {
      const input = queue.shift();
      if (input.type === 'bloom') renderer.bloom(input.x, input.y, input.intensity);
      else renderer.splat(input.x, input.y, input.dx, input.dy, input.amount, input.radius);
    }
    if (queue.length > 16) queue.splice(0, queue.length - 16);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const interval = 1000 / profile.fps;
    if (now - lastRender < interval) return;
    const elapsed = now - lastRender;
    lastRender = now;
    const dt = clamp((now - lastFrame) / 1000, .001, profile.mobile ? .04 : .025);
    lastFrame = now;
    if (themeDirty) refreshTheme();
    theme += (targetTheme - theme) * Math.min(1, dt * 2.4);
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 2.4);
    addAmbient(now / 1000);
    consumeInputs();
    renderer.step(dt, now / 1000, theme, intensity);
    if (elapsed > interval * 1.85) slowFrames += 1;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (!downgraded && slowFrames > 45) {
      downgraded = true;
      profile.fps = Math.max(18, profile.fps - (profile.mobile ? 5 : 12));
      renderer.degrade();
      canvas.dataset.fluidProfile = `${profile.level}-adaptive`;
      onStatus({ profile: `${profile.level}-adaptive`, renderer: rendererName, fps: profile.fps });
    }
  }

  function canRun() {
    return enabled && !document.hidden && !document.body.classList.contains('menu-open') && !document.body.classList.contains('modal-open');
  }

  function start() {
    if (raf || !canRun()) return;
    lastFrame = performance.now();
    lastRender = 0;
    raf = requestAnimationFrame(frame);
    canvas.classList.add('fluid-ready');
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function syncActivity() {
    if (canRun()) start();
    else stop();
  }

  function recordMove(clientX, clientY, target, isTouch = false) {
    const x = clientX / innerWidth;
    const y = 1 - clientY / innerHeight;
    const strength = localIntensity(target);
    if (pointer) {
      const dx = clamp((clientX - pointer.x) / innerWidth * 4.6, -.75, .75);
      const dy = clamp((pointer.y - clientY) / innerHeight * 4.6, -.75, .75);
      const distance = Math.hypot(clientX - pointer.x, clientY - pointer.y);
      if (distance > (isTouch ? 5 : 2)) {
        queue.push({ type: 'splat', x, y, dx, dy, amount: clamp(distance / 74, .1, .55) * strength, radius: isTouch ? .0042 : .0027 });
      }
    }
    pointer = { x: clientX, y: clientY };
  }

  addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    recordMove(event.clientX, event.clientY, event.target, false);
  }, { passive: true, signal });
  addEventListener('touchmove', (event) => {
    const touch = event.touches[0];
    if (touch) recordMove(touch.clientX, touch.clientY, event.target, true);
  }, { passive: true, signal });
  addEventListener('pointerup', () => { pointer = null; }, { passive: true, signal });
  addEventListener('pointercancel', () => { pointer = null; }, { passive: true, signal });
  addEventListener('click', (event) => {
    if (isInteractive(event.target)) return;
    const strength = localIntensity(event.target);
    queue.push({ type: 'bloom', x: event.clientX / innerWidth, y: 1 - event.clientY / innerHeight, intensity: strength });
  }, { passive: true, signal });
  addEventListener('scroll', () => { themeDirty = true; pointer = null; }, { passive: true, signal });
  addEventListener('resize', () => { renderer.resize(); themeDirty = true; }, { passive: true, signal });
  document.addEventListener('visibilitychange', syncActivity, { signal });
  const bodyObserver = new MutationObserver(syncActivity);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  queue.push(
    { type: 'splat', x: .02, y: .28, dx: .18, dy: .04, amount: .28, radius: .0035 },
    { type: 'splat', x: .98, y: .7, dx: -.17, dy: -.03, amount: .25, radius: .0035 }
  );
  start();

  return {
    get profile() { return { ...profile, renderer: rendererName }; },
    setEnabled(value) {
      enabled = Boolean(value);
      canvas.classList.toggle('fluid-disabled', !enabled);
      syncActivity();
    },
    clear() { queue.length = 0; renderer.clear(); },
    destroy() {
      stop();
      abortController.abort();
      bodyObserver.disconnect();
      renderer.clear();
    }
  };
}

window.HJRFluid = { createFluidEffect, detectFluidProfile };
})();
