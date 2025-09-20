/* D-트래커 - v7.0.0-2025-09-20 */
(() => {
  const APP_VERSION = "v7.0.0-2025-09-20";
  const QS = (sel) => document.querySelector(sel);

  // Version display
  window.addEventListener("DOMContentLoaded", () => {
    QS("#appVersion").textContent = APP_VERSION;
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") document.documentElement.dataset.theme = "dark";
    QS("#darkMode").checked = savedTheme === "dark";

    // PWA support
    QS("#pwaSupported").textContent = ("serviceWorker" in navigator && "PushManager" in window) ? "가능" : ("serviceWorker" in navigator ? "부분 가능" : "미지원");

    // SW status (will update after registration)
    QS("#swStatus").textContent = ("serviceWorker" in navigator) ? "등록 시도 중" : "미지원";
  });

  // Simple toast
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
    setTimeout(() => toast.classList.remove("show"), options.duration ?? 3000);
  }

  // Settings save
  window.addEventListener("DOMContentLoaded", () => {
    QS("#saveSettings").addEventListener("click", () => {
      const dark = QS("#darkMode").checked;
      if (dark) {
        localStorage.setItem("theme", "dark");
        document.documentElement.dataset.theme = "dark";
      } else {
        localStorage.setItem("theme", "light");
        delete document.documentElement.dataset.theme;
      }
      showToast("설정이 적용되었습니다 ✅");
    });
  });

  // Service Worker registration and update flow
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("sw.js");
        QS("#swStatus").textContent = "등록 완료";

        // Detect updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New version available
              showToast("새 버전이 준비되었습니다.", {
                duration: 8000,
                actions: [{ label: "업데이트", onClick: () => {
                  if (reg.waiting) {
                    reg.waiting.postMessage({ type: "SKIP_WAITING" });
                  } else {
                    navigator.serviceWorker.getRegistration().then(r => r?.waiting?.postMessage({type: "SKIP_WAITING"}));
                  }
                }}]
              });
            }
          });
        });

        // Reload once activated
        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      } catch (err) {
        console.error("SW 등록 실패:", err);
        QS("#swStatus").textContent = "등록 실패";
      }
    });
  }
})();
