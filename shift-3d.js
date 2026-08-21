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

  Renderer.prototype.resize = function (W, H, f) {
    this.W = W; this.H = H; this.f = f;
  };
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

  // Sutherland-Hodgman against the near plane (view z > NEAR). Vertices are
  // [x, y, z, u, v]; texture coordinates interpolate through the clip so a
  // wall right beside the camera still maps its texture instead of
  // collapsing into a flat color slab.
  function clipNear(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ain = a[2] > NEAR, bin = b[2] > NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        const t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([
          a[0] + (b[0] - a[0]) * t,
          a[1] + (b[1] - a[1]) * t,
          NEAR + 0.0001,
          a[3] + (b[3] - a[3]) * t,
          a[4] + (b[4] - a[4]) * t,
        ]);
      }
    }
    return out;
  }

  // quad: 4 world points (in texture order: (0,0),(w,0),(w,h),(0,h)),
  // color string, opts {alpha, tex (canvas), bias, dim, noSub}
  //
  // Large flat-color quads are subdivided into tiles before sorting: a big
  // surface sorted by its average depth will fight the small objects that
  // stand on it, and tiles make the painter's sort behave like real depth.
  const SUB = 1.25; // max tile edge in meters
  function lerp3(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  Renderer.prototype.quad = function (pts, color, opts) {
    opts = opts || {};
    if (!opts.noSub) {
      const eu = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
      const ev = Math.hypot(pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]);
      let step = opts.tex ? SUB * 1.4 : SUB;
      if (opts.tex) {
        // affine texture mapping warps when a quad spans a wide depth range;
        // subdivide harder as the near/far ratio grows so the mapping stays
        // visually perspective-correct
        let zMin = 1e9, zMax = 0;
        for (const p of pts) {
          const z = (p[0] - this.cam.x) * this.sy + (p[2] - this.cam.z) * this.cy;
          if (z > zMax) zMax = z;
          if (z < zMin) zMin = z;
        }
        const ratio = zMax / Math.max(0.4, zMin);
        if (ratio > 1.3) step /= Math.min(4, ratio);
      }
      const nu = Math.min(14, Math.ceil(eu / step)), nv = Math.min(14, Math.ceil(ev / step));
      if (nu > 1 || nv > 1) {
        for (let i = 0; i < nu; i++) {
          for (let j = 0; j < nv; j++) {
            const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
            const tile = [
              lerp3(lerp3(pts[0], pts[1], u0), lerp3(pts[3], pts[2], u0), v0),
              lerp3(lerp3(pts[0], pts[1], u1), lerp3(pts[3], pts[2], u1), v0),
              lerp3(lerp3(pts[0], pts[1], u1), lerp3(pts[3], pts[2], u1), v1),
              lerp3(lerp3(pts[0], pts[1], u0), lerp3(pts[3], pts[2], u0), v1),
            ];
            this._quad1(tile, color, opts, [u0, v0, u1, v1]);
          }
        }
        return;
      }
    }
    this._quad1(pts, color, opts, [0, 0, 1, 1]);
  };
  Renderer.prototype._quad1 = function (pts, color, opts, uv) {
    // vertices carry uv so near-plane clipping keeps textures mapped
    const cu = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    const v = pts.map((p, i) => {
      const t = this.toView(p);
      return [t[0], t[1], t[2], cu[i][0], cu[i][1]];
    });
    if (v[0][2] <= NEAR && v[1][2] <= NEAR && v[2][2] <= NEAR && v[3][2] <= NEAR) return;
    const clipped = (v[0][2] > NEAR && v[1][2] > NEAR && v[2][2] > NEAR && v[3][2] > NEAR) ? v : clipNear(v);
    if (clipped.length < 3) return;
    let depth = 0;
    for (const p of clipped) depth += p[2];
    depth /= clipped.length;
    const spts = clipped.map((p) => {
      const s = this.project(p);
      return [s[0], s[1], p[3], p[4]];
    });
    // skip prims entirely outside the viewport
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of spts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    if (maxX < -60 || minX > this.W + 60 || maxY < -60 || minY > this.H + 60) return;
    this.prims.push({
      k: "q",
      s: spts,
      depth: depth + (opts.bias || 0),
      seq: this.seq++,
      color: color,
      alpha: opts.alpha, tex: opts.tex, dim: opts.dim || 0,
    });
  };

  // darkness is blended straight into the fill color, so adjacent tiles
  // never double-darken along their antialiased edges
  const dimCache = {};
  function dimColor(color, dim) {
    const key = color + "|" + dim;
    let out = dimCache[key];
    if (out) return out;
    let r = 128, g = 128, b = 128;
    if (color[0] === "#") {
      const c = parse(color);
      r = c[0]; g = c[1]; b = c[2];
    } else {
      const m = color.match(/(\d+)[, ]+(\d+)[, ]+(\d+)/);
      if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    }
    const k = 1 - dim;
    out = "rgb(" + Math.round(r * k + 6 * dim) + "," + Math.round(g * k + 12 * dim) + "," + Math.round(b * k + 18 * dim) + ")";
    dimCache[key] = out;
    return out;
  }

  // billboard: world anchor (feet), draw(ctx, sx, sy, scale) with scale =
  // screen pixels per world meter at that depth.
  Renderer.prototype.billboard = function (x, y, z, draw, bias, dim) {
    const v = this.toView([x, y, z]);
    // don't hard-cull at the near plane: an item right beside the camera
    // should slide off the screen edge, not blink out as you turn. The
    // projection uses the true depth (so it leaves the frame naturally)
    // while the draw scale is bounded so nothing explodes.
    if (v[2] <= 0.04) return;
    const zp = Math.max(v[2], 0.06);
    const s = [this.W / 2 + (this.f * v[0]) / zp, this.H / 2 - (this.f * v[1]) / zp];
    if (s[0] < -this.W || s[0] > this.W * 2 || s[1] < -this.H || s[1] > this.H * 2) return;
    this.prims.push({ k: "b", sx: s[0], sy: s[1], scale: this.f / Math.max(v[2], 0.3), depth: v[2] + (bias || 0), seq: this.seq++, draw: draw, dim: dim || 0 });
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
    // camera moves. Transparent quads render in their own second pass so
    // glass never depth-fights opaque geometry.
    this.prims.sort((a, b) => (b.depth - a.depth) || (a.seq - b.seq));
    for (const p of this.prims) {
      if (p.k === "q" && p.alpha !== undefined) continue;
      this._drawPrim(ctx, p);
    }
    for (const p of this.prims) {
      if (!(p.k === "q" && p.alpha !== undefined)) continue;
      this._drawPrim(ctx, p);
    }
  };
  Renderer.prototype._drawPrim = function (ctx, p) {
    {
      if (p.k === "b") {
        if (p.dim) ctx.filter = "brightness(" + (1 - p.dim * 0.8).toFixed(2) + ")";
        p.draw(ctx, p.sx, p.sy, p.scale);
        if (p.dim) ctx.filter = "none";
        return;
      }
      if (p.tex) {
        const w = p.tex.width, h = p.tex.height;
        const s = p.s;
        if (p.dim) ctx.filter = "brightness(" + (1 - p.dim * 0.82).toFixed(2) + ")";
        for (let i = 1; i < s.length - 1; i++) {
          texTri(ctx, p.tex, s[0], s[i], s[i + 1],
            s[0][2] * w, s[0][3] * h, s[i][2] * w, s[i][3] * h, s[i + 1][2] * w, s[i + 1][3] * h);
        }
        if (p.dim) ctx.filter = "none";
      } else {
        const col = p.dim ? dimColor(p.color, p.dim) : p.color;
        ctx.beginPath();
        ctx.moveTo(p.s[0][0], p.s[0][1]);
        for (let i = 1; i < p.s.length; i++) ctx.lineTo(p.s[i][0], p.s[i][1]);
        ctx.closePath();
        if (p.alpha !== undefined) ctx.globalAlpha = p.alpha;
        ctx.fillStyle = col;
        ctx.fill();
        if (p.alpha === undefined) {
          // hairline stroke in the fill color papers over sub-pixel seams
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.globalAlpha = 1;
        }
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
