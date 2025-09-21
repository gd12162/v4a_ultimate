// D-Tracker v6 — 4탭 고정 + 홈 하단 입력칸 포함 버전
// - 홈: 배너(설정 이미지), 중앙 D-day 표시, 전체구조(보기) + 하단에 "소주제/목표 추가" 폼
// - 완료기록: 카테고리/소주제 트리 아래에 완료 누른 순서대로 기록
// - 진행현황: 읽기전용 구조
// - 설정: 이미지 업로드 + 오늘 기준 D값, 저장 시 토스트
(() => {
  // ---- State ----
  const KEY = 'hundreddays_v6';
  const CATS = ['돈을 버는 행위','영성 유지를 위한 행위','가족을 위한 행위','나를 위한 시간'];

  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||{} }catch{ return {} } }
  function save(s){ localStorage.setItem(KEY, JSON.stringify(s)); }
  function initState(){
    const s = load();
    s.config ||= { coverDataUrl:'', todayD:0 };
    s.items ||= [];        // {id, cat, type:'sub'|'goal', title, detail?, parentId?, createdAt}
    s.achievements ||= []; // {id, itemId, doneAt, dValue}
    s.seq ||= 1;
    save(s); return s;
  }
  let state = initState();

  // ---- DOM helpers ----
  const $ = (sel, root=document)=>root.querySelector(sel);
  const $$ = (sel, root=document)=>[...root.querySelectorAll(sel)];
  const view = $('#view');
  const toastBox = $('#toast');

  // 요구: 상단 버전표시 제거 (HTML 손대지 않아도 됨)
  $('.topbar .version')?.remove();

  // ---- Tabs ----
  let currentPage = 'home';
  $$('.tabs .tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      $$('.tabs .tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentPage = btn.dataset.page;
      render();
    });
  });
  // 첫 진입
  (function firstActive(){
    const first = $('.tabs .tab[data-page="home"]') || $('.tabs .tab');
    first?.classList.add('active');
  })();

  // ---- Utils ----
  const pad2 = n=>String(n).padStart(2,'0');
  const fmtDate = d=>{
    const t=new Date(d);
    return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
  };
  const nowISO = ()=>new Date().toISOString();
  const toast = (msg)=>{
    if(!toastBox) return alert(msg);
    toastBox.textContent = msg;
    toastBox.classList.add('show');
    setTimeout(()=>toastBox.classList.remove('show'),1500);
  };

  // ---- Data ops ----
  function addSub({cat,title,detail}){
    const it={id:state.seq++,cat,type:'sub',title,detail:detail||'',createdAt:nowISO()};
    state.items.push(it); save(state); return it;
  }
  function addGoal({cat,parentId,title,detail}){
    const it={id:state.seq++,cat,type:'goal',parentId:parentId||null,title,detail:detail||'',createdAt:nowISO()};
    state.items.push(it); save(state); return it;
  }
  function editSub(subId,newTitle){
    const it=state.items.find(x=>x.id===subId && x.type==='sub'); if(!it) return;
    it.title=newTitle.trim(); save(state);
  }
  function deleteItem(itemId){
    const target=state.items.find(x=>x.id===itemId); if(!target) return;
    if(!confirm(`정말 "${target.title}"을(를) 삭제할까요? 소주제를 삭제하면 하위 목표도 함께 삭제됩니다.`)) return;

    let removedIds=[];
    if(target.type==='sub'){
      removedIds = state.items.filter(i=>i.id===itemId || i.parentId===itemId).map(i=>i.id);
      state.items = state.items.filter(i=>!(i.id===itemId || i.parentId===itemId));
    } else {
      removedIds=[itemId];
      state.items = state.items.filter(i=>i.id!==itemId);
    }
    // 고아 완료기록 제거
    state.achievements = state.achievements.filter(a=>!removedIds.includes(a.itemId));
    save(state);
  }
  function completeGoal(itemId){
    const it=state.items.find(x=>x.id===itemId && x.type==='goal'); if(!it) return;
    const rec={id:state.seq++, itemId, doneAt:nowISO(), dValue:Number(state.config.todayD||0)};
    state.achievements.push(rec); save(state);
  }

  // ---- Shared renderers ----
  const catHead = cat => `<div class="cat-head"><h3 class="cat-title">${cat}</h3></div>`;
  const subChipHTML = sub => `
    <div class="chip subtopic" data-sub-id="${sub.id}">
      <span class="badge">소주제</span>
      <strong>${sub.title}</strong>${sub.detail?` <span class="meta small">${sub.detail}</span>`:''}
      <div class="chip-actions">
        <button class="chip-btn edit-sub">수정</button>
        <button class="chip-btn danger del-sub">삭제</button>
      </div>
    </div>`;
  const goalRowHTML = (goal,indent=false)=>`
    <div class="goal${indent?' sub-goal-indent':''}" data-item-id="${goal.id}">
      <div class="goal-left">
        <span class="badge">목표</span>
        <strong class="g-title">${goal.title}</strong>
        ${goal.detail?`<div class="meta g-detail small">${goal.detail}</div>`:''}
        <div class="meta g-meta small">등록: ${fmtDate(goal.createdAt)}</div>
      </div>
      <div class="goal-right">
        <button class="mini-btn done-btn">완료</button>
        <button class="mini-btn danger del-btn">삭제</button>
      </div>
    </div>`;
  const goalRowReadOnly = (goal,indent=false)=>`
    <div class="goal${indent?' sub-goal-indent':''}">
      <div class="goal-left">
        <span class="badge">목표</span>
        <strong class="g-title">${goal.title}</strong>
        ${goal.detail?`<div class="meta g-detail small">${goal.detail}</div>`:''}
        <div class="meta g-meta small">등록: ${fmtDate(goal.createdAt)}</div>
      </div>
    </div>`;

  // ---- Page: Home (구조 + 하단 입력칸) ----
  function renderHome(){
    const d = Number(state.config.todayD||0);
    const bannerStyle = state.config.coverDataUrl
      ? `style="background-image:url('${state.config.coverDataUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;"`
      : '';
    // 구조 + 입력칸
    let html = `
      <section class="page page-home">
        <div id="banner" ${bannerStyle}></div>
        <div id="todayDbox" class="center-d">D-${d}</div>

        <div id="fullTree">
          ${CATS.map(cat=>{
            const subs=state.items.filter(x=>x.cat===cat && x.type==='sub');
            const directGoals=state.items.filter(x=>x.cat===cat && x.type==='goal' && !x.parentId);
            return `<div class="category" data-cat="${cat}">
              ${catHead(cat)}
              ${subs.map(st=>{
                const goalsUnder=state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
                return `${subChipHTML(st)}${goalsUnder.map(g=>goalRowHTML(g,true)).join('')}`;
              }).join('')}
              ${directGoals.map(g=>goalRowHTML(g,false)).join('')}
            </div>`;
          }).join('')}
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
            <label>제목<input id="quickTitle" type="text" placeholder="제목을 입력"/></label>
            <label>상세(선택)<input id="quickDetail" type="text" placeholder="설명(선택)"/></label>
            <div class="actions"><button id="quickAdd" class="btn">추가</button></div>
          </div>
        </div>
      </section>`;
    view.innerHTML = html;

    // 소주제 버튼 바인딩(수정/삭제)
    $$('#fullTree .subtopic').forEach(node=>{
      const subId = Number(node.dataset.subId);
      node.querySelector('.edit-sub')?.addEventListener('click', ()=>{
        const it=state.items.find(x=>x.id===subId); if(!it) return;
        const nv=prompt('소주제 제목 수정', it.title);
        if(nv===null) return;
        const t=nv.trim(); if(!t) return toast('제목을 입력하세요.');
        editSub(subId,t); render();
      });
      node.querySelector('.del-sub')?.addEventListener('click', ()=>{ deleteItem(subId); render(); });
    });

    // 목표 버튼 바인딩(완료/삭제)
    $$('#fullTree .goal').forEach(row=>{
      const id=Number(row.dataset.itemId);
      row.querySelector('.done-btn')?.addEventListener('click', ()=>{ completeGoal(id); toast('완료가 기록되었습니다.'); });
      row.querySelector('.del-btn')?.addEventListener('click', ()=>{ deleteItem(id); render(); });
    });

    // 홈 하단 입력칸 로직
    const quickType = $('#quickType');
    const quickCat = $('#quickCat');
    const quickParent = $('#quickParent');
    const quickTitle = $('#quickTitle');
    const quickDetail = $('#quickDetail');

    function refreshParentOptions(){
      const cat=quickCat.value;
      const subs=state.items.filter(x=>x.cat===cat && x.type==='sub');
      quickParent.innerHTML = `<option value="">(카테고리 직속)</option>` + subs.map(s=>`<option value="${s.id}">소주제: ${s.title}</option>`).join('');
    }
    quickCat.addEventListener('change', refreshParentOptions);
    refreshParentOptions();

    $('#quickAdd').addEventListener('click', ()=>{
      const type=quickType.value;
      const cat=quickCat.value;
      const title=quickTitle.value.trim();
      const detail=quickDetail.value.trim();
      if(!cat) return toast('카테고리를 선택하세요.');
      if(!title) return toast('제목을 입력하세요.');

      if(type==='sub'){
        addSub({cat,title,detail});
        toast('소주제가 추가되었습니다.');
      }else{
        const pid = quickParent.value ? Number(quickParent.value) : null;
        addGoal({cat,parentId:pid,title,detail});
        toast('목표가 추가되었습니다.');
      }
      // 낙관적 반영: 입력만 비우고 트리 재렌더
      quickTitle.value=''; quickDetail.value='';
      renderHome(); // 홈만 새로 그림(현재 탭 유지)
    });
  }

  // ---- Page: History (완료기록) ----
  function renderHistory(){
    const itemMap = Object.fromEntries(state.items.map(i=>[i.id,i]));
    const rows = [...state.achievements].sort((a,b)=> new Date(a.doneAt)-new Date(b.doneAt));
    const grouped = {};
    for(const rec of rows){
      const it=itemMap[rec.itemId]; if(!it) continue;
      const cat=it.cat; const subId=it.parentId||0;
      grouped[cat] ||= {}; grouped[cat][subId] ||= [];
      grouped[cat][subId].push({title:it.title, doneAt:rec.doneAt, dValue:rec.dValue});
    }

    let html = `<section class="page page-history"><h2>완료기록</h2>`;
    html += CATS.map(cat=>{
      const g=grouped[cat]||{}; const keys=Object.keys(g);
      if(!keys.length){
        return `<div class="category" data-cat="${cat}">${catHead(cat)}<p class="meta small">완료 기록이 없습니다.</p></div>`;
      }
      const blocks = keys.map(k=>{
        const sid=Number(k);
        let head='';
        if(sid){
          const st=state.items.find(i=>i.id===sid);
          head = `<div class="chip"><span class="badge">소주제</span><strong>${st?st.title:'(소주제)'}</strong></div>`;
        }
        const recs=g[k];
        const body = recs.map(r=>`
          <div class="goal${sid?' sub-goal-indent':''}">
            <div><span class="badge">목표</span>
              <strong>${r.title}</strong>
              <div class="meta small">${fmtDate(r.doneAt)} • D-${r.dValue}</div>
            </div>
          </div>`).join('');
        return head+body;
      }).join('');
      return `<div class="category" data-cat="${cat}">${catHead(cat)}${blocks}</div>`;
    }).join('');
    html += `</section>`;
    view.innerHTML = html;
  }

  // ---- Page: Progress (읽기전용) ----
  function renderProgress(){
    let html = `<section class="page page-progress"><h2>진행현황</h2>`;
    html += CATS.map(cat=>{
      const subs=state.items.filter(x=>x.cat===cat && x.type==='sub');
      const directGoals=state.items.filter(x=>x.cat===cat && x.type==='goal' && !x.parentId);
      return `<div class="category" data-cat="${cat}">
        ${catHead(cat)}
        ${subs.map(st=>{
          const goalsUnder=state.items.filter(x=>x.cat===cat && x.type==='goal' && x.parentId===st.id);
          return `<div class="subtopic chip">
              <span class="badge">소주제</span><strong>${st.title}</strong>${st.detail?` <span class="meta small">${st.detail}</span>`:''}
            </div>
            ${goalsUnder.map(g=>goalRowReadOnly(g,true)).join('')}`;
        }).join('')}
        ${directGoals.map(g=>goalRowReadOnly(g,false)).join('')}
      </div>`;
    }).join('');
    html += `</section>`;
    view.innerHTML = html;
  }

  // ---- Page: Settings ----
  function renderSettings(){
    const d = Number(state.config.todayD||0);
    let html = `
      <section class="page page-settings">
        <h2>설정</h2>
        <div class="form-grid">
          <label>메인 배너 이미지
            <input id="coverFile" type="file" accept="image/*">
          </label>
          <div class="imgBox">
            <img id="coverPreview" alt="미리보기" style="display:${state.config.coverDataUrl?'block':'none'}" />
          </div>
          <label>오늘 기준 D-값
            <input id="todayD" type="number" min="0" max="99" value="${d}">
          </label>
          <div class="actions"><button id="saveSettingsBtn" class="btn">저장</button></div>
        </div>
      </section>`;
    view.innerHTML = html;

    const coverFile = $('#coverFile');
    const coverPreview = $('#coverPreview');
    if(state.config.coverDataUrl){
      coverPreview.src = state.config.coverDataUrl;
      coverPreview.style.width='120px';
      coverPreview.style.height='120px';
      coverPreview.style.objectFit='cover';
      coverPreview.style.borderRadius='12px';
      coverPreview.style.border='1px solid var(--line)';
    }

    coverFile?.addEventListener('change', (e)=>{
      const f=e.target.files?.[0]; if(!f) return;
      const reader=new FileReader();
      reader.onload = ()=>{
        state.config.coverDataUrl=String(reader.result||'');
        save(state);
        coverPreview.src=state.config.coverDataUrl;
        coverPreview.style.display='block';
      };
      reader.readAsDataURL(f);
    });

    $('#saveSettingsBtn').addEventListener('click', ()=>{
      state.config.todayD = Number($('#todayD').value||0);
      save(state);
      toast('설정이 적용되었습니다.');
    });
  }

  // ---- Render switch ----
  function render(){
    switch(currentPage){
      case 'home': return renderHome();
      case 'history': return renderHistory();
      case 'progress': return renderProgress();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  }

  // ---- SW(Optional) ----
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{ try{ navigator.serviceWorker.register('./sw.js'); }catch{} });
  }

  // initial
  render();
})();
