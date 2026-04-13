"use strict";

/* ── Config ──────────────────────────────────────── */
const MEMBERS = [
  "Carlos Perez",
  "Luis Martinez",
];

// Scope-level flag so updateSlider can read it
let _foundLimit = false;

/* ── Router ──────────────────────────────────────── */
let chartInstance = null;

function navigate(view) {
  ["home","teoria","lab"].forEach(v => {
    document.getElementById("view-"+v).classList.toggle("active", v===view);
  });
  
  // Reset chart when navigating
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  
  if (view==="lab") {
    setTimeout(() => {
      validateAndCalculate();
      // Inicializar controles del laboratorio después del cálculo
      setTimeout(() => {
        if (ST.ready) {
          setupSlider();
          createChart();
          updateMetricLabels();
          const initX = parseFloat(document.getElementById("x_slider").value);
          updateSpeedometer(initX);
          updateOrderAnalysis(initX);
        }
      }, 200);
    }, 100);
  }
  if (view==="teoria") {
    renderTeoria();
    const teoriaBody = document.querySelector("#view-teoria .teoria-body");
    requestAnimationFrame(() => {
      if (teoriaBody) teoriaBody.scrollTo(0, 0);
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      renderTheoryMath();
    });
  }
}

/* ── Accordion ───────────────────────────────────── */
function toggleAccordion(id) {
  const card = document.querySelector(`[data-accordion="${id}"]`);
  card.classList.toggle('expanded');
}

/* ── KaTeX ───────────────────────────────────────── */
function waitK(fn) {
  if (window.__katexReady && window.katex) fn();
  else setTimeout(()=>waitK(fn), 50);
}
function K(tex, node, display) {
  if (!node) return;
  try { katex.render(tex, node, {throwOnError:false, displayMode:!!display}); }
  catch(_) { node.textContent = tex; }
}

/* ── Members ─────────────────────────────────────── */
function buildMembers() {
  const wrap = document.getElementById("members-chips");
  MEMBERS.forEach(m => {
    const initials = m.split(" ").map(w=>w[0]).slice(0,2).join("");
    const c = document.createElement("div");
    c.className = "mchip";
    c.innerHTML = `<div class="av">${initials}</div>${m}`;
    wrap.appendChild(c);
  });
}

/* ── Teoría render ───────────────────────────────── */
let _teoriaRendered = false;
function renderTeoria() {
  // Teoria is now pure HTML — nothing to render
  _teoriaRendered = true;
}

function renderTheoryMath() {
  if (!window.katex) return;
  document.querySelectorAll('#view-teoria [data-tex]').forEach(node => {
    if (node.dataset.rendered === '1') return;
    try {
      katex.render(node.getAttribute('data-tex'), node, {throwOnError:false, displayMode:false});
      node.dataset.rendered = '1';
    } catch (_) {
      node.textContent = node.getAttribute('data-tex');
    }
  });
}

/* ── Lab State ───────────────────────────────────── */
const ST = {
  ready:false, fRaw:"sin(x)", gRaw:"x",
  aStr:"0", aNum:0, aIsInf:false,
  xMin:-4, xMax:4,
  presetXMin:null, presetXMax:null,
  fFn:null, gFn:null,
  dfFns:[], dgFns:[],
  dfSyms:[], dgSyms:[],
  limitVal:null, hops:0,
  detailSteps: [],
};

/* ── Modal Functions ───────────────────────────────── */
let lastDiagSteps = []; // Guardar los últimos pasos del diagnóstico

function openModal() {
  if (!lastDiagSteps || lastDiagSteps.length === 0) {
    document.getElementById('modal-body').innerHTML = '<p style="text-align:center;color:var(--muted);">No hay procedimiento disponible. Calcula un límite primero.</p>';
  } else {
    renderModalContent();
  }
  document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function renderModalContent() {
  const modalBody = document.getElementById('modal-body');
  let html = '';
  
  lastDiagSteps.forEach((step) => {
    // Replicar exactamente el estilo del diagnóstico
    let stepClass = 'ds ' + step.type;
    let headerHtml = '<div class="ds-head">';
    
    if (step.num) {
      headerHtml += '<span class="ds-num ' + (step.type === 'ok' ? 'g' : '') + '">' + step.num + '</span>';
    } else if (step.icon) {
      headerHtml += '<i class="bx ' + step.icon + ' ds-icon"></i>';
    }
    
    headerHtml += '<span>' + step.title + '</span></div>';
    
    // Agregar líneas de texto
    let linesHtml = '';
    (step.lines || []).forEach(line => {
      linesHtml += '<div class="ds-line">' + line + '</div>';
    });
    
    // Agregar matemáticas
    let mathHtml = '';
    if (step.math) {
      mathHtml += '<div class="ds-math" data-m="' + encodeURIComponent(step.math) + '"></div>';
    }
    (step.mlines || []).forEach(mline => {
      mathHtml += '<div class="ds-math" data-m="' + encodeURIComponent(mline) + '"></div>';
    });
    
    // Agregar conclusión
    let conclHtml = '';
    if (step.concl) {
      conclHtml = '<div class="ds-concl">→ ' + step.concl + '</div>';
    }
    
    html += '<div class="' + stepClass + '">' + headerHtml + linesHtml + mathHtml + conclHtml + '</div>';
  });
  
  modalBody.innerHTML = html;
  
  // Renderizar matemáticas en el modal
  waitK(() => {
    modalBody.querySelectorAll('[data-m]').forEach(m => {
      waitK(() => K(decodeURIComponent(m.getAttribute('data-m')), m, true));
    });
  });
}

/* ── Calculate Domain ───────────────────────────────── */
function calculateDomain(a, isInf) {
  if (Number.isFinite(ST.presetXMin) && Number.isFinite(ST.presetXMax)) {
    return { min: ST.presetXMin, max: ST.presetXMax };
  }

  if (isInf) {
    return { min: -10, max: 10 };
  }
  
  // Rango razonable alrededor del punto a
  const range = 5;
  let min = a - range;
  let max = a + range;
  
  // Evitar dominios problemáticos para funciones comunes
  if (Math.abs(a) < 0.1) {
    min = -2;
    max = 2;
  }
  
  return { min, max };
}

/* ── Math helpers ────────────────────────────────── */
function norm(s){ return (s||"").trim().replace(/\*\*/g,"^").replace(/\bln\s*\(/gi,"log("); }
function parseA(str){
  const s=(str||"").trim().toLowerCase();
  if(["inf","+inf","infinity","+infinity","∞"].includes(s)) return {value:1e9,isInf:true};
  const n=parseFloat(s.replace(",","."));
  if(!isFinite(n)) throw new Error("Punto 'a' inválido. Usa un número o 'inf'.");
  return {value:n,isInf:false};
}
function nEval(expr,x){
  try{
    const v=nerdamer(norm(expr),{x:String(x)}).evaluate().text();
    const n=parseFloat(v);
    if(isFinite(n)) return n;
    
    // Detectar infinitos explícitos de Nerdamer
    if(v === 'Infinity' || v === '+Infinity' || v === '∞') return Infinity;
    if(v === '-Infinity' || v === '-∞') return -Infinity;
    
    return NaN;
  }catch(_){return NaN;}
}
function buildFn(expr){
  try{const fn=nerdamer(norm(expr)).buildFunction(["x"]);return x=>{try{const v=fn(x);return isFinite(v)?v:NaN;}catch(_){return NaN;};};}
  catch(_){return ()=>NaN;}
}
function diffStr(expr){
  const e=norm(expr);
  try{if(typeof nerdamer.diff==="function") return nerdamer.diff(nerdamer(e),"x").text();}catch(_){}
  try{return nerdamer("diff("+e+",x)").text();}catch(err){throw new Error("No se pudo derivar '"+e+"'");}
}
function ratio(f,g){return x=>{const fv=f(x),gv=g(x);return(isFinite(fv)&&isFinite(gv)&&Math.abs(gv)>1e-300)?fv/gv:NaN;};}
function fmt(n,p=6){
  if(n === null || n === undefined) return "—";
  if(n === 0 || (typeof n === 'number' && Math.abs(n) < 1e-15)) return "0";
  if(!isFinite(n)) return n > 0 ? "+∞" : "−∞";
  if(Math.abs(n) < 1e-10) return "≈ 0";
  if(Math.abs(n) > 5e7) return n>0?"+∞":"−∞";
  return +n.toPrecision(p)+"";
}

/* ── Enhanced Infinity Detection ──────────────────────── */
function detectInfinity(expr, x, isPositiveInfinity = true) {
  try {
    // Evaluar en puntos muy grandes para detectar comportamiento asintótico
    const testPoints = isPositiveInfinity ? [1e6, 1e8, 1e10] : [-1e6, -1e8, -1e10];
    const values = testPoints.map(t => nEval(expr, t));
    
    // Si todos los valores son consistentemente grandes en magnitud
    const avgMagnitude = values.reduce((sum, v) => sum + Math.abs(v || 0), 0) / values.length;
    
    // Umbral de crecimiento sostenido para funciones lentas (ln, log, etc.)
    // Si el valor es grande pero representa crecimiento lento hacia infinito,
    // normalizarlo a infinito para que L'Hôpital reconozca la indeterminación
    const sustainedGrowthThreshold = 10; // Umbral para crecimiento sostenido
    
    if (avgMagnitude > sustainedGrowthThreshold) {
      // Determinar el signo
      const positiveCount = values.filter(v => v > 0).length;
      return positiveCount > values.length / 2 ? Infinity : -Infinity;
    }
    
    // Si no se detecta infinito, verificar si el valor en x es infinito
    const valueAtX = nEval(expr, x);
    if (isInfinityValue(valueAtX)) {
      return valueAtX;
    }
    
    return NaN;
  } catch (_) {
    return NaN;
  }
}

function isInfinityValue(val) {
  return val === Infinity || val === -Infinity || 
         (typeof val === 'string' && (val.includes('Infinity') || val.includes('∞')));
}

/* ── Indetermination check ───────────────────────── */
function checkIndet(F,G,a,isInf){
  const sustainedGrowthThreshold = 10; // Umbral para crecimiento sostenido
  if(isInf){
    const f = detectInfinity(F, a, true) || nEval(F, 1e8);
    const g = detectInfinity(G, a, true) || nEval(G, 1e8);
    return{ok:(isInfinityValue(f) || Math.abs(f)>sustainedGrowthThreshold) && (isInfinityValue(g) || Math.abs(g)>sustainedGrowthThreshold)};
  }
  const h=1e-6;
  const f1=nEval(F,a+h),g1=nEval(G,a+h),f2=nEval(F,a-h),g2=nEval(G,a-h);
  const sm=z=>Math.abs(z)<5e-4, bg=z=>Math.abs(z)>sustainedGrowthThreshold || isInfinityValue(z);
  return{ok:(sm(f1)&&sm(g1))||(sm(f2)&&sm(g2))||(bg(f1)&&bg(g1))||(bg(f2)&&bg(g2))};
}

/* ── Diagnostic renderer ─────────────────────────── */
function renderDiag(steps){
  // Guardar los pasos para el modal
  lastDiagSteps = steps;
  
  const out=document.getElementById("diag-out");
  out.innerHTML="";
  steps.forEach(s=>{
    const d=document.createElement("div");
    d.className="ds "+s.type;
    let h=`<div class="ds-head">`;
    if(s.num) h+=`<span class="ds-num ${s.type==="ok"?"g":""}">${s.num}</span>`;
    else if(s.icon) h+=`<i class="bx ${s.icon} ds-icon"></i>`;
    h+=`<span>${s.title}</span></div>`;
    (s.lines||[]).forEach(l=>{h+=`<div class="ds-line">${l}</div>`;});
    if(s.math) h+=`<div class="ds-math" data-m="${encodeURIComponent(s.math)}"></div>`;
    (s.mlines||[]).forEach(m=>{h+=`<div class="ds-math" data-m="${encodeURIComponent(m)}"></div>`;});
    if(s.concl) h+=`<div class="ds-concl">→ ${s.concl}</div>`;
    d.innerHTML=h;
    d.querySelectorAll("[data-m]").forEach(m=>{
      waitK(()=>K(decodeURIComponent(m.getAttribute("data-m")),m,true));
    });
    out.appendChild(d);
  });
}

/* ── Chart.js Setup ───────────────────────────────── */
function createChart() {
  // Destruir gráfica existente
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  
  const ctx = document.getElementById('chart').getContext('2d');
  
  // Calcular dominio automáticamente
  const domain = calculateDomain(ST.aNum, ST.aIsInf);
  ST.xMin = domain.min;
  ST.xMax = domain.max;
  
  // Generate data points
  const points = [];
  const derivPoints = [];
  const limitLine = [];
  
  for (let i = 0; i <= 300; i++) {
    const x = ST.xMin + (i / 300) * (ST.xMax - ST.xMin);
    const fR = ST.fFn && ST.gFn ? ST.fFn(x) / ST.gFn(x) : NaN;
    const dfFn = ST.dfFns[ST.dfFns.length - 1];
    const dgFn = ST.dgFns[ST.dgFns.length - 1];
    const dR = dfFn && dgFn ? dfFn(x) / dgFn(x) : NaN;
    
    if (isFinite(fR)) points.push({x, y: fR});
    if (isFinite(dR)) derivPoints.push({x, y: dR});
    
    if (ST.limitVal !== null && isFinite(ST.limitVal)) {
      limitLine.push({x, y: ST.limitVal});
    }
  }
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'f(x)/g(x)',
          data: points,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.05)',
          borderWidth: 2.8,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 5,
          spanGaps: false
        },
        {
          label: "f'(x)/g'(x)",
          data: derivPoints,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.05)',
          borderWidth: 2,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 5,
          spanGaps: false
        },
        ...(ST.limitVal !== null && isFinite(ST.limitVal) ? [{
          label: 'Límite L',
          data: limitLine,
          borderColor: '#d97706',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          spanGaps: true
        }] : [])
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#94a3b8',
          bodyColor: '#fff',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          callbacks: {
            title: function(items) {
              if (!items.length) return '';
              const xVal = Number(items[0].parsed.x);
              // Detect if near critical point a
              if (!ST.aIsInf && isFinite(ST.aNum) && Math.abs(xVal - ST.aNum) < (ST.xMax - ST.xMin) / 60) {
                return `x ≈ ${ST.aStr} (Punto Crítico)`;
              }
              return `x = ${xVal.toPrecision(5)}`;
            },
            label: function(context) {
              if (context.datasetIndex === 2) return null; // skip limit line
              const xVal = Number(context.parsed.x);
              const y = context.parsed.y;
              if (y === null || y === undefined) return null;

              // Smart tooltip near critical point
              const isNearCritical = !ST.aIsInf && isFinite(ST.aNum) &&
                Math.abs(xVal - ST.aNum) < (ST.xMax - ST.xMin) / 60;

              if (isNearCritical && ST.hops > 0) {
                if (context.datasetIndex === 0) {
                  return `f/g: Indeterminado (Discontinuidad Evitable)`;
                }
                if (context.datasetIndex === 1) {
                  return `f'/g': ${fmt(y, 6)}  ← valor del límite`;
                }
              }
              const label = context.dataset.label || '';
              return `${label}: ${fmt(y, 6)}`;
            },
            afterBody: function(items) {
              if (!items.length) return [];
              const xVal = Number(items[0].parsed.x);
              const isNearCritical = !ST.aIsInf && isFinite(ST.aNum) &&
                Math.abs(xVal - ST.aNum) < (ST.xMax - ST.xMin) / 60;

              if (isNearCritical && ST.hops > 0 && ST.limitVal !== null && isFinite(ST.limitVal)) {
                return [`──────────────────`, `Límite L = ${fmt(ST.limitVal, 6)}`, `(${ST.hops} iter. de L'Hôpital)`];
              }
              if (ST.limitVal !== null && isFinite(ST.limitVal)) {
                return [`Límite L: ${fmt(ST.limitVal, 6)}`];
              }
              return [];
            }
          }
        },
        // Vertical line at x = a
        verticalLine: {}
      },
      scales: {
        x: {
          type: 'linear',
          position: 'center',
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#94a3b8',
            font: { family: "'JetBrains Mono', monospace" },
            maxTicksLimit: 10
          }
        },
        y: {
          type: 'linear',
          position: 'center',
          grid: { color: '#f1f5f9' },
          ticks: {
            color: '#94a3b8',
            font: { family: "'JetBrains Mono', monospace" },
            maxTicksLimit: 8
          }
        }
      }
    },
    plugins: [{
      id: 'overlays',
      afterDraw: (chart) => {
        const ctx2 = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale) return;

        // 1. Vertical dashed line at x = a
        if (!ST.aIsInf) {
          const xPos = xScale.getPixelForValue(ST.aNum);
          ctx2.save();
          ctx2.strokeStyle = 'rgba(100,116,139,0.4)';
          ctx2.lineWidth = 1.5;
          ctx2.setLineDash([5, 4]);
          ctx2.beginPath();
          ctx2.moveTo(xPos, chart.chartArea.top);
          ctx2.lineTo(xPos, chart.chartArea.bottom);
          ctx2.stroke();
          ctx2.setLineDash([]);
          ctx2.restore();
        }

        // 2. Slider x marker — vertical line + dot on f/g curve
        const sliderX = parseFloat(document.getElementById('x_slider').value);
        if (isFinite(sliderX) && ST.ready && ST.fFn && ST.gFn) {
          const sliderPx = xScale.getPixelForValue(sliderX);
          // Only draw if within chart area
          if (sliderPx >= chart.chartArea.left && sliderPx <= chart.chartArea.right) {
            // Vertical line at slider x
            ctx2.save();
            ctx2.strokeStyle = 'rgba(37,99,235,0.5)';
            ctx2.lineWidth = 1.5;
            ctx2.setLineDash([3, 3]);
            ctx2.beginPath();
            ctx2.moveTo(sliderPx, chart.chartArea.top);
            ctx2.lineTo(sliderPx, chart.chartArea.bottom);
            ctx2.stroke();
            ctx2.setLineDash([]);
            ctx2.restore();

            // Dot on f(x)/g(x) curve at slider x
            const fv = ST.fFn(sliderX), gv = ST.gFn(sliderX);
            if (isFinite(fv) && isFinite(gv) && Math.abs(gv) > 1e-300) {
              const y = fv / gv;
              const yPx = yScale.getPixelForValue(y);
              if (yPx >= chart.chartArea.top && yPx <= chart.chartArea.bottom) {
                ctx2.save();
                ctx2.fillStyle = '#2563eb';
                ctx2.beginPath();
                ctx2.arc(sliderPx, yPx, 6, 0, Math.PI * 2);
                ctx2.fill();
                ctx2.strokeStyle = '#fff';
                ctx2.lineWidth = 2;
                ctx2.stroke();
                ctx2.restore();
              }
            }
          }
        }

        // 3. Discontinuity marker — hollow circle at (a, L) when indeterminate
        if (ST.limitVal !== null && isFinite(ST.limitVal) && !ST.aIsInf && ST.hops > 0) {
          const xPos = xScale.getPixelForValue(ST.aNum);
          const yPos = yScale.getPixelForValue(ST.limitVal);
          if (xPos >= chart.chartArea.left && xPos <= chart.chartArea.right &&
              yPos >= chart.chartArea.top && yPos <= chart.chartArea.bottom) {
            ctx2.save();
            // Hollow circle (discontinuity evitable)
            ctx2.beginPath();
            ctx2.arc(xPos, yPos, 8, 0, Math.PI * 2);
            ctx2.strokeStyle = '#d97706';
            ctx2.lineWidth = 2.5;
            ctx2.stroke();
            // Inner fill with chart background
            ctx2.fillStyle = '#ffffff';
            ctx2.fill();
            // Label
            ctx2.fillStyle = '#92400e';
            ctx2.font = 'bold 10px JetBrains Mono, monospace';
            ctx2.fillText(`L=${fmt(ST.limitVal, 4)}`, xPos + 12, yPos - 6);
            ctx2.restore();
          }
        } else if (ST.limitVal !== null && isFinite(ST.limitVal) && !ST.aIsInf) {
          // Direct evaluation — solid dot (no discontinuity)
          const xPos = xScale.getPixelForValue(ST.aNum);
          const yPos = yScale.getPixelForValue(ST.limitVal);
          if (xPos >= chart.chartArea.left && xPos <= chart.chartArea.right &&
              yPos >= chart.chartArea.top && yPos <= chart.chartArea.bottom) {
            ctx2.save();
            ctx2.fillStyle = '#d97706';
            ctx2.beginPath();
            ctx2.arc(xPos, yPos, 6, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.strokeStyle = '#fff';
            ctx2.lineWidth = 2;
            ctx2.stroke();
            ctx2.fillStyle = '#92400e';
            ctx2.font = 'bold 10px JetBrains Mono, monospace';
            ctx2.fillText(`L=${fmt(ST.limitVal, 4)}`, xPos + 10, yPos - 6);
            ctx2.restore();
          }
        }
      }
    }]
  });
  
  // Chart drawn — slider marker will appear via plugin afterDraw
}

/* ── Main calculation ────────────────────────────── */
function validateAndCalculate(){
  const resStrip=document.getElementById("result-strip");
  const errStrip=document.getElementById("err-strip");
  resStrip.style.display="none";
  errStrip.style.display="none";
  document.getElementById("diag-out").innerHTML=`<div class="diag-idle">Analizando…</div>`;

  ST.fRaw=norm(document.getElementById("f_input").value);
  ST.gRaw=norm(document.getElementById("g_input").value);
  ST.detailSteps = []; // Resetear pasos detallados
  ST.ready=false; ST.limitVal=null; ST.hops=0;
  ST.dfFns=[]; ST.dgFns=[]; ST.dfSyms=[]; ST.dgSyms=[];

  try { nerdamer(ST.fRaw); nerdamer(ST.gRaw); }
  catch(e){ showErr("Expresión inválida: "+e.message); return; }

  let aInfo;
  try { aInfo=parseA(document.getElementById("a_input").value); }
  catch(e){ showErr(e.message); return; }
  ST.aNum=aInfo.value; ST.aStr=document.getElementById("a_input").value.trim(); ST.aIsInf=aInfo.isInf;

  ST.fFn=buildFn(ST.fRaw); ST.gFn=buildFn(ST.gRaw);

  const a=ST.aNum, isInf=ST.aIsInf;
  const lp=isInf?"\\infty":ST.aStr;
  const steps=[];

  // Evaluate f and g at a
  let fVal,gVal;
  if(isInf){
    // Evaluación mejorada para infinito
    fVal = detectInfinity(ST.fRaw, a, true);
    gVal = detectInfinity(ST.gRaw, a, true);
    
    // Si no se detectó infinito, usar evaluación directa
    if (!isInfinityValue(fVal)) fVal = nEval(ST.fRaw, 1e8);
    if (!isInfinityValue(gVal)) gVal = nEval(ST.gRaw, 1e8);
  }
  else{
    const h=1e-7;
    const f1=nEval(ST.fRaw,a+h),f2=nEval(ST.fRaw,a-h);
    const g1=nEval(ST.gRaw,a+h),g2=nEval(ST.gRaw,a-h);
    fVal=(isFinite(f1)&&isFinite(f2))?(f1+f2)/2:(isFinite(f1)?f1:f2);
    gVal=(isFinite(g1)&&isFinite(g2))?(g1+g2)/2:(isFinite(g1)?g1:g2);
  }

  // Detección mejorada de infinitos y ceros
  const sustainedGrowthThreshold = 10; // Umbral para crecimiento sostenido
  const fSm=Math.abs(fVal)<5e-4, gSm=Math.abs(gVal)<5e-4;
  const fBg=isInfinityValue(fVal) || Math.abs(fVal)>sustainedGrowthThreshold;
  const gBg=isInfinityValue(gVal) || Math.abs(gVal)>sustainedGrowthThreshold;
  const isZZ=fSm&&gSm, isII=fBg&&gBg, isInd=isZZ||isII;

  steps.push({
    type:"info", icon:"bx-search", title:`Evaluación en x → ${isInf?"∞":ST.aStr}`,
    lines:[
      `f(${isInf?"∞":ST.aStr}) → <strong>${isZZ?"0":(fBg?"∞":fmt(fVal))}</strong>`,
      `g(${isInf?"∞":ST.aStr}) → <strong>${gSm?"0":(gBg?"∞":fmt(gVal))}</strong>`,
    ]
  });

  if(!isInd){
    const errorMsg = Math.abs(gVal)<1e-9 
      ? "División por cero detectada — L'Hôpital no aplica"
      : "Uso incorrecto de la Regla: El límite no es indeterminado";
    
    steps.push({
      type:"err",icon:"bx-x-circle",title:errorMsg,
      lines:[Math.abs(gVal)<1e-9 
        ? "El denominador → 0 pero el numerador no. El límite es ±∞."
        : "No se cumple 0/0 ni ∞/∞. L'Hôpital no es aplicable."]
    });
    
    if (Math.abs(gVal) >= 1e-9) {
      const direct=fVal/gVal;
      steps.push({
        type:"warn",icon:"bx-info-circle",title:"Evaluación directa",
        math:`\\lim_{x\\to ${lp}}\\frac{f}{g}=\\frac{${fmt(fVal)}}{${fmt(gVal)}}=${fmt(direct)}`,
        concl:`Límite directo = ${fmt(direct,8)}`
      });
      ST.limitVal=direct;
    }
    
    ST.hops=0;
    ST.dfFns=[()=>NaN]; ST.dgFns=[()=>NaN];
    finalize(steps,lp);
    return;
  }

  steps.push({
    type:"info", icon:"bx-bolt",
    title:`Indeterminación ${isZZ?"0/0":"∞/∞"} confirmada`,
    math:`\\lim_{x\\to ${lp}}\\frac{${ST.fRaw}}{${ST.gRaw}}=\\frac{${isZZ?"0":"\\infty"}}{${isZZ?"0":"\\infty"}}`,
    lines:["Condición de L'Hôpital cumplida. Procedemos iterativamente."]
  });

  // Iterative derivation
  let F=ST.fRaw, G=ST.gRaw, limitVal=NaN;
  const MAX=8;
  _foundLimit = false;

  for(let k=0;k<MAX;k++){
    let dF,dG;
    try{dF=diffStr(F);dG=diffStr(G);}
    catch(e){steps.push({type:"err",icon:"bx-x-circle",title:"Error al derivar",lines:[e.message]});break;}
    if(dF==="0"&&dG==="0"){steps.push({type:"err",icon:"bx-x-circle",title:"Derivadas nulas",lines:["Imposible continuar."]});break;}

    ST.dfSyms.push(dF); ST.dgSyms.push(dG);
    const dfFn=buildFn(dF), dgFn=buildFn(dG);
    ST.dfFns.push(dfFn); ST.dgFns.push(dgFn);

    // Build prime notation: f'(x), f''(x), f'''(x), f^{(n)}(x) for n>=4
    const primes = k < 3 ? "'".repeat(k+1) : `^{(${k+1})}`;

    // Función de formateo LaTeX académico profesional mejorada
    const formatAcademicLatex = (expr) => {
      let formatted = String(expr).trim();
      
      // 1. Sustitución de logaritmos: log -> ln (contexto de Cálculo)
      formatted = formatted.replace(/\blog\b/g, 'ln');
      
      // 2. Transformar potencias negativas a fracciones (casos específicos)
      // Caso simple: x^-n -> \frac{1}{x^n}
      formatted = formatted.replace(/([a-zA-Z])\^(-\d+)/g, (match, base, exp) => {
        const absExp = exp.replace('-', '');
        return `\\frac{1}{${base}^{${absExp}}}`;
      });
      
      // Caso complejo: (expr)^-n -> \frac{1}{(expr)^n}
      formatted = formatted.replace(/\(([^)]+)\)\^(-\d+)/g, (match, inner, exp) => {
        const absExp = exp.replace('-', '');
        return `\\frac{1}{(${inner})^{${absExp}}}`;
      });
      
      // Caso especial: x^(-1) -> \frac{1}{x}
      formatted = formatted.replace(/x\^\(-1\)/g, '\\frac{1}{x}');
      
      // 3. Manejar casos específicos de derivadas de logaritmos
      // 1/x -> \frac{1}{x}
      formatted = formatted.replace(/1\/x/g, '\\frac{1}{x}');
      formatted = formatted.replace(/1\/\s*x/g, '\\frac{1}{x}');
      
      // Caso: número·1/x -> número·\frac{1}{x}
      formatted = formatted.replace(/(\d+)\s*\\cdot\s*1\/x/g, '$1\\cdot\\frac{1}{x}');
      formatted = formatted.replace(/(\d+)\s*\\cdot\s*1\/\s*x/g, '$1\\cdot\\frac{1}{x}');
      
      // Caso general: cualquier cosa·1/x -> cualquier cosa·\frac{1}{x}
      formatted = formatted.replace(/(.+?)\\cdot\s*1\/x/g, '$1\\cdot\\frac{1}{x}');
      formatted = formatted.replace(/(.+?)\\cdot\s*1\/\s*x/g, '$1\\cdot\\frac{1}{x}');
      
      // 4. Limpieza de LaTeX: eliminar paréntesis vacíos y espacios después de ^
      formatted = formatted.replace(/\(\s*\)/g, ''); // Paréntesis vacíos
      formatted = formatted.replace(/\^(\s+)/g, '^'); // Espacios después de ^
      formatted = formatted.replace(/\^(\s+)([a-zA-Z])/g, '^$2'); // ^ seguido de espacio y letra
      
      // 5. Reemplazar multiplicación con \cdot para claridad académica
      formatted = formatted.replace(/\*(?!\*)/g, ' \\cdot ');
      
      // 6. Estandarizar funciones trigonométricas y exponenciales
      formatted = formatted.replace(/\bsin\b/g, '\\sin');
      formatted = formatted.replace(/\bcos\b/g, '\\cos');
      formatted = formatted.replace(/\btan\b/g, '\\tan');
      formatted = formatted.replace(/\bexp\b/g, 'e^');
      
      // 7. Limpieza final de espacios múltiples
      formatted = formatted.replace(/\s+/g, ' ').trim();
      
      // 8. Validación básica: asegurar que las fracciones estén balanceadas
      const openFracs = (formatted.match(/\\frac\{/g) || []).length;
      const closeBraces = (formatted.match(/}/g) || []).length;
      if (openFracs > closeBraces) {
        formatted += '}'.repeat(openFracs - closeBraces);
      }
      
      return formatted;
    };
    
    steps.push({
      type:"info", num:k+1,
      title:`Aplicación ${k+1} de L'Hôpital`,
      mlines:[`f${primes}(x) = ${formatAcademicLatex(dF)}`, `g${primes}(x) = ${formatAcademicLatex(dG)}`]
    });

    F=dF; G=dG;

    const nowIndet=checkIndet(F,G,a,isInf);

    // Show intermediate check: is the new ratio still indeterminate at a?
    if (nowIndet.ok) {
      // Still 0/0 or ∞/∞ — show it so user knows why we iterate again
      const h2 = 1e-6;
      const nfv = nEval(F, a === 0 ? h2 : a + h2);
      const ngv = nEval(G, a === 0 ? h2 : a + h2);
      const fSm2 = Math.abs(nfv) < 5e-4, gSm2 = Math.abs(ngv) < 5e-4;
      const fBg2 = Math.abs(nfv) > sustainedGrowthThreshold || isInfinityValue(nfv);
      const gBg2 = Math.abs(ngv) > sustainedGrowthThreshold || isInfinityValue(ngv);
      const indType2 = (fSm2 && gSm2) ? "0/0" : ((fBg2 && gBg2) ? "\\infty/\\infty" : "0/0");
      steps.push({
        type:"warn", icon:"bx-refresh",
        title:`Sigue siendo indeterminado — se aplica L'Hôpital de nuevo`,
        math:`\\lim_{x\\to ${lp}}\\frac{${F}}{${G}}=\\frac{${indType2.startsWith("0") ? "0" : "\\infty"}}{${indType2.startsWith("0") ? "0" : "\\infty"}}`,
        lines:["El cociente de derivadas aún es indeterminado en x → " + (isInf ? "∞" : ST.aStr) + ". Se requiere otra iteración."]
      });
    }

    // Evaluate the new ratio to check convergence
    // For infinity: use moderate values where JS floats still work (exp(50) ~ 5e21, exp(100) = Infinity in JS)
    // We test at x=20 and x=50 which are reachable by buildFn
    let r = NaN;
    if (isInf) {
      const candidates = [10, 20, 30, 50, 100];
      for (const tx of candidates) {
        const rv = dfFn(tx) / dgFn(tx);
        if (isFinite(rv)) { r = rv; break; }
      }
      // If those fail, try nEval which uses nerdamer's symbolic evaluator
      if (!isFinite(r)) {
        for (const tx of [10, 20, 30]) {
          const fv = nEval(dF, tx), gv = nEval(dG, tx);
          if (isFinite(fv) && isFinite(gv) && Math.abs(gv) > 1e-300) {
            r = fv / gv; break;
          }
        }
      }
    } else {
      const sx = a + (a===0 ? 1e-7 : 1e-7*Math.abs(a));
      r = dfFn(sx) / dgFn(sx);
    }

    // Only exit when the new ratio is truly NOT indeterminate at 'a'.
    // isFinite(r) alone is NOT enough — near x=0, sin(x)/2x evaluates to ~0.5
    // at x=1e-7 even though it's still 0/0 at x=0. We must confirm !nowIndet.ok.
    if (!nowIndet.ok) {
      if (isInf) {
        // Evaluate limit numerically at increasing x values
        // Use nEval (symbolic) rather than buildFn for stability at large x
        let bestVal = NaN;
        const probeValues = [];
        const xTestPoints = [20, 50, 100, 200, 500, 1000];
        
        for (const tx of xTestPoints) {
          const fv = nEval(dF, tx), gv = nEval(dG, tx);
          if (isFinite(fv) && isFinite(gv) && Math.abs(gv) > 1e-300) {
            const ratio = fv / gv;
            if (isFinite(ratio)) {
              probeValues.push({x: tx, value: ratio});
            }
          }
        }
        
        if (probeValues.length >= 3) {
          // Analyze trend across multiple points
          const lastValue = probeValues[probeValues.length - 1].value;
          const firstValue = probeValues[0].value;
          
          // Strong convergence to zero: very small value or decreasing trend
          const isVerySmall = Math.abs(lastValue) < 1e-8;
          const isDecreasing = probeValues.every((pv, i) => 
            i === 0 || Math.abs(pv.value) <= Math.abs(probeValues[i-1].value) * 1.1
          );
          const strongDecrease = Math.abs(lastValue) < Math.abs(firstValue) * 0.1;
          
          if (isVerySmall || (isDecreasing && strongDecrease)) {
            bestVal = 0;
          } else {
            bestVal = lastValue;
          }
        } else if (probeValues.length > 0) {
          // Fallback: use last available value
          const lastValue = probeValues[probeValues.length - 1].value;
          bestVal = Math.abs(lastValue) < 1e-6 ? 0 : lastValue;
        }

        limitVal = isFinite(bestVal) ? bestVal : NaN;
      } else {
        const h=1e-10;
        const ra=dfFn(a+h)/dgFn(a+h), rb=dfFn(a-h)/dgFn(a-h);
        limitVal=(isFinite(ra)&&isFinite(rb))?(ra+rb)/2:(isFinite(ra)?ra:rb);
      }
      ST.hops=k+1; _foundLimit = true; break;
    }

    // If still indeterminate but r is finite, use as best estimate and continue
    if (isFinite(r)) {
      limitVal = r;
    }
    ST.hops = k+1;
  }

  // Fallback: if we exhausted iterations without converging, use last finite ratio
  if (!_foundLimit) {
    const lastDFn = ST.dfFns[ST.dfFns.length-1];
    const lastDGn = ST.dgFns[ST.dgFns.length-1];
    if (lastDFn && lastDGn) {
      if (isInf) {
        for (const tx of [10, 20, 30, 50]) {
          const fv = nEval(ST.dfSyms[ST.dfSyms.length-1], tx);
          const gv = nEval(ST.dgSyms[ST.dgSyms.length-1], tx);
          if (isFinite(fv) && isFinite(gv) && Math.abs(gv) > 1e-300) {
            limitVal = fv / gv;
            break;
          }
        }
      } else {
        const h = 1e-9;
        const ra = lastDFn(a+h)/lastDGn(a+h), rb = lastDFn(a-h)/lastDGn(a-h);
        limitVal = (isFinite(ra)&&isFinite(rb))?(ra+rb)/2:(isFinite(ra)?ra:rb);
      }
    }
    if (!isFinite(limitVal)) {
      limitVal = NaN;
    }
  }

  ST.limitVal = limitVal;
  
  const fmtLimit = (limitVal === 0 || (isFinite(limitVal) && Math.abs(limitVal) < 1e-15)) ? "0" : fmt(limitVal, 8);
  steps.push({
    type:"ok", icon:"bx-target-lock",
    title:`Resultado — ${ST.hops} iteración(es)`,
    math:`\\lim_{x\\to ${lp}}\\frac{f(x)}{g(x)}=${fmtLimit}`,
    concl:`Límite = ${fmtLimit}`
  });

  finalize(steps,lp);
}

function showErr(msg){
  const e=document.getElementById("err-strip");
  e.style.display="block";
  e.innerHTML=`<div class="err-strip"><i class="bx bx-error-circle" style="vertical-align:middle;margin-right:5px;"></i>${msg}</div>`;
  document.getElementById("diag-out").innerHTML=`<div class="diag-idle">Corrige el error y vuelve a intentarlo.</div>`;
}

function finalize(steps,lp){
  renderDiag(steps);

  const resStrip=document.getElementById("result-strip");
  const lv = ST.limitVal;
  if(lv !== null && (lv === 0 || isFinite(lv))){
    resStrip.style.display="block";
    resStrip.innerHTML=`
      <div class="res-strip">
        <div class="rs-lbl">Límite exacto</div>
        <div class="rs-val">${fmt(lv,8)}</div>
        <div class="rs-sub">${ST.hops>0?ST.hops+" aplicación(es) de L'Hôpital":"Evaluación directa"}</div>
      </div>`;
  } else {
    resStrip.style.display="none";
  }

  ST.ready=true;
  setupSlider();
  createChart();
  updateMetricLabels();
  // Initialize speedometer at slider position
  const initX = parseFloat(document.getElementById("x_slider").value);
  updateSpeedometer(initX);
  updateOrderAnalysis(initX);
}

/* ── Slider ──────────────────────────────────────── */
function setupSlider(){
  const s=document.getElementById("x_slider");
  const input=document.getElementById("x_input");
  const domain = calculateDomain(ST.aNum, ST.aIsInf);
  s.min = domain.min;
  s.max = domain.max;
  input.min = domain.min;
  input.max = domain.max;
  
  // Posición inicial cerca del punto a
  const offset = ST.aIsInf ? 0 : 0.1;
  const initialValue = ST.aIsInf ? 0 : ST.aNum + offset;
  s.value = Math.max(domain.min, Math.min(domain.max, initialValue));
  input.value = s.value;
  
  // Event listeners
  s.addEventListener("input", function(){
    // Solo actualizar el input si no está enfocado
    if (document.activeElement !== input) {
      input.value = s.value;
    }
    updateSlider();
  });
  
  input.addEventListener("input", function(){
    const x = parseFloat(input.value);
    if (!isNaN(x) && isFinite(x)) {
      const clampedX = Math.max(domain.min, Math.min(domain.max, x));
      s.value = clampedX;
      updateSlider();
    }
  });

  // Permitir edición completa del input sin interferencia
  input.addEventListener("keydown", function(e){
    // Permitir todas las teclas de edición
    if (e.key === "Backspace" || e.key === "Delete" || 
        e.key === "ArrowLeft" || e.key === "ArrowRight" || 
        e.key === "Home" || e.key === "End" ||
        e.key === "Tab" || e.key === "." || e.key === ",") {
      return;
    }
  });
  
  updateSlider();
}

function updateSlider(){
  if(!ST.ready) return;
  const x=parseFloat(document.getElementById("x_slider").value);
  
  // Actualizar elementos solo si existen
  const xLabel = document.getElementById("x_label");
  const xInput = document.getElementById("x_input");
  const valOrig = document.getElementById("val_orig");
  const valDeriv = document.getElementById("val_deriv");
  const valLimit = document.getElementById("val_limit");
  
  if (xLabel) xLabel.textContent=`x = ${x.toFixed(4)}`;
  // Solo actualizar el input si no está enfocado (usuario no está escribiendo)
  if (xInput && document.activeElement !== xInput) {
    xInput.value = x.toFixed(4);
  }

  const fR=ST.fFn&&ST.gFn?ST.fFn(x)/ST.gFn(x):NaN;
  const dfFn=ST.dfFns[ST.dfFns.length-1], dgFn=ST.dgFns[ST.dgFns.length-1];
  const dR=dfFn&&dgFn?dfFn(x)/dgFn(x):NaN;

  if (valOrig) valOrig.textContent=isFinite(fR)?fmt(fR,6):"Indefinido";
  if (valDeriv) valDeriv.textContent=isFinite(dR)?fmt(dR,6):"Indefinido";
  const finalVal = ST.limitVal;
  if (valLimit) valLimit.textContent =
    (finalVal === 0) ? "0" :
    (finalVal !== null && isFinite(finalVal) ? fmt(finalVal, 6) : "—");

  // Update speedometer with current x
  updateSpeedometer(x);
  // Update order analysis bars
  updateOrderAnalysis(x);

  // Redraw chart so the slider marker updates position
  if (chartInstance) chartInstance.update('none');
}

function updateMetricLabels(){
  waitK(()=>{
    K("\\tfrac{f}{g}", document.getElementById("mc0"), false);
    K("\\tfrac{f'}{g'}", document.getElementById("mc1"), false);
  });
}

/* ── Preset ──────────────────────────────────────── */
document.getElementById("preset-sel").addEventListener("change",function(){
  if(!this.value) {
    ST.presetXMin = null;
    ST.presetXMax = null;
    return;
  }
  const [f,g,a,xmin,xmax]=this.value.split("|");
  document.getElementById("f_input").value=f;
  document.getElementById("g_input").value=g;
  document.getElementById("a_input").value=a;
  const min = parseFloat(xmin);
  const max = parseFloat(xmax);
  ST.presetXMin = Number.isFinite(min) ? min : null;
  ST.presetXMax = Number.isFinite(max) ? max : null;
});

/* ══════════════════════════════════════════════════════
   ANÁLISIS DE ORDEN — Barras de Magnitud
══════════════════════════════════════════════════════ */
function updateOrderAnalysis(x) {
  const fBar   = document.getElementById("order-f-bar");
  const gBar   = document.getElementById("order-g-bar");
  const fValEl = document.getElementById("order-f-val");
  const gValEl = document.getElementById("order-g-val");
  const noteEl = document.getElementById("order-note");
  const ptLbl  = document.getElementById("order-point-label");
  if (!fBar || !gBar) return;

  if (!ST.ready || !ST.fFn || !ST.gFn) {
    fBar.style.width = "0%"; gBar.style.width = "0%";
    if (fValEl) fValEl.textContent = "—";
    if (gValEl) gValEl.textContent = "—";
    if (noteEl) noteEl.textContent = "Calcula un límite primero.";
    return;
  }

  if (ptLbl) ptLbl.textContent = ST.aIsInf ? "x → ∞" : `x → ${ST.aStr}`;
  const fv = ST.fFn(x);
  const gv = ST.gFn(x);
  const fAbs = isFinite(fv) ? Math.abs(fv) : 0;
  const gAbs = isFinite(gv) ? Math.abs(gv) : 0;
  const maxAbs = Math.max(fAbs, gAbs, 1e-15);

  // Log scale for better visualization across orders of magnitude
  const logScale = v => {
    if (v < 1e-20) return 0;
    const logV   = Math.log10(v + 1e-20);
    const logMax = Math.log10(maxAbs + 1e-20);
    const logMin = logMax - 12;
    return Math.max(2, Math.min(100, ((logV - logMin) / (logMax - logMin)) * 100));
  };

  fBar.style.width = logScale(fAbs).toFixed(1) + "%";
  gBar.style.width = logScale(gAbs).toFixed(1) + "%";

  if (fValEl) fValEl.textContent = isFinite(fv) ? fmt(fv, 4) : (fv > 0 ? "+∞" : "−∞");
  if (gValEl) gValEl.textContent = isFinite(gv) ? fmt(gv, 4) : (gv > 0 ? "+∞" : "−∞");

  if (noteEl) {
    if (!isFinite(fv) || !isFinite(gv)) {
      noteEl.textContent = "Al menos una función diverge → ∞.";
    } else if (fAbs < 1e-6 && gAbs < 1e-6) {
      noteEl.textContent = "Ambas → 0: indeterminación 0/0 confirmada.";
    } else if (fAbs > gAbs * 10) {
      noteEl.textContent = "f domina sobre g en este punto.";
    } else if (gAbs > fAbs * 10) {
      noteEl.textContent = "g domina sobre f en este punto.";
    } else {
      noteEl.textContent = "f y g tienen magnitudes comparables.";
    }
  }
}

/* ══════════════════════════════════════════════════════
   VELOCÍMETRO DE PENDIENTE
══════════════════════════════════════════════════════ */
// Gauge: semicircle, center=(90,90), radius=70
// Angle convention (SVG standard): 180°=left(−), 90°=up(0), 0°=right(+)
// Needle is a <line> rotated around pivot (90,90).
// The line rests pointing UP (to y=24). SVG rotate(deg, 90, 90):
//   rotate(0)   → up   → represents value=0
//   rotate(90)  → right → value → +∞
//   rotate(-90) → left  → value → −∞

const SPD_CX = 90, SPD_CY = 90, SPD_R = 70;

function initSpeedTrack() {
  // Track is hardcoded in SVG, nothing to compute
}

// Map derivative value → SVG rotation degrees for the needle
// Uses atan to compress ±∞ into ±90°
function valueToNeedleRot(v) {
  if (!isFinite(v)) return v > 0 ? 90 : -90;
  return (Math.atan(v / 3) / (Math.PI / 2)) * 90; // maps ±∞ → ±90
}

// Arc path on the gauge semicircle from angle a1 to a2 (degrees, standard math)
// 180°=left, 0°=right; we want CCW direction (upward sweep)
function spdArcPath(a1Deg, a2Deg) {
  const toRad = d => d * Math.PI / 180;
  const x1 = SPD_CX + SPD_R * Math.cos(toRad(a1Deg));
  const y1 = SPD_CY - SPD_R * Math.sin(toRad(a1Deg)); // SVG y inverted
  const x2 = SPD_CX + SPD_R * Math.cos(toRad(a2Deg));
  const y2 = SPD_CY - SPD_R * Math.sin(toRad(a2Deg));
  const sweep = a2Deg > a1Deg ? 0 : 1; // CCW=0, CW=1
  const large = Math.abs(a2Deg - a1Deg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${SPD_R} ${SPD_R} 0 ${large} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function slopeColor(v) {
  if (!isFinite(v)) return "#94a3b8";
  const mag = Math.abs(v);
  if (mag > 5)   return "#f87171";
  if (mag > 1.5) return "#fbbf24";
  if (mag > 0.1) return "#34d399";
  return "#60a5fa";
}
function slopeClass(v) {
  if (!isFinite(v)) return "zero";
  const mag = Math.abs(v);
  if (mag > 5)   return "high";
  if (mag > 1.5) return "med";
  if (mag > 0.1) return "low";
  return "zero";
}

function updateSpeedometer(x) {
  const needle = document.getElementById("speed-needle");
  const fill   = document.getElementById("speed-fill");
  const spdF   = document.getElementById("spd-f");
  const spdG   = document.getElementById("spd-g");
  const badge  = document.getElementById("speed-badge");
  if (!needle || !fill || !spdF || !spdG) return;

  if (!ST.ready || !ST.dfFns.length || !ST.dgFns.length) {
    needle.setAttribute("transform", `rotate(0, ${SPD_CX}, ${SPD_CY})`);
    fill.setAttribute("d", "");
    spdF.textContent = "—"; spdF.className = "speed-val-num zero";
    spdG.textContent = "—"; spdG.className = "speed-val-num zero";
    if (badge) badge.textContent = "Sin datos";
    return;
  }

  const dfFn = ST.dfFns[ST.dfFns.length - 1];
  const dgFn = ST.dgFns[ST.dgFns.length - 1];
  const dfVal = dfFn ? dfFn(x) : NaN;
  const dgVal = dgFn ? dgFn(x) : NaN;

  spdF.textContent = isFinite(dfVal) ? fmt(dfVal, 5) : (dfVal > 0 ? "+∞" : "−∞");
  spdG.textContent = isFinite(dgVal) ? fmt(dgVal, 5) : (dgVal > 0 ? "+∞" : "−∞");
  spdF.className = "speed-val-num " + slopeClass(dfVal);
  spdG.className = "speed-val-num " + slopeClass(dgVal);

  const rot   = valueToNeedleRot(dfVal);          // −90..+90
  const color = slopeColor(dfVal);

  // Rotate needle around center pivot
  needle.setAttribute("transform", `rotate(${rot.toFixed(2)}, ${SPD_CX}, ${SPD_CY})`);
  needle.setAttribute("stroke", color);

  // Fill arc: from 90° (top/zero) toward current needle direction
  // rot < 0 → fill left half (90° → 90+|rot|°), rot > 0 → fill right half (90° → 90-rot°)
  // In math-angle terms: gauge center=90°, left=180°, right=0°
  // needle rot=-90 → math angle 180°, rot=0 → 90°, rot=+90 → 0°
  // so math_angle = 90 - rot
  if (isFinite(dfVal) && Math.abs(rot) > 0.5) {
    const mathAngle = 90 - rot; // value at current needle
    // always fill from 90° (top) to mathAngle
    const a1 = 90, a2 = mathAngle;
    fill.setAttribute("d", spdArcPath(a1, a2));
    fill.setAttribute("stroke", color);
  } else {
    fill.setAttribute("d", "");
  }

  const mag = isFinite(dfVal) ? Math.abs(dfVal) : Infinity;
  if (badge) {
    badge.textContent = mag > 5 ? "Alta" : mag > 1.5 ? "Media" : mag > 0.1 ? "Baja" : "Cero";
    badge.style.background = `${color}22`;
    badge.style.color = color;
    badge.style.borderColor = `${color}44`;
  }
}

/* ── Events ──────────────────────────────────────── */
document.getElementById("calc-btn").addEventListener("click", validateAndCalculate);
document.getElementById("detail-btn").addEventListener("click", openModal);
/* ── Init ────────────────────────────────────────── */
window.addEventListener("load",()=>{
  buildMembers();
  initSpeedTrack();
  waitK(()=>{
    renderTeoria();
    renderTheoryMath();
  });
});