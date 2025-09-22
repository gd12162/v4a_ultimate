// D-Tracker v6 — 낙관적 삽입 + 다음 프레임 전체 렌더 + 토스트 + 스크롤 포커스 + D-day 자동계산 + 데이터 백업/불러오기/초기화
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
    if (typeof s.config.baseDate !== 'string') s.config.baseDate = new Date().toISOString().slice(0,10);
    if (!Array.isArray(s.items)) s.items = [];        
    if (!Array.isArray(s.achievements)) s.achievements = []; 
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
  function nextFrame(fn){
    if (typeof requestAnimationFrame === 'function'){
      requestAnimationFrame(()=>requestAnimationFrame(fn));
    } else {
      setTimeout(fn, 0);
    }
  }
  function focusNewElement(sel){
    const el = document.querySelector(sel);
    if (el && typeof el.scrollIntoView === 'function'){
      el.scrollIntoView({behavior:'smooth', block:'center'});
    }
  }

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
    const rec = { id: state.seq++, itemId, doneAt: nowISO(), dValue: Number(state.config.todayD||0) };
    state.achievements.push(rec); save(state);
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

  // ---------- Render Pages ----------
  function renderHome(){
    // D-day 자동 계산
    const baseDate = new Date(state.config.baseDate || new Date());
    const today = new Date();
    const diffDays = Math.floor((today - baseDate) / (1000*60*60*24));
    const d = Math.max(0, (Number(state.config.todayD||0) - diffDays));

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
                <div class="cat-head"><h3 class="cat-title">${cat}</h3></div>
                ${subs.map(st=>{
                  const goalsUnder = state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
                  return `<div class="chip subtopic" data-sub-id="${st.id}">
                    <span class="badge">소주제</span>
                    <strong>${escapeHTML(st.title)}</strong>${st.detail?` <span class="meta small">${escapeHTML(st.detail)}</span>`:''}
                    <div class="chip-actions">
                      <button class="chip-btn edit-sub">수정</button>
                      <button class="chip-btn danger del-sub">삭제</button>
                    </div>
                  </div>
                  ${goalsUnder.map(g=>`
                    <div class="goal sub-goal-indent" data-item-id="${g.id}">
                      <div class="goal-left">
                        <span class="badge">목표</span>
                        <strong class="g-title">${escapeHTML(g.title)}</strong>
                        ${g.detail?`<div class="meta g-detail small">${escapeHTML(g.detail)}</div>`:''}
                        <div class="meta g-meta small">등록: ${fmtDate(g.createdAt)}</div>
                      </div>
                      <div class="goal-right">
                        <button class="mini-btn done-btn">완료</button>
                        <button class="mini-btn danger del-btn">삭제</button>
                      </div>
                    </div>`).join('')}`;
                }).join('')}
                ${directGoals.map(g=>`
                  <div class="goal" data-item-id="${g.id}">
                    <div class="goal-left">
                      <span class="badge">목표</span>
                      <strong class="g-title">${escapeHTML(g.title)}</strong>
                      ${g.detail?`<div class="meta g-detail small">${escapeHTML(g.detail)}</div>`:''}
                      <div class="meta g-meta small">등록: ${fmtDate(g.createdAt)}</div>
                    </div>
                    <div class="goal-right">
                      <button class="mini-btn done-btn">완료</button>
                      <button class="mini-btn danger del-btn">삭제</button>
                    </div>
                  </div>`).join('')}
              </div>`;
            }).join('')}
          </div>
        </div>
      </section>`;
    view.innerHTML = html;

    // 이벤트 연결
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
  }

  function renderHistory(){ ... } // (생략, 동일)

  function renderProgress(){ ... } // (생략, 동일)

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

    // 설정 이벤트
    $('#coverFile')?.addEventListener('change', (e)=>{
      const f = e.target.files && e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        state.config.coverDataUrl = String(reader.result||'');
        save(state);
        $('#coverPreview').src = state.config.coverDataUrl;
        $('#coverPreview').style.display = 'block';
      };
      reader.readAsDataURL(f);
    });
    $('#saveSettingsBtn')?.addEventListener('click', ()=>{
      state.config.todayD = Number(($('#todayD')||{}).value || 0);
      state.config.baseDate = new Date().toISOString().slice(0,10);
      save(state);
      toast('설정이 적용되었습니다.');
    });

    // 버튼 이벤트
    $('#exportBtn')?.addEventListener('click', exportData);
    $('#importBtn')?.addEventListener('click', ()=> $('#importFile').click());
    $('#importFile')?.addEventListener('change', e=>{
      const f = e.target.files[0];
      if (f) importData(f);
    });
    $('#resetBtn')?.addEventListener('click', resetData);
  }

  function render(){
    switch (currentPage){
      case 'home': return renderHome();
      case 'history': return renderHistory();
      case 'progress': return renderProgress();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{ try{ navigator.serviceWorker.register('./sw.js'); }catch(e){} });
  }

  render();
})();
