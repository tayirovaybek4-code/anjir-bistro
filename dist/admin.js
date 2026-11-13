const byId = id => document.getElementById(id);
const notice = byId("notice");
const login = byId("login-form");
const dishForm = byId("dish-form");
const siteForm = byId("site-form");
let key = "";
let menu = [];
let selectedDish = "";

async function request(action, data = {}) {
  const response = await fetch(window.BOOKING_ENDPOINT, {
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=UTF-8"},
    body:JSON.stringify({action,key,...data})
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Server javob bermadi.");
  return result;
}

function setText(parent, tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

const money = amount => new Intl.NumberFormat("uz-UZ").format(amount) + " so‘m";

function renderBookings(bookings) {
  const rows = byId("rows");
  rows.replaceChildren();
  byId("count").textContent = bookings.length ? "Ko‘rsatilgan bronlar · " + bookings.length : "Bu tanlov bo‘yicha bronlar yo‘q.";
  for (const booking of bookings) {
    const row = rows.insertRow();
    const visit = row.insertCell();
    setText(visit,"strong",booking.day);
    setText(visit,"span",booking.hour);
    const guest = row.insertCell();
    setText(guest,"strong",booking.name);
    setText(guest,"span",booking.phone);
    setText(row.insertCell(),"span",booking.table + "-stol · " + booking.guests + " kishi");
    const order = row.insertCell();
    if (Array.isArray(booking.preorder?.items)) {
      for (const item of booking.preorder.items) setText(order,"span",item.name + " × " + item.quantity);
      setText(order,"strong","Jami · " + money(booking.preorder.total));
    } else order.textContent = "—";
    setText(row.insertCell(),"span",booking.status,"badge");
  }
}

function fill(form, data) {
  for (const field of form.elements) {
    if (!field.name) continue;
    if (field.type === "file") field.value = "";
    else if (field.type === "checkbox") field.checked = data[field.name] !== false;
    else field.value = data[field.name] ?? "";
  }
}
async function preview(form, field, photo, fallback = "") {
  const file = form.elements.file.files[0];
  const source = form.elements[field].value;
  if (photo.src.startsWith("blob:")) URL.revokeObjectURL(photo.src);
  photo.hidden = true;
  photo.removeAttribute("src");
  if (!file && !source && !fallback) return;
  try {
    const url = file ? URL.createObjectURL(file) : await resolvePhoto(source || fallback);
    if (form.elements.file.files[0] !== file || form.elements[field].value !== source) return;
    photo.src = url;
    photo.hidden = false;
  } catch (_) { photo.hidden = true; }
}
async function imagePayload(form) {
  const {file,...data} = Object.fromEntries(new FormData(form));
  if (!file?.size) return data;
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch (_) { throw Error("Bu rasm ochilmadi. JPG, PNG yoki WebP faylini tanlang."); }
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    for (const size of [1600,1280,960,720]) {
      const scale = Math.min(1,size / Math.max(bitmap.width,bitmap.height));
      canvas.width = Math.max(1,Math.round(bitmap.width * scale));
      canvas.height = Math.max(1,Math.round(bitmap.height * scale));
      context.fillStyle = "#fffaf4";
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const upload = canvas.toDataURL("image/jpeg",0.85);
      if (upload.length <= 300000) return {...data,upload};
    }
    throw Error("Rasm juda katta. Boshqa rasm tanlang.");
  } finally {
    bitmap.close();
  }
}
function dishImage(item) {
  return item?.image || window.DISH_PHOTOS?.[item?.id]?.[0] || "";
}

function showDishPreview() {
  preview(dishForm,"image",byId("preview"),dishImage(menu.find(item => item.id === selectedDish)));
}

function selectDish(id) {
  selectedDish = id;
  const item = menu.find(entry => entry.id === id);
  fill(dishForm,item || {});
  byId("dish-title").textContent = item?.name || "Yangi taom";
  byId("dish-notice").textContent = "";
  showDishPreview();
  for (const row of byId("dish-list").children) row.setAttribute("aria-pressed",String(row.dataset.id === id));
}

function renderDishList() {
  const query = byId("dish-search").value.trim().toLowerCase();
  const matches = menu.filter(item => (item.name + " " + item.category).toLowerCase().includes(query));
  const list = byId("dish-list");
  list.replaceChildren();
  byId("dish-count").textContent = matches.length ? matches.length + " ta taom" : "Taom topilmadi.";
  for (const item of matches) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dish-choice";
    row.dataset.id = item.id;
    row.setAttribute("aria-pressed",String(item.id === selectedDish));
    const source = dishImage(item);
    if (source && !source.startsWith("photo:")) {
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.src = source;
      row.append(image);
    }
    const details = setText(row,"span","");
    setText(details,"strong",item.name);
    setText(details,"small",item.category + " · " + money(item.price));
    row.onclick = () => {
      if (dishForm.querySelector("button").disabled) return;
      selectDish(item.id);
      if (matchMedia("(max-width: 760px)").matches) dishForm.scrollIntoView({block:"start"});
    };
    list.append(row);
  }
}

function renderMenu(items, selected = items[0]?.id || "") {
  menu = items;
  selectDish(selected);
  renderDishList();
}

async function run(button, task, message = notice) {
  button.disabled = true;
  message.textContent = "Yuklanmoqda…";
  try { message.textContent = await task() || ""; }
  catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
}

login.onsubmit = event => {
  event.preventDefault();
  run(login.querySelector("button"),async () => {
    key = login.elements.key.value.trim();
    try {
      const data = await request("admin.list");
      renderBookings(data.bookings);
      renderMenu(data.menu);
      fill(siteForm,{...data.site,brand:data.site?.brand || "Zarafshon",heading:data.site?.heading || "Parij ta’mi, Toshkentda"});
      preview(siteForm,"hero",byId("hero-preview"));
      login.reset();
      byId("login").hidden = true;
      byId("dashboard").hidden = false;
    } catch (error) {
      key = "";
      throw error;
    }
  });
};

byId("logout").onclick = () => location.reload();
const refresh = byId("refresh");
refresh.onclick = () => run(refresh,async () => {
  const data = await request("admin.list",{day:byId("day").value});
  renderBookings(data.bookings);
});
byId("day").onchange = () => refresh.click();
byId("dish-search").oninput = renderDishList;
byId("new-dish").onclick = () => {
  if (dishForm.querySelector("button").disabled) return;
  selectDish("");
  dishForm.elements.name.focus();
};
dishForm.elements.file.onchange = showDishPreview;
siteForm.elements.file.onchange = () => preview(siteForm,"hero",byId("hero-preview"));
for (const button of document.querySelectorAll("[data-panel]")) {
  button.onclick = () => {
    for (const control of document.querySelectorAll("[data-panel]")) {
      const active = control === button;
      control.setAttribute("aria-pressed",String(active));
      byId(control.dataset.panel).hidden = !active;
    }
  };
}
dishForm.onsubmit = event => {
  event.preventDefault();
  run(dishForm.querySelector("button"),async () => {
    const id = selectedDish;
    const item = {...await imagePayload(dishForm),id,visible:dishForm.elements.visible.checked};
    const result = await request("admin.menu",{item});
    renderMenu(result.menu,id || result.menu.at(-1)?.id);
    return "Taom saqlandi.";
  },byId("dish-notice"));
};
siteForm.onsubmit = event => {
  event.preventDefault();
  run(siteForm.querySelector("button"),async () => {
    const result = await request("admin.site",{site:await imagePayload(siteForm)});
    fill(siteForm,result.site);
    preview(siteForm,"hero",byId("hero-preview"));
    return "Sayt ma’lumotlari saqlandi.";
  });
};

