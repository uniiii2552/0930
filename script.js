/*************************************************
 * Nuomi Map Tour — script.js（修正版：括號齊全）
 * - 地圖/路線/午餐/拖曳/LocalStorage
 * - 上方下拉加入/移除
 * - 官方行程：applyPresetByNames()
 * - 桌機側欄收合、手機抽屜
 *************************************************/
let map, markers = [];
let directionsService, directionsRenderer, infoWindow;
let sortable = null, lastOrderedSeq = null, lastDirectionsResult = null;
let placesService, lunchTempMarkers = [], autocomplete, pendingPlace = null;

const STORAGE_KEY = "nuomi_tour_state_v1";
const emojiByType = { "景點":"📍","農遊體驗":"🌾","餐廳":"🍽️","民宿":"🏡","自訂":"✨" };
const defaultStayByType = { "景點":30,"農遊體驗":90,"餐廳":60,"民宿":0,"自訂":30 };
const activeTypes = new Set(["景點","農遊體驗","餐廳","民宿"]);
function getEmojiForType(t){ return emojiByType[t] || "📍"; }

/* === 景點資料（名稱需與官方行程一致） === */
const locationList = [
  { name: "糯米橋", type: "景點", lat: 23.971679, lng: 120.874739 },
  { name: "音樂水車", type: "景點", lat: 23.972064, lng: 120.873682 },
  { name: "北圳弧形水橋", type: "景點", lat: 23.971324, lng: 120.875905 },
  { name: "阿婆洗衣墩", type: "景點", lat: 23.971127, lng: 120.876315 },
  { name: "碧雲宮", type: "景點", lat: 23.969956, lng: 120.878139 },
  { name: "元寶山", type: "景點", lat: 23.974038, lng: 120.878926 },
  { name: "茄苳神木", type: "景點", lat: 23.974933, lng: 120.872745 },
  { name: "北圳步道", type: "景點", lat: 23.974495, lng: 120.874096 },
  { name: "蝙蝠洞", type: "景點", lat: 23.973796, lng: 120.873537 },
  { name: "神仙島吊橋", type: "景點", lat: 23.973317, lng: 120.87199 },
  // 農遊體驗
  { name: "新豐農場", type: "農遊體驗", lat: 23.970372, lng: 120.876847 },
  { name: "行者咖啡", type: "農遊體驗", lat: 23.9724,  lng: 120.8722  },
  { name: "糯米橋咖啡工坊", type: "農遊體驗", lat: 23.972136, lng: 120.87103  },
  { name: "阿坤香茅工坊", type: "農遊體驗", lat: 23.975208, lng: 120.873617 },
  { name: "梅庄休閒渡假中心", type: "農遊體驗", lat: 23.97485,  lng: 120.87498  },
  { name: "綠恩有機棉花農場", type: "農遊體驗", lat: 23.97536,  lng: 120.87388  },
  { name: "百勝村咖啡莊園", type: "農遊體驗", lat: 23.969229, lng: 120.870302 },
  // 餐廳
  { name: "裕峰餐廳", type: "餐廳", lat: 23.97288,  lng: 120.873185 },
  { name: "后頭厝餐廳", type: "餐廳", lat: 23.97071,  lng: 120.877895 },
  { name: "鄉村餐廳", type: "餐廳", lat: 23.970988, lng: 120.878377 },
  { name: "私房餐廳", type: "餐廳", lat: 23.970735, lng: 120.878629 },
  // 民宿
  { name: "春天民宿", type: "民宿", lat: 23.975046, lng: 120.873941 },
  { name: "泰雅渡假村", type: "民宿", lat: 23.972829, lng: 120.870576 },
  { name: "水岸松林露營區", type: "民宿", lat: 23.975087, lng: 120.87484  },
  { name: "神仙島山莊", type: "民宿", lat: 23.972552, lng: 120.87157  },
  { name: "覓境露營", type: "民宿", lat: 23.9724,   lng: 120.8722  },
  { name: "陽光水岸會館", type: "民宿", lat: 23.97133,  lng: 120.8709  },
];

/* ============== 地圖初始化（Callback） ============== */
function initMap(){
  const mapEl = document.getElementById("map");
  map = new google.maps.Map(mapEl, {
    center:{lat:23.9719,lng:120.8715},
    zoom:15,
    mapId:"DEMO_MAP_ID",
    gestureHandling:"greedy",
    fullscreenControl:true,
    mapTypeControl:false
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map, preserveViewport:true });
  infoWindow = new google.maps.InfoWindow();
  placesService = new google.maps.places.PlacesService(map);

  populateStartSelect();
  loadLocations();
  populateQuickSelect();
  bindGlobalControls();
  bindQuickActions();
  restoreState();
  initDrawerControls();

  window.addEventListener("orientationchange", () => {
    setTimeout(() => google.maps.event.trigger(map, "resize"), 300);
  });
}

/* ============== 上方下拉：資料與事件 ============== */
function populateQuickSelect(){
  const sel = document.getElementById("quickSelect");
  if (!sel) return;

  sel.innerHTML = "";
  const groups = new Map();

  for (const loc of locationList) {
    if (!groups.has(loc.type)) groups.set(loc.type, []);
    groups.get(loc.type).push(loc);
  }

  for (const [type, arr] of groups) {
    const og = document.createElement("optgroup");
    og.label = type;
    arr.forEach((loc) => {
      const idx = locationList.findIndex((x) => x.name === loc.name);
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = `${getEmojiForType(loc.type)} ${loc.name}`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }
}

function bindQuickActions(){
  const addBtn = document.getElementById("quickAdd");
  const rmBtn  = document.getElementById("quickRemove");
  if (addBtn) addBtn.addEventListener("click", () => quickToggle(true));
  if (rmBtn)  rmBtn.addEventListener("click", () => quickToggle(false));
}

function quickToggle(checked){
  const sel = document.getElementById("quickSelect");
  if (!sel) return;
  const idx = Number(sel.value);
  const cb  = document.getElementById(`cb-${idx}`);
  if (!cb) return;

  cb.checked = !!checked;
  setMarkerSelected(idx, !!checked);

  const pos = getMarkerLatLng(idx);
  map.panTo(pos);
  if (map.getZoom() < 15) map.setZoom(15);

  rebuildSelectedList();
  saveState();

  const n = getSelectedIndicesFromList().length;
  if (n >= 2) planRouteFromOrder(); else clearRoute();
}

/* ============== 固定控制 ============== */
function bindGlobalControls(){
  document.querySelectorAll(".type-filter").forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) activeTypes.add(box.value);
      else activeTypes.delete(box.value);
      applyTypeFilters();
      saveState();
    });
  });

  const btnSel = document.getElementById("selectVisible");
  if (btnSel) btnSel.addEventListener("click", () => {
    locationList.forEach((loc, idx) => {
      if (!activeTypes.has(loc.type)) return;
      const cb = document.getElementById(`cb-${idx}`);
      if (cb && !cb.checked) {
        cb.checked = true;
        setMarkerSelected(idx, true);
      }
    });
    rebuildSelectedList();
    saveState();
    planRouteFromOrder();
  });

  const btnClr = document.getElementById("clearVisible");
  if (btnClr) btnClr.addEventListener("click", () => {
    locationList.forEach((loc, idx) => {
      if (!activeTypes.has(loc.type)) return;
      const cb = document.getElementById(`cb-${idx}`);
      if (cb && cb.checked) {
        cb.checked = false;
        setMarkerSelected(idx, false);
      }
    });
    rebuildSelectedList();
    saveState();
    clearRoute();
  });

  const btnPlan = document.getElementById("planRoute");
  if (btnPlan) btnPlan.addEventListener("click", planRouteSuggested);

  const btnManual = document.getElementById("planManual");
  if (btnManual) btnManual.addEventListener("click", planRouteFromOrder);

  const btnClearRoute = document.getElementById("clearRoute");
  if (btnClearRoute) btnClearRoute.addEventListener("click", clearRoute);

  const btnExport = document.getElementById("exportLink");
  if (btnExport) btnExport.addEventListener("click", () => {
    if (!lastOrderedSeq || lastOrderedSeq.length < 2) {
      showToast("請先規劃一條路線。");
      return;
    }
    const mode = document.getElementById("travelMode")?.value || "DRIVING";
    window.open(buildGmapsUrl(lastOrderedSeq, mode), "_blank");
  });

  const btnSuggestOrder = document.getElementById("suggestOrder");
  if (btnSuggestOrder) btnSuggestOrder.addEventListener("click", () => {
    const orderIdx = getSelectedIndicesFromList();
    if (orderIdx.length < 2) { showToast("請至少選擇 2 個景點。"); return; }

    const points = orderIdx.map((i) => locationList[i]);
    const startSel = document.getElementById("startSelect").value;

    let startLoc =
      startSel === "first"   ? points[0] :
      startSel === "current" ? null :
      locationList[Number(startSel)];

    let pool = [...points];

    if (startSel !== "first" && startSel !== "current") {
      const startIdx = Number(document.getElementById("startSelect").value);
      if (!orderIdx.includes(startIdx)) {
        pool.unshift(startLoc);
      }
    }

    const ordered = (startSel === "current")
      ? points
      : nearestNeighbor(pool, startLoc || points[0]);

    const newIdxOrder = ordered
      .filter((p) => p.name !== "我的位置")
      .map((p) => locationList.findIndex((x) => x.name === p.name));

    reorderSelectedList(newIdxOrder);
    saveState();
    planRouteFromOrder();
  });

  const btnClearSelected = document.getElementById("clearSelected");
  if (btnClearSelected) btnClearSelected.addEventListener("click", () => {
    document
      .querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
      .forEach((cb) => {
        cb.checked = false;
        setMarkerSelected(Number(cb.dataset.index), false);
      });
    rebuildSelectedList();
    saveState();
    clearRoute();
  });

  ["departTime", "travelMode", "startSelect"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => {
      saveState();
      if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
    });
  });

  const btnLunch = document.getElementById("suggestLunch");
  if (btnLunch) btnLunch.addEventListener("click", suggestLunch);

  // 官方行程
  const pA = document.getElementById("preset1D_A");
  if (pA) pA.addEventListener("click", () => {
    applyPresetByNames(
      ["糯米橋","音樂水車","茄苳神木","梅庄休閒渡假中心","阿坤香茅工坊"],
      {"梅庄休閒渡假中心":60,"阿坤香茅工坊":90},
      { departTime:"09:00", travelMode:"DRIVING", startSelect:"first" }
    );
  });

  const pB = document.getElementById("preset1D_B");
  if (pB) pB.addEventListener("click", () => {
    applyPresetByNames(
      ["糯米橋","音樂水車","碧雲宮","后頭厝餐廳","蝙蝠洞","北圳步道"],
      {"后頭厝餐廳":60},
      { departTime:"09:00", travelMode:"DRIVING", startSelect:"first" }
    );
  });

  const pC = document.getElementById("preset1D_C");
  if (pC) pC.addEventListener("click", () => {
    applyPresetByNames(
      ["糯米橋","音樂水車","百勝村咖啡莊園","裕峰餐廳","新豐農場"],
      {"百勝村咖啡莊園":60,"裕峰餐廳":60,"新豐農場":60},
      { departTime:"09:00", travelMode:"DRIVING", startSelect:"first" }
    );
  });
}

/* ============== 官方行程套用 ============== */
function applyPresetByNames(names, stayOverrides = {}, options = {}){
  // 清空
  document
    .querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
    .forEach((cb) => { cb.checked = false; setMarkerSelected(Number(cb.dataset.index), false); });

  // 勾選
  const indices = [];
  names.forEach((n) => {
    const i = locationList.findIndex((x) => x.name === n);
    if (i >= 0) {
      const cb = document.getElementById(`cb-${i}`);
      if (cb) {
        cb.checked = true;
        setMarkerSelected(i, true);
        indices.push(i);
      }
    }
  });

  // 清單 + 停留
  rebuildSelectedList();
  Object.entries(stayOverrides).forEach(([name, min]) => {
    const idx = locationList.findIndex((x) => x.name === name);
    const inp = document.querySelector(`#selected-list input.stay[data-index="${idx}"]`);
    if (inp) inp.value = Number(min);
  });

  // 參數
  if (options.departTime) document.getElementById("departTime").value = options.departTime;
  if (options.travelMode) document.getElementById("travelMode").value = options.travelMode;
  if (options.startSelect) document.getElementById("startSelect").value = options.startSelect;

  saveState();

  if (indices.length >= 2) planRouteFromOrder(); else clearRoute();
}

/* ============== 抽屜/收合控制 ============== */
function initDrawerControls(){
  const drawer   = document.querySelector(".sidebar");
  const backdrop = document.getElementById("backdrop");
  const fab      = document.getElementById("toggleSidebar");

  function openDrawer(){
    drawer?.classList.add("open");
    backdrop?.classList.add("show");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }
  function closeDrawer(){
    drawer?.classList.remove("open");
    backdrop?.classList.remove("show");
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    google.maps.event.trigger(map, "resize");
  }

  if (fab) fab.addEventListener("click", () => {
    if (window.matchMedia("(max-width:768px)").matches) {
      if (drawer?.classList.contains("open")) closeDrawer();
      else openDrawer();
    } else {
      drawer?.classList.toggle("collapsed");
      google.maps.event.trigger(map, "resize");
    }
  });

  if (backdrop) backdrop.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (window.matchMedia("(max-width:768px)").matches) closeDrawer();
      else drawer?.classList.add("collapsed");
    }
  });

  const mq = window.matchMedia("(min-width:769px)");
  const handler = (e) => { if (e.matches) closeDrawer(); };
  if (mq.addEventListener) mq.addEventListener("change", handler);
  else if (mq.addListener) mq.addListener(handler);
}

/* ============== UI Builders ============== */
function populateStartSelect(){
  const sel = document.getElementById("startSelect");
  if (!sel) return;

  sel.innerHTML = `
    <option value="first">以「第一個勾選的景點」為起點</option>
    <option value="current">使用目前位置（需授權）</option>
  `;

  const group = document.createElement("optgroup");
  group.label = "指定固定起點（不一定要勾選）";

  locationList.forEach((loc, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = loc.name;
    group.appendChild(opt);
  });

  sel.appendChild(group);
}

function loadLocations(){
  const list = document.getElementById("checkbox-list");
  if (!list) return;

  list.innerHTML = "";
  const bounds = new google.maps.LatLngBounds();

  locationList.forEach((loc, idx) => {
    // 隱藏的 checkbox 行
    const card = document.createElement("label");
    card.className = "option-card";
    card.dataset.index = String(idx);
    card.dataset.type  = loc.type;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `cb-${idx}`;
    cb.dataset.index = String(idx);
    cb.className = "d-none";

    const nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = `${getEmojiForType(loc.type)} ${loc.name}`;

    const detailsSpan = document.createElement("span");
    detailsSpan.className = "details";
    detailsSpan.textContent = loc.type;

    card.appendChild(cb);
    card.appendChild(nameSpan);
    card.appendChild(detailsSpan);
    list.appendChild(card);

    cb.addEventListener("change", () => {
      setMarkerSelected(idx, cb.checked);
      const pos = getMarkerLatLng(idx);
      map.panTo(pos);
      if (map.getZoom() < 15) map.setZoom(15);
      rebuildSelectedList();
      saveState();
      const n = getSelectedIndicesFromList().length;
      if (n >= 2) planRouteFromOrder(); else clearRoute();
    });

    const marker = createMarkerWithFallback(loc, idx);
    const pos =
      marker.position && typeof marker.position.lat === "function"
        ? marker.position
        : new google.maps.LatLng(loc.lat, loc.lng);
    bounds.extend(pos);

    const openInfo = () => {
      const isChecked = !!document.querySelector(`#cb-${idx}:checked`);
      const btnId = `info-toggle-${idx}`;
      const html = `
        <div style="min-width:180px">
          <div style="font-weight:700">${loc.name}</div>
          <div style="color:#666;font-size:12px;margin:2px 0 8px;">${loc.type}</div>
          <button id="${btnId}" style="padding:6px 10px;width:auto;">
            ${isChecked ? "從行程移除" : "加入行程"}
          </button>
        </div>`;
      infoWindow.setContent(html);
      infoWindow.open({ map, anchor: marker });
      google.maps.event.addListenerOnce(infoWindow, "domready", () => {
        const btn = document.getElementById(btnId);
        if (btn) btn.onclick = () => toggleCheckbox(idx);
      });
    };

    if (
      google.maps.marker &&
      google.maps.marker.AdvancedMarkerElement &&
      marker instanceof google.maps.marker.AdvancedMarkerElement
    ) {
      marker.addListener("gmp-click", openInfo);
    } else if (marker.addListener) {
      marker.addListener("click", openInfo);
    }
  });

  if (!bounds.isEmpty()) map.fitBounds(bounds);
}

/* ============== 已選清單（拖曳 + 停留） ============== */
function rebuildSelectedList(){
  const container = document.getElementById("selected-list");
  if (!container) return;

  const oldStay = getStayMinutesMapFromSelectedList();

  const checkedIdx = Array.from(
    document.querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
  ).map((cb) => Number(cb.dataset.index));

  const currentOrder = getSelectedIndicesFromList();
  const kept  = currentOrder.filter((i) => checkedIdx.includes(i));
  const extras = checkedIdx.filter((i) => !kept.includes(i));
  const finalOrder = [...kept, ...extras];

  container.innerHTML = "";
  finalOrder.forEach((i) => {
    const loc = locationList[i];
    const stay = oldStay.has(i) ? oldStay.get(i) : (defaultStayByType[loc.type] ?? 30);

    const li = document.createElement("li");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="name">${loc.name}</span>
      <div class="staywrap">
        <label for="stay-${i}" style="margin:0;font-weight:400;">停留</label>
        <input class="stay" id="stay-${i}" type="number" min="0" step="5"
               value="${stay}" data-index="${i}" /> 分
      </div>
      <button class="remove" type="button" data-index="${i}" aria-label="移除 ${loc.name}">✕</button>
    `;
    container.appendChild(li);
  });

  container.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.index);
      const cb = document.getElementById(`cb-${idx}`);
      if (cb) { cb.checked = false; setMarkerSelected(idx, false); }
      rebuildSelectedList();
      saveState();
      if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
      else clearRoute();
    });
  });

  container.querySelectorAll("input.stay").forEach((inp) => {
    inp.addEventListener("change", () => {
      saveState();
      if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
    });
  });

  if (!sortable) {
    sortable = new Sortable(container, {
      animation: 150,
      onSort: () => {
        saveState();
        if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
      }
    });
  }
}

function getSelectedIndicesFromList(){
  const container = document.getElementById("selected-list");
  if (!container) return [];
  return Array.from(container.querySelectorAll("li")).map((li) => Number(li.dataset.index));
}

function reorderSelectedList(newIdxOrder){
  const container = document.getElementById("selected-list");
  if (!container) return;

  const oldStay = getStayMinutesMapFromSelectedList();
  container.innerHTML = "";

  newIdxOrder.forEach((i) => {
    const loc = locationList[i];
    const stay = oldStay.has(i) ? oldStay.get(i) : (defaultStayByType[loc.type] ?? 30);

    const li = document.createElement("li");
    li.dataset.index = String(i);
    li.innerHTML = `
      <span class="name">${loc.name}</span>
      <div class="staywrap">
        <label for="stay-${i}" style="margin:0;font-weight:400;">停留</label>
        <input class="stay" id="stay-${i}" type="number" min="0" step="5"
               value="${stay}" data-index="${i}" /> 分
      </div>
      <button class="remove" type="button" data-index="${i}" aria-label="移除 ${loc.name}">✕</button>
    `;
    container.appendChild(li);
  });

  container.querySelectorAll(".remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.index);
      const cb = document.getElementById(`cb-${idx}`);
      if (cb) { cb.checked = false; setMarkerSelected(idx, false); }
      rebuildSelectedList();
      saveState();
      if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
      else clearRoute();
    });
  });

  container.querySelectorAll("input.stay").forEach((inp) => {
    inp.addEventListener("change", () => {
      saveState();
      if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
    });
  });
}

function getStayMinutesMapFromSelectedList(){
  const m = new Map();
  document.querySelectorAll("#selected-list input.stay").forEach((inp) => {
    m.set(Number(inp.dataset.index), Math.max(0, Number(inp.value || 0)));
  });
  return m;
}

/* ============== 規劃/路線 ============== */
function clearRoute(){
  if (directionsRenderer) directionsRenderer.set("directions", null);
  lastOrderedSeq = null;
  const panel = document.getElementById("itinerary");
  if (panel) panel.innerHTML = "";
}

async function planRouteFromOrder(){
  const orderIdx = getSelectedIndicesFromList();
  if (orderIdx.length < 2) return;

  const mode = document.getElementById("travelMode")?.value || "DRIVING";
  const startSel = document.getElementById("startSelect")?.value || "first";
  const departStr = document.getElementById("departTime")?.value || "09:00";

  let seq = orderIdx.map((i) => locationList[i]);

  if (startSel === "current") {
    try {
      const pos = await getCurrentPositionPromise();
      seq = [{ name:"我的位置", lat:pos.coords.latitude, lng:pos.coords.longitude }, ...seq];
    } catch {
      showToast("無法取得目前位置，請允許定位權限。");
      return;
    }
  } else if (startSel !== "first") {
    const fixed = locationList[Number(startSel)];
    const found = seq.findIndex((p) => p.name === fixed.name);
    if (found === -1) seq = [fixed, ...seq];
    else if (found !== 0) { seq.splice(found, 1); seq.unshift(fixed); }
  }

  drawDirectionsWithETA(seq, mode, departStr);
}

async function planRouteSuggested(){
  const checked = Array.from(
    document.querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
  ).map((cb) => Number(cb.dataset.index));

  if (checked.length < 2) { showToast("請至少選擇 2 個景點。"); return; }

  const mode = document.getElementById("travelMode")?.value || "DRIVING";
  const startSel = document.getElementById("startSelect")?.value || "first";
  const departStr = document.getElementById("departTime")?.value || "09:00";

  let points = checked.map((i) => locationList[i]);
  let startLoc;

  if (startSel === "current") {
    try {
      const pos = await getCurrentPositionPromise();
      startLoc = { name: "我的位置", lat: pos.coords.latitude, lng: pos.coords.longitude };
      points = [startLoc, ...points];
    } catch {
      showToast("無法取得目前位置。");
      return;
    }
  } else if (startSel === "first") {
    startLoc = points[0];
  } else {
    startLoc = locationList[Number(startSel)];
    if (!points.find((p) => p.name === startLoc.name)) points = [startLoc, ...points];
  }

  const ordered = nearestNeighbor(points, startLoc);
  const newIdxOrder = ordered
    .filter((p) => p.name !== "我的位置")
    .map((p) => locationList.findIndex((x) => x.name === p.name));

  reorderSelectedList(newIdxOrder);
  saveState();
  drawDirectionsWithETA(ordered, mode, departStr);
}

function drawDirectionsWithETA(seq, mode, departStr){
  if (!seq || seq.length < 2) return;

  const origin = new google.maps.LatLng(seq[0].lat, seq[0].lng);
  const destination = new google.maps.LatLng(seq[seq.length - 1].lat, seq[seq.length - 1].lng);
  const waypoints = seq.slice(1, seq.length - 1).map((p) => ({
    location: new google.maps.LatLng(p.lat, p.lng),
    stopover: true
  }));

  directionsService.route(
    {
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode[mode],
      optimizeWaypoints: false
    },
    (result, status) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);
        lastOrderedSeq = seq;
        lastDirectionsResult = result;
        const stayMap = buildStayMinutesByName();
        renderItineraryWithETA(seq, result, departStr, stayMap);
      } else {
        console.error("無法規劃路線：", status);
        showToast("無法規劃路線：" + status);
      }
    }
  );
}

function buildStayMinutesByName(){
  const m = {};
  document.querySelectorAll("#selected-list li").forEach((li) => {
    const idx = Number(li.dataset.index);
    const name = locationList[idx].name;
    const stay = Math.max(0, Number(li.querySelector("input.stay")?.value || 0));
    m[name] = stay;
  });
  return m;
}

function renderItineraryWithETA(seq, result, departStr, stayByName){
  const legs = result.routes[0].legs;

  let totalMeters = 0;
  let totalMoveSeconds = 0;
  legs.forEach((leg) => {
    totalMeters += leg.distance.value;
    totalMoveSeconds += leg.duration.value;
  });
  const km = (totalMeters / 1000).toFixed(2);

  const [hStr, mStr] = (departStr || "09:00").split(":");
  let current = new Date();
  current.setHours(Number(hStr) || 9, Number(mStr) || 0, 0, 0);

  const rows = [];
  let totalStayMinutes = 0;

  let arrive = new Date(current);
  const stay0 = stayByName[seq[0].name] || 0;
  let depart = new Date(arrive.getTime() + stay0 * 60000);
  if (stay0 > 0) totalStayMinutes += stay0;

  rows.push({
    idx: 1,
    name: seq[0].name,
    arrive,
    stay: stay0,
    depart,
    moveText: seq.length > 1 ? fmtDurationSec(legs[0].duration.value) : "-"
  });

  for (let i = 1; i < seq.length; i++) {
    const travelSec = legs[i - 1].duration.value;
    arrive = new Date(depart.getTime() + travelSec * 1000);

    const stayMin = stayByName[seq[i].name] || 0;
    if (stayMin > 0) totalStayMinutes += stayMin;

    depart = new Date(arrive.getTime() + stayMin * 60000);

    rows.push({
      idx: i + 1,
      name: seq[i].name,
      arrive,
      stay: stayMin,
      depart,
      moveText: i < seq.length - 1 ? fmtDurationSec(legs[i].duration.value) : "-"
    });
  }

  const totalEnd = new Date(
    current.getTime() + totalMoveSeconds * 1000 + totalStayMinutes * 60000
  );
  const hh = Math.floor(totalMoveSeconds / 3600);
  const mm = Math.round((totalMoveSeconds % 3600) / 60);

  let panel = document.getElementById("itinerary");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "itinerary";
    document.querySelector(".sidebar")?.appendChild(panel);
  }

  panel.innerHTML = `
    <div><strong>總移動距離：</strong>${km} km</div>
    <div><strong>總移動時間：</strong>${hh > 0 ? `${hh} 小時 ` : ""}${mm} 分</div>
    <div><strong>總停留時間：</strong>${totalStayMinutes} 分</div>
    <div><strong>出發時間：</strong>${fmtTime(current)}</div>
    <div><strong>預估結束：</strong>${fmtTime(totalEnd)}</div>
    <table>
      <thead>
        <tr><th>#</th><th>景點</th><th>到達</th><th>停留</th><th>離開</th><th>下段移動</th></tr>
      </thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${r.idx}</td>
            <td>${r.name}</td>
            <td>${fmtTime(r.arrive)}</td>
            <td>${r.stay} 分</td>
            <td>${fmtTime(r.depart)}</td>
            <td>${r.moveText}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}

/* ============== 午餐建議（簡化版） ============== */
async function suggestLunch(){
  if (!lastOrderedSeq || !lastDirectionsResult) {
    showToast("請先規劃路線再使用午餐建議。");
    return;
  }

  const departStr = document.getElementById("departTime")?.value || "09:00";
  const legs = lastDirectionsResult.routes[0].legs;
  const seq  = lastOrderedSeq;
  const stayByName = buildStayMinutesByName();

  const [hStr, mStr] = (departStr || "09:00").split(":");
  let t = new Date();
  t.setHours(Number(hStr) || 9, Number(mStr) || 0, 0, 0);

  let arrive = new Date(t);
  let depart = new Date(arrive.getTime() + (stayByName[seq[0].name] || 0) * 60000);

  const noon = new Date(t);
  noon.setHours(12, 0, 0, 0);

  const windowMin = new Date(noon.getTime() - 60 * 60000);
  const windowMax = new Date(noon.getTime() + 60 * 60000);

  let anchor = {
    lat: seq[Math.floor(seq.length / 2)].lat,
    lng: seq[Math.floor(seq.length / 2)].lng
  };

  for (let i = 1; i < seq.length; i++) {
    const travelSec = legs[i - 1].duration.value;
    arrive = new Date(depart.getTime() + travelSec * 1000);

    if (arrive >= windowMin && arrive <= windowMax) {
      anchor = { lat: seq[i].lat, lng: seq[i].lng };
      break;
    }

    const stayMin = stayByName[seq[i].name] || 0;
    const leave   = new Date(arrive.getTime() + stayMin * 60000);

    if (arrive <= noon && leave >= noon) {
      anchor = { lat: seq[i].lat, lng: seq[i].lng };
      break;
    }

    depart = leave;
  }

  const radius = Math.max(100, Number(document.getElementById("lunchRadius")?.value || 500));

  lunchTempMarkers.forEach((m) => m.setMap && m.setMap(null));
  lunchTempMarkers = [];

  const request = {
    location: new google.maps.LatLng(anchor.lat, anchor.lng),
    radius,
    type: "restaurant"
  };

  placesService.nearbySearch(request, (results, status) => {
    const box = document.getElementById("lunchResults");

    if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
      if (box) box.innerHTML = `<div class="muted">在 ${radius}m 內沒有找到餐廳。</div>`;
      return;
    }

    const top = results.slice(0, 8);
    const listHtml = top.map((p, i) => {
      const rating = (p.rating != null) ? `⭐ ${p.rating}` : "";
      const addr   = p.vicinity || p.formatted_address || "";
      return `
        <div style="margin:6px 0;padding:6px;border:1px dashed #ddd;border-radius:8px">
          <div style="font-weight:600">${i+1}. ${p.name}
            <span style="color:#666;font-weight:400">${rating}</span>
          </div>
          <div style="font-size:12px;color:#666">${addr}</div>
        </div>`;
    }).join("");

    if (box) {
      box.innerHTML = `
        <div style="margin-bottom:6px;color:#333">
          以「中午」所在點為中心，半徑 ${radius}m 的餐廳：
        </div>
        ${listHtml}`;
    }

    top.forEach((p, i) => {
      const pos = p.geometry?.location;
      if (!pos) return;
      const m = new google.maps.Marker({ position: pos, map, label: String(i + 1) });
      lunchTempMarkers.push(m);
    });

    map.panTo(request.location);
    if (map.getZoom() < 16) map.setZoom(16);
  });
}

/* ============== 標記 / 類型篩選 ============== */
function createMarkerWithFallback(loc, idx){
  if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
    const el = document.createElement("div");
    el.className = "emoji-marker";
    el.textContent = getEmojiForType(loc.type);
    const m = new google.maps.marker.AdvancedMarkerElement({
      position: { lat: loc.lat, lng: loc.lng },
      map,
      title: loc.name,
      content: el
    });
    markers[idx] = m;
    return m;
  }

  const m = new google.maps.Marker({
    position: { lat: loc.lat, lng: loc.lng },
    map,
    title: loc.name,
    label: { text: getEmojiForType(loc.type) }
  });
  markers[idx] = m;
  return m;
}

function applyTypeFilters(){
  locationList.forEach((loc, idx) => {
    const visible = activeTypes.has(loc.type);
    const m = markers[idx];
    if (!m) return;
    if ("setMap" in m) m.setMap(visible ? map : null);
    else m.map = visible ? map : null;
  });
}

function getMarkerLatLng(idx){
  const m = markers[idx];
  const loc = locationList[idx];
  if (!m) return new google.maps.LatLng(loc.lat, loc.lng);
  if (m.position && typeof m.position.lat === "function") return m.position;
  return new google.maps.LatLng(loc.lat, loc.lng);
}

function setMarkerSelected(idx, selected){
  const m = markers[idx];
  if (!m) return;
  if ("setIcon" in m) {
    m.setZIndex(selected ? google.maps.Marker.MAX_ZINDEX + 1 : undefined);
    return;
  }
  const el = m.content;
  if (el && el.classList) el.classList.toggle("selected", !!selected);
}

function toggleCheckbox(idx){
  const cb = document.getElementById(`cb-${idx}`);
  if (!cb) return;

  cb.checked = !cb.checked;
  setMarkerSelected(idx, cb.checked);

  const pos = getMarkerLatLng(idx);
  map.panTo(pos);
  if (map.getZoom() < 15) map.setZoom(15);

  rebuildSelectedList();
  saveState();

  const n = getSelectedIndicesFromList().length;
  if (n >= 2) planRouteFromOrder(); else clearRoute();
}

/* ============== LocalStorage ============== */
function saveState(){
  try {
    const orderIdx = getSelectedIndicesFromList();
    const stay = {};
    document.querySelectorAll("#selected-list input.stay").forEach((inp) => {
      const idx = Number(inp.dataset.index);
      const val = Math.max(0, Number(inp.value || 0));
      stay[idx] = val;
    });
    const state = {
      v: 1,
      selectedOrder: orderIdx,
      stayByIndex: stay,
      departTime: document.getElementById("departTime")?.value || "09:00",
      travelMode: document.getElementById("travelMode")?.value || "DRIVING",
      startSelect: document.getElementById("startSelect")?.value || "first",
      checkedIndices: Array.from(
        document.querySelectorAll('#checkbox-list input[type="checkbox"]:checked')
      ).map((cb) => Number(cb.dataset.index))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("存檔失敗", e);
  }
}

function restoreState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const state = JSON.parse(raw);
    if (state.departTime) document.getElementById("departTime").value = state.departTime;
    if (state.travelMode) document.getElementById("travelMode").value = state.travelMode;
    if (state.startSelect) document.getElementById("startSelect").value = state.startSelect;

    if (Array.isArray(state.checkedIndices)) {
      state.checkedIndices.forEach((i) => {
        const cb = document.getElementById(`cb-${i}`);
        if (cb) { cb.checked = true; setMarkerSelected(i, true); }
      });
    }

    rebuildSelectedList();

    if (Array.isArray(state.selectedOrder) && state.selectedOrder.length) {
      reorderSelectedList(state.selectedOrder);
      if (state.stayByIndex) {
        document.querySelectorAll("#selected-list li").forEach((li) => {
          const idx = Number(li.dataset.index);
          const v = state.stayByIndex[idx];
          if (v != null) li.querySelector("input.stay").value = v;
        });
      }
    }

    if (getSelectedIndicesFromList().length >= 2) planRouteFromOrder();
  } catch (e) {
    console.warn("還原失敗", e);
  }
}

/* ============== 工具 ============== */
function nearestNeighbor(points, startLoc){
  if (!points?.length) return [];
  const s = startLoc || points[0];
  const visited = [s];
  const remaining = points.filter((p) => p.name !== s.name);

  while (remaining.length) {
    const last = visited[visited.length - 1];
    let best = null;
    let min = Infinity;
    for (const loc of remaining) {
      const d = haversineMeters(last.lat, last.lng, loc.lat, loc.lng);
      if (d < min) { min = d; best = loc; }
    }
    visited.push(best);
    const rmIdx = remaining.findIndex((x) => x.name === best.name);
    remaining.splice(rmIdx, 1);
  }
  return visited;
}

function haversineMeters(a, b, c, d){
  const R = 6371000;
  const rad = (x) => x * Math.PI / 180;
  const dLat = rad(c - a);
  const dLon = rad(d - b);
  const s = Math.sin(dLat/2) ** 2 +
            Math.cos(rad(a)) * Math.cos(rad(c)) *
            Math.sin(dLon/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function fmtTime(d){ return d.toTimeString().slice(0,5); }
function fmtDurationSec(s){
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return (h ? `${h} 小時 ` : "") + `${m} 分`;
}
function showToast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1800);
}
function buildGmapsUrl(seq, mode){
  const base = "https://www.google.com/maps/dir/?api=1";
  const origin = `${seq[0].lat},${seq[0].lng}`;
  const destination = `${seq[seq.length-1].lat},${seq[seq.length-1].lng}`;
  const waypoints = seq.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join("|");
  return `${base}&origin=${origin}&destination=${destination}&travelmode=${mode.toLowerCase()}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}`;
}
function getCurrentPositionPromise(){
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 8000
    })
  );
}

/* 讓 Google Maps callback 能找到 initMap */
window.initMap = initMap;
