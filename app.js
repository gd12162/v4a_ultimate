// v6-optimistic-patch2-final: settings flow, full-bleed banner, cycle auto, orphan cleanup
(() => {
  // ---- Tabs ----
  const tabs = document.querySelectorAll('header .tabs button');
  const pages = document.querySelectorAll('.page');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pages.forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + btn.dataset.tab);
    if (page) page.classList.add('active');

    if (btn.dataset.tab === 'completed') { fillCycleSelect(); renderCompleted(); updateCompletedHeader(); }
    if (btn.dataset.tab === 'overview') { renderOverview(); }
    if (btn.dataset.tab === 'home') { renderHome(); }
    if (btn.dataset.tab === 'settings') { fillSettings(); }
  }));

  // ---- SW ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
  }

  // ---- State ----
  const KEY = 'hundreddays_v6';
  const FIXED_CATS = ['돈을 벌기위한 행위','신앙을 지키는 행위','가족을 챙기기 위한 행위','나를 위한 시간'];
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function initState() {
    const s = load();
    s.config ||= { startDate: '', useDday: false, todayD: 0, currentCycleN: 1, coverDataUrl: '', bannerFit: 'cover' };
    s.items ||= [];        // {id, cat, type:'goal'|'sub', title, detail, parentId?, createdAt}
    s.achievements ||= []; // {id, itemId, cycleIndex, doneAt, dValue}
    s.seq ||= 1;
    save(s);
    return s;
  }
  let state = initState();

  // ---- DOM helpers ----
  const $ = (id) => document.getElementById(id);
  const headerTitle = $('headerTitle');
  const banner = $('banner');
  const todayDbox = $('todayDbox');
  const fullTree = $('fullTree');
  const quickCat = $('quickCat');
  const quickType = $('quickType');
  const quickTitle = $('quickTitle');
  const quickDetail = $('quickDetail');
  const quickParent = $('quickParent');
  const cycleSelect = $('cycleSelect');
  const completedList = $('completedList');
  const completedHeaderD = $('completedHeaderD');
  const completedTitle = $('completedTitle');

  // settings elements (may be null if HTML not ready; guarded in code)
  const startDate = $('startDate');
  const coverFile = $('coverFile');
  const useDday = $('useDday');
  const todayD = $('todayD');
  const currentCycleN = $('currentCycleN');
  const coverPreview = $('coverPreview');
  const bannerFit = $('bannerFit'); // optional <select> 'cover'|'contain'
  const saveSettingsBtn = $('saveSettingsBtn');

  // ---- Utils ----
  const MS_DAY = 86400000;
  const pad2 = (n)=> String(n).padStart(2,'0');
  function daysBetween(a, b) { return Math.floor((b - a) / MS_DAY); }
  function effectiveStartDate() {
    if (state.config.useDday) {
      const d = new Date(); d.setHours(0,0,0,0);
      d.setDate(d.getDate() - Math.max(0, Math.min(99, Number(state.config.todayD)||0)));
      return d;
    }
    if (!state.config.startDate) return null;
    return new Date(state.config.startDate + 'T00:00:00');
  }
  function currentCycleIndexComputed() {
    const start = effectiveStartDate();
    if (!start) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = daysBetween(start, today);
    return Math.max(0, Math.floor(d / 100));
  }
  function dValueFor(date) {
    const start = effectiveStartDate();
    if (!start) return 0;
    const day0 = new Date(date); day0.setHours(0,0,0,0);
    const d = daysBetween(start, day0);
    return Math.max(0, d % 100);
  }
  function cycleRange(idx) {
    const start = effectiveStartDate();
    if (!start) return null;
    const from = new Date(start.getTime() + (idx*100)*MS_DAY);
    const to = new Date(from.getTime() + 100*MS_DAY - 1);
    return {from, to};
  }
  const fmtDate = (d) => {
    const dd = new Date(d);
    const Y = dd.getFullYear(), M = pad2(dd.getMonth()+1), D = pad2(dd.getDate());
    const h = pad2(dd.getHours()), m = pad2(dd.getMinutes());
    return `${Y}-${M}-${D} ${h}:${m}`;
  };
  const isoDay = (d)=> `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;

  // ---- Header + Banner ----
  function renderHeader() {
    if (!headerTitle) return;
    const start = effectiveStartDate();
    headerTitle.textContent = start ? `D-${dValueFor(new Date())}` : 'D-??';
  }
  function renderBanner() {
    if (!banner) return;
    const dataUrl = state.config.coverDataUrl || '';
    banner.style.backgroundImage = dataUrl ? `url('${dataUrl}')` : 'none';
    banner.style.backgroundSize = (state.config.bannerFit || 'cover'); // full-bleed by default
    banner.style.backgroundPosition = 'center';
    banner.style.backgroundRepeat = 'no-repeat';
    if (todayDbox) {
      const start = effectiveStartDate();
      todayDbox.textContent = start ? `D-${dValueFor(new Date())}` : 'D-??';
    }
  }

  // ---- Quick selectors ----
  function fillQuickSelectors() {
    if (!quickCat) return;
    quickCat.innerHTML = '';
    for (const c of FIXED_CATS) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c; quickCat.appendChild(opt);
    }
    updateParentSubSelect();
  }
  function updateParentSubSelect() {
    if (!quickParent || !quickCat) return;
    const cat = quickCat.value;
    quickParent.innerHTML = '<option value="">(카테고리 직속)</option>';
    const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
    for (const st of subs) {
      const o = document.createElement('option');
      o.value = String(st.id);
      o.textContent = `소주제: ${st.title}`;
      quickParent.appendChild(o);
    }
  }
  quickCat?.addEventListener('change', updateParentSubSelect);

  // ---- Optimistic helpers ----
  function goalRowHTML(g) {
    return `<div class="goal-left">
      <div class="badge">목표</div>
      <strong class="g-title">${g.title}</strong>
      <div class="meta g-detail">${g.detail||''}</div>
      <div class="meta g-meta">등록: ${fmtDate(g.createdAt || new Date())}</div>
    </div>
    <div class="goal-right">
      <button class="done-btn">달성</button>
      <button class="del-btn danger">삭제</button>
    </div>`;
  }
  function bindGoalRowEvents(row, g) {
    const doneBtn = row.querySelector('.done-btn');
    const delBtn = row.querySelector('.del-btn');
    if (doneBtn) doneBtn.addEventListener('click', () => markDone(g.id));
    if (delBtn) delBtn.addEventListener('click', () => deleteItem(g.id));
  }
  function findCatBoxByAttr(cat) {
    if (!fullTree) return null;
    const cats = fullTree.querySelectorAll('.category');
    for (const el of cats) {
      if (el.getAttribute('data-cat') === cat) return el;
    }
    return null;
  }
  function findSubChipById(container, subId) {
    const chips = container.querySelectorAll('.subtopic');
    for (const c of chips) {
      if (Number(c.getAttribute('data-sub-id')) === Number(subId)) return c;
    }
    return null;
  }
  function insertOptimistic(cat, newItem) {
    const catBox = findCatBoxByAttr(cat);
    if (!catBox) return; // fallback: full render will handle
    if (newItem.type === 'sub') {
      const subHeader = document.createElement('div');
      subHeader.className = 'chip subtopic';
      subHeader.setAttribute('data-sub-id', newItem.id);
      subHeader.innerHTML = `<span class="badge sub">소주제</span><strong>${newItem.title}</strong>${newItem.detail?` <span class="meta">${newItem.detail}</span>`:''}
        <button class="edit-sub" style="margin-left:6px">수정</button>
        <button class="del-sub danger" style="margin-left:6px">삭제</button>`;
      subHeader.querySelector('.edit-sub')?.addEventListener('click', () => editSubtopic(newItem.id));
      subHeader.querySelector('.del-sub')?.addEventListener('click', () => deleteItem(newItem.id));
      catBox.appendChild(subHeader);
      return;
    }
    if (newItem.type === 'goal') {
      const row = document.createElement('div');
      const underSub = !!newItem.parentId;
      row.className = 'goal' + (underSub ? ' sub-goal-indent' : '');
      row.setAttribute('data-item-id', newItem.id);
      row.innerHTML = goalRowHTML(newItem);
      if (underSub) {
        const subChip = findSubChipById(catBox, newItem.parentId);
        if (subChip) subChip.insertAdjacentElement('afterend', row);
        else catBox.appendChild(row);
      } else {
        catBox.appendChild(row);
      }
      bindGoalRowEvents(row, newItem);
    }
  }

  // ---- Add (immediate show) ----
  $('quickAdd')?.addEventListener('click', () => {
    if (!quickCat || !quickType || !quickTitle) return;
    const cat = quickCat.value;
    const type = quickType.value;
    const title = quickTitle.value.trim();
    const detail = (quickDetail?.value || '').trim();
    if (!cat) return alert('카테고리를 선택하세요.');
    if (!title) return alert('제목을 입력하세요.');

    const item = { id: state.seq++, cat, type, title, detail, createdAt: new Date().toISOString() };
    if (type==='goal' && quickParent) {
      const pid = quickParent.value ? Number(quickParent.value) : null;
      if (pid) item.parentId = pid;
    }
    state.items.push(item);
    save(state);

    insertOptimistic(cat, item);

    if (quickTitle) quickTitle.value='';
    if (quickDetail) quickDetail.value='';
    updateParentSubSelect();

    requestAnimationFrame(() => {
      renderFullTree();
      renderOverview();
    });
  });

  // ---- Edit subtopic ----
  function editSubtopic(subId) {
    const it = state.items.find(x => x.id === Number(subId) && x.type==='sub');
    if (!it) return;
    const newTitle = prompt('소주제 제목 수정', it.title);
    if (newTitle === null) return; // cancel
    const t = newTitle.trim();
    if (!t) return alert('제목을 입력하세요.');
    it.title = t;
    // 상세도 수정하려면 아래 주석 해제
    // const newDetail = prompt('설명(선택)', it.detail || '');
    // if (newDetail !== null) it.detail = newDetail.trim();
    save(state);
    renderFullTree();
    renderOverview();
  }

  // ---- Done / Delete ----
  function markDone(itemId) {
    const start = effectiveStartDate();
    if (!start) return alert('설정에서 시작일 또는 D값을 먼저 저장하세요.');
    const now = new Date();
    const dval = dValueFor(now);

    // 사이클 자동 계산(요구 반영)
    const idxAuto = currentCycleIndexComputed();

    const rec = { id: state.seq++, itemId, cycleIndex: idxAuto, doneAt: now.toISOString(), dValue: dval };
    state.achievements.push(rec); save(state);
    renderCompleted();
    renderFullTree();
    renderOverview();
  }
  function deleteItem(itemId) {
    const item = state.items.find(i=>i.id===itemId);
    if (!item) return;
    if (!confirm(`정말 "${item.title}"을(를) 삭제할까요? 소주제를 삭제하면 하위 목표도 함께 삭제됩니다.`)) return;

    let removedIds = [];
    if (item.type==='sub') {
      removedIds = state.items.filter(i => i.id===itemId || i.parentId===itemId).map(i=>i.id);
      state.items = state.items.filter(i => !(i.id===itemId || i.parentId===itemId));
    } else {
      removedIds = [itemId];
      state.items = state.items.filter(i => i.id!==itemId);
    }
    // 삭제와 동시에 달성기록 고아 데이터 제거(요구 반영)
    state.achievements = state.achievements.filter(a => !removedIds.includes(a.itemId));
    save(state);
    renderFullTree();
    renderOverview();
    renderCompleted();
  }

  // ---- HOME render (with subtopic edit/delete buttons) ----
  function renderFullTree() {
    if (!fullTree) return;
    fullTree.innerHTML = '';
    for (const cat of FIXED_CATS) {
      const catBox = document.createElement('div');
      catBox.className = 'category';
      catBox.setAttribute('data-cat', cat);
      catBox.innerHTML = `<div class="cat-head"><h3 class="cat-title">${cat}</h3></div>`;

      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      for (const st of subs) {
        const subHeader = document.createElement('div');
        subHeader.className = 'chip subtopic';
        subHeader.setAttribute('data-sub-id', st.id);
        subHeader.innerHTML = `<span class="badge sub">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta">${st.detail}</span>`:''}
          <button class="edit-sub" style="margin-left:6px">수정</button>
          <button class="del-sub danger" style="margin-left:6px">삭제</button>`;
        subHeader.querySelector('.edit-sub')?.addEventListener('click', () => editSubtopic(st.id));
        subHeader.querySelector('.del-sub')?.addEventListener('click', () => deleteItem(st.id));
        catBox.appendChild(subHeader);

        const goalsUnder = state.items.filter(x => x.cat===cat && x.type==='goal' && x.parentId===st.id);
        for (const g of goalsUnder) {
          const row = document.createElement('div');
          row.className = 'goal sub-goal-indent';
          row.setAttribute('data-item-id', g.id);
          row.innerHTML = `<div class="goal-left">
            <div class="badge">목표</div>
            <strong class="g-title">${g.title}</strong>
            <div class="meta g-detail">${g.detail||''}</div>
            <div class="meta g-meta">등록: ${fmtDate(g.createdAt)}</div>
          </div>
          <div class="goal-right">
            <button class="done-btn">달성</button>
            <button class="del-btn danger">삭제</button>
          </div>`;
          row.querySelector('.done-btn')?.addEventListener('click', () => markDone(g.id));
          row.querySelector('.del-btn')?.addEventListener('click', () => deleteItem(g.id));
          catBox.appendChild(row);
        }
      }

      const directGoals = state.items.filter(x => x.cat===cat && x.type==='goal' && !x.parentId);
      for (const g of directGoals) {
        const row = document.createElement('div');
        row.className = 'goal';
        row.setAttribute('data-item-id', g.id);
        row.innerHTML = `<div class="goal-left">
          <div class="badge">목표</div>
          <strong class="g-title">${g.title}</strong>
          <div class="meta g-detail">${g.detail||''}</div>
          <div class="meta g-meta">등록: ${fmtDate(g.createdAt)}</div>
        </div>
        <div class="goal-right">
          <button class="done-btn">달성</button>
          <button class="del-btn danger">삭제</button>
        </div>`;
        row.querySelector('.done-btn')?.addEventListener('click', () => markDone(g.id));
        row.querySelector('.del-btn')?.addEventListener('click', () => deleteItem(g.id));
        catBox.appendChild(row);
      }

      fullTree.appendChild(catBox);
    }
  }

  // ---- Completed ----
  function fillCycleSelect() {
    if (!cycleSelect) return;
    cycleSelect.innerHTML = '';
    const start = effectiveStartDate();
    if (!start) return;
    const nowIdx = Math.max(0, currentCycleIndexComputed());
    for (let i=0; i<=nowIdx; i++) {
      const r = cycleRange(i);
      if (!r) continue;
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i+1}번째 100일 (${isoDay(r.from)}~${isoDay(r.to)})`;
      cycleSelect.appendChild(opt);
    }
    // 표시용 타이틀은 config.currentCycleN를 유지(사용자 시점 표시), 렌더는 자동 계산 사용
    const want = String(Math.max(1, Number(state.config.currentCycleN||1)) - 1);
    cycleSelect.value = [...cycleSelect.options].some(o=>o.value===want) ? want : String(nowIdx);
  }
  function updateCompletedHeader() {
    if (!completedHeaderD || !completedTitle) return;
    const dval = effectiveStartDate() ? dValueFor(new Date()) : '??';
    const n = Math.max(1, Number(state.config.currentCycleN||1));
    completedHeaderD.textContent = `D-${dval} (${n}번째 100일)`;
    completedTitle.textContent = `사이클별 완료기록 (${n}번째)`;
  }
  function renderCompleted() {
    if (!completedList) return;
    updateCompletedHeader();

    // 실제 렌더 기준은 "현재 날짜 기반 자동 사이클"로 보여줌
    const idx = currentCycleIndexComputed();

    const rows = state.achievements
      .filter(a => a.cycleIndex === idx)
      .sort((a,b)=> new Date(a.doneAt) - new Date(b.doneAt));

    completedList.innerHTML = '';
    if (!rows.length) { completedList.innerHTML = `<p class="meta">이 사이클에 달성 기록이 없습니다.</p>`; return; }

    const itemMap = Object.fromEntries(state.items.map(i=>[i.id,i]));
    const byCat = {};
    for (const r of rows) {
      const it = itemMap[r.itemId]; if (!it) continue;
      const cat = it.cat;
      const subId = it.parentId || 0;
      byCat[cat] ||= {};
      byCat[cat][subId] ||= [];
      byCat[cat][subId].push({title: it.title, doneAt: r.doneAt, dValue: r.dValue});
    }
    for (const cat of Object.keys(byCat)) {
      const catDiv = document.createElement('div');
      catDiv.className = 'category';
      catDiv.innerHTML = `<h3>${cat}</h3>`;
      const subs = byCat[cat];
      for (const subIdStr of Object.keys(subs)) {
        const subId = Number(subIdStr);
        if (subId) {
          const st = state.items.find(i=>i.id===subId);
          const subHeader = document.createElement('div');
          subHeader.className = 'chip';
          subHeader.innerHTML = `<span class="badge sub">소주제</span><strong>${st?st.title:'(소주제)'}</strong>`;
          catDiv.appendChild(subHeader);
        }
        for (const g of subs[subIdStr]) {
          const row = document.createElement('div');
          row.className = 'goal' + (subId ? ' sub-goal-indent' : '');
          row.innerHTML = `<div><div class="badge">목표</div>
            <strong>${g.title}</strong>
            <div class="meta">${fmtDate(g.doneAt)} • D-${g.dValue}</div></div>`;
          catDiv.appendChild(row);
        }
      }
      completedList.appendChild(catDiv);
    }
  }

  // ---- Overview ----
  function renderOverview() {
    const wrap = document.getElementById('overviewTree');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const cat of FIXED_CATS) {
      const catBox = document.createElement('div');
      catBox.className = 'category';
      const head = document.createElement('div');
      head.className = 'cat-head';
      head.innerHTML = `<h3>${cat}</h3>`;
      catBox.appendChild(head);

      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      for (const st of subs) {
        const chip = document.createElement('div');
        chip.className = 'subtopic chip';
        chip.innerHTML = `<span class="badge sub">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta">${st.detail}</span>`:''}`;
        catBox.appendChild(chip);

        const goalsUnder = state.items.filter(x => x.cat===cat && x.type==='goal' && x.parentId===st.id);
        for (const g of goalsUnder) {
          const row = document.createElement('div');
          row.className = 'goal sub-goal-indent';
          row.innerHTML = `<div class="badge">목표</div> ${g.title}`;
          catBox.appendChild(row);
        }
      }

      const directGoals = state.items.filter(x => x.cat===cat && x.type==='goal' && !x.parentId);
      for (const g of directGoals) {
        const row = document.createElement('div');
        row.className = 'goal';
        row.innerHTML = `<div class="badge">목표</div> ${g.title}`;
        catBox.appendChild(row);
      }

      wrap.appendChild(catBox);
    }
  }

  // ---- Settings: fill & save ----
  function fillSettings() {
    if (startDate) startDate.value = state.config.startDate || '';
    if (useDday) useDday.checked = !!state.config.useDday;
    if (todayD) todayD.value = String(state.config.todayD ?? 0);
    if (currentCycleN) currentCycleN.value = String(state.config.currentCycleN ?? 1);
    if (coverPreview) coverPreview.src = state.config.coverDataUrl || '';
    if (bannerFit) bannerFit.value = state.config.bannerFit || 'cover';
  }
  function saveSettings() {
    if (startDate) state.config.startDate = startDate.value || '';
    if (useDday) state.config.useDday = !!useDday.checked;
    if (todayD) state.config.todayD = Number(todayD.value || 0);
    if (currentCycleN) state.config.currentCycleN = Math.max(1, Number(currentCycleN.value || 1));
    if (bannerFit) state.config.bannerFit = bannerFit.value || 'cover';
    save(state);
    alert('설정이 적용되었습니다.');
    renderAll();
  }
  saveSettingsBtn?.addEventListener('click', saveSettings);

  coverFile?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.config.coverDataUrl = String(reader.result || '');
      save(state);
      if (coverPreview) coverPreview.src = state.config.coverDataUrl;
      renderBanner();
    };
    reader.readAsDataURL(f);
  });

  // ---- Home + All ----
  function renderHome() {
    renderBanner();
    fillQuickSelectors();
    renderFullTree();
  }
  function renderAll() {
    renderHeader();
    renderHome();
    fillCycleSelect();
    renderCompleted();
    renderOverview();
  }

  // Initial paint
  renderAll();
})();
