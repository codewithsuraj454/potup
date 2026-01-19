(function () {
  function init() {
    if (window.__darkGlassMenuInstalled) return;
    window.__darkGlassMenuInstalled = true;

    // Inject refined styles
    const style = document.createElement("style");
    style.textContent = `
      #glassContextMenu {
        position: fixed;
        display: none;
        width: 200px; /* Smaller width */
        padding: 5px; /* Tighter padding */
        border-radius: 12px; /* Smaller radius */

        /* Modern Dark Glass */
        background: rgba(30, 30, 30, 0.85);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);

        /* Subtle border and shadow */
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 10px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);

        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px; /* Compact font */
        color: #f0f0f0;

        /* Snappy Animation */
        transform-origin: top left;
        transform: scale(0.95);
        opacity: 0;
        transition: transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.1s ease;
      }

      #glassContextMenu.show {
        transform: scale(1);
        opacity: 1;
      }

      .gcm-item {
        padding: 6px 10px; /* Compact item padding */
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background 0.1s ease;
      }

      .gcm-item:hover {
        background: rgba(255, 255, 255, 0.15); /* Brighter hover */
        color: #fff;
      }

      /* Icons */
      .gcm-icon {
        width: 16px;
        text-align: center;
        font-size: 14px;
        opacity: 0.8;
      }

      /* Keyboard Shortcuts */
      .gcm-hint {
        margin-left: auto; /* Pushes to right */
        opacity: 0.4;
        font-size: 11px;
        letter-spacing: 0.5px;
      }

      /* Divider */
      .gcm-divider {
        height: 1px;
        margin: 4px 6px;
        background: rgba(255, 255, 255, 0.1);
      }

      .gcm-hidden {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);

    // Create menu structure
    const menu = document.createElement("div");
    menu.id = "glassContextMenu";
    menu.innerHTML = `
      <div class="gcm-item" id="gcm-copy">
        <span class="gcm-icon">❐</span> Copy
        <span class="gcm-hint">Ctrl+C</span>
      </div>

      <div class="gcm-item" id="gcm-search">
        <span class="gcm-icon">🔍</span> Search
      </div>

      <div class="gcm-item" id="gcm-download">
        <span class="gcm-icon">⬇</span> Save Image
      </div>

      <div class="gcm-divider"></div>

      <div class="gcm-item" id="gcm-refresh">
        <span class="gcm-icon">↻</span> Refresh
        <span class="gcm-hint">F5</span>
      </div>
      
      <div class="gcm-item" id="gcm-info">
        <span class="gcm-icon">ℹ</span> Info
      </div>
    `;
    document.body.appendChild(menu);

    const $ = (id) => menu.querySelector(id);
    const copyBtn = $("#gcm-copy");
    const searchBtn = $("#gcm-search");
    const downloadBtn = $("#gcm-download");
    const infoBtn = $("#gcm-info");
    const refreshBtn = $("#gcm-refresh");

    let rightClickedImage = null;

    // Open menu
    window.addEventListener(
      "contextmenu",
      function (e) {
        e.preventDefault();
        e.stopPropagation();

        rightClickedImage = null;

        // Handle Image Context
        if (e.target && e.target.tagName === "IMG") {
          rightClickedImage = e.target;
          downloadBtn.classList.remove("gcm-hidden");
        } else {
          downloadBtn.classList.add("gcm-hidden");
        }

        // Handle Selection Context
        const sel = window.getSelection().toString();
        if (!sel) {
          copyBtn.classList.add("gcm-hidden");
          searchBtn.classList.add("gcm-hidden");
        } else {
          copyBtn.classList.remove("gcm-hidden");
          searchBtn.classList.remove("gcm-hidden");
        }

        // Positioning Logic (Keep menu inside viewport)
        const menuWidth = 200;
        const menuHeight = menu.offsetHeight || 150; // Estimate if not visible yet
        let x = e.clientX;
        let y = e.clientY;

        if (x + menuWidth > window.innerWidth) x = x - menuWidth;
        if (y + menuHeight > window.innerHeight) y = y - menuHeight;

        menu.style.left = x + "px";
        menu.style.top = y + "px";
        menu.style.display = "block";

        // Trigger animation
        requestAnimationFrame(() => menu.classList.add("show"));
      },
      true
    );

    // Close menu
    function hide() {
      if (menu.classList.contains("show")) {
        menu.classList.remove("show");
        setTimeout(() => (menu.style.display = "none"), 100);
      }
    }

    window.addEventListener("click", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide, true);

    // Functionality
    copyBtn.onclick = async () => {
      const text = window.getSelection().toString();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        alert("Copy failed permissions");
      }
    };

    searchBtn.onclick = () => {
      const text = window.getSelection().toString();
      if (!text) return;
      window.open(
        "https://www.google.com/search?q=" + encodeURIComponent(text),
        "_blank"
      );
    };

    downloadBtn.onclick = () => {
      if (!rightClickedImage) return;
      const a = document.createElement("a");
      a.href = rightClickedImage.src;
      a.download = "download";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    infoBtn.onclick = () => alert("Clean Glass Menu v2.0");
    refreshBtn.onclick = () => location.reload();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
