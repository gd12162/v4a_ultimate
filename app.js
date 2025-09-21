// D-Tracker v6 — 탭 단일 뷰 렌더 버전 (요구 반영)
// - 홈: 배너(설정이미지), 중앙 D-day 표시, 전체구조(보기전용)
// - 소주제/목표 추가: 생성 즉시 반영(낙관적)
// - 완료기록: 구조 틀 + 완료 누른 순서대로 기록
// - 진행현황: 버튼 없는 뷰어
// - 설정: 이미지 업로드 + 오늘 기준 D값 입력 + 저장 시 토스트/즉시 반영

(() => {
  // ---- State ----
  const KEY = 'hundreddays_v6';
  const CATS = ['돈을 버는 행위','영성 유지를 위한 행위','가족을 위한 행위','나를 위한 시간'];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function initState() {
    const s = load();
    s.config ||= { coverDataUrl: '', todayD: 0 }; // 오늘 기준 D-n 단순표시
    s.items ||= [];        // {id, cat, type:'sub'|'goal', title, detail?, parentId?, createdAt}
    s.achievements ||= []; // {id, itemId, doneAt, dValue}
    s.seq ||= 1;
    save(s);
    return s;
  }
  let state = initState();

  // ---- DOM helpers ----
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const view = $('#view');
  const toastBox = $('#toast');

  // ---- Utils ----
  const pad2 = n => String(n).padStart(2,'0');
  const fmtDate = d => {
    const t = new Date(d);
    return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  };
  const nowISO = () => new Date().toISOString();
  const toast = (msg) => {
    if (!toastBox) return alert(msg);
    toastBox.textContent = msg;
    toastBox.classList.add('show');
    setTimeout(()=>toastBox.classList.remove('show'), 1600);
  };

  // ---- Router (tabs) ----
  const tabs = $$('.tabs .tab');
  let currentPage = 'home';
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPage = btn.dataset.page;
    render();
  }));
  // 첫 진입 active
  (function activateFirst(){
    const first = $('.tabs .tab[data-page="home"]') || tabs[0];
    first?.classList.add('active');
  })();

  // ---- Data operations ----
  function addSub({cat, title, detail}) {
    const it = { id: state.seq++, cat, type:'sub', title, detail: detail||'', createdAt: nowISO() };
    state.items.push(it); save(state);
    return it;
  }
  function addGoal({cat, parentId, title, detail}) {
    const it = { id: state.seq++, cat, type:'goal', parentId: parentId||null, title, detail: detail||'', createdAt: nowISO() };
    state.items.push(it); save(state);
    return it;
  }
  function editSub(subId, newTitle) {
    const it = state.items.find(x=>x.id===subId && x.type==='sub');
    if (!it) return;
    it.title = newTitle.trim();
    save(state);
  }
  function deleteItem(itemId) {
    const target = state.items.find(x=>x.id===itemId);
    if (!target) return;
    if (!confirm(`정말 "${target.title}"을(를) 삭제할까요? 소주제를 삭제하면 하위 목표도 함께 삭제됩니다.`)) return;

    // 삭제되는 목표 id 수집
    let removedIds = [];
    if (target.type==='sub') {
      removedIds = state.items.filter(i => i.id===itemId || i.parentId===itemId).map(i=>i.id);
      state.items = state.items.filter(i => !(i.id===itemId || i.parentId===itemId));
    } else {
      removedIds = [itemId];
      state.items = state.items.filter(i => i.id!==itemId);
    }
    // 완료기록 고아 제거
    state.achievements = state.achievements.filter(a => !removedIds.includes(a.itemId));
    save(state);
  }
  function completeGoal(itemId) {
    const it = state.items.find(x=>x.id===itemId && x.type==='goal');
    if (!it) return;
    const rec = { id: state.seq++, itemId, doneAt: nowISO(), dValue: Number(state.config.todayD||0) };
    state.achievements.push(rec); save(state);
  }

  // ---- Shared renderers ----
  function catBoxTitle(cat) {
    return `<div class="cat-head"><h3 class="cat-title">${cat}</h3></div>`;
  }
  function subChipHTML(sub) {
    return `
      <div class="chip subtopic" data-sub-id="${sub.id}">
        <span class="badge sub">소주제</span>
        <strong>${sub.title}</strong>${sub.detail ? ` <span class="meta">${sub.detail}</span>` : ''}
        <div class="chip-actions">
          <button class="chip-btn edit-sub" title="수정">수정</button>
          <button class="chip-btn danger del-sub" title="삭제">삭제</button>
        </div>
      </div>`;
  }
  function goalRowHTML(goal, indent=false) {
    return `
      <div class="goal${indent ? ' sub-goal-indent':''}" data-item-id="${goal.id}">
        <div class="goal-left">
          <div class="badge">목표</div>
          <strong class="g-title">${goal.title}</strong>
          ${goal.detail ? `<div class="meta g-detail">${goal.detail}</div>`:''}
          <div class="meta g-meta">등록: ${fmtDate(goal.createdAt)}</div>
        </div>
        <div class="goal-right">
          <button class="done-btn" title="완료">완료</button>
          <button class="del-btn danger" title="삭제">삭제</button>
        </div>
      </div>`;
  }
  function goalRowReadOnly(goal, indent=false) {
    return `
      <div class="goal${indent ? ' sub-goal-indent':''}">
        <div class="goal-left">
          <div class="badge">목표</div>
          <strong class="g-title">${goal.title}</strong>
          ${goal.detail ? `<div class="meta g-detail">${goal.detail}</div>`:''}
          <div class="meta g-meta">등록: ${fmtDate(goal.createdAt)}</div>
        </div>
      </div>`;
  }

  // ---- Page: Home ----
  function renderHome() {
    const d = Number(state.config.todayD || 0);
    const bannerStyle = state.config.coverDataUrl
      ? `style="background-image:url('${state.config.coverDataUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;"`
      : '';
    let html = `
      <section class="page page-home">
        <div id="banner" ${bannerStyle}></div>
        <div id="todayDbox" class="center-d">D-${d}</div>
        <div id="fullTree">
          ${CATS.map(cat=>{
            const subs = state.items.filter(x=>x.cat===cat && x.type==='sub');
            const directGoals = state.items.filter(x=>x.cat===cat && x.type==='goal' && !x.parentId);
            return `
              <div class="category" data-cat="${cat}">
                ${catBoxTitle(cat)}
                ${subs.map(st=>{
                  const goalsUnder = state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
                  return `
                    ${subChipHTML(st)}
                    ${goalsUnder.map(g => goalRowHTML(g, true)).join('')}
                  `;
                }).join('')}
                ${directGoals.map(g => goalRowHTML(g, false)).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </section>
    `;
    view.innerHTML = html;

    // bind sub buttons
    $$('#fullTree .subtopic').forEach(node=>{
      const subId = Number(node.dataset.subId);
      node.querySelector('.edit-sub')?.addEventListener('click', ()=>{
        const it = state.items.find(x=>x.id===subId);
        if (!it) return;
        const nv = prompt('소주제 제목 수정', it.title);
        if (nv===null) return;
        const t = nv.trim(); if (!t) return toast('제목을 입력하세요.');
        editSub(subId, t);
        render(); // refresh
      });
      node.querySelector('.del-sub')?.addEventListener('click', ()=>{
        deleteItem(subId);
        render();
      });
    });
    // bind goal buttons
    $$('#fullTree .goal').forEach(row=>{
      const id = Number(row.dataset.itemId);
      row.querySelector('.done-btn')?.addEventListener('click', ()=>{
        completeGoal(id);
        toast('완료가 기록되었습니다.');
        // 완료기록은 누른 순서대로 쌓임. 홈은 변화 없음(의도대로 유지)
      });
      row.querySelector('.del-btn')?.addEventListener('click', ()=>{
        deleteItem(id);
        render();
      });
    });
  }

  // ---- Page: Quick Add (소주제/목표 추가) ----
  function renderQuickAdd() {
    let html = `
      <section class="page page-quickadd">
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
            <select id="quickParent">
              <option value="">(카테고리 직속)</option>
            </select>
          </label>
          <label>제목
            <input id="quickTitle" type="text" placeholder="제목을 입력"/>
          </label>
          <label>상세(선택)
            <input id="quickDetail" type="text" placeholder="설명(선택)"/>
          </label>
          <div class="actions">
            <button id="quickAdd">추가</button>
          </div>
        </div>
      </section>
    `;
    view.innerHTML = html;

    const quickType = $('#quickType');
    const quickCat = $('#quickCat');
    const quickParent = $('#quickParent');
    const quickTitle = $('#quickTitle');
    const quickDetail = $('#quickDetail');

    function refreshParentOptions() {
      const cat = quickCat.value;
      const subs = state.items.filter(x=>x.cat===cat && x.type==='sub');
      quickParent.innerHTML = `<option value="">(카테고리 직속)</option>` + subs.map(s=>`<option value="${s.id}">소주제: ${s.title}</option>`).join('');
    }
    quickCat.addEventListener('change', refreshParentOptions);
    refreshParentOptions();

    $('#quickAdd').addEventListener('click', ()=>{
      const type = quickType.value;
      const cat = quickCat.value;
      const title = quickTitle.value.trim();
      const detail = quickDetail.value.trim();
      if (!cat) return toast('카테고리를 선택하세요.');
      if (!title) return toast('제목을 입력하세요.');

      if (type==='sub') {
        addSub({cat, title, detail});
        toast('소주제가 추가되었습니다.');
      } else {
        const pid = quickParent.value ? Number(quickParent.value) : null;
        addGoal({cat, parentId: pid, title, detail});
        toast('목표가 추가되었습니다.');
      }
      // 입력 초기화 + 다른 탭 안가도 홈/현황은 즉시 반영 필요 없음(탭 전환시 반영)
      quickTitle.value=''; quickDetail.value='';
    });
  }

  // ---- Page: History (완료기록) ----
  function renderHistory() {
    // item 맵
    const itemMap = Object.fromEntries(state.items.map(i=>[i.id, i]));
    // 시간순(오래된→최신) 혹은 최신→오래된; 요구는 "누른 순서대로"라 오래된→최신으로 보자
    const rows = [...state.achievements].sort((a,b)=> new Date(a.doneAt) - new Date(b.doneAt));

    // cat → subId → [records]
    const grouped = {};
    for (const rec of rows) {
      const it = itemMap[rec.itemId];
      if (!it) continue;
      const cat = it.cat;
      const subId = it.parentId || 0;
      grouped[cat] ||= {};
      grouped[cat][subId] ||= [];
      grouped[cat][subId].push({ title: it.title, doneAt: rec.doneAt, dValue: rec.dValue });
    }

    let html = `<section class="page page-history"><h2>완료기록</h2>`;
    html += CATS.map(cat=>{
      const g = grouped[cat] || {};
      const subIds = Object.keys(g);
      if (!subIds.length) {
        return `
          <div class="category" data-cat="${cat}">
            ${catBoxTitle(cat)}
            <p class="meta">완료 기록이 없습니다.</p>
          </div>`;
      }
      const blocks = subIds.map(k=>{
        const sid = Number(k);
        let head = '';
        if (sid) {
          const st = state.items.find(i=>i.id===sid);
          head = `<div class="chip"><span class="badge sub">소주제</span><strong>${st?st.title:'(소주제)'}</strong></div>`;
        }
        const recs = g[k];
        const body = recs.map(r=>`
          <div class="goal${sid ? ' sub-goal-indent' : ''}">
            <div><div class="badge">목표</div>
              <strong>${r.title}</strong>
              <div class="meta">${fmtDate(r.doneAt)} • D-${r.dValue}</div>
            </div>
          </div>
        `).join('');
        return head + body;
      }).join('');
      return `<div class="category" data-cat="${cat}">${catBoxTitle(cat)}${blocks}</div>`;
    }).join('');
    html += `</section>`;
    view.innerHTML = html;
  }

  // ---- Page: Progress (진행현황) ----
  function renderProgress() {
    let html = `<section class="page page-progress"><h2>진행현황</h2>`;
    html += CATS.map(cat=>{
      const subs = state.items.filter(x=>x.cat===cat && x.type==='sub');
      const directGoals = state.items.filter(x=>x.cat===cat && x.type==='goal' && !x.parentId);
      return `
        <div class="category" data-cat="${cat}">
          ${catBoxTitle(cat)}
          ${subs.map(st=>{
            const goalsUnder = state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
            return `
              <div class="subtopic chip">
                <span class="badge sub">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta">${st.detail}</span>`:''}
              </div>
              ${goalsUnder.map(g=>goalRowReadOnly(g,true)).join('')}
            `;
          }).join('')}
          ${directGoals.map(g=>goalRowReadOnly(g,false)).join('')}
        </div>
      `;
    }).join('');
    html += `</section>`;
    view.innerHTML = html;
  }

  // ---- Page: Settings ----
  function renderSettings() {
    const d = Number(state.config.todayD || 0);
    let html = `
      <section class="page page-settings">
        <h2>설정</h2>
        <div class="form-grid">
          <label>메인 배너 이미지
            <input id="coverFile" type="file" accept="image/*">
          </label>
          <div>
            <img id="coverPreview" alt="미리보기" style="max-width:100%;display:${state.config.coverDataUrl?'block':'none'}" />
          </div>
          <label>오늘 기준 D-값
            <input id="todayD" type="number" min="0" max="99" value="${d}" />
          </label>
          <div class="actions">
            <button id="saveSettingsBtn">저장</button>
          </div>
        </div>
      </section>
    `;
    view.innerHTML = html;

    const coverFile = $('#coverFile');
    const coverPreview = $('#coverPreview');
    if (state.config.coverDataUrl) coverPreview.src = state.config.coverDataUrl;

    coverFile?.addEventListener('change', (e)=>{
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        state.config.coverDataUrl = String(reader.result||'');
        save(state);
        coverPreview.src = state.config.coverDataUrl;
        coverPreview.style.display = 'block';
      };
      reader.readAsDataURL(f);
    });

    $('#saveSettingsBtn').addEventListener('click', ()=>{
      const todayD = Number($('#todayD').value || 0);
      state.config.todayD = todayD;
      save(state);
      toast('설정이 적용되었습니다.');
      // 홈에도 즉시 반영되도록, 현재 탭은 유지하지만 홈 렌더는 다음 이동 시 반영.
      // 당장 확인하려면 홈 탭 한번 눌러보면 됨.
    });
  }

  // ---- Render switch ----
  function render() {
    switch (currentPage) {
      case 'home': return renderHome();
      case 'quickadd': return renderQuickAdd();
      case 'history': return renderHistory();
      case 'progress': return renderProgress();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  }

  // ---- SW registration (옵션) ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      try { navigator.serviceWorker.register('./sw.js'); } catch {}
    });
  }

  // initial paint
  render();
})();
