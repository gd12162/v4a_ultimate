// PWA v6: UI-only changes; keep connection/paths same
(() => {

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
    if (btn.dataset.tab === 'settings') { fillSettings(); }
  }));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
  }

  const KEY = 'hundreddays_v6';
  const FIXED_CATS = ['돈을 벌기위한 행위','신앙을 지키는 행위','가족을 챙기기 위한 행위','나를 위한 시간'];
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function initState() {
    const s = load();
    s.config ||= { startDate: '', useDday: false, todayD: 0, currentCycleN: 1, coverDataUrl: '' };
    s.items ||= [];
    s.achievements ||= [];
    s.seq ||= 1;
    save(s);
    return s;
  }
  let state = initState();

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
    return Math.max(0, d % 100);
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

  function renderHeader() {
    const start = effectiveStartDate();
    if (!start) { headerTitle.textContent = 'D-??'; return; }
    const dval = dValueFor(new Date());
    headerTitle.textContent = `D-${dval}`;
  }
  function renderBanner() {
    const dataUrl = state.config.coverDataUrl || '';
    banner.style.backgroundImage = dataUrl ? `url('${dataUrl}')` : 'none';
    const start = effectiveStartDate();
    todayDbox.textContent = start ? `D-${dValueFor(new Date())}` : 'D-??';
  }

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
  $('quickAdd').addEventListener('click', () => {
    const cat = quickCat.value;
    const type = quickType.value;
    const title = quickTitle.value.trim();
    const detail = quickDetail.value.trim();
    if (!cat) return alert('카테고리를 선택하세요.');
    if (!title) return alert('제목을 입력하세요.');
    const item = { id: state.seq++, cat, type, title, detail, createdAt: new Date().toISOString() };
    if (type==='goal') {
      const pid = quickParent.value ? Number(quickParent.value) : null;
      if (pid) item.parentId = pid;
    }
    state.items.push(item);
    save(state);
    quickTitle.value=''; quickDetail.value='';
    updateParentSubSelect();
    renderFullTree();
  });

  function markDone(itemId) {
    const start = effectiveStartDate();
    if (!start) return alert('설정에서 시작일 또는 D값을 먼저 저장하세요.');
    const now = new Date();
    const dval = dValueFor(now);
    const idxBySetting = Math.max(1, Number(state.config.currentCycleN||1)) - 1;
    const rec = { id: state.seq++, itemId, cycleIndex: idxBySetting, doneAt: now.toISOString(), dValue: dval };
    state.achievements.push(rec); save(state);
    alert(`달성 처리 완료! (기록: ${fmtDate(now)} / D-${dval})`);
    renderCompleted();
    renderFullTree();
    renderOverview();
  }
  function deleteItem(itemId) {
    const item = state.items.find(i=>i.id===itemId);
    if (!item) return;
    if (!confirm(`정말 "${item.title}"을(를) 삭제할까요?`)) return;
    if (item.type==='sub') {
      state.items = state.items.filter(i => !(i.id===itemId || i.parentId===itemId));
    } else {
      state.items = state.items.filter(i => i.id!==itemId);
    }
    save(state);
    renderFullTree(); renderOverview();
  }

  function renderFullTree() {
    fullTree.innerHTML = '';
    for (const cat of FIXED_CATS) {
      const catBox = document.createElement('div');
      catBox.className = 'category';
      catBox.innerHTML = `<div class="cat-head"><h3 class="cat-title">${cat}</h3></div>`;

      const inlineWrap = document.createElement('div');
      inlineWrap.className = 'subtopics inline';
      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      for (const st of subs) {
        const chip = document.createElement('span');
        chip.className = 'subtopic chip';
        chip.innerHTML = `<span class="badge sub">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta">${st.detail}</span>`:''}`;
        inlineWrap.appendChild(chip);
      }
      catBox.appendChild(inlineWrap);

      for (const st of subs) {
        const goalsUnder = state.items.filter(x => x.cat===cat && x.type==='goal' && x.parentId===st.id);
        for (const g of goalsUnder) {
          const row = document.createElement('div');
          row.className = 'goal sub-goal-indent';
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

      const goals = state.items.filter(x => x.cat===cat && x.type==='goal' && !x.parentId);
      for (const g of goals) {
        const row = document.createElement('div');
        row.className = 'goal';
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

  function renderOverview() {
    const wrap = document.getElementById('overviewTree');
    wrap.innerHTML = '';
    for (const cat of FIXED_CATS) {
      const catBox = document.createElement('div');
      catBox.className = 'category';
      const head = document.createElement('div');
      head.className = 'cat-head';
      head.innerHTML = `<h3>${cat}</h3>`;
      catBox.appendChild(head);
      const inlineWrap = document.createElement('div');
      inlineWrap.className = 'subtopics inline';
      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      for (const st of subs) {
        const chip = document.createElement('span');
        chip.className = 'subtopic chip';
        chip.innerHTML = `<span class="badge sub">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta">${st.detail}</span>`:''}`;
        inlineWrap.appendChild(chip);
      }
      catBox.appendChild(inlineWrap);
      for (const st of subs) {
        const goalsUnder = state.items.filter(x => x.cat===cat && x.type==='goal' && x.parentId===st.id);
        for (const g of goalsUnder) {
          const row = document.createElement('div');
          row.className = 'goal sub-goal-indent';
          row.innerHTML = `<div class="badge">목표</div> ${g.title}`;
          catBox.appendChild(row);
        }
      }
      const goals = state.items.filter(x => x.cat===cat && x.type==='goal' && !x.parentId);
      for (const g of goals) {
        const row = document.createElement('div');
        row.className = 'goal';
        row.innerHTML = `<div class="badge">목표</div> ${g.title}`;
        catBox.appendChild(row);
      }
      wrap.appendChild(catBox);
    }
  }

  $('saveBase').addEventListener('click', () => {
    state.config.startDate = startDate.value || '';
    state.config.useDday = !!useDday.checked;
    state.config.todayD = Math.max(0, Math.min(99, Number(todayD.value||0)));
    state.config.currentCycleN = Math.max(1, Number(currentCycleN.value||1));
    save(state);
    renderAll();
    alert('저장되었습니다.');
  });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('정말 전체 초기화할까요? JSON 백업을 먼저 권장합니다.')) return;
    state = {config:{startDate:'',useDday:false,todayD:0,currentCycleN:1,coverDataUrl:''}, items:[], achievements:[], seq:1};
    save(state); renderAll(); alert('초기화 완료');
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
      state = load(); renderAll(); alert('가져오기 완료');
    } catch(e) { alert('JSON 파싱 실패'); }
  });
  const coverFile = document.getElementById('coverFile');
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

  function fillSettings() {
    startDate.value = state.config.startDate || '';
    useDday.checked = !!state.config.useDday;
    todayD.value = Number(state.config.todayD||0);
    currentCycleN.value = Number(state.config.currentCycleN||1);
    coverPreview.style.backgroundImage = state.config.coverDataUrl ? `url('${state.config.coverDataUrl}')` : 'none';
  }
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
    fillSettings();
  }
  renderAll();
})();