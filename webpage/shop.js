// shop.js — 提供：
// - 分類切換
// - 即時搜尋（支持 Enter）
// - 關鍵字高亮
// - 清除按鈕
// - 無結果提示與可存取性的 ARIA 更新

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');
  const categoryItems = Array.from(document.querySelectorAll('.category-item'));
  const products = Array.from(document.querySelectorAll('.product'));
  const resultsInfo = document.getElementById('resultsInfo');
  const noResults = document.getElementById('noResults');

  // 儲存原始商品名稱以利高亮重置
  products.forEach(p => {
    const nameEl = p.querySelector('.product-name');
    if (nameEl) {
      p.dataset.originalName = nameEl.textContent.trim();
    }
  });

  // 目前選取的類別
  function getActiveCategory() {
    const active = categoryItems.find(i => i.classList.contains('active'));
    return active ? active.dataset.category : 'all';
  }

  // 安全建立 regex（escape user input）
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  }

  // 高亮商品名稱中的 query
  function highlightName(product, query) {
    const nameEl = product.querySelector('.product-name');
    const original = product.dataset.originalName || (nameEl ? nameEl.textContent : '');
    if (!nameEl) return;
    if (!query) {
      nameEl.innerHTML = original;
      return;
    }
    const re = new RegExp('(' + escapeRegExp(query) + ')', 'ig');
    nameEl.innerHTML = original.replace(re, '<mark class="highlight">$1</mark>');
  }

  // 主過濾函式
  function applyFilters() {
    const raw = searchInput.value.trim();
    const q = raw.toLowerCase();
    const activeCategory = getActiveCategory();

    let visibleCount = 0;

    products.forEach(product => {
      const name = (product.dataset.originalName || '').toLowerCase();
      const category = (product.dataset.category || '').toLowerCase();

      // 判斷是否符合類別
      const categoryMatches = (activeCategory === 'all') || (category === activeCategory.toLowerCase());

      // 判斷是否符合搜尋
      const matchesQuery = !q || name.indexOf(q) !== -1 || category.indexOf(q) !== -1;

      if (categoryMatches && matchesQuery) {
        product.classList.add('show');
        product.style.display = '';
        highlightName(product, q);
        visibleCount++;
      } else {
        product.classList.remove('show');
        product.style.display = 'none';
        highlightName(product, '');
      }
    });

    // 更新介面文字與無結果提示
    if (visibleCount === 0) {
      noResults.style.display = '';
      noResults.setAttribute('aria-hidden', 'false');
      resultsInfo.textContent = '0 筆符合條件';
    } else {
      noResults.style.display = 'none';
      noResults.setAttribute('aria-hidden', 'true');
      resultsInfo.textContent = `${visibleCount} 筆符合條件`;
    }

    // 清除按鈕顯示
    clearBtn.style.display = raw ? '' : 'none';
  }

  // 綁定分類按鈕
  categoryItems.forEach(item => {
    item.addEventListener('click', () => {
      categoryItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      applyFilters();
    });

    // 支援鍵盤可聚焦並以 Enter/Space 選取
    item.setAttribute('tabindex', '0');
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });

  // 簡單 debounce，降低快速輸入時操作頻率
  function debounce(fn, wait = 150) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  const debouncedApply = debounce(applyFilters, 120);

  // 即時搜尋
  searchInput.addEventListener('input', debouncedApply);

  // 支援 Enter 鍵以確認（也會觸發 applyFilters）
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyFilters();
    }
  });

  // 清除按鈕
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    applyFilters();
  });

  // 初始套用一次（顯示預設）
  applyFilters();

  // --- 購物車與 modal 功能 ---
  const cart = [];
  // 在 header cart 加一個數字徽章（如果尚未存在，動態建立）
  let cartCountEl = document.querySelector('.cart .count');
  const cartContainer = document.querySelector('.cart');
  if (!cartCountEl) {
    cartCountEl = document.createElement('span');
    cartCountEl.className = 'count';
    cartCountEl.textContent = '0';
    cartContainer.appendChild(cartCountEl);
  }

  function updateCartCount() {
    cartCountEl.textContent = String(cart.length);
  }

  const popover = document.getElementById('productPopover');
  const popoverPanel = popover.querySelector('.popover-panel');
  const popoverTitle = popover.querySelector('.popover-title');
  const popoverPrice = popover.querySelector('.popover-price');
  const popoverAddBtn = document.getElementById('popoverAddBtn');
  const popoverCancelBtn = document.getElementById('popoverCancelBtn');

  let currentProduct = null;

  function openPopover(product) {
    currentProduct = product;
    const name = product.dataset.originalName || product.querySelector('.product-name')?.textContent || '';
    const price = product.dataset.price || product.querySelector('.product-price')?.textContent || '';
    popoverTitle.textContent = name;
    popoverPrice.textContent = price;

    // 在開啟時重設按鈕文字，並依購物車內是否存在該 id 顯示對應狀態
    const productId = product.dataset.id || product.dataset.originalName || '';
    const isInCart = cart.some(ci => ci.id === productId);
    if (isInCart) {
      popoverAddBtn.textContent = '已在購物車';
    } else {
      popoverAddBtn.textContent = '加入購物車';
    }

    // 計算位置：將 popover 放在商品 element 底下，若超出右邊則向左調整，若超出底部則放到上方
    const rect = product.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const scrollX = window.scrollX || window.pageXOffset;
    const panelWidth = 280; // 近似寬度
    let left = rect.left + scrollX;
    // 調整以避免超出右邊
    if (left + panelWidth > window.innerWidth + scrollX) {
      left = Math.max(scrollX + 8, window.innerWidth + scrollX - panelWidth - 8);
    }
    // 首選顯示在底下
    let top = rect.bottom + scrollY + 8;
    // 若超出視窗高度，則放到上方
    if (top + 120 > window.innerHeight + scrollY) {
      top = rect.top + scrollY - 8 - 120; // 上方預留高度
    }

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.display = '';
    popover.setAttribute('aria-hidden', 'false');
    popoverAddBtn.focus();
  }

  function closePopover() {
    popover.style.display = 'none';
    popover.setAttribute('aria-hidden', 'true');
    currentProduct = null;
  }

  // 點商品就顯示 popover
  products.forEach(product => {
    product.style.cursor = 'pointer';
    product.addEventListener('click', (e) => {
      // stop search input focus
      e.stopPropagation();
      openPopover(product);
    });
  });

  // 加入購物車（從 popover）
  popoverAddBtn.addEventListener('click', () => {
    if (!currentProduct) return;
    const item = {
      id: currentProduct.dataset.id || (currentProduct.dataset.originalName || currentProduct.querySelector('.product-name')?.textContent || ''),
      name: currentProduct.dataset.originalName || currentProduct.querySelector('.product-name')?.textContent || '',
      price: currentProduct.dataset.price || currentProduct.querySelector('.product-price')?.textContent || ''
    };
    // 若購物車已有該項商品（以 id 判斷），則不重複加入
    const exists = cart.some(ci => ci.id === item.id);
    if (exists) {
      const prev = popoverAddBtn.textContent;
      popoverAddBtn.textContent = '已在購物車';
      setTimeout(() => {
        popoverAddBtn.textContent = prev;
        closePopover();
      }, 800);
      return;
    }

    cart.push(item);
    updateCartCount();
    renderCart();
    // 簡單的回饋（變更按鈕文字 0.8s）
    const prev = popoverAddBtn.textContent;
    popoverAddBtn.textContent = '已加入 ✓';
    setTimeout(() => {
      popoverAddBtn.textContent = prev;
      closePopover();
    }, 800);
  });

  // popover 取消
  popoverCancelBtn.addEventListener('click', closePopover);

  // 點頁面空白處關閉 popover 或 cart panel
  document.addEventListener('click', (e) => {
    // 若點到 cartButton 或 cartPanel，讓 cartPanel 處理自己
    const cartBtn = document.getElementById('cartButton');
    const cartPanel = document.getElementById('cartPanel');
    if (!cartPanel.contains(e.target) && e.target !== cartBtn && !cartBtn.contains(e.target)) {
      cartPanel.style.display = 'none';
      cartPanel.setAttribute('aria-hidden', 'true');
    }

    // 若點到 popover 內則不關閉
    if (!popover.contains(e.target)) {
      closePopover();
    }
  });

  // Esc 鍵關閉 popover
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popover.getAttribute('aria-hidden') === 'false') {
      closePopover();
    }
  });

  // --- 購物車面板（檢視/移除） ---
  const cartBtn = document.getElementById('cartButton');
  const cartPanel = document.getElementById('cartPanel');
  const cartList = document.getElementById('cartList');
  const cartEmpty = document.getElementById('cartEmpty');

  function renderCart() {
    // 清空
    cartList.innerHTML = '';
    if (cart.length === 0) {
      cartEmpty.style.display = '';
      cartList.style.display = 'none';
      return;
    }
    cartEmpty.style.display = 'none';
    cartList.style.display = '';
    cart.forEach((ci) => {
      const li = document.createElement('li');
      li.className = 'cart-item';
      // include data-id on remove button
      li.innerHTML = `<div style="font-size:0.95rem">${ci.name}</div><div style="display:flex;align-items:center;gap:8px"><div style="color:#f53d2d">${ci.price}</div><button class=\"remove\" data-id=\"${ci.id}\">移除</button></div>`;
      cartList.appendChild(li);
    });
    // bind remove by id
    cartList.querySelectorAll('button.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.id;
        const idx = cart.findIndex(ci => ci.id === id);
        if (idx !== -1) {
          cart.splice(idx, 1);
          updateCartCount();
          renderCart();
        }
        e.stopPropagation();
      });
    });
  }

  // 點購物車圖示切換面板
  cartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cartPanel.style.display === 'none' || cartPanel.style.display === '') {
      cartPanel.style.display = '';
      cartPanel.setAttribute('aria-hidden', 'false');
      renderCart();
    } else {
      cartPanel.style.display = 'none';
      cartPanel.setAttribute('aria-hidden', 'true');
    }
  });

  // 前往購物車按鈕：目前沒有獨立頁面，先提示或導向 cart.html（若存在）
  const goToCartBtn = document.getElementById('goToCartBtn');
  if (goToCartBtn) {
    goToCartBtn.addEventListener('click', () => {
      if (cart.length === 0) {
        alert('購物車為空');
        return;
      }
      // 若有 cart.html 可導向，否則顯示簡單摘要
      // 導向中文檔名的購物車頁面
      window.location.href = '購物車.html';
    });
  }
});
// 發光中心（模擬銀河中心）
const centerGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const centerMaterial = new THREE.MeshBasicMaterial({
  color: 0xffddaa,
  emissive: 0xffaa33
});
const center = new THREE.Mesh(centerGeometry, centerMaterial);
scene.add(center);

