// v6-strict-patch: minimal UI-only changes (edit subtopic, mapping fix, banner contain)
(() => {
  // ---- Tabs (unchanged) ----
  const tabs = document.querySelectorAll('header .tabs button');
  const pages = document.querySelectorAll('.page');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'completed') { fillCycleSelect(); renderCompleted(); updateCompletedHeader(); }
    if (btn.dataset.tab === 'overview') { renderOverview(); }
    if (btn.dataset.tab === 'home') { renderHome(); }
    if (btn.dataset.tab === 'settings') { fillSettings?.(); }
  }));

  // ---- PWA SW registration (unchanged) ----
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
    s.config ||= { startDate: '', useDday: false, todayD: 0, currentCycleN: 1, coverDataUrl: '' };
    s.items ||= []; // {id, cat, type:'goal'|'sub', title, detail, parentId?, createdAt}
    s.achievements ||= []; // {id, itemId, cycleIndex, doneAt, dValue}
    s.seq ||= 1;
    save(s);
    return s;
  }
  let state = initState();

  // ---- DOM ----
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
  const startDate = $('startDate');
  const coverFile = $('coverFile');
  const useDday = $('useDday');
  const todayD = $('todayD');
  const currentCycleN = $('currentCycleN');
  const coverPreview = $('coverPreview');

  // ---- Utils ----
  function daysBetween(a, b) {
    const MS = 24*60*60*1000;
    return Math.floor((b - a) / MS);
  }
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
    const d = daysBetween(start, new Date(new Date(date).setHours(0,0,0,0)));
    return Math.max(0, d % 100); // 0~99
  }
  function cycleRange(idx) {
    const start = effectiveStartDate();
    if (!start) return null;
    const from = new Date(start.getTime() + (idx*100)*86400000);
    const to = new Date(from.getTime() + 100*86400000 - 1);
    return {from, to};
  }
  const fmtDate = (d)=> new Date(d).toLocaleString();
  const isoDay = (d)=> d.toISOString().slice(0,10);

  // ---- Header + Banner ----
  function renderHeader() {
    const start = effectiveStartDate();
    headerTitle.textContent = start ? `D-${dValueFor(new Date())}` : 'D-??';
  }
  function renderBanner() {
    const dataUrl = state.config.coverDataUrl || '';
    banner.style.backgroundImage = dataUrl ? `url('${dataUrl}')` : 'none';
    // *** Patch: show full image (no crop) ***
    banner.style.backgroundSize = 'contain';
    banner.style.backgroundPosition = 'center';
    banner.style.backgroundRepeat = 'no-repeat';
    const start = effectiveStartDate();
    todayDbox.textContent = start ? `D-${dValueFor(new Date())}` : 'D-??';
  }

  // ---- Quick selectors ----
  function fillQuickSelectors() {
    quickCat.innerHTML = '';
    for (const c of FIXED_CATS) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c; quickCat.appendChild(opt);
    }
    updateParentSubSelect();
  }
  function updateParentSubSelect() {
    quickParent.innerHTML = '<option value="">(카테고리 직속)</option>';
    const subs = state.items.filter(x => x.cat===quickCat.value && x.type==='sub');
    for (const st of subs) {
      const o = document.createElement('option');
      o.value = String(st.id);
      o.textContent = `소주제: ${st.title}`;
      quickParent.appendChild(o);
    }
  }
  quickCat.addEventListener('change', updateParentSubSelect);

  // ---- Optimistic insert helpers (unchanged) ----
  function goalRowHTML(g, isSub) {
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
  function insertOptimistic(cat, newItem) {
    const catBox = fullTree.querySelector(`.category[data-cat="${CSS.escape(cat)}"]`) || [...fullTree.querySelectorAll('.category')].find(el=>el.getAttribute('data-cat')===cat);
    if (!catBox) return;
    if (newItem.type === 'sub') {
      const subHeader = document.createElement('div');
      subHeader.className = 'chip subtopic';
      subHeader.setAttribute('data-sub-id', newItem.id);
      subHeader.innerHTML = `<span class="badge sub">소주제</span><strong>${newItem.title}</strong>${newItem.detail?` <span class="meta">${newItem.detail}</span>`:''}
        <button class="edit-sub" style="margin-left:6px">수정</button>
        <button class="del-sub danger" style="margin-left:6px">삭제</button>`;
      // *** Patch: edit button ***
      subHeader.querySelector('.edit-sub').addEventListener('click', () => editSubtopic(newItem.id));
      subHeader.querySelector('.del-sub').addEventListener('click', () => deleteItem(newItem.id));
      catBox.appendChild(subHeader);
      return;
    }
    if (newItem.type === 'goal') {
      const row = document.createElement('div');
      const underSub = !!newItem.parentId;
      row.className = 'goal' + (underSub ? ' sub-goal-indent' : '');
      row.setAttribute('data-item-id', newItem.id);
      row.innerHTML = goalRowHTML(newItem, underSub);

      if (underSub) {
        // *** Patch: robust anchor match ***
        const chips = catBox.querySelectorAll('.subtopic');
        let subChip = null;
        for (const c of chips) {
          if (Number(c.getAttribute('data-sub-id')) === Number(newItem.parentId)) { subChip = c; break; }
        }
        if (subChip && subChip.nextSibling) {
          catBox.insertBefore(row, subChip.nextSibling);
        } else {
          catBox.appendChild(row);
        }
      } else {
        catBox.appendChild(row);
      }
      bindGoalRowEvents(row, newItem);
    }
  }

  // ---- Add item (patch: keep selected parent reliably) ----
  $('quickAdd').addEventListener('click', () => {
    const cat = quickCat.value;
    const type = quickType.value;
    const title = quickTitle.value.trim();
    const detail = quickDetail.value.trim();
    if (!cat) return alert('카테고리를 선택하세요.');
    if (!title) return alert('제목을 입력하세요.');

    // *** Patch: snapshot current parent selection before any refresh ***
    const selectedParent = quickParent.value ? Number(quickParent.value) : null;

    const item = { id: state.seq++, cat, type, title, detail, createdAt: new Date().toISOString() };
    if (type==='goal' && selectedParent) item.parentId = selectedParent;
    state.items.push(item);
    save(state);

    insertOptimistic(cat, item);

    // clear inputs
    quickTitle.value=''; quickDetail.value='';

    // *** Patch: refresh parent options AFTER write, but keep category unchanged ***
    updateParentSubSelect();
    if (selectedParent) quickParent.value = String(selectedParent);

    // reconcile
    requestAnimationFrame(() => {
      renderFullTree();
      renderOverview();
    });
  });

  // ---- Edit subtopic (new) ----
  function editSubtopic(subId) {
    const it = state.items.find(x => x.id === Number(subId) && x.type==='sub');
    if (!it) return;
    const nv = prompt('소주제 제목 수정', it.title);
    if (nv === null) return;
    const t = nv.trim();
    if (!t) return alert('제목을 입력하세요.');
    it.title = t;
    save(state);
    renderFullTree();
    renderOverview();
    updateParentSubSelect(); // keep quickParent titles in sync
  }

  // ---- Done / Delete (unchanged behavior) ----
  function markDone(itemId) {
    const start = effectiveStartDate();
    if (!start) return alert('설정에서 시작일 또는 D값을 먼저 저장하세요.');
    const now = new Date();
    const dval = dValueFor(now);
    const idxBySetting = Math.max(1, Number(state.config.currentCycleN||1)) - 1; // 0-based storage
    const rec = { id: state.seq++, itemId, cycleIndex: idxBySetting, doneAt: now.toISOString(), dValue: dval };
    state.achievements.push(rec); save(state);
    renderCompleted();
    renderFullTree();
    renderOverview();
  }
  function deleteItem(itemId) {
    const item = state.items.find(i=>i.id===itemId);
    if (!item) return;
    if (!confirm(`정말 "${item.title}"을(를) 삭제할까요? 소주제를 삭제하면 하위 목표도 함께 삭제됩니다.`)) return;
    if (item.type==='sub') {
      state.items = state.items.filter(i => !(i.id===itemId || i.parentId===itemId));
    } else {
      state.items = state.items.filter(i => i.id!==itemId);
    }
    save(state);
    renderFullTree();
    renderOverview();
    updateParentSubSelect();
  }

  // ---- HOME: render (only add edit button on subtopic; rest unchanged) ----
  function renderFullTree() {
    fullTree.innerHTML = '';
    for (const cat of FIXED_CATS) {
      const catBox = document.createElement('div');
      catBox.className = 'category';
      catBox.setAttribute('data-cat', cat);
      catBox.innerHTML = `<div class="cat-head"><h3 class="cat-title">${cat}</h3></div>`;

      // subtopics
      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      for (const st of subs) {
        const subHeader = document.createElement('div');
        subHeader.className = 'chip subtopic';
        subHeader.setAttribute('data-sub-id', st.id);
        subHeader.innerHTML = `<span class="badge sub">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta">${st.detail}</span>`:''}
          <button class="edit-sub" style="margin-left:6px">수정</button>
          <button class="del-sub danger" style="margin-left:6px">삭제</button>`;
        subHeader.querySelector('.edit-sub').addEventListener('click', () => editSubtopic(st.id));
        subHeader.querySelector('.del-sub').addEventListener('click', () => deleteItem(st.id));
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
          row.querySelector('.done-btn').addEventListener('click', () => markDone(g.id));
          row.querySelector('.del-btn').addEventListener('click', () => deleteItem(g.id));
          catBox.appendChild(row);
        }
      }

      // direct goals
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
        row.querySelector('.done-btn').addEventListener('click', () => markDone(g.id));
        row.querySelector('.del-btn').addEventListener('click', () => deleteItem(g.id));
        catBox.appendChild(row);
      }

      fullTree.appendChild(catBox);
    }
  }

  // ---- Completed (unchanged) ----
  function fillCycleSelect() {
    cycleSelect.innerHTML = '';
    const start = effectiveStartDate();
    if (!start) return;
    const nowIdx = Math.max(0, currentCycleIndexComputed());
    for (let i=0; i<=nowIdx; i++) {
      const r = cycleRange(i);
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i+1}번째 100일 (${isoDay(r.from)}~${isoDay(r.to)})`;
      cycleSelect.appendChild(opt);
    }
    const want = String(Math.max(1, Number(state.config.currentCycleN||1)) - 1);
    cycleSelect.value = [...cycleSelect.options].some(o=>o.value===want) ? want : String(nowIdx);
  }
  function updateCompletedHeader() {
    const dval = effectiveStartDate() ? dValueFor(new Date()) : '??';
    const n = Math.max(1, Number(state.config.currentCycleN||1));
    completedHeaderD.textContent = `D-${dval} (${n}번째 100일)`;
    completedTitle.textContent = `사이클별 완료기록 (${n}번째)`;
  }
  function renderCompleted() {
    updateCompletedHeader();
    const n = Math.max(1, Number(state.config.currentCycleN||1));
    const idx = n - 1;
    const rows = state.achievements.filter(a => a.cycleIndex === idx)
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

  // ---- Overview (unchanged) ----
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

  // ---- Settings (unchanged, but keep banner contain) ----
  $('saveBase').addEventListener('click', () => {
    state.config.startDate = startDate.value || '';
    state.config.useDday = !!useDday.checked;
    state.config.todayD = Math.max(0, Math.min(99, Number(todayD.value||0)));
    state.config.currentCycleN = Math.max(1, Number(currentCycleN.value||1));
    save(state);
    renderHeader();
    renderBanner();
    renderOverview();
    alert('저장되었습니다.');
  });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('정말 전체 초기화할까요? JSON 백업을 먼저 권장합니다.')) return;
    state = {config:{startDate:'',useDday:false,todayD:0,currentCycleN:1,coverDataUrl:''}, items:[], achievements:[], seq:1};
    save(state); renderHeader(); renderHome(); renderOverview(); alert('초기화 완료');
  });
  $('exportJson').addEventListener('click', () => {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    data.schema_version = 6;
    data.exported_at = new Date().toISOString();
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `100days-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  $('importJson').addEventListener('click', async () => {
    const f = $('importFile').files?.[0];
    if (!f) return alert('가져올 JSON 파일을 선택해주세요.');
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      localStorage.setItem(KEY, JSON.stringify({
        config: json.config || {startDate:'',useDday:false,todayD:0,currentCycleN:1,coverDataUrl:''},
        items: json.items || [],
        achievements: json.achievements || [],
        seq: json.seq || 1
      }));
      state = load(); renderHeader(); renderHome(); renderOverview(); alert('가져오기 완료');
    } catch(e) { alert('JSON 파싱 실패'); }
  });
  coverFile.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.config.coverDataUrl = reader.result;
      save(state);
      coverPreview.style.backgroundImage = `url('${state.config.coverDataUrl}')`;
      renderBanner();
    };
    reader.readAsDataURL(f);
  });

  // ---- Renderers ----
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

  // ---- Init ----
  renderAll();
})();