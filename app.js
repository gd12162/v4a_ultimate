/* D-트래커 - v7.1 */
(() => {
  const APP_VERSION = "v7.1.0-2025-09-20";
  const QS = (sel) => document.querySelector(sel);
  const $view = () => QS("#view");
  const Tabs = ["home","history","progress","settings"];

  // --- Toast ---
  function showToast(message, options = {}) {
    const toast = QS("#toast");
    toast.innerHTML = `<div>${message}</div>`;
    if (options.actions && options.actions.length) {
      const actDiv = document.createElement("div");
      actDiv.className = "actions";
      options.actions.forEach(a => {
        const b = document.createElement("button");
        b.className = "toast-btn";
        b.textContent = a.label;
        b.onclick = a.onClick;
        actDiv.appendChild(b);
      });
      toast.appendChild(actDiv);
    }
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), options.duration ?? 2500);
  }

  // --- Store (localStorage) ---
  const store = {
    key: "dtracker_v1",
    default: {
      theme: "dark",
      photo: null,              // dataURL
      dday: null,               // ISO date string
      quickItems: [],           // {id, text, done, createdAt, doneAt}
      structure: ["돈 버는 행위", "신앙", "가족", "나를 위한 시간"], // 기본 카테고리
    },
    load() {
      try {
        const raw = localStorage.getItem(this.key);
        return raw ? { ...this.default, ...JSON.parse(raw) } : { ...this.default };
      } catch { return { ...this.default }; }
    },
    save(data) { localStorage.setItem(this.key, JSON.stringify(data)); }
  };
  let state = store.load();

  // --- Helpers ---
  const formatDate = (d) => new Date(d).toLocaleDateString();
  const todayISO = () => new Date().toISOString().slice(0,10);
  const uid = () => Math.random().toString(36).slice(2,10);

  function ddayText(iso) {
    if (!iso) return "미설정";
    const target = new Date(iso);
    const now = new Date();
    const diff = Math.ceil((target - new Date(now.toDateString())) / (1000*60*60*24));
    if (diff > 0) return `D-${diff}`;
    if (diff === 0) return "D-DAY";
    return `D+${Math.abs(diff)}`;
  }

  // --- Renderers ---
  function renderHome() {
    const itemsLeft = state.quickItems.filter(i => !i.done).length;
    const prog = progressPercent();
    $view().innerHTML = `
      <section class="card">
        <h2>나의 이미지</h2>
        <div class="imgBox">
          <img id="userImg" src="${state.photo || ""}" alt="이미지" onerror="this.style.display='none'">
          <div class="grid">
            <input id="photoFile" type="file" accept="image/*" class="input">
            <button id="savePhoto" class="btn">이미지 저장</button>
            ${state.photo ? '<button id="removePhoto" class="btn secondary">이미지 제거</button>' : ""}
          </div>
        </div>
        <p class="small">홈 화면 상단에 동기부여 이미지를 고정합니다.</p>
      </section>

      <section class="card">
        <h2>디데이</h2>
        <div class="row">
          <input id="ddayInput" type="date" class="input" value="${state.dday || ""}">
          <button id="saveDday" class="btn">저장</button>
        </div>
        <div class="kv">
          <div>현재 상태</div><div class="pill">${ddayText(state.dday)}</div>
        </div>
      </section>

      <section class="card">
        <h2>전체구조</h2>
        <div class="grid cols-2" id="structGrid">
          ${state.structure.map(s => `<div class="item"><span>${s}</span><span class="badge">카테고리</span></div>`).join("")}
        </div>
        <div class="row" style="margin-top:10px">
          <input id="newStruct" class="input" placeholder="카테고리 추가">
          <button id="addStruct" class="btn">추가</button>
        </div>
      </section>

      <section class="card">
        <h2>빠른 추가</h2>
        <div class="row">
          <input id="quickText" class="input" placeholder="할 일 입력">
          <button id="addQuick" class="btn">추가</button>
        </div>
        <div class="list" id="quickList">
          ${state.quickItems.filter(i=>!i.done).map(renderQuickItem).join("") || '<div class="small">할 일이 없습니다.</div>'}
        </div>
        <p class="small">남은 항목: ${itemsLeft}개</p>
      </section>

      <section class="card">
        <h2>오늘의 진행률</h2>
        <div class="progressbar"><div style="width:${prog}%"></div></div>
        <p class="small">${prog}% 완료</p>
      </section>
    `;

    // listeners
    const file = QS("#photoFile");
    const savePhoto = QS("#savePhoto");
    const removePhoto = QS("#removePhoto");
    savePhoto?.addEventListener("click", async () => {
      if (!file.files || !file.files[0]) { showToast("이미지를 선택하세요"); return; }
      const reader = new FileReader();
      reader.onload = () => { state.photo = reader.result; persist(); renderHome(); showToast("이미지 저장됨"); };
      reader.readAsDataURL(file.files[0]);
    });
    removePhoto?.addEventListener("click", () => { state.photo = null; persist(); renderHome(); showToast("이미지 제거됨"); });

    QS("#saveDday").addEventListener("click", () => {
      const val = QS("#ddayInput").value || null;
      state.dday = val;
      persist(); renderHome(); showToast("디데이 저장됨");
    });

    QS("#addStruct").addEventListener("click", () => {
      const i = QS("#newStruct");
      const v = i.value.trim();
      if (!v) return;
      state.structure.push(v);
      i.value = "";
      persist(); renderHome(); showToast("카테고리 추가됨");
    });

    QS("#addQuick").addEventListener("click", () => {
      const i = QS("#quickText");
      const v = i.value.trim();
      if (!v) return;
      state.quickItems.unshift({ id: uid(), text: v, done: false, createdAt: Date.now(), doneAt: null });
      i.value = "";
      persist(); renderHome(); showToast("추가 완료");
    });

    // quick item actions
    $view().querySelectorAll(".quick-done").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        const item = state.quickItems.find(x => x.id === id);
        if (item) { item.done = true; item.doneAt = Date.now(); persist(); showToast("완료로 이동"); renderHome(); }
      });
    });
    $view().querySelectorAll(".quick-del").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.id;
        state.quickItems = state.quickItems.filter(x => x.id !== id);
        persist(); showToast("삭제됨"); renderHome();
      });
    });
  }

  function renderQuickItem(i) {
    return `<div class="item">
      <div>${i.text}</div>
      <div class="row">
        <button class="btn secondary quick-done" data-id="${i.id}">완료</button>
        <button class="btn secondary quick-del" data-id="${i.id}">삭제</button>
      </div>
    </div>`;
  }

  function renderHistory() {
    const done = state.quickItems.filter(i => i.done).sort((a,b)=>b.doneAt-a.doneAt);
    $view().innerHTML = `
      <section class="card">
        <h2>완료 기록</h2>
        <div class="list">
          ${done.length ? done.map(i => `
            <div class="item">
              <div>${i.text}</div>
              <div class="small">${new Date(i.doneAt).toLocaleString()}</div>
            </div>`).join("") : '<div class="small">완료된 항목이 없습니다.</div>'}
        </div>
        ${done.length ? '<button id="clearDone" class="btn" style="margin-top:10px">완료 기록 비우기</button>' : ''}
      </section>
    `;
    QS("#clearDone")?.addEventListener("click", () => {
      state.quickItems = state.quickItems.filter(i => !i.done);
      persist(); renderHistory(); showToast("완료 기록이 비워졌습니다");
    });
  }

  function progressPercent() {
    const total = state.quickItems.length;
    const done = state.quickItems.filter(i => i.done).length;
    if (total === 0) return 0;
    return Math.round((done / total) * 100);
  }

  function renderProgress() {
    const total = state.quickItems.length;
    const done = state.quickItems.filter(i => i.done).length;
    const pending = total - done;
    const pct = progressPercent();
    $view().innerHTML = `
      <section class="card">
        <h2>진행현황</h2>
        <div class="kv"><span>전체 항목</span><strong>${total}</strong></div>
        <div class="kv"><span>완료</span><strong>${done}</strong></div>
        <div class="kv"><span>미완료</span><strong>${pending}</strong></div>
        <div style="margin:10px 0">
          <div class="progressbar"><div style="width:${pct}%"></div></div>
          <p class="small">${pct}% 완료</p>
        </div>
        <h3>카테고리별</h3>
        <div class="grid cols-2">
          ${state.structure.map(s => {
            const cnt = state.quickItems.filter(i => i.text.includes(s)).length;
            return `<div class="item"><div>${s}</div><div class="badge">${cnt}건</div></div>`
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderSettings() {
    $view().innerHTML = `
      <section class="card">
        <h2>설정</h2>
        <div class="form-row">
          <label for="darkMode">다크 모드</label>
          <input type="checkbox" id="darkMode" ${state.theme === "dark" ? "checked":""} />
        </div>
        <button id="saveSettings" class="btn">설정 적용</button>
        <p class="small">저장 시 "설정이 적용되었습니다" 메시지가 표시됩니다.</p>
      </section>

      <section class="card">
        <h2>상태</h2>
        <ul>
          <li>PWA 설치 지원: <strong id="pwaSupported">확인 중…</strong></li>
          <li>서비스 워커: <strong id="swStatus">확인 중…</strong></li>
          <li>버전: <strong>${APP_VERSION}</strong></li>
        </ul>
      </section>
    `;
    QS("#saveSettings").addEventListener("click", () => {
      const dark = QS("#darkMode").checked;
      state.theme = dark ? "dark" : "light";
      applyTheme();
      persist();
      showToast("설정이 적용되었습니다 ✅");
    });
    // PWA support indicators
    QS("#pwaSupported").textContent = ("serviceWorker" in navigator && "PushManager" in window) ? "가능" : ("serviceWorker" in navigator ? "부분 가능" : "미지원");
    QS("#swStatus").textContent = ("serviceWorker" in navigator) ? "등록됨(또는 대기중)" : "미지원";
  }

  // --- Routing / Tabs ---
  function activateTab(name) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.page===name));
    if (name === "home") renderHome();
    else if (name === "history") renderHistory();
    else if (name === "progress") renderProgress();
    else if (name === "settings") renderSettings();
    location.hash = name;
  }

  function initTabs() {
    document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => activateTab(b.dataset.page)));
    const initial = Tabs.includes(location.hash.replace("#","")) ? location.hash.replace("#","") : "home";
    activateTab(initial);
  }

  // --- Theme ---
  function applyTheme() {
    if (state.theme === "dark") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme","light");
  }

  function persist() { store.save(state); }

  // --- Startup ---
  window.addEventListener("DOMContentLoaded", () => {
    QS("#appVersion").textContent = APP_VERSION;
    applyTheme();
    initTabs();
  });

  // --- Service Worker registration and update flow ---
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("sw.js");
        // Detect updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showToast("새 버전이 준비되었습니다.", {
                duration: 8000,
                actions: [{ label: "업데이트", onClick: () => {
                  if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
                  else navigator.serviceWorker.getRegistration().then(r => r?.waiting?.postMessage({type:"SKIP_WAITING"}));
                }}]
              });
            }
          });
        });
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return; refreshing = true; window.location.reload();
        });
      } catch (err) { console.error("SW 등록 실패:", err); }
    });
  }
})();