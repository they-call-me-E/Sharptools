/*!
 * FlipBoard Editor — Color Picker Module
 * Extracted from the monolithic editor file.
 *
 * Requirements:
 * - The HTML must include the Color Picker modal markup (ids: fpColorBackdrop, fpSvCanvas, fpHue, fpAlpha, fpHex, fpFormat, fpR, fpG, fpB, fpA, fpSwatchRow, fpLiveOut, fpApply, fpCancel, fpColorClose, fpModeDot, fpModeText, fpPreview)
 * - The editor will call: window.ColorPickerModal.open({ target: <input>, default: "#FFFFFF", format: "HEX" })
 *
 * Notes:
 * - This file intentionally attaches a single global: window.ColorPickerModal
 * - No dependencies; safe to load via <script src="./color-picker.js"></script>
 */

(function(){
  const backdrop = document.getElementById('fpColorBackdrop');
  const btnClose = document.getElementById('fpColorClose');
  const btnCancel = document.getElementById('fpCancel');
  const btnApply = document.getElementById('fpApply');

  const modeDot  = document.getElementById('fpModeDot');
  const modeText = document.getElementById('fpModeText');
  const preview  = document.getElementById('fpPreview');

  const cv = document.getElementById('fpSvCanvas');
  const ctx = cv.getContext('2d');

  const hueEl = document.getElementById('fpHue');
  const alphaEl = document.getElementById('fpAlpha');

  const hexEl = document.getElementById('fpHex');
  const fmtEl = document.getElementById('fpFormat');
  const rEl = document.getElementById('fpR');
  const gEl = document.getElementById('fpG');
  const bEl = document.getElementById('fpB');
  const aEl = document.getElementById('fpA');

  const swatchRow = document.getElementById('fpSwatchRow');
  const liveOut = document.getElementById('fpLiveOut');

  let targetEl = null;
  let editRange = null;
  let lastPointerType = "mouse";

  let lastUsedRGBA = { r: 255, g: 255, b: 255, a: 1 };

  const state = { h: 210, s: 0.5, v: 0.8, a: 1.0 };
  const SWATCHES = ["#FFFFFF","#3FB1CE","#59A5FF","#FF6A3D","#494BCE","#00C48C","#FFC542","#FF3D71"];

  const clamp01 = (x)=> Math.max(0, Math.min(1, x));
  const clamp255 = (x)=> Math.max(0, Math.min(255, x|0));
  const clamp360 = (x)=> ((x % 360) + 360) % 360;
  const round2 = (x)=> Math.round(x*100)/100;

  function isWordChar(ch){
    return !!ch && /[A-Za-z0-9_]/.test(ch);
  }

  function rgbToHex(r,g,b){
    const h = (n)=> n.toString(16).padStart(2,'0').toUpperCase();
    return `#${h(clamp255(r))}${h(clamp255(g))}${h(clamp255(b))}`;
  }

  function extractStrictColorValueFromToken(rawToken){
    const t = String(rawToken).trim();
    const m = t.match(/^\{COLOR ([^}]+)\}$/i);
    return m ? m[1].trim() : null;
  }

  function hexToRgb(hex){
    let s = String(hex||"").trim();
    if(s.startsWith("{")) s = extractStrictColorValueFromToken(s) || s;
    if(!s.startsWith("#")) s = "#" + s;
    const m = s.match(/^#([0-9a-fA-F]{6})$/);
    if(!m) return null;
    const n = parseInt(m[1], 16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }

  function hsvToRgb(h,s,v){
    h = clamp360(h); s = clamp01(s); v = clamp01(v);
    const c = v*s;
    const x = c*(1 - Math.abs(((h/60)%2)-1));
    const m = v-c;
    let rp=0,gp=0,bp=0;
    if(h<60){rp=c;gp=x;}
    else if(h<120){rp=x;gp=c;}
    else if(h<180){gp=c;bp=x;}
    else if(h<240){gp=x;bp=c;}
    else if(h<300){rp=x;bp=c;}
    else {rp=c;bp=x;}
    return { r:Math.round((rp+m)*255), g:Math.round((gp+m)*255), b:Math.round((bp+m)*255) };
  }

  function rgbToHsv(r,g,b){
    r=clamp255(r)/255; g=clamp255(g)/255; b=clamp255(b)/255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
    let h=0;
    if(d===0) h=0;
    else if(max===r) h=60*(((g-b)/d)%6);
    else if(max===g) h=60*(((b-r)/d)+2);
    else h=60*(((r-g)/d)+4);
    if(h<0) h+=360;
    const s = max===0 ? 0 : d/max;
    return { h, s, v:max };
  }

  function isIntInRange(x, lo, hi){
    const n = Number(x);
    return Number.isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi;
  }
  function isFloatInRange(x, lo, hi){
    const n = Number(x);
    return Number.isFinite(n) && n >= lo && n <= hi;
  }

  function parseValueToRGBA(value){
    const s = String(value||"").trim();

    if(/^#([0-9a-fA-F]{6})$/.test(s)){
      const rgb = hexToRgb(s);
      return rgb ? { r: rgb.r, g: rgb.g, b: rgb.b, a: 1 } : null;
    }

    let m = s.match(/^RGB\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if(m){
      if(!isIntInRange(+m[1],0,255) || !isIntInRange(+m[2],0,255) || !isIntInRange(+m[3],0,255)) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: 1 };
    }

    m = s.match(/^RGBA\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d+)?)\s*\)$/i);
    if(m){
      if(!isIntInRange(+m[1],0,255) || !isIntInRange(+m[2],0,255) || !isIntInRange(+m[3],0,255)) return null;
      if(!isFloatInRange(+m[4],0,1)) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
    }

    return null;
  }

  const COLOR_TOKEN_RE = /\{COLOR [^}]+\}/g;

  function getAllStrictValidColorTokens(text){
    const out = [];
    COLOR_TOKEN_RE.lastIndex = 0;
    let m;
    while((m = COLOR_TOKEN_RE.exec(text)) !== null){
      const start = m.index;
      const end = start + m[0].length;
      const raw = m[0];
      const value = extractStrictColorValueFromToken(raw);
      const rgba = value ? parseValueToRGBA(value) : null;
      if(!rgba) continue;
      out.push({ start, end, raw, value, rgba });
    }
    return out;
  }

  function pickBestTokenForSelection(tokens, selStart, selEnd){
    const caret = (selStart === selEnd) ? selStart : selEnd;
    let best = null;
    let bestScore = null;

    for(const t of tokens){
      const intersects = !(t.end < selStart || t.start > selEnd);
      const caretInside = (selStart === selEnd) && caret >= t.start && caret <= t.end;
      const caretAfter  = (selStart === selEnd) && caret === t.end;
      if(!intersects && !caretInside && !caretAfter) continue;

      const priority = caretInside ? 0 : (intersects ? 1 : (caretAfter ? 2 : 3));
      const dist = (caret < t.start) ? (t.start - caret) : (caret > t.end ? (caret - t.end) : 0);
      const score = [priority, dist, t.start];

      if(!best || score[0] < bestScore[0] ||
        (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
        (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] > bestScore[2])){
        best = t;
        bestScore = score;
      }
    }
    return best;
  }

  function findActiveTokenOnLine(tokens, text, caretPos){
    const lineStart = text.lastIndexOf("\n", Math.max(0, caretPos - 1)) + 1;
    let best = null;
    for(const t of tokens){
      if(t.start < lineStart) continue;
      if(t.end <= caretPos){
        if(!best || t.start > best.start) best = t;
      }
    }
    return best;
  }

  function replaceRange(text, start, end, insert){
    return text.slice(0, start) + insert + text.slice(end);
  }

  function setMode(isEdit){
    modeText.textContent = isEdit ? "Edit" : "Insert";
    modeDot.classList.toggle("edit", !!isEdit);
  }

  function buildToken(){
    const rgb = hsvToRgb(state.h, state.s, state.v);
    const a = round2(clamp01(state.a));

    if (fmtEl.value === "HEX" && a < 1) {
      return `{COLOR RGBA(${rgb.r},${rgb.g},${rgb.b},${a})}`;
    }
    if (fmtEl.value === "RGB")  return `{COLOR RGB(${rgb.r},${rgb.g},${rgb.b})}`;
    if (fmtEl.value === "RGBA") return `{COLOR RGBA(${rgb.r},${rgb.g},${rgb.b},${a})}`;
    return `{COLOR ${rgbToHex(rgb.r,rgb.g,rgb.b)}}`;
  }

  function setRangeBackgrounds(){
    hueEl.style.background =
      "linear-gradient(to right,rgb(255,0,0),rgb(255,255,0),rgb(0,255,0),rgb(0,255,255),rgb(0,0,255),rgb(255,0,255),rgb(255,0,0))";
    const rgb = hsvToRgb(state.h,state.s,state.v);
    alphaEl.style.background = `linear-gradient(to right, rgba(${rgb.r},${rgb.g},${rgb.b},0), rgba(${rgb.r},${rgb.g},${rgb.b},1))`;
  }

  function drawSV(){
    const base = hsvToRgb(state.h,1,1);
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    ctx.fillRect(0,0,cv.width,cv.height);

    const w = ctx.createLinearGradient(0,0,cv.width,0);
    w.addColorStop(0,"rgba(255,255,255,1)");
    w.addColorStop(1,"rgba(255,255,255,0)");
    ctx.fillStyle = w; ctx.fillRect(0,0,cv.width,cv.height);

    const k = ctx.createLinearGradient(0,0,0,cv.height);
    k.addColorStop(0,"rgba(0,0,0,0)");
    k.addColorStop(1,"rgba(0,0,0,1)");
    ctx.fillStyle = k; ctx.fillRect(0,0,cv.width,cv.height);

    const x = Math.round(state.s * cv.width);
    const y = Math.round((1 - state.v) * cv.height);

    const ring = (lastPointerType === "touch") ? 13 : 10;
    const ring2 = ring + 2;

    ctx.beginPath();
    ctx.arc(x,y,ring,0,Math.PI*2);
    ctx.strokeStyle="rgba(255,255,255,.92)";
    ctx.lineWidth=3;
    ctx.shadowColor="rgba(0,0,0,.45)";
    ctx.shadowBlur=6;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x,y,ring2,0,Math.PI*2);
    ctx.strokeStyle="rgba(0,0,0,.35)";
    ctx.lineWidth=2;
    ctx.stroke();
  }

  function updateSwatchActive(hex){
    const norm = String(hex).toUpperCase();
    [...swatchRow.children].forEach(el=> el.classList.toggle("fp-active", el.dataset.hex===norm));
  }

  function updatePreviewChip(r,g,b,a){
    preview.style.backgroundImage =
      `linear-gradient(rgba(${r},${g},${b},${a}), rgba(${r},${g},${b},${a}))`;
    preview.style.backgroundBlendMode = "normal";
    preview.style.backgroundColor = "transparent";
  }

  function sync(){
    const rgb = hsvToRgb(state.h,state.s,state.v);
    const hex = rgbToHex(rgb.r,rgb.g,rgb.b);
    const a = round2(clamp01(state.a));

    hueEl.value = Math.round(state.h);
    alphaEl.value = state.a;

    hexEl.value = hex;
    rEl.value = rgb.r; gEl.value = rgb.g; bEl.value = rgb.b; aEl.value = a;

    liveOut.textContent =
      (fmtEl.value === "HEX" && a < 1)
        ? `RGBA(${rgb.r},${rgb.g},${rgb.b},${a})`
        : (fmtEl.value === "RGB")
          ? `RGB(${rgb.r},${rgb.g},${rgb.b})`
          : (fmtEl.value === "RGBA")
            ? `RGBA(${rgb.r},${rgb.g},${rgb.b},${a})`
            : hex;

    setRangeBackgrounds();
    drawSV();
    updateSwatchActive(hex);

    lastUsedRGBA = { r: rgb.r, g: rgb.g, b: rgb.b, a };
    updatePreviewChip(rgb.r, rgb.g, rgb.b, a);
  }

  function renderSwatches(){
    swatchRow.innerHTML="";
    SWATCHES.forEach(hex=>{
      const d=document.createElement("div");
      d.className="fp-swatch";
      d.style.background=hex;
      d.dataset.hex=hex.toUpperCase();
      d.title = hex;
      d.addEventListener("click", ()=>{
        const rgb=hexToRgb(hex);
        if(!rgb) return;
        const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);
        state.h=hsv.h; state.s=hsv.s; state.v=hsv.v;
        sync();
      });
      swatchRow.appendChild(d);
    });
  }

  function insertAtCursor(el, text){
    const start = el.selectionStart;
    const end = el.selectionEnd ?? start;
    el.value = el.value.slice(0,start) + text + el.value.slice(end);
    const caret = start + text.length;
    el.selectionStart = el.selectionEnd = caret;
    el.focus();
  }

  function seedFromLastOrDefault(defaultHex, initialFormat){
    const hsv = rgbToHsv(lastUsedRGBA.r, lastUsedRGBA.g, lastUsedRGBA.b);
    state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
    state.a = clamp01(lastUsedRGBA.a ?? 1);
    fmtEl.value = initialFormat || "HEX";
    if(fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";

    if(defaultHex && /^#([0-9a-fA-F]{6})$/.test(defaultHex)){
      // intentionally light
    }
  }

  function open(opts){
    targetEl = opts.target;
    editRange = null;
    setMode(false);

    const defaultHex = opts.default || "#FFFFFF";
    const initialFormat = opts.format || "HEX";

    if(!targetEl || typeof targetEl.selectionStart !== "number"){
      seedFromLastOrDefault(defaultHex, initialFormat);
    } else {
      const text = targetEl.value;
      const ss = targetEl.selectionStart;
      const se = targetEl.selectionEnd ?? ss;
      const caret = (ss === se) ? ss : se;

      const prev = text[caret - 1];
      const next = text[caret];
      const caretInsideWord = isWordChar(prev) && isWordChar(next);

      if(caretInsideWord){
        editRange = null;
        setMode(false);
        seedFromLastOrDefault(defaultHex, initialFormat);
      } else {
        const tokens = getAllStrictValidColorTokens(text);
        const bestHit = pickBestTokenForSelection(tokens, Math.min(ss,se), Math.max(ss,se));
        let chosen = bestHit;

        if(!chosen){
          chosen = findActiveTokenOnLine(tokens, text, caret);
        }

        if(chosen){
          editRange = { start: chosen.start, end: chosen.end };
          setMode(true);

          const hsv = rgbToHsv(chosen.rgba.r, chosen.rgba.g, chosen.rgba.b);
          state.h = hsv.h; state.s = hsv.s; state.v = hsv.v;
          state.a = clamp01(chosen.rgba.a ?? 1);

          if(/^RGBA\(/i.test(chosen.value)) fmtEl.value = "RGBA";
          else if(/^RGB\(/i.test(chosen.value)) fmtEl.value = "RGB";
          else fmtEl.value = initialFormat;

          if(fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
        } else {
          const def = hexToRgb(defaultHex) || {r:255,g:255,b:255};
          const hsv = rgbToHsv(def.r,def.g,def.b);
          state.h=hsv.h; state.s=hsv.s; state.v=hsv.v;
          state.a = 1;
          fmtEl.value = initialFormat;
        }
      }
    }

    renderSwatches();
    backdrop.classList.add("fp-open");
    sync();
    setTimeout(()=>hexEl.focus(),0);
  }

  function close(){
    backdrop.classList.remove("fp-open");
    editRange = null;
  }
  function isOpen(){ return backdrop.classList.contains("fp-open"); }

  hueEl.addEventListener("input", ()=>{
    state.h=clamp360(+hueEl.value);
    sync();
  });

  alphaEl.addEventListener("input", ()=>{
    state.a=clamp01(+alphaEl.value);
    if(fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
    sync();
  });

  fmtEl.addEventListener("change", ()=> sync());

  hexEl.addEventListener("change", ()=>{
    const rgb=hexToRgb(hexEl.value);
    if(!rgb) return sync();
    const hsv=rgbToHsv(rgb.r,rgb.g,rgb.b);
    state.h=hsv.h; state.s=hsv.s; state.v=hsv.v;
    sync();
  });

  function chanCommit(){
    const r=clamp255(+rEl.value), g=clamp255(+gEl.value), b=clamp255(+bEl.value);
    const a=clamp01(+aEl.value);
    state.a = Number.isFinite(a) ? a : state.a;

    const hsv=rgbToHsv(r,g,b);
    state.h=hsv.h; state.s=hsv.s; state.v=hsv.v;

    if(fmtEl.value === "HEX" && round2(state.a) < 1) fmtEl.value = "RGBA";
    sync();
  }
  [rEl,gEl,bEl,aEl].forEach(el=>{ el.addEventListener("change",chanCommit); el.addEventListener("blur",chanCommit); });

  let dragging=false;
  function pointToSV(cx,cy){
    const r=cv.getBoundingClientRect();
    const x=clamp01((cx-r.left)/r.width);
    const y=clamp01((cy-r.top)/r.height);
    return { s:x, v:1-y };
  }
  cv.addEventListener("pointerdown",(e)=>{
    lastPointerType = e.pointerType || "mouse";
    dragging=true;
    cv.setPointerCapture?.(e.pointerId);
    const p=pointToSV(e.clientX,e.clientY);
    state.s=p.s; state.v=p.v; sync();
  });
  window.addEventListener("pointermove",(e)=>{
    if(!dragging) return;
    lastPointerType = e.pointerType || lastPointerType;
    const p=pointToSV(e.clientX,e.clientY);
    state.s=p.s; state.v=p.v; sync();
  });
  window.addEventListener("pointerup",(e)=>{
    dragging=false;
    try{ cv.releasePointerCapture?.(e.pointerId);}catch(_){}
  });

  preview.addEventListener("click", async ()=>{
    const token = buildToken();
    try{
      await navigator.clipboard.writeText(token);
    }catch(e){
      const ta = document.createElement("textarea");
      ta.value = token;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const old = preview.style.boxShadow;
    preview.style.boxShadow = "0 0 0 3px rgba(63,177,206,.55), " + old;
    setTimeout(()=> preview.style.boxShadow = old, 350);
  });

  function applyNow(){
    if(!targetEl) return;
    const token = buildToken();

    if(editRange && typeof targetEl.selectionStart === "number"){
      const text = targetEl.value;
      targetEl.value = replaceRange(text, editRange.start, editRange.end, token);
      const caret = editRange.start + token.length;
      targetEl.selectionStart = targetEl.selectionEnd = caret;
      targetEl.focus();
      targetEl.dispatchEvent(new Event("input", { bubbles:true }));
      close();
      return;
    }

    insertAtCursor(targetEl, token);
    targetEl.dispatchEvent(new Event("input", { bubbles:true }));
    close();
  }

  btnApply.addEventListener("click", applyNow);
  btnClose.addEventListener("click", close);
  btnCancel.addEventListener("click", close);
  backdrop.addEventListener("click",(e)=>{ if(e.target===backdrop) close(); });

  window.addEventListener("keydown",(e)=>{
    if(!isOpen()) return;
    if(e.key === "Escape"){ e.preventDefault(); close(); return; }
    if(e.key === "Enter"){ e.preventDefault(); applyNow(); return; }
  });

  window.ColorPickerModal = { open, close };
})();
