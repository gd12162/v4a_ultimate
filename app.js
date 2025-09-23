// D-Tracker v6 — 낙관적 삽입 + 다음 프레임 전체 렌더 + 토스트 + 스크롤 포커스
// + D-day 자동계산 + 데이터 백업/불러오기/초기화 + 버튼 2줄 표기
(() => {
  // ---------- State ----------
  const KEY = 'hundreddays_v6';
  const CATS = ['돈을 벌기위한 행위','신앙을 지키는 행위','가족을 챙기기 위한 행위','나를 위한 시간'];

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||{} }catch{ return {} } }
  function save(s){ localStorage.setItem(KEY, JSON.stringify(s)); }
  function initState(){
    const s = load();
    if (!s.config) s.config = {};
    if (typeof s.config.coverDataUrl !== 'string') s.config.coverDataUrl = '';
    if (typeof s.config.todayD !== 'number') s.config.todayD = 0;
    // 저장 버튼을 누르기 전에는 todayD를 있는 그대로 보여주기 위해 기본 baseDate를 오늘로 둠
    if (typeof s.config.baseDate !== 'string') s.config.baseDate = new Date().toISOString().slice(0,10);
    if (!Array.isArray(s.items)) s.items = [];        // {id, cat, type:'sub'|'goal', title, detail?, parentId?, createdAt}
    if (!Array.isArray(s.achievements)) s.achievements = []; // {id, itemId, doneAt, dValue}
    if (typeof s.seq !== 'number') s.seq = 1;
    save(s); return s;
  }
  let state = initState();

  // ---------- 새라벨 → 옛라벨 자동 정규화 ----------
  (function normalizeCats(){
    const toOld = {
      '돈을 버는 행위': '돈을 벌기위한 행위',
      '영성 유지를 위한 행위': '신앙을 지키는 행위',
      '가족을 위한 행위': '가족을 챙기기 위한 행위',
      '나를 위한 시간': '나를 위한 시간'
    };
    let changed = false;
    for (let i=0;i<state.items.length;i++){
      const it = state.items[i];
      if (toOld[it.cat]) { it.cat = toOld[it.cat]; changed = true; }
    }
    if (changed) save(state);
  })();

  // ---------- DOM ----------
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  const view = $('#view');
  const toastBox = $('#toast');

  // ---------- Tabs ----------
  let currentPage = 'home';
  $all('.tabs .tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $all('.tabs .tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentPage = btn.getAttribute('data-page');
      render();
    });
  });
  (function firstActive(){
    const first = document.querySelector('.tabs .tab[data-page="home"]') || document.querySelector('.tabs .tab');
    if (first) first.classList.add('active');
  })();

  // ---------- Utils ----------
  function pad2(n){ return String(n).padStart(2,'0'); }
  function fmtDate(d){
    const t = new Date(d);
    return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  }
  function nowISO(){ return new Date().toISOString(); }
  function toast(msg){
    if (!toastBox){ alert(msg); return; }
    toastBox.textContent = msg;
    toastBox.classList.add('show');
    setTimeout(()=>toastBox.classList.remove('show'), 1500);
  }
  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  // 다음 프레임(그림 그린 뒤) 보정용
  function nextFrame(fn){
    if (typeof requestAnimationFrame === 'function'){
      requestAnimationFrame(()=>requestAnimationFrame(fn));
    } else {
      setTimeout(fn, 0);
    }
  }
  // 방금 추가한 요소를 화면 중앙으로
  function focusNewElement(sel){
    const el = document.querySelector(sel);
    if (el && typeof el.scrollIntoView === 'function'){
      el.scrollIntoView({behavior:'smooth', block:'center'});
    }
  }
  // 날짜 차이를 "일" 단위로 안전하게(타임존 영향 최소화)
  function diffDaysUTC(a, b){ // a: today, b: baseDate
    const au = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const bu = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.floor((au - bu)/86400000);
  }

  // === [ADD] 로컬 날짜 유틸 & 현재 보이는 D 계산 ===
  function ymdLocal(d = new Date()){
    const y = d.getFullYear(), m = d.getMonth()+1, dd = d.getDate();
    const pad = n => String(n).padStart(2,'0');
    return `${y}-${pad(m)}-${pad(dd)}`; // 로컬 기준 YYYY-MM-DD
  }
  function dateFromYmdLocal(s){
    const [y,m,d] = (s||'').split('-').map(Number);
    return new Date(y || 1970, (m||1)-1, d || 1); // 로컬 자정
  }
  function diffDaysLocal(a, b){ // a,b: Date
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((da - db) / 86400000);
  }
  function currentD(){
    const base = dateFromYmdLocal(state.config.baseDate || ymdLocal());
    const today = new Date();
    const passed = diffDaysLocal(today, base);
    return Math.max(0, Number(state.config.todayD||0) - passed);
  }
  // === [/ADD] ===

  // ---------- Data ops ----------
  function addSub({cat,title,detail}){
    const it={id:state.seq++,cat,type:'sub',title,detail:detail||'',createdAt:nowISO()};
    state.items.push(it); save(state); return it;
  }
  function addGoal({cat,parentId,title,detail}){
    const it={id:state.seq++,cat,type:'goal',parentId:parentId||null,title,detail:detail||'',createdAt:nowISO()};
    state.items.push(it); save(state); return it;
  }
  function editSub(subId,newTitle){
    const it = state.items.find(x=>x.id===subId && x.type==='sub'); if(!it) return;
    it.title = String(newTitle||'').trim(); save(state);
  }
  function deleteItem(itemId){
    const target = state.items.find(x=>x.id===itemId); if(!target) return;
    if (!confirm(`정말 "${target.title}"을(를) 삭제할까요? 소주제를 삭제하면 하위 목표도 함께 삭제됩니다.`)) return;
    let removedIds = [];
    if (target.type==='sub'){
      removedIds = state.items.filter(i=>i.id===itemId || i.parentId===itemId).map(i=>i.id);
      state.items = state.items.filter(i=>!(i.id===itemId || i.parentId===itemId));
    } else {
      removedIds = [itemId];
      state.items = state.items.filter(i=>i.id!==itemId);
    }
    state.achievements = state.achievements.filter(a=>removedIds.indexOf(a.itemId)===-1);
    save(state);
  }
  function completeGoal(itemId){
    const it = state.items.find(x=>x.id===itemId && x.type==='goal'); if(!it) return;
    // === [REPLACE] 완료 기록에 저장하는 D값: 현재 화면에 보이는 D로 저장 ===
    const rec = { id: state.seq++, itemId, doneAt: nowISO(), dValue: currentD() };
    // === [/REPLACE] ===
    state.achievements.push(rec); save(state);
  }

  // ---------- Shared HTML ----------
  function catHead(cat){ return `<div class="cat-head"><h3 class="cat-title">${cat}</h3></div>`; }
  function subChipHTML(sub){
    return `<div class="chip subtopic" data-sub-id="${sub.id}">
      <span class="badge">소주제</span>
      <strong>${escapeHTML(sub.title)}</strong>${sub.detail?` <span class="meta small">${escapeHTML(sub.detail)}</span>`:''}
      <div class="chip-actions">
        <button class="chip-btn edit-sub">수정</button>
        <button class="chip-btn danger del-sub">삭제</button>
      </div>
    </div>`;
  }
  function goalRowHTML(goal, indent){
    return `<div class="goal${indent?' sub-goal-indent':''}" data-item-id="${goal.id}">
      <div class="goal-left">
        <span class="badge">목표</span>
        <strong class="g-title">${escapeHTML(goal.title)}</strong>
        ${goal.detail?`<div class="meta g-detail small">${escapeHTML(goal.detail)}</div>`:''}
        <div class="meta g-meta small">등록: ${fmtDate(goal.createdAt)}</div>
      </div>
      <div class="goal-right">
        <button class="mini-btn done-btn">완료</button>
        <button class="mini-btn danger del-btn">삭제</button>
      </div>
    </div>`;
  }
  function goalRowReadOnly(goal, indent){
    return `<div class="goal${indent?' sub-goal-indent':''}">
      <div class="goal-left">
        <span class="badge">목표</span>
        <strong class="g-title">${escapeHTML(goal.title)}</strong>
        ${goal.detail?`<div class="meta g-detail small">${escapeHTML(goal.detail)}</div>`:''}
        <div class="meta g-meta small">등록: ${fmtDate(goal.createdAt)}</div>
      </div>
    </div>`;
  }

  // ---------- Optimistic helpers ----------
  function findCatBoxByAttr(cat) {
    const cats = document.querySelectorAll('#fullTree .category');
    for (let i=0;i<cats.length;i++){
      const el = cats[i];
      if (el.getAttribute('data-cat') === cat) return el;
    }
    return null;
  }
  function findSubChipById(container, subId) {
    const chips = container.querySelectorAll('.subtopic');
    for (let i=0;i<chips.length;i++){
      const c = chips[i];
      if (Number(c.getAttribute('data-sub-id')) === Number(subId)) return c;
    }
    return null;
  }
  function bindGoalRowEvents(row, gId) {
    const doneBtn = row.querySelector('.done-btn');
    const delBtn = row.querySelector('.del-btn');
    if (doneBtn) doneBtn.addEventListener('click', ()=>{ completeGoal(gId); toast('완료가 기록되었습니다.'); });
    if (delBtn) delBtn.addEventListener('click', ()=>{ deleteItem(gId); renderHome(); });
  }
  function insertOptimistic(cat, newItem) {
    const catBox = findCatBoxByAttr(cat);
    if (!catBox) return false; // 컨테이너 없으면 호출 측에서 전체 렌더

    if (newItem.type === 'sub') {
      const subHeader = document.createElement('div');
      subHeader.className = 'chip subtopic';
      subHeader.setAttribute('data-sub-id', newItem.id);
      subHeader.innerHTML =
        '<span class="badge">소주제</span><strong>'+escapeHTML(newItem.title)+'</strong>'+
        (newItem.detail? ' <span class="meta small">'+escapeHTML(newItem.detail)+'</span>' : '')+
        '<div class="chip-actions">'+
          '<button class="chip-btn edit-sub">수정</button>'+
          '<button class="chip-btn danger del-sub">삭제</button>'+
        '</div>';

      subHeader.querySelector('.edit-sub')?.addEventListener('click', ()=>{
        const nv = prompt('소주제 제목 수정', newItem.title);
        if (nv===null) return;
        const t = String(nv).trim(); if (!t) return toast('제목을 입력하세요.');
        editSub(newItem.id, t); renderHome();
      });
      subHeader.querySelector('.del-sub')?.addEventListener('click', ()=>{ deleteItem(newItem.id); renderHome(); });

      catBox.appendChild(subHeader);
      return true;
    }

    if (newItem.type === 'goal') {
      const row = document.createElement('div');
      const underSub = !!newItem.parentId;
      row.className = 'goal' + (underSub ? ' sub-goal-indent' : '');
      row.setAttribute('data-item-id', newItem.id);
      row.innerHTML =
        '<div class="goal-left">'+
          '<span class="badge">목표</span>'+
          '<strong class="g-title">'+escapeHTML(newItem.title)+'</strong>'+
          (newItem.detail? '<div class="meta g-detail small">'+escapeHTML(newItem.detail)+'</div>' : '')+
          '<div class="meta g-meta small">등록: '+fmtDate(newItem.createdAt)+'</div>'+
        '</div>'+
        '<div class="goal-right">'+
          '<button class="mini-btn done-btn">완료</button>'+
          '<button class="mini-btn danger del-btn">삭제</button>'+
        '</div>';

      if (underSub) {
        const subChip = findSubChipById(catBox, newItem.parentId);
        if (subChip) subChip.insertAdjacentElement('afterend', row);
        else catBox.appendChild(row);
      } else {
        catBox.appendChild(row);
      }
      bindGoalRowEvents(row, newItem.id);
      return true;
    }
    return false;
  }

  // ---------- 백업/불러오기/리셋 ----------
  function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "dtracker_backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const imported = JSON.parse(e.target.result);
        if (!imported || typeof imported !== 'object') throw new Error("잘못된 파일 형식입니다.");
        state = imported;
        save(state);
        render();
        toast("데이터가 성공적으로 불러와졌습니다.");
      } catch (err) {
        alert("불러오기 실패: " + err.message);
      }
    };
    reader.readAsText(file);
  }
  function resetData() {
    if (confirm("정말 모든 데이터를 초기화할까요? 이 작업은 되돌릴 수 없습니다.")) {
      localStorage.removeItem(KEY);
      state = initState();
      render();
      toast("데이터가 초기화되었습니다.");
    }
  }

  // ---------- Pages ----------
  function renderHome(){
    // === [REPLACE] D-day 계산을 현재 보이는 값으로 통일 ===
    const d = currentD();
    // === [/REPLACE] ===

    const bannerStyle = state.config.coverDataUrl
      ? `style="background-image:url('${state.config.coverDataUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;"`
      : '';
    const html = `
      <section class="page page-home">
        <div id="banner" ${bannerStyle}></div>
        <div id="todayDbox" class="center-d">D-${d}</div>

        <div class="card">
          <div id="fullTree">
            ${CATS.map(cat=>{
              const subs = state.items.filter(x=>x.cat===cat && x.type==='sub');
              const directGoals = state.items.filter(x=>x.cat===cat && x.type==='goal' && !x.parentId);
              return `<div class="category" data-cat="${cat}">
                ${catHead(cat)}
                ${subs.map(st=>{
                  const goalsUnder = state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
                  return `${subChipHTML(st)}${goalsUnder.map(g=>goalRowHTML(g,true)).join('')}`;
                }).join('')}
                ${directGoals.map(g=>goalRowHTML(g,false)).join('')}
              </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card" id="homeQuickAdd">
          <h2>소주제/목표 추가</h2>
          <div class="form-grid">
            <label>추가 유형
              <select id="quickType">
                <option value="sub">소주제</option>
                <option value="goal">목표</option>
              </select>
            </label>
            <label>카테고리
              <select id="quickCat">
                ${CATS.map(c=>`<option value="${c}">${c}</option>`).join('')}
              </select>
            </label>
            <label>소주제(목표일 때)
              <select id="quickParent"><option value="">(카테고리 직속)</option></select>
            </label>
            <label>제목<input id="quickTitle" type="text" placeholder="제목을 입력"></label>
            <label>상세(선택)<input id="quickDetail" type="text" placeholder="설명(선택)"></label>
            <div class="actions"><button id="quickAdd" class="btn">추가</button></div>
          </div>
        </div>
      </section>
    `;
    view.innerHTML = html;

    // subtopic actions
    $all('#fullTree .subtopic').forEach(node=>{
      const subId = Number(node.getAttribute('data-sub-id'));
      node.querySelector('.edit-sub')?.addEventListener('click', ()=>{
        const it = state.items.find(x=>x.id===subId); if(!it) return;
        let nv = prompt('소주제 제목 수정', it.title);
        if (nv===null) return;
        nv = String(nv).trim();
        if (!nv){ toast('제목을 입력하세요.'); return; }
        editSub(subId, nv);
        renderHome();
      });
      node.querySelector('.del-sub')?.addEventListener('click', ()=>{
        deleteItem(subId);
        renderHome();
      });
    });

    // goal actions
    $all('#fullTree .goal').forEach(row=>{
      const id = Number(row.getAttribute('data-item-id'));
      row.querySelector('.done-btn')?.addEventListener('click', ()=>{
        completeGoal(id);
        toast('완료가 기록되었습니다.');
      });
      row.querySelector('.del-btn')?.addEventListener('click', ()=>{
        deleteItem(id);
        renderHome();
      });
    });

    // quick add logic (낙관적 삽입 + 다음 프레임 보정)
    const quickType = $('#quickType');
    const quickCat = $('#quickCat');
    const quickParent = $('#quickParent');
    const quickTitle = $('#quickTitle');
    const quickDetail = $('#quickDetail');

    function refreshParentOptions(){
      const cat = quickCat.value;
      const subs = state.items.filter(x=>x.cat===cat && x.type==='sub');
      quickParent.innerHTML =
        `<option value="">(카테고리 직속)</option>` +
        subs.map(s=>`<option value="${s.id}">소주제: ${escapeHTML(s.title)}</option>`).join('');
    }
    quickCat?.addEventListener('change', refreshParentOptions);
    refreshParentOptions();

    $('#quickAdd')?.addEventListener('click', ()=>{
      const type   = quickType.value;
      const cat    = quickCat.value;
      const title  = String(quickTitle.value||'').trim();
      const detail = String(quickDetail.value||'').trim();
      if (!cat)   return toast('카테고리를 선택하세요.');
      if (!title) return toast('제목을 입력하세요.');

      if (type === 'sub') {
        const it = addSub({cat, title, detail});         // 저장
        insertOptimistic(cat, it);                        // 즉시 DOM
        toast('소주제가 추가되었습니다.');
        refreshParentOptions();                           // 부모 드롭다운 즉시 갱신
        nextFrame(()=>{
          renderHome();
          nextFrame(()=> focusNewElement(`.subtopic[data-sub-id="${it.id}"]`));
        });
      } else {
        const pid = quickParent.value ? Number(quickParent.value) : null;
        const it  = addGoal({cat, parentId: pid, title, detail});
        insertOptimistic(cat, it);
        toast('목표가 추가되었습니다.');
        nextFrame(()=>{
          renderHome();
          nextFrame(()=> focusNewElement(`.goal[data-item-id="${it.id}"]`));
        });
      }

      // 입력 초기화
      quickTitle.value=''; 
      quickDetail.value='';
    });
  }

  function renderHistory(){
    const itemMap = Object.fromEntries(state.items.map(i=>[i.id,i]));
    const rows = state.achievements.slice().sort((a,b)=> new Date(a.doneAt)-new Date(b.doneAt));
    const grouped = {}; // cat -> subId -> records
    rows.forEach(rec=>{
      const it = itemMap[rec.itemId]; if (!it) return;
      const cat = it.cat; const subId = it.parentId || 0;
      grouped[cat] ||= {}; grouped[cat][subId] ||= [];
      grouped[cat][subId].push({ title: it.title, doneAt: rec.doneAt, dValue: rec.dValue });
    });

    let html = `<section class="page page-history"><div class="card"><h2>완료기록</h2>`;
    html += CATS.map(cat=>{
      const g = grouped[cat] || {};
      const keys = Object.keys(g);
      if (!keys.length){
        return `<div class="category" data-cat="${cat}">${catHead(cat)}<p class="meta small">완료 기록이 없습니다.</p></div>`;
      }
      const blocks = keys.map(k=>{
        const sid = Number(k);
        let head = '';
        if (sid){
          const st = state.items.find(i=>i.id===sid);
          head = `<div class="chip"><span class="badge">소주제</span><strong>${st?escapeHTML(st.title):'(소주제)'}</strong></div>`;
        }
        const recs = g[k];
        const body = recs.map(r=>`
          <div class="goal${sid?' sub-goal-indent':''}">
            <div><span class="badge">목표</span>
              <strong>${escapeHTML(r.title)}</strong>
              <div class="meta small">${fmtDate(r.doneAt)} • D-${r.dValue}</div>
            </div>
          </div>`).join('');
        return head + body;
      }).join('');
      return `<div class="category" data-cat="${cat}">${catHead(cat)}${blocks}</div>`;
    }).join('');
    html += `</div></section>`;
    view.innerHTML = html;
  }

  function renderProgress(){
    let html = `<section class="page page-progress"><div class="card"><h2>진행현황</h2>`;
    html += CATS.map(cat=>{
      const subs = state.items.filter(x=>x.cat===cat && x.type==='sub');
      const directGoals = state.items.filter(x=>x.cat===cat && x.type==='goal' && !x.parentId);
      return `<div class="category" data-cat="${cat}">
        ${catHead(cat)}
        ${subs.map(st=>{
          const goalsUnder = state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
          return `<div class="subtopic chip">
              <span class="badge">소주제</span><strong>${escapeHTML(st.title)}</strong>${st.detail?` <span class="meta small">${escapeHTML(st.detail)}</span>`:''}
            </div>
            ${goalsUnder.map(g=>goalRowReadOnly(g,true)).join('')}`;
        }).join('')}
        ${directGoals.map(g=>goalRowReadOnly(g,false)).join('')}
      </div>`;
    }).join('');
    html += `</div></section>`;
    view.innerHTML = html;
  }

  function renderSettings(){
    const d = Number(state.config.todayD||0);
    const html = `
      <section class="page page-settings">
        <div class="card">
          <h2>설정</h2>
          <div class="form-grid">
            <label>메인 배너 이미지
              <input id="coverFile" type="file" accept="image/*">
            </label>
            <div class="imgBox">
              <img id="coverPreview" alt="미리보기" style="display:${state.config.coverDataUrl?'block':'none'}">
            </div>
            <label>오늘 기준 D-값
              <input id="todayD" type="number" min="0" max="9999" value="${d}">
            </label>
            <div class="actions"><button id="saveSettingsBtn" class="btn">저장</button></div>
          </div>
          <hr>
          <div class="actions">
            <button id="exportBtn" class="btn">데이터<br>내보내기</button>
            <button id="importBtn" class="btn">데이터<br>불러오기</button>
            <input id="importFile" type="file" accept="application/json" style="display:none">
            <button id="resetBtn" class="btn danger">데이터<br>초기화</button>
          </div>
        </div>
      </section>`;
    view.innerHTML = html;

    const coverFile = $('#coverFile');
    const coverPreview = $('#coverPreview');
    if (state.config.coverDataUrl){
      coverPreview.src = state.config.coverDataUrl;
      coverPreview.style.display = 'block';
    }
    coverFile?.addEventListener('change', (e)=>{
      const f = e.target.files && e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        state.config.coverDataUrl = String(reader.result||'');
        save(state);
        coverPreview.src = state.config.coverDataUrl;
        coverPreview.style.display = 'block';
      };
      reader.readAsDataURL(f);
    });

    $('#saveSettingsBtn')?.addEventListener('click', ()=>{
      state.config.todayD = Number(($('#todayD')||{}).value || 0);
      // === [REPLACE] 기준일을 로컬 YYYY-MM-DD로 저장 (UTC 금지) ===
      state.config.baseDate = ymdLocal(new Date());
      // === [/REPLACE] ===
      save(state);
      toast('설정이 적용되었습니다.');
    });

    // 백업/복원/리셋
    $('#exportBtn')?.addEventListener('click', exportData);
    $('#importBtn')?.addEventListener('click', ()=> $('#importFile').click());
    $('#importFile')?.addEventListener('change', e=>{
      const f = e.target.files[0];
      if (f) importData(f);
    });
    $('#resetBtn')?.addEventListener('click', resetData);
  }

  // ---------- Render switch ----------
  function render(){
    switch (currentPage){
      case 'home': return renderHome();
      case 'history': return renderHistory();
      case 'progress': return renderProgress();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  }

  // ---------- SW(optional) ----------
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{ try{ navigator.serviceWorker.register('./sw.js'); }catch(e){} });
  }

  // first paint
  render();
})();
