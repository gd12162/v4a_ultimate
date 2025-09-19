// PWA v5 for GitHub Pages: 4 tabs, banner image, D-Value header, tree, completed, settings
(() => {
  // Tabs
  const tabs = document.querySelectorAll('header .tabs button');
  const pages = document.querySelectorAll('.page');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'completed') { fillCycleSelect(); renderCompleted(); }
    if (btn.dataset.tab === 'overview') { renderOverviewTree(); }
    if (btn.dataset.tab === 'home') { renderHome(); }
  }));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
  }

  // State
  const KEY = 'hundreddays_v5';
  const FIXED_CATS = ['일을 위한 시간','영성','가족','나'];
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
  function initState() {
    const s = load();
    s.config ||= { startDate: '', coverUrl: '', useDday: false, todayD: 0 };
    s.items ||= []; // {id, cat, type:'goal'|'sub', title, detail, parentId?, createdAt}
    s.achievements ||= []; // {id, itemId, cycleIndex, doneAt, dValue}
    s.seq ||= 1;
    save(s);
    return s;
  }
  let state = initState();

  // DOM refs
  const $ = (id) => document.getElementById(id);
  const headerTitle = $('headerTitle');
  const banner = $('banner');
  const todayDbox = $('todayDbox');
  const quickCat = $('quickCat');
  const quickType = $('quickType');
  const quickTitle = $('quickTitle');
  const quickDetail = $('quickDetail');
  const quickParent = $('quickParent');

  const cycleSelect = $('cycleSelect');
  const completedList = $('completedList');

  // SETTINGS
  const startDate = $('startDate');
  const coverUrl = $('coverUrl');
  const useDday = $('useDday');
  const todayD = $('todayD');
  const coverPreview = $('coverPreview');

  // Utils
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
  function currentCycleIndex() {
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

  // Header + Home
  function renderHeader() {
    const start = effectiveStartDate();
    if (!start) { headerTitle.textContent = 'D-??'; return; }
    const dval = dValueFor(new Date());
    headerTitle.textContent = `D-${dval}`;
  }
  function renderBanner() {
    const url = state.config.coverUrl;
    banner.style.backgroundImage = url ? `url('${url}')` : 'none';
    const start = effectiveStartDate();
    todayDbox.textContent = start ? `D-${dValueFor(new Date())}` : 'D-??';
  }

  function fillQuickSelectors() {
    quickCat.innerHTML = '';
    for (const c of FIXED_CATS) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c; quickCat.appendChild(opt);
    }
    // parent subtopics under selected category
    quickParent.innerHTML = '<option value="">(카테고리 직속)</option>';
    const subs = state.items.filter(x => x.cat===quickCat.value && x.type==='sub');
    for (const st of subs) {
      const o = document.createElement('option');
      o.value = String(st.id);
      o.textContent = `소주제: ${st.title}`;
      quickParent.appendChild(o);
    }
  }

  $('quickAdd').addEventListener('click', () => {
    const cat = quickCat.value;
    const type = quickType.value; // 'goal'|'sub'
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
    fillQuickSelectors();
    renderFullTree();
  });

  quickCat.addEventListener('change', fillQuickSelectors);

  function markDone(itemId) {
    const start = effectiveStartDate();
    if (!start) return alert('설정에서 시작일 또는 D값을 먼저 저장하세요.');
    const now = new Date();
    const dval = dValueFor(now);
    const rec = { id: state.seq++, itemId, cycleIndex: currentCycleIndex(), doneAt: now.toISOString(), dValue: dval };
    state.achievements.push(rec); save(state);
    alert(`달성 처리 완료! (기록: ${fmtDate(now)} / D-${dval})`);
    renderCompleted();
    renderFullTree();
    renderOverviewTree();
  }

  function renderFullTree() {
    const wrap = document.getElementById('fullTree');
    wrap.innerHTML = '';
    const tplCat = document.getElementById('tpl-cat').content;
    const tplSub = document.getElementById('tpl-sub').content;
    const tplGoal = document.getElementById('tpl-goal').content;

    for (const cat of FIXED_CATS) {
      const frag = document.importNode(tplCat, true);
      frag.querySelector('.cat-title').textContent = cat;

      // subtopics
      const subWrap = frag.querySelector('.subtopics');
      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      for (const st of subs) {
        const sf = document.importNode(tplSub, true);
        sf.querySelector('.st-title').textContent = st.title;
        sf.querySelector('.st-detail').textContent = st.detail || '';
        const subGoalsWrap = sf.querySelector('.sub-goals');
        const gUnder = state.items.filter(x => x.cat===cat && x.type==='goal' && x.parentId===st.id);
        for (const g of gUnder) {
          const gf = document.importNode(tplGoal, true);
          gf.querySelector('.g-title').textContent = g.title;
          gf.querySelector('.g-detail').textContent = g.detail||'';
          gf.querySelector('.g-meta').textContent = `등록: ${fmtDate(g.createdAt)}`;
          gf.querySelector('.done-btn').addEventListener('click', () => markDone(g.id));
          subGoalsWrap.appendChild(gf);
        }
        subWrap.appendChild(sf);
      }

      // goals directly under category
      const gWrap = frag.querySelector('.goals');
      const goals = state.items.filter(x => x.cat===cat && x.type==='goal' && !x.parentId);
      for (const g of goals) {
        const gf = document.importNode(tplGoal, true);
        gf.querySelector('.g-title').textContent = g.title;
        gf.querySelector('.g-detail').textContent = g.detail||'';
        gf.querySelector('.g-meta').textContent = `등록: ${fmtDate(g.createdAt)}`;
        gf.querySelector('.done-btn').addEventListener('click', () => markDone(g.id));
        gWrap.appendChild(gf);
      }

      wrap.appendChild(frag);
    }
  }

  function renderCompleted() {
    const val = Number(cycleSelect.value || '0');
    const rows = state.achievements.filter(a => a.cycleIndex === val)
      .sort((a,b)=> new Date(a.doneAt) - new Date(b.doneAt));
    completedList.innerHTML = '';
    if (!rows.length) { completedList.innerHTML = `<p class="meta">이 사이클에 달성 기록이 없습니다.</p>`; return; }
    const itemMap = Object.fromEntries(state.items.map(i=>[i.id,i]));
    for (const r of rows) {
      const it = itemMap[r.itemId] || {title:'(삭제됨)'};
      const div = document.createElement('div');
      div.className = 'goal';
      div.innerHTML = `<div><div class="badge">달성</div>
        <strong>${it.title}</strong>
        <div class="meta">${fmtDate(r.doneAt)} • D-${r.dValue}</div></div>`;
      completedList.appendChild(div);
    }
  }

  function fillCycleSelect() {
    cycleSelect.innerHTML = '';
    const start = effectiveStartDate();
    if (!start) return;
    const nowIdx = currentCycleIndex();
    for (let i=0; i<=nowIdx; i++) {
      const r = cycleRange(i);
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i+1}번째 100일 (${isoDay(r.from)}~${isoDay(r.to)})`;
      cycleSelect.appendChild(opt);
    }
    cycleSelect.value = String(nowIdx);
  }

  function renderOverviewTree() {
    const wrap = document.getElementById('overviewTree');
    wrap.innerHTML = '';
    const itemMap = {};
    for (const cat of FIXED_CATS) {
      const catBox = document.createElement('div');
      catBox.className = 'category';
      catBox.innerHTML = `<h3>${cat}</h3>`;
      const subs = state.items.filter(x => x.cat===cat && x.type==='sub');
      const goalsDirect = state.items.filter(x => x.cat===cat && x.type==='goal' && !x.parentId);
      const ul = document.createElement('ul'); ul.style.paddingLeft = '18px';

      for (const st of subs) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="badge sub">소주제</span> <strong>${st.title}</strong> ${st.detail?`<span class="meta">${st.detail}</span>`:''}`;
        // sub goals
        const gList = document.createElement('ul'); gList.style.paddingLeft = '18px';
        const gUnder = state.items.filter(x => x.cat===cat && x.type==='goal' && x.parentId===st.id);
        for (const g of gUnder) {
          const gli = document.createElement('li');
          gli.innerHTML = `<span class="badge">목표</span> ${g.title}`;
          gList.appendChild(gli);
        }
        li.appendChild(gList);
        ul.appendChild(li);
      }

      for (const g of goalsDirect) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="badge">목표</span> ${g.title}`;
        ul.appendChild(li);
      }

      catBox.appendChild(ul);
      wrap.appendChild(catBox);
    }
  }

  // SETTINGS handlers
  $('saveBase').addEventListener('click', () => {
    state.config.startDate = startDate.value || '';
    state.config.coverUrl = coverUrl.value || '';
    state.config.useDday = !!useDday.checked;
    state.config.todayD = Math.max(0, Math.min(99, Number(todayD.value||0)));
    save(state);
    fillQuickSelectors();
    renderAll();
    alert('저장되었습니다.');
  });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('정말 전체 초기화할까요? JSON 백업을 먼저 권장합니다.')) return;
    state = {config:{startDate:'',coverUrl:'',useDday:false,todayD:0}, items:[], achievements:[], seq:1};
    save(state); renderAll(); alert('초기화 완료');
  });
  $('exportJson').addEventListener('click', () => {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    data.schema_version = 5;
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
        config: json.config || {startDate:'',coverUrl:'',useDday:false,todayD:0},
        items: json.items || [],
        achievements: json.achievements || [],
        seq: json.seq || 1
      }));
      state = load(); renderAll(); alert('가져오기 완료');
    } catch(e) { alert('JSON 파싱 실패'); }
  });

  function fillSettings() {
    startDate.value = state.config.startDate || '';
    coverUrl.value = state.config.coverUrl || '';
    useDday.checked = !!state.config.useDday;
    todayD.value = Number(state.config.todayD||0);
    coverPreview.style.backgroundImage = state.config.coverUrl ? `url('${state.config.coverUrl}')` : 'none';
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
    renderOverviewTree();
    fillSettings();
  }

  // init
  renderAll();
})();