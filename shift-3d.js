// The Shift — tiny software 3D renderer. No libraries: axis-ish quads and
// billboards projected through a perspective camera, painter-sorted, drawn
// on a plain 2D canvas. Units are meters; +z runs into the store.
(function () {
  const NEAR = 0.14;

  // ---- color helpers -----------------------------------------------------
  const colCache = {};
  function parse(hex) {
    let c = colCache[hex];
    if (!c) {
      c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      colCache[hex] = c;
    }
    return c;
  }
  function shade(hex, k, alpha) {
    const c = parse(hex);
    const r = Math.max(0, Math.min(255, Math.round(c[0] * k)));
    const g = Math.max(0, Math.min(255, Math.round(c[1] * k)));
    const b = Math.max(0, Math.min(255, Math.round(c[2] * k)));
    return alpha !== undefined
      ? "rgba(" + r + "," + g + "," + b + "," + alpha + ")"
      : "rgb(" + r + "," + g + "," + b + ")";
  }

  function Renderer(ctx, W, H, fovDeg) {
    this.ctx = ctx; this.W = W; this.H = H;
    this.f = (H / 2) / Math.tan(((fovDeg || 64) * Math.PI) / 360);
    this.cam = { x: 0, y: 1.55, z: 1.5, yaw: 0, pitch: -0.08 };
    this.prims = [];
    this.seq = 0;
  }

  // average color of a texture canvas, for when a clipped quad can't map it
  function texAvg(tex) {
    if (tex.__avg) return tex.__avg;
    const t = document.createElement("canvas");
    t.width = 1; t.height = 1;
    const c = t.getContext("2d");
    c.drawImage(tex, 0, 0, 1, 1);
    const d = c.getImageData(0, 0, 1, 1).data;
    tex.__avg = "rgb(" + d[0] + "," + d[1] + "," + d[2] + ")";
    return tex.__avg;
  }

  Renderer.prototype.begin = function () {
    this.prims.length = 0;
    this.seq = 0;
    const c = this.cam;
    this.sy = Math.sin(c.yaw); this.cy = Math.cos(c.yaw);
    this.sp = Math.sin(c.pitch); this.cp = Math.cos(c.pitch);
  };

  Renderer.prototype.toView = function (p) {
    const c = this.cam;
    const dx = p[0] - c.x, dy = p[1] - c.y, dz = p[2] - c.z;
    const vx = dx * this.cy - dz * this.sy;
    const z1 = dx * this.sy + dz * this.cy;
    const vy = dy * this.cp - z1 * this.sp;
    const vz = dy * this.sp + z1 * this.cp;
    return [vx, vy, vz];
  };
  Renderer.prototype.project = function (v) {
    return [this.W / 2 + (this.f * v[0]) / v[2], this.H / 2 - (this.f * v[1]) / v[2]];
  };

  // Sutherland-Hodgman against the near plane (view z > NEAR).
  function clipNear(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ain = a[2] > NEAR, bin = b[2] > NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR + 0.0001]);
      }
    }
    return out;
  }

  // quad: 4 world points (in texture order: (0,0),(w,0),(w,h),(0,h)),
  // color string, opts {alpha, tex (canvas), bias, noCull}
  Renderer.prototype.quad = function (pts, color, opts) {
    opts = opts || {};
    const v = [this.toView(pts[0]), this.toView(pts[1]), this.toView(pts[2]), this.toView(pts[3])];
    if (v[0][2] <= NEAR && v[1][2] <= NEAR && v[2][2] <= NEAR && v[3][2] <= NEAR) return;
    const clipped = (v[0][2] > NEAR && v[1][2] > NEAR && v[2][2] > NEAR && v[3][2] > NEAR) ? v : clipNear(v);
    if (clipped.length < 3) return;
    let depth = 0;
    for (const p of clipped) depth += p[2];
    depth /= clipped.length;
    const wasClipped = clipped !== v;
    this.prims.push({
      k: "q",
      s: clipped.map((p) => this.project(p)),
      full: wasClipped ? null : v.map((p) => this.project(p)),
      depth: depth + (opts.bias || 0),
      seq: this.seq++,
      // a clipped textured quad can't be affine-mapped; fall back to the
      // texture's average color instead of flashing black
      color: opts.tex && wasClipped ? texAvg(opts.tex) : color,
      alpha: opts.alpha, tex: opts.tex, dim: opts.dim || 0,
    });
  };

  // billboard: world anchor (feet), draw(ctx, sx, sy, scale) with scale =
  // screen pixels per world meter at that depth.
  Renderer.prototype.billboard = function (x, y, z, draw, bias, dim) {
    const v = this.toView([x, y, z]);
    if (v[2] <= NEAR) return;
    const s = this.project(v);
    this.prims.push({ k: "b", sx: s[0], sy: s[1], scale: this.f / v[2], depth: v[2] + (bias || 0), seq: this.seq++, draw: draw, dim: dim || 0 });
  };

  // axis-aligned box; emits only the faces the camera can see.
  // colors: {px, nx, pz, nz, top, bot} hex or single hex.
  Renderer.prototype.box = function (x0, y0, z0, x1, y1, z1, colors, opts) {
    opts = opts || {};
    const c = typeof colors === "string" ? { all: colors } : colors;
    const cam = this.cam;
    const face = (id) => c[id] || c.all;
    if (cam.x > x1 && face("px")) this.quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], face("px"), opts);
    if (cam.x < x0 && face("nx")) this.quad([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], face("nx"), opts);
    if (cam.z > z1 && face("pz")) this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], face("pz"), opts);
    if (cam.z < z0 && face("nz")) this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], face("nz"), opts);
    if (cam.y > y1 && face("top")) this.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], face("top"), opts);
    if (cam.y < y0 && face("bot")) this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], face("bot"), opts);
  };

  // horizontal textured surface: tex maps with u along +x, v along +z.
  Renderer.prototype.texTop = function (x0, z0, x1, z1, y, tex, opts) {
    this.quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], "#000",
      Object.assign({}, opts, { tex: tex }));
  };
  // vertical textured surface on a wall facing the given axis direction.
  // dir: "nx" faces -x, "px" faces +x, "nz" faces -z, "pz" faces +z.
  Renderer.prototype.texWall = function (dir, fixed, a0, y0, a1, y1, tex, opts) {
    opts = Object.assign({}, opts, { tex: tex });
    let pts;
    // texture u runs viewer-left to viewer-right for each facing direction
    // (the camera's right vector is (cos yaw, -sin yaw), so facing +x puts
    // -z on screen-right, and facing +z puts +x on screen-right)
    if (dir === "nx") pts = [[fixed, y1, a1], [fixed, y1, a0], [fixed, y0, a0], [fixed, y0, a1]];
    else if (dir === "px") pts = [[fixed, y1, a0], [fixed, y1, a1], [fixed, y0, a1], [fixed, y0, a0]];
    else if (dir === "nz") pts = [[a0, y1, fixed], [a1, y1, fixed], [a1, y0, fixed], [a0, y0, fixed]];
    else pts = [[a1, y1, fixed], [a0, y1, fixed], [a0, y0, fixed], [a1, y0, fixed]];
    this.quad(pts, "#000", opts);
  };

  // inflate a triangle slightly about its centroid so the two halves of a
  // textured quad overlap instead of leaving a hairline seam
  function inflate(p0, p1, p2) {
    const cx = (p0[0] + p1[0] + p2[0]) / 3, cy = (p0[1] + p1[1] + p2[1]) / 3;
    const grow = (p) => {
      const dx = p[0] - cx, dy = p[1] - cy;
      const d = Math.hypot(dx, dy) || 1;
      return [p[0] + (dx / d) * 0.7, p[1] + (dy / d) * 0.7];
    };
    return [grow(p0), grow(p1), grow(p2)];
  }
  function texTri(ctx, img, p0, p1, p2, u0, v0, u1, v1, u2, v2) {
    const den = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (!den) return;
    const a = (p0[0] * (v1 - v2) + p1[0] * (v2 - v0) + p2[0] * (v0 - v1)) / den;
    const b = (p0[1] * (v1 - v2) + p1[1] * (v2 - v0) + p2[1] * (v0 - v1)) / den;
    const cc = (p0[0] * (u2 - u1) + p1[0] * (u0 - u2) + p2[0] * (u1 - u0)) / den;
    const d = (p0[1] * (u2 - u1) + p1[1] * (u0 - u2) + p2[1] * (u1 - u0)) / den;
    const e = (p0[0] * (u1 * v2 - u2 * v1) + p1[0] * (u2 * v0 - u0 * v2) + p2[0] * (u0 * v1 - u1 * v0)) / den;
    const f = (p0[1] * (u1 * v2 - u2 * v1) + p1[1] * (u2 * v0 - u0 * v2) + p2[1] * (u0 * v1 - u1 * v0)) / den;
    const g = inflate(p0, p1, p2);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g[0][0], g[0][1]); ctx.lineTo(g[1][0], g[1][1]); ctx.lineTo(g[2][0], g[2][1]);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, cc, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  Renderer.prototype.flush = function () {
    const ctx = this.ctx;
    // stable sort: equal depths keep emit order, so nothing flickers as the
    // camera moves
    this.prims.sort((a, b) => (b.depth - a.depth) || (a.seq - b.seq));
    for (const p of this.prims) {
      if (p.k === "b") {
        if (p.dim) ctx.filter = "brightness(" + (1 - p.dim * 0.8).toFixed(2) + ")";
        p.draw(ctx, p.sx, p.sy, p.scale);
        if (p.dim) ctx.filter = "none";
        continue;
      }
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(p.s[0][0], p.s[0][1]);
        for (let i = 1; i < p.s.length; i++) ctx.lineTo(p.s[i][0], p.s[i][1]);
        ctx.closePath();
      };
      if (p.tex && p.full) {
        const w = p.tex.width, h = p.tex.height;
        texTri(ctx, p.tex, p.full[0], p.full[1], p.full[2], 0, 0, w, 0, w, h);
        texTri(ctx, p.tex, p.full[0], p.full[2], p.full[3], 0, 0, w, h, 0, h);
      } else {
        path();
        if (p.alpha !== undefined) ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fill();
        if (p.alpha === undefined) {
          // hairline stroke in the fill color papers over sub-pixel seams
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.globalAlpha = 1;
        }
      }
      if (p.dim) {
        path();
        ctx.fillStyle = "rgba(6,12,18," + p.dim + ")";
        ctx.fill();
      }
    }
  };

  // Screen point -> world ray {ox,oy,oz,dx,dy,dz}.
  Renderer.prototype.ray = function (mx, my) {
    const vx = (mx - this.W / 2) / this.f;
    const vy = -(my - this.H / 2) / this.f;
    const vz = 1;
    // inverse pitch then inverse yaw
    const y1 = vy * this.cp + vz * this.sp;
    const z1 = -vy * this.sp + vz * this.cp;
    const dx = vx * this.cy + z1 * this.sy;
    const dz = -vx * this.sy + z1 * this.cy;
    const len = Math.hypot(dx, y1, dz);
    const c = this.cam;
    return { ox: c.x, oy: c.y, oz: c.z, dx: dx / len, dy: y1 / len, dz: dz / len };
  };

  // Ray vs AABB (slab method); returns entry distance or null.
  function rayBox(r, b) {
    let tmin = 0, tmax = Infinity;
    const o = [r.ox, r.oy, r.oz], d = [r.dx, r.dy, r.dz];
    const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < lo[i] || o[i] > hi[i]) return null;
      } else {
        let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  window.Shift3D = { Renderer: Renderer, shade: shade, rayBox: rayBox, NEAR: NEAR };
})();
