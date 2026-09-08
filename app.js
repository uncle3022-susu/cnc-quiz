const CATEGORY_ORDER = ["CNC銑床", "機工類", "職業安全", "工作倫理", "環境保護", "節能減碳"];
const CATEGORY_INFO = {
  "CNC銑床": { slug:"cnc", mode:"ratio", label:"CNC銑床" },
  "機工類": { slug:"machine", mode:"ratio", label:"機工類" },
  "職業安全": { slug:"safety", mode:"single", label:"職業安全" },
  "工作倫理": { slug:"ethics", mode:"single", label:"工作倫理" },
  "環境保護": { slug:"environment", mode:"single", label:"環境保護" },
  "節能減碳": { slug:"energy", mode:"single", label:"節能減碳" }
};

const STORAGE_KEY = "skill-quiz-state-v1";
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

function defaultState(){ return { wrong:{}, history:[] }; }
function loadState(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState(); }
  catch { return defaultState(); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function toast(msg){
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(msg)}</div>`;
  setTimeout(()=>toastRoot.innerHTML="",2300);
}
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function byCategory(cat){ return questions.filter(q=>q.category===cat); }
function answerKey(arr){ return [...arr].map(String).sort().join(","); }
function isCorrect(q, selected){ return answerKey(q.answer)===answerKey(selected||[]); }
function unique(arr){ return [...new Set(arr)]; }
function safeCount(cat){ return byCategory(cat).length; }
function ratioSplit(total){ return { single:Math.round(total*.7), multiple:total-Math.round(total*.7) }; }
function buildQuiz(cat,total){
  const pool=byCategory(cat);
  if(!pool.length) return null;
  total=Math.min(total,pool.length);
  let selected=[];
  if(CATEGORY_INFO[cat].mode==="ratio"){
    let {single,multiple}=ratioSplit(total);
    const singles=shuffle(pool.filter(q=>q.type==="single"));
    const multis=shuffle(pool.filter(q=>q.type==="multiple"));
    if(singles.length<single){ multiple+=single-singles.length; single=singles.length; }
    if(multis.length<multiple){ single+=multiple-multis.length; multiple=multis.length; }
    selected=[...singles.slice(0,single),...multis.slice(0,multiple)];
    selected=selected.slice(0,total);
    // If total is still short because one type ran out, fill from remaining unique pool.
    if(selected.length<total){ const used=new Set(selected.map(q=>q.id)); selected.push(...shuffle(pool.filter(q=>!used.has(q.id))).slice(0,total-selected.length)); }
    // Keep all singles before multiples. Extra fallback questions are sorted by type.
    selected.sort((a,b)=>a.type===b.type?0:(a.type==="single"?-1:1));
  } else {
    selected=shuffle(pool.filter(q=>q.type==="single")).slice(0,total);
  }
  return {id:crypto.randomUUID?.()||String(Date.now()), category:cat, total:selected.length, questions:selected, answers:{}, index:0, startedAt:Date.now()};
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
}
function renderQuizHome(){
  return `<section class="hero"><h2>今天想練哪一科？</h2><p>從題庫隨機抽題，同次測驗不重複；錯題會自動保存到個人。</p></section>
  <div class="grid">${CATEGORY_ORDER.map((cat,i)=>{
    const s=stats[cat]||{}; return `<button class="category-card" data-cat="${cat}">
      <div class="num">0${i+1}</div><h3>${escapeHtml(cat)}</h3><p>${s.usable??safeCount(cat)} 題</p><span class="arrow">›</span>
    </button>`;}).join("")}</div>
  <section class="section"><div class="section-title"><span>題庫總覽</span></div><div class="stat-row">${[
    ["總題數",questions.length],["錯題",Object.values(state.wrong).reduce((n,a)=>n+a.length,0)],["測驗次數",state.history.length]
  ].map(([a,b])=>`<div class="stat"><b>${b}</b><span>${a}</span></div>`).join("")}</div></section>`;
}
function renderQuiz(){
  const q=currentQuiz.questions[currentQuiz.index]; const selected=currentQuiz.answers[q.id]||[];
  const pct=Math.round((currentQuiz.index+1)/currentQuiz.total*100);
  return `<div class="quiz-shell">
    <div class="quiz-meta"><span>第 ${currentQuiz.index+1} / ${currentQuiz.total} 題</span><span>${pct}%</span></div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <article class="card question-card">
      <div class="question-source">PDF 第 ${q.pdfPage} 頁${q.printedPage?` ・原印頁 ${q.printedPage}`:""}</div>
      ${q.type==="multiple"?'<div class="question-type">複選題 · 可選擇多個答案</div>':''}
      <div class="question-text">${escapeHtml(q.question)}</div>
      <div class="option-list">${[1,2,3,4].map(n=>{
        const text=q.options[String(n)]||""; const chosen=selected.includes(String(n));
        return `<button class="option ${chosen?'selected':''} ${text?'':'missing'}" data-option="${n}"><span class="option-letter">${n}</span><span class="option-text">${text?escapeHtml(text):'此選項為 PDF 圖示內容，請查看原 PDF'}</span></button>`;
      }).join("")}</div>
      ${q.imageRequired?`<div class="source-callout">本題部分選項為圖示，網站題庫保留原 PDF 頁面。<a href="#" data-pdf="1">開啟 PDF 第 ${q.pdfPage} 頁</a></div>`:''}
    </article>
    <div class="quiz-actions"><button class="secondary-btn" data-action="prev" ${currentQuiz.index===0?'disabled':''}>上一題</button><button class="primary-btn" data-action="next" ${selected.length===0?'disabled':''}>${currentQuiz.index===currentQuiz.total-1?'完成測驗':'下一題'}</button></div>
  </div>`;
}
function renderProfile(){
  const wrongTotal=Object.values(state.wrong).reduce((n,a)=>n+a.length,0);
  return `<section class="profile-header"><h2>我的學習</h2><p>曾經答錯的題目會留在這裡，方便日後複習。</p></section>
  <section class="section"><div class="wrong-grid">${CATEGORY_ORDER.map(cat=>{const n=(state.wrong[cat]||[]).length; return `<button class="wrong-card" data-wrongcat="${cat}"><div><h3>${escapeHtml(cat)}錯題</h3><p>${n?`已累積 ${n} 題`:'目前沒有錯題'}</p></div><span class="count">${n}</span></button>`}).join("")}</div></section>
  <section class="section"><div class="section-title"><span>最近測驗</span></div><div class="card">${state.history.length?state.history.slice(0,20).map(h=>`<div class="history-item"><div><b>${escapeHtml(h.category)}</b><div class="meta">${escapeHtml(h.date)} · ${h.total} 題 · 答對 ${h.correct} 題</div></div><span class="history-score">${h.accuracy}%</span></div>`).join(""):'<div class="empty">還沒有測驗紀錄</div>'}</div></section>
  <section class="section"><div class="section-title"><span>資料管理</span><span>${wrongTotal} 個錯題</span></div><div class="manage"><button class="secondary-btn" data-manage="clearWrong">清除全部錯題</button><button class="secondary-btn" data-manage="clearHistory">清除測驗紀錄</button><button class="danger-btn" data-manage="clearAll">清除所有網站資料</button></div></section>`;
}
function openQuestionCountModal(cat, preset){
  const max=safeCount(cat); const options=[];
  for(let n=10;n<=100;n+=10) if(n<=max) options.push(n);
  if(!options.length && max>0) options.push(max);
  if(max>0 && max<10 && !options.includes(max)) options.unshift(max);
  const defaultValue=preset||options[0]||0;
  const info=CATEGORY_INFO[cat];
  const ratio = info.mode==="ratio" ? ratioSplit(defaultValue) : {single:defaultValue,multiple:0};
  modalRoot.innerHTML=`<div class="modal-backdrop" data-closemodal="1"><div class="modal" role="dialog" aria-modal="true">
    <div class="eyebrow">START QUIZ</div><h3>${escapeHtml(cat)}</h3><p>選擇這次想做的題數。</p>
    <select id="countSelect" class="select">${options.map(n=>`<option value="${n}" ${n===defaultValue?'selected':''}>${n} 題</option>`).join("")}</select>
    <div id="ratioBox" class="ratio-box">${info.mode==="ratio"?`本次測驗：單選 ${ratio.single} 題・複選 ${ratio.multiple} 題`:'本次測驗：100% 單選題'}</div>
    <div class="modal-actions"><button class="secondary-btn" data-close="1">取消</button><button class="primary-btn" data-start="1">開始測驗</button></div>
  </div></div>`;
  const select=document.getElementById("countSelect");
  select?.addEventListener("change",()=>{const t=Number(select.value);const r=info.mode==="ratio"?ratioSplit(t):{single:t,multiple:0};document.getElementById("ratioBox").textContent=info.mode==="ratio"?`本次測驗：單選 ${r.single} 題・複選 ${r.multiple} 題`:'本次測驗：100% 單選題';});
  modalRoot.querySelector('[data-start]')?.addEventListener('click',()=>{const total=Number(select.value);modalRoot.innerHTML="";currentQuiz=buildQuiz(cat,total);if(!currentQuiz){toast('此科目目前沒有可用題庫');return;}render();});
  modalRoot.querySelectorAll('[data-close],[data-closemodal]').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.closemodal && el.target!==el) return;modalRoot.innerHTML="";}));
  modalRoot.querySelector('.modal').addEventListener('click',e=>e.stopPropagation());
}
function finishQuiz(){
  const answers=currentQuiz.answers; const results=currentQuiz.questions.map(q=>({q,selected:answers[q.id]||[],correct:isCorrect(q,answers[q.id]||[])}));
  const correct=results.filter(r=>r.correct).length, wrong=results.length-correct, accuracy=Math.round(correct/results.length*100);
  const date=new Date().toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  results.filter(r=>!r.correct).forEach(r=>{const arr=state.wrong[r.q.category]||[]; if(!arr.includes(r.q.id)) arr.push(r.q.id); state.wrong[r.q.category]=arr;});
  state.history.unshift({date,category:currentQuiz.category,total:results.length,correct,wrong,accuracy}); state.history=state.history.slice(0,20); saveState();
  currentQuiz={...currentQuiz,results,correct,wrong,accuracy,finished:true}; expandedReview=new Set(); render();
}
function renderResults(){
  return `<section class="result-hero"><div class="score">${currentQuiz.accuracy}%</div><h2>${currentQuiz.accuracy===100?'太厲害了！':currentQuiz.accuracy>=80?'表現很好！':currentQuiz.accuracy>=60?'繼續努力！':'建議再複習錯題。'}</h2><p>${currentQuiz.category} · 共 ${currentQuiz.total} 題</p></section>
  <div class="stat-row"><div class="stat"><b>${currentQuiz.correct}</b><span>答對</span></div><div class="stat"><b>${currentQuiz.wrong}</b><span>答錯</span></div><div class="stat"><b>${currentQuiz.total}</b><span>總題數</span></div></div>
  <section class="section"><div class="section-title"><span>錯題檢視</span><span>${currentQuiz.wrong} 題</span></div><div class="review-list">${currentQuiz.results.filter(r=>!r.correct).map((r,i)=>reviewItem(r,i)).join('') || '<div class="card empty">這次全部答對，沒有錯題 🎉</div>'}</div></section>
  <button class="primary-btn full-btn" data-result="retry">重新測驗</button>
  <button class="secondary-btn full-btn" data-result="home">返回測驗首頁</button>`;
}
function reviewItem(r,i){
  const open=expandedReview.has(r.q.id);
  return `<div class="review-item"><button class="review-head" data-review="${r.q.id}"><span>錯題 ${i+1} ・ PDF 第 ${r.q.pdfPage} 頁</span><span>${open?'⌃':'⌄'}</span></button>${open?`<div class="review-body"><div class="q">${escapeHtml(r.q.question)}</div><div class="answer-line"><span class="tag-wrong">你的答案</span><div class="answers">${(r.selected.length?r.selected:['未作答']).map(x=>`<span class="answer-chip">${x}</span>`).join('')}</div></div><div class="answer-line"><span class="tag-correct">正確答案</span><div class="answers">${r.q.answer.map(x=>`<span class="answer-chip correct">${x}</span>`).join('')}</div></div>${r.q.imageRequired?`<div class="source-callout"><a href="#" data-resultpdf="${r.q.id}">開啟 PDF 原頁</a></div>`:''}</div>`:''}</div>`;
}
function renderQuizPage(){
  if(currentQuiz.finished) return renderResults();
  return renderQuiz();
}
function bindEvents(){
  document.querySelectorAll('.category-card').forEach(b=>b.addEventListener('click',()=>openQuestionCountModal(b.dataset.cat)));
  document.querySelectorAll('.wrong-card').forEach(b=>b.addEventListener('click',()=>openWrongModal(b.dataset.wrongcat)));
  document.querySelectorAll('[data-option]').forEach(b=>b.addEventListener('click',()=>{
    const q=currentQuiz.questions[currentQuiz.index]; const selected=new Set(currentQuiz.answers[q.id]||[]); const val=b.dataset.option;
    if(q.type==='single'){ currentQuiz.answers[q.id]=[val]; } else { selected.has(val)?selected.delete(val):selected.add(val); currentQuiz.answers[q.id]=[...selected].sort(); }
    render();
  }));
  document.querySelectorAll('[data-action="prev"]').forEach(b=>b.addEventListener('click',()=>{if(currentQuiz.index>0){currentQuiz.index--;render();}}));
  document.querySelectorAll('[data-action="next"]').forEach(b=>b.addEventListener('click',()=>{
    const q=currentQuiz.questions[currentQuiz.index]; if(!(currentQuiz.answers[q.id]||[]).length)return;
    if(currentQuiz.index===currentQuiz.total-1) finishQuiz(); else {currentQuiz.index++;render();}
  }));
  document.querySelectorAll('[data-pdf]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const q=currentQuiz.questions[currentQuiz.index];openPdf(q);}));
  document.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>{expandedReview.has(b.dataset.review)?expandedReview.delete(b.dataset.review):expandedReview.add(b.dataset.review);render();}));
  document.querySelectorAll('[data-result]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.result==='home'){currentQuiz=null;render();}else{currentQuiz=buildQuiz(currentQuiz.category,currentQuiz.total);render();}}));
  document.querySelectorAll('[data-resultpdf]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();const id=a.dataset.resultpdf;const r=currentQuiz.results.find(x=>x.q.id===id);if(r)openPdf(r.q);}));
  document.querySelectorAll('[data-manage]').forEach(b=>b.addEventListener('click',()=>manageData(b.dataset.manage)));
}
function openWrongModal(cat){
  const ids=new Set(state.wrong[cat]||[]); const qs=byCategory(cat).filter(q=>ids.has(q.id));
  modalRoot.innerHTML=`<div class="modal-backdrop" data-wrongback="1"><div class="modal" role="dialog" aria-modal="true" style="max-height:90vh;overflow:auto">
   <div class="eyebrow">WRONG QUESTIONS</div><h3>${escapeHtml(cat)}錯題</h3><p>${qs.length?`共 ${qs.length} 題。正確答案以黃色螢光標記。`:'目前沒有錯題。'}</p>
   ${qs.map((q,i)=>`<div class="review-item" style="margin-top:10px"><div class="review-body" style="padding:14px"><div class="q">${i+1}. ${escapeHtml(q.question)}</div><div class="answers" style="margin-top:10px">${[1,2,3,4].map(n=>`<span class="answer-chip ${q.answer.includes(String(n))?'correct':''}">${n}. ${q.options[String(n)]?escapeHtml(q.options[String(n)]):'PDF 圖示選項'}</span>`).join('')}</div><div class="answer-line" style="color:#8a93a3">PDF 第 ${q.pdfPage} 頁</div></div></div>`).join('')}
   <div class="modal-actions"><button class="secondary-btn" data-closewrong="1">關閉</button><button class="primary-btn" data-practice="1" ${qs.length?'':'disabled'}>重新練習</button></div>
  </div></div>`;
  modalRoot.querySelector('[data-closewrong]')?.addEventListener('click',()=>modalRoot.innerHTML='');
  modalRoot.querySelector('[data-practice]')?.addEventListener('click',()=>{modalRoot.innerHTML='';const pool=qs; if(!pool.length)return; const total=Math.min(10,pool.length); currentQuiz={id:String(Date.now()),category:cat,total,questions:shuffle(pool).slice(0,total),answers:{},index:0,startedAt:Date.now()}; page='quiz';render();});
  modalRoot.querySelector('[data-wrongback]')?.addEventListener('click',e=>{if(e.target===e.currentTarget) modalRoot.innerHTML='';});
}
function manageData(kind){
  const msg={clearWrong:'確定要清除所有錯題嗎？這個動作無法復原。',clearHistory:'確定要清除測驗紀錄嗎？',clearAll:'確定要清除所有網站資料嗎？'}[kind];
  modalRoot.innerHTML=`<div class="modal-backdrop"><div class="modal"><h3>確認操作</h3><p>${msg}</p><div class="modal-actions"><button class="secondary-btn" data-cancel>取消</button><button class="danger-btn" data-ok>確定</button></div></div></div>`;
  modalRoot.querySelector('[data-cancel]').addEventListener('click',()=>modalRoot.innerHTML='');
  modalRoot.querySelector('[data-ok]').addEventListener('click',()=>{if(kind==='clearWrong')state.wrong={};if(kind==='clearHistory')state.history=[];if(kind==='clearAll'){state=defaultState();localStorage.removeItem(STORAGE_KEY);}saveState();modalRoot.innerHTML='';toast('資料已更新');render();});
}

bottomNav.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{ if(currentQuiz && page==='quiz' && !currentQuiz.finished){toast('測驗進行中，請完成本次測驗');return;} page=b.dataset.page; render(); }));
document.getElementById('homeQuickBtn').addEventListener('click',()=>{if(currentQuiz && !currentQuiz.finished){toast('請完成本次測驗後再離開');return;} currentQuiz=null;page='quiz';render();});

fetch('data/questions.json').then(r=>{if(!r.ok)throw new Error('題庫載入失敗');return r.json()}).then(data=>{questions=data;return fetch('data/stats.json')}).then(r=>r.json()).then(s=>{stats=s;render();}).catch(err=>{main.innerHTML=`<div class="card empty">題庫載入失敗，請重新整理頁面。<br><small>${escapeHtml(err.message)}</small></div>`;});
