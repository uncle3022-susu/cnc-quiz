const CATEGORY_ORDER = ["CNC銑床", "機工類", "職業安全", "工作倫理", "環境保護", "節能減碳"];
const CATEGORY_INFO = {
  "CNC銑床": { slug:"cnc", mode:"ratio", label:"CNC銑床" },
  "機工類": { slug:"machine", mode:"ratio", label:"機工類" },
  "職業安全": { slug:"safety", mode:"single", label:"職業安全" },
  "工作倫理": { slug:"ethics", mode:"single", label:"工作倫理" },
  "環境保護": { slug:"environment", mode:"single", label:"環境保護" },
  "節能減碳": { slug:"energy", mode:"single", label:"節能減碳" }
};

const STATE_VERSION = 2;
const STORAGE_KEY = "skill-quiz-state-v2";
const LEGACY_STORAGE_KEY = "skill-quiz-state-v1";

const app = document.getElementById("app");
const main = document.getElementById("main");
const pageTitle = document.getElementById("pageTitle");
const bottomNav = document.getElementById("bottomNav");
const modalRoot = document.getElementById("modalRoot");
const toastRoot = document.getElementById("toastRoot");

let questions = [];
let stats = {};
let state = loadState();
let page = "quiz";
let currentQuiz = null;
let expandedReview = new Set();
let imageModalState = null;

function defaultState(){
  return {
    version: STATE_VERSION,
    wrong: {},
    history: [],
    tested: {}
  };
}

function normalizeState(raw){
  const base = defaultState();
  if(!raw || typeof raw !== "object") return base;
  const out = {...base};
  if(raw.version != null) out.version = Number(raw.version) || 1;
  if(raw.wrong && typeof raw.wrong === "object"){
    out.wrong = Object.fromEntries(CATEGORY_ORDER.map(cat => [cat, unique(Array.isArray(raw.wrong[cat]) ? raw.wrong[cat].map(String) : [])]));
  }
  if(Array.isArray(raw.history)) out.history = raw.history.filter(Boolean).slice(0, 20);
  if(raw.tested && typeof raw.tested === "object"){
    out.tested = Object.fromEntries(CATEGORY_ORDER.map(cat => [cat, unique(Array.isArray(raw.tested[cat]) ? raw.tested[cat].map(String) : [])]));
  }
  out.version = STATE_VERSION;
  return out;
}

function migrateState(raw, fromVersion=1){
  // v1 -> v2: preserve wrong/history; add per-category tested-question records.
  if(fromVersion < 2) return normalizeState(raw);
  return normalizeState(raw);
}

function loadState(){
  try{
    const current = localStorage.getItem(STORAGE_KEY);
    if(current){
      const parsed = JSON.parse(current);
      if(Number(parsed?.version) === STATE_VERSION) return normalizeState(parsed);
      const migrated = migrateState(parsed, Number(parsed?.version)||1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if(legacy){
      const parsed = JSON.parse(legacy);
      const migrated = migrateState(parsed, 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  }catch(e){ console.warn("state load/migration failed", e); }
  return defaultState();
}

function saveState(){
  state.version = STATE_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toast(msg){
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
  setTimeout(()=>toastRoot.innerHTML="",2300);
}

function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function unique(arr){ return [...new Set(arr)]; }
function byCategory(cat){ return questions.filter(q=>q.category===cat); }
function answerKey(arr){ return [...arr].map(String).sort().join(","); }
function isCorrect(q, selected){ return answerKey(q.answer)===answerKey(selected||[]); }
function safeCount(cat){ return byCategory(cat).length; }
function testedIds(cat){ return new Set(state.tested?.[cat] || []); }
function untestedQuestions(cat){
  const used = testedIds(cat);
  return byCategory(cat).filter(q=>!used.has(String(q.id)));
}
function recordTested(cat, qs){
  if(!state.tested[cat]) state.tested[cat]=[];
  state.tested[cat] = unique([...state.tested[cat], ...qs.map(q=>String(q.id))]);
}
function ratioSplit(total){
  const single=Math.round(total*0.7);
  return {single, multiple:total-single};
}

function buildQuizFromPool(cat, total, pool){
  if(!pool.length) return null;
  total=Math.min(total,pool.length);
  let selected=[];
  if(CATEGORY_INFO[cat].mode==="ratio"){
    let {single,multiple}=ratioSplit(total);
    const singles=shuffle(pool.filter(q=>q.type==="single"));
    const multis=shuffle(pool.filter(q=>q.type==="multiple"));
    if(singles.length<single){ multiple += single-singles.length; single=singles.length; }
    if(multis.length<multiple){ single += multiple-multis.length; multiple=multis.length; }
    selected=[...singles.slice(0,single), ...multis.slice(0,multiple)];
    if(selected.length<total){
      const used=new Set(selected.map(q=>q.id));
      const extra=shuffle(pool.filter(q=>!used.has(q.id)));
      selected.push(...extra.slice(0,total-selected.length));
    }
    selected = selected.slice(0,total).sort((a,b)=>a.type===b.type?0:(a.type==="single"?-1:1));
  }else{
    selected=shuffle(pool.filter(q=>q.type==="single")).slice(0,total);
  }
  return {
    id:globalThis.crypto?.randomUUID?.()||String(Date.now()+Math.random()),
    category:cat,
    total:selected.length,
    questions:selected,
    answers:{},
    index:0,
    startedAt:Date.now(),
    interrupted:false
  };
}

function startQuizWithTotal(cat,total){
  const pool=untestedQuestions(cat);
  return buildQuizFromPool(cat,total,pool);
}

function openPdf(q){
  const info=CATEGORY_INFO[q.category];
  const url=`pdfs/${info.slug}.pdf#page=${q.pdfPage}`;
  window.open(url,"_blank","noopener");
}

function render(){
  pageTitle.textContent = page==="quiz" ? (currentQuiz?"測驗中":"測驗") : "個人";
  bottomNav.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  document.getElementById("homeQuickBtn").style.visibility = page==="quiz" && !currentQuiz ? "hidden":"visible";
  main.innerHTML = page==="quiz" ? (currentQuiz?(currentQuiz.finished?renderResults():renderQuiz()):renderQuizHome()) : renderProfile();
  bindEvents();
  bindImageFallbacks();
}

function renderQuizHome(){
  return `<section class="hero"><div class="eyebrow">SKILL PRACTICE</div><h2>今天想練哪一科？</h2><p>每一輪測驗過的題目會先暫時排除，持續刷完本輪題庫後再重新隨機。</p></section>
  <div class="grid">${CATEGORY_ORDER.map((cat,i)=>{
    const s=stats[cat]||{}; const total=safeCount(cat); const left=untestedQuestions(cat).length;
    return `<button class="category-card" data-cat="${escapeHtml(cat)}">
      <div class="num">0${i+1}</div><h3>${escapeHtml(cat)}</h3><p>${s.usable??total} 題題庫</p><span class="remaining">本輪剩 ${left} 題</span><span class="arrow">›</span>
    </button>`;
  }).join("")}</div>
  <section class="section"><div class="section-title"><span>題庫總覽</span></div><div class="stat-row">${[
    ["總題數",questions.length], ["個人錯題",Object.values(state.wrong).reduce((n,a)=>n+a.length,0)], ["最近測驗",Math.min(3,state.history.length)]
  ].map(([a,b])=>`<div class="stat"><b>${b}</b><span>${a}</span></div>`).join("")}</div></section>`;
}

function renderImageButton(q, extraClass=""){
  if(!q.image) return "";
  return `<button class="question-image-wrap ${extraClass}" data-image="${escapeHtml(q.image)}" aria-label="點擊放大查看題目圖片">
    <img class="question-image" src="${escapeHtml(q.image)}" alt="${escapeHtml(q.imageAlt||`${q.category} 第${q.originalQuestionNumber}題原始圖片`)}" loading="eager">
    <span class="image-hint">點一下放大</span>
  </button>`;
}

function renderQuiz(){
  const q=currentQuiz.questions[currentQuiz.index];
  const selected=currentQuiz.answers[q.id]||[];
  const pct=Math.round((currentQuiz.index+1)/currentQuiz.total*100);
  const hasImage=!!q.image;
  return `<div class="quiz-shell">
    <div class="quiz-meta"><span>第 ${currentQuiz.index+1} / ${currentQuiz.total} 題</span><span>${pct}%</span></div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <article class="card question-card">
      <div class="question-source">PDF 第 ${q.pdfPage} 頁</div>
      ${q.type==="multiple"?'<div class="question-type">複選題 · 可選擇多個答案</div>':''}
      ${hasImage ? `<div class="visual-question-note">題目圖如下，點一下可以放大查看</div>${renderImageButton(q)}` : `<div class="question-text">${escapeHtml(q.question)}</div>`}
      <div class="option-list ${hasImage?'visual-options':''}">${[1,2,3,4].map(n=>{
        const text=q.options[String(n)]||"";
        const chosen=selected.includes(String(n));
        return `<button class="option ${chosen?'selected':''} ${!text?'missing':''}" data-option="${n}"><span class="option-letter">${n}</span><span class="option-text">${hasImage ? n : (text?escapeHtml(text):'此選項內容缺失')}</span></button>`;
      }).join("")}</div>
    </article>
    <div class="quiz-actions"><button class="secondary-btn" data-action="prev" ${currentQuiz.index===0?'disabled':''}>上一題</button><button class="primary-btn" data-action="next" ${selected.length===0?'disabled':''}>${currentQuiz.index===currentQuiz.total-1?'完成測驗':'下一題'}</button></div>
  </div>`;
}

function renderProfile(){
  const wrongTotal=Object.values(state.wrong).reduce((n,a)=>n+a.length,0);
  return `<section class="profile-header"><div class="eyebrow">MY STUDY</div><h2>我的學習</h2><p>曾經答錯的題目會留在這裡，方便日後複習。</p></section>
  <section class="section"><div class="wrong-grid">${CATEGORY_ORDER.map(cat=>{const n=(state.wrong[cat]||[]).length; return `<button class="wrong-card" data-wrongcat="${escapeHtml(cat)}"><div><h3>${escapeHtml(cat)}錯題</h3><p>${n?`已累積 ${n} 題`:'目前沒有錯題'}</p></div><span class="count">${n}</span></button>`}).join("")}</div></section>
  <section class="section"><div class="section-title"><span>最近測驗</span><span>最新 3 筆</span></div><div class="card">${state.history.length?state.history.slice(0,3).map(h=>`<div class="history-item"><div><b>${escapeHtml(h.category)}</b><div class="meta">${escapeHtml(h.date)} · ${h.total} 題 · 答對 ${h.correct} 題${h.interrupted?' · 中斷':''}</div></div><span class="history-score">${h.accuracy}%</span></div>`).join(""):'<div class="empty">還沒有測驗紀錄</div>'}</div></section>
  <section class="section"><div class="section-title"><span>資料管理</span><span>${wrongTotal} 個錯題</span></div><div class="manage"><button class="secondary-btn" data-manage="clearWrong">清除全部錯題</button><button class="danger-btn" data-manage="clearAll">清除所有網站資料</button></div></section>`;
}

function openQuestionCountModal(cat){
  const untested=untestedQuestions(cat);
  const totalPool=safeCount(cat);
  const options=[];
  // Dropdown is based on the full category pool, not only the untested remainder,
  // so the user can intentionally choose a count larger than the remaining pool and
  // then receive the explicit "剩餘題庫不足" confirmation.
  for(let n=10;n<=100;n+=10) if(n<=totalPool) options.push(n);
  if(!options.length && totalPool>0) options.push(totalPool);
  if(totalPool>0 && totalPool<10 && !options.includes(totalPool)) options.unshift(totalPool);
  const defaultValue=options[0]||0;
  const info=CATEGORY_INFO[cat];
  const ratio=info.mode==="ratio"?ratioSplit(defaultValue):{single:defaultValue,multiple:0};

  if(untested.length===0){
    modalRoot.innerHTML=`<div class="modal-backdrop" data-closemodal="1"><div class="modal" role="dialog" aria-modal="true">
      <div class="eyebrow">NEW ROUND</div><h3>題目皆已測驗過</h3><p>${escapeHtml(cat)} 本輪所有題目都已測驗過，是否重新隨機測驗？</p>
      <div class="modal-actions"><button class="secondary-btn" data-close="1">取消</button><button class="primary-btn" data-rerandomize="1">重新隨機測驗</button></div>
    </div></div>`;
    bindModalClose();
    modalRoot.querySelector('[data-rerandomize]')?.addEventListener('click',()=>{
      state.tested[cat]=[];
      saveState();
      modalRoot.innerHTML="";
      const qz=startQuizWithTotal(cat,10<=totalPool?10:totalPool);
      if(!qz){toast('此科目目前沒有可用題庫');return;}
      currentQuiz=qz; page="quiz"; render();
    });
    return;
  }

  modalRoot.innerHTML=`<div class="modal-backdrop" data-closemodal="1"><div class="modal" role="dialog" aria-modal="true">
    <div class="eyebrow">START QUIZ</div><h3>${escapeHtml(cat)}</h3><p>本輪尚有 ${untested.length} 題未測驗。</p>
    <select id="countSelect" class="select">${options.map(n=>`<option value="${n}" ${n===defaultValue?'selected':''}>${n} 題</option>`).join("")}</select>
    <div id="ratioBox" class="ratio-box">${info.mode==="ratio"?`本次測驗：單選 ${ratio.single} 題・複選 ${ratio.multiple} 題`:'本次測驗：100% 單選題'}</div>
    <div id="roundNotice" class="round-notice"></div>
    <div class="modal-actions"><button class="secondary-btn" data-close="1">取消</button><button class="primary-btn" data-start="1">開始測驗</button></div>
  </div></div>`;
  const select=document.getElementById('countSelect');
  const notice=document.getElementById('roundNotice');
  const update=()=>{
    const t=Number(select.value); const r=info.mode==="ratio"?ratioSplit(t):{single:t,multiple:0};
    document.getElementById('ratioBox').textContent=info.mode==="ratio"?`本次測驗：單選 ${r.single} 題・複選 ${r.multiple} 題`:'本次測驗：100% 單選題';
    notice.textContent = t>untested.length ? `本次尚有${untested.length}題未測驗，題庫剩餘題數不足選擇測驗題數，是否測驗這${untested.length}題？` : '';
  };
  select.addEventListener('change',update); update();
  modalRoot.querySelector('[data-start]')?.addEventListener('click',()=>{
    const wanted=Number(select.value);
    if(wanted>untested.length){
      openRemainConfirmModal(cat,untested.length);
      return;
    }
    const qz=startQuizWithTotal(cat,wanted);
    modalRoot.innerHTML="";
    if(!qz){toast('此科目目前沒有可用題庫');return;}
    currentQuiz=qz; page='quiz'; render();
  });
  bindModalClose();
}

function openRemainConfirmModal(cat, remaining){
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">
    <div class="eyebrow">LAST QUESTIONS</div><h3>剩餘題庫不足</h3>
    <p>本次尚有${remaining}題未測驗，題庫剩餘題數不足選擇測驗題數，是否測驗這${remaining}題？</p>
    <div class="modal-actions"><button class="secondary-btn" data-close="1">取消</button><button class="primary-btn" data-startremaining="1">開始${remaining}題測驗</button></div>
  </div></div>`;
  bindModalClose();
  modalRoot.querySelector('[data-startremaining]')?.addEventListener('click',()=>{
    const qz=startQuizWithTotal(cat,remaining); modalRoot.innerHTML="";
    if(!qz){toast('目前沒有可用題庫');return;}
    currentQuiz=qz; page='quiz'; render();
  });
}

function bindModalClose(){
  modalRoot.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>modalRoot.innerHTML=''));
  const backdrop=modalRoot.querySelector('.modal-backdrop');
  backdrop?.addEventListener('click',e=>{if(e.target===backdrop) modalRoot.innerHTML='';});
  modalRoot.querySelector('.modal')?.addEventListener('click',e=>e.stopPropagation());
}

function finishQuiz(interrupted=false){
  const answeredQuestions=currentQuiz.questions.filter(q=>Array.isArray(currentQuiz.answers[q.id]) && currentQuiz.answers[q.id].length);
  const results=answeredQuestions.map(q=>({q,selected:currentQuiz.answers[q.id]||[],correct:isCorrect(q,currentQuiz.answers[q.id]||[])}));
  if(!results.length){
    currentQuiz=null; page='quiz'; toast('尚未作答，未產生測驗結果。'); render(); return;
  }
  const correct=results.filter(r=>r.correct).length;
  const wrong=results.length-correct;
  const accuracy=Math.round(correct/results.length*100);
  const date=new Date().toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  results.filter(r=>!r.correct).forEach(r=>{
    const arr=state.wrong[r.q.category]||[];
    if(!arr.includes(String(r.q.id))) arr.push(String(r.q.id));
    state.wrong[r.q.category]=arr;
  });
  recordTested(currentQuiz.category, answeredQuestions);
  state.history.unshift({date,category:currentQuiz.category,total:results.length,correct,wrong,accuracy,interrupted:!!interrupted});
  state.history=state.history.slice(0,3);
  saveState();
  currentQuiz={...currentQuiz,results,correct,wrong,accuracy,finished:true,interrupted:!!interrupted,answeredCount:results.length};
  expandedReview=new Set();
  render();
}

function renderResults(){
  const label=currentQuiz.interrupted?'測驗中斷結果':'測驗完成';
  return `<section class="result-hero"><div class="result-badge">${escapeHtml(label)}</div><div class="score">${currentQuiz.accuracy}%</div><h2>${currentQuiz.accuracy===100?'太厲害了！':currentQuiz.accuracy>=80?'表現很好！':currentQuiz.accuracy>=60?'繼續努力！':'建議再複習錯題。'}</h2><p>${escapeHtml(currentQuiz.category)} · 已作答 ${currentQuiz.answeredCount} 題${currentQuiz.interrupted?` · 尚有 ${currentQuiz.total-currentQuiz.answeredCount} 題未作答`:''}</p></section>
  <div class="stat-row"><div class="stat"><b>${currentQuiz.correct}</b><span>答對</span></div><div class="stat"><b>${currentQuiz.wrong}</b><span>答錯</span></div><div class="stat"><b>${currentQuiz.answeredCount}</b><span>已作答</span></div></div>
  <section class="section"><div class="section-title"><span>錯題檢視</span><span>${currentQuiz.wrong} 題</span></div><div class="review-list">${currentQuiz.results.filter(r=>!r.correct).map((r,i)=>reviewItem(r,i)).join('') || '<div class="card empty">這次已作答題目全部答對 🎉</div>'}</div></section>
  <button class="secondary-btn full-btn" data-result="home">返回測驗首頁</button>`;
}

function renderOptionInline(q){
  return `<div class="inline-options">${[1,2,3,4].map(n=>`${n}. ${q.options[String(n)]?escapeHtml(q.options[String(n)]):'圖片選項'}`).join(' ')}</div>`;
}

function reviewItem(r,i){
  const open=expandedReview.has(r.q.id);
  return `<div class="review-item"><button class="review-head" data-review="${escapeHtml(r.q.id)}"><span>錯題 ${i+1} ・ PDF 第 ${r.q.originalQuestionNumber} 題</span><span>${open?'⌃':'⌄'}</span></button>${open?`<div class="review-body">${renderImageButton(r.q,'review-image')}<div class="q">${escapeHtml(r.q.question)}</div>${renderOptionInline(r.q)}<div class="answer-line"><span class="tag-wrong">你的答案</span><div class="answers">${(r.selected.length?r.selected:['未作答']).map(x=>`<span class="answer-chip">${x}</span>`).join('')}</div></div><div class="answer-line"><span class="tag-correct">正確答案</span><div class="answers">${r.q.answer.map(x=>`<span class="answer-chip correct">${x}</span>`).join('')}</div></div></div>`:''}</div>`;
}

function openWrongModal(cat){
  const ids=new Set(state.wrong[cat]||[]);
  const qs=byCategory(cat).filter(q=>ids.has(String(q.id)));
  modalRoot.innerHTML=`<div class="modal-backdrop wrong-modal-backdrop" data-wrongback="1"><div class="modal wrong-modal" role="dialog" aria-modal="true">
    <div class="eyebrow">WRONG QUESTIONS</div><h3>${escapeHtml(cat)}錯題</h3><p>${qs.length?`共 ${qs.length} 題。正確答案以黃色螢光標記。`:'目前沒有錯題。'}</p>
    <div class="wrong-scroll">${qs.map((q,i)=>`<article class="wrong-detail"><div class="wrong-detail-title">${i+1}. ${escapeHtml(q.question)}</div>${renderImageButton(q,'wrong-image')}${renderOptionInline(q)}<div class="answer-line correct-answer-line">正確答案：${q.answer.map(x=>`<span class="answer-chip correct">${x}</span>`).join('')} <span class="pdf-question-ref">PDF 第 ${q.originalQuestionNumber} 題</span></div></article>`).join('') || '<div class="empty">目前沒有錯題。</div>'}</div>
    <div class="modal-sticky-actions"><button class="secondary-btn" data-closewrong="1">關閉</button><button class="primary-btn" data-practice="1" ${qs.length?'':'disabled'}>錯題練習</button></div>
  </div></div>`;
  modalRoot.querySelector('[data-closewrong]')?.addEventListener('click',()=>modalRoot.innerHTML='');
  modalRoot.querySelector('[data-practice]')?.addEventListener('click',()=>{
    if(!qs.length)return;
    modalRoot.innerHTML='';
    const total=Math.min(10,qs.length);
    currentQuiz={id:globalThis.crypto?.randomUUID?.()||String(Date.now()),category:cat,total,questions:shuffle(qs).slice(0,total),answers:{},index:0,startedAt:Date.now(),interrupted:false,fromWrongPractice:true};
    page='quiz'; render();
  });
  modalRoot.querySelector('[data-wrongback]')?.addEventListener('click',e=>{if(e.target===e.currentTarget)modalRoot.innerHTML='';});
  modalRoot.querySelector('.wrong-modal')?.addEventListener('click',e=>e.stopPropagation());
}

function openImageModal(src,alt){
  imageModalState={src,alt};
  modalRoot.insertAdjacentHTML('beforeend', `<div class="image-lightbox" data-lightbox="1"><button class="lightbox-close" data-lightbox-close aria-label="關閉">×</button><div class="lightbox-inner"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt||'題目圖片')}"><div class="lightbox-caption">點擊空白處關閉</div></div></div>`);
  const box=modalRoot.querySelector('[data-lightbox]');
  box.addEventListener('click',e=>{if(e.target===box)closeImageModal();});
  box.querySelector('[data-lightbox-close]').addEventListener('click',closeImageModal);
}
function closeImageModal(){
  modalRoot.querySelector('[data-lightbox]')?.remove(); imageModalState=null;
}
function bindImageFallbacks(){
  document.querySelectorAll('.question-image').forEach(img=>img.addEventListener('error',()=>{
    img.closest('.question-image-wrap')?.classList.add('image-error');
  },{once:true}));
}

function manageData(kind){
  const msg={clearWrong:'確定要清除所有錯題嗎？這個動作無法復原。',clearAll:'確定要清除所有網站資料嗎？這會清除本機儲存的錯題、測驗紀錄與本輪出題紀錄。題庫與網站程式不會被刪除。'}[kind];
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><h3>確認操作</h3><p>${msg}</p><div class="modal-actions"><button class="secondary-btn" data-cancel>取消</button><button class="danger-btn" data-ok>確定</button></div></div></div>`;
  modalRoot.querySelector('[data-cancel]').addEventListener('click',()=>modalRoot.innerHTML='');
  modalRoot.querySelector('[data-ok]').addEventListener('click',()=>{
    if(kind==='clearWrong') state.wrong={};
    if(kind==='clearAll'){
      state=defaultState();
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    if(kind!=='clearAll') saveState();
    modalRoot.innerHTML=''; toast('資料已更新'); render();
  });
}

function openInterruptConfirm(){
  const answered=currentQuiz.questions.filter(q=>Array.isArray(currentQuiz.answers[q.id]) && currentQuiz.answers[q.id].length).length;
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><div class="eyebrow">LEAVE QUIZ</div><h3>要中斷這次測驗嗎？</h3><p>目前已作答 ${answered} 題。按「是」後，這些已作答題目會完成判分，錯題會加入個人錯題，並將已作答題目記為本輪已測驗。</p><div class="modal-actions"><button class="secondary-btn" data-cancel>否，繼續作答</button><button class="danger-btn" data-interrupt>是，結束測驗</button></div></div></div>`;
  modalRoot.querySelector('[data-cancel]').addEventListener('click',()=>modalRoot.innerHTML='');
  modalRoot.querySelector('[data-interrupt]').addEventListener('click',()=>{modalRoot.innerHTML=''; finishQuiz(true);});
}

function bindEvents(){
  document.querySelectorAll('.category-card').forEach(b=>b.addEventListener('click',()=>openQuestionCountModal(b.dataset.cat)));
  document.querySelectorAll('.wrong-card').forEach(b=>b.addEventListener('click',()=>openWrongModal(b.dataset.wrongcat)));
  document.querySelectorAll('[data-option]').forEach(b=>b.addEventListener('click',()=>{
    const q=currentQuiz.questions[currentQuiz.index];
    const selected=new Set(currentQuiz.answers[q.id]||[]);
    const val=b.dataset.option;
    if(q.type==='single') currentQuiz.answers[q.id]=[val];
    else { selected.has(val)?selected.delete(val):selected.add(val); currentQuiz.answers[q.id]=[...selected].sort(); }
    render();
  }));
  document.querySelectorAll('[data-action="prev"]').forEach(b=>b.addEventListener('click',()=>{if(currentQuiz.index>0){currentQuiz.index--;render();}}));
  document.querySelectorAll('[data-action="next"]').forEach(b=>b.addEventListener('click',()=>{
    const q=currentQuiz.questions[currentQuiz.index];
    if(!(currentQuiz.answers[q.id]||[]).length)return;
    if(currentQuiz.index===currentQuiz.total-1) finishQuiz(false);
    else {currentQuiz.index++;render();}
  }));
  document.querySelectorAll('[data-result="home"]').forEach(b=>b.addEventListener('click',()=>{currentQuiz=null;page='quiz';render();}));
  document.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>{expandedReview.has(b.dataset.review)?expandedReview.delete(b.dataset.review):expandedReview.add(b.dataset.review);render();}));
  document.querySelectorAll('[data-manage]').forEach(b=>b.addEventListener('click',()=>manageData(b.dataset.manage)));
  document.querySelectorAll('[data-image]').forEach(b=>b.addEventListener('click',()=>openImageModal(b.dataset.image,b.querySelector('img')?.alt)));
}

bottomNav.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{
  if(currentQuiz && !currentQuiz.finished){ openInterruptConfirm(); return; }
  page=b.dataset.page; render();
}));

document.getElementById('homeQuickBtn').addEventListener('click',()=>{
  if(currentQuiz && !currentQuiz.finished){ openInterruptConfirm(); return; }
  currentQuiz=null; page='quiz'; render();
});

Promise.all([
  fetch('data/questions.json').then(r=>{if(!r.ok)throw new Error('題庫載入失敗');return r.json()}),
  fetch('data/stats.json').then(r=>{if(!r.ok)throw new Error('題庫統計載入失敗');return r.json()})
]).then(([data,s])=>{
  questions=data; stats=s;
  // Keep persisted IDs for deleted questions harmlessly; no migration is destructive.
  render();
}).catch(err=>{
  main.innerHTML=`<div class="card empty">題庫載入失敗，請重新整理頁面。<br><small>${escapeHtml(err.message)}</small></div>`;
});
