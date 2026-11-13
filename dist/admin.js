const byId = id => document.getElementById(id);
const notice = byId("notice");
const login = byId("login-form");
const dishForm = byId("dish-form");
const siteForm = byId("site-form");
let key = "";
let menu = [];

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
async function preview(form, field, photo) {
  const file = form.elements.file.files[0];
  const source = form.elements[field].value;
  if (photo.src.startsWith("blob:")) URL.revokeObjectURL(photo.src);
  photo.hidden = true;
  photo.removeAttribute("src");
  if (!file && !source) return;
  try {
    const url = file ? URL.createObjectURL(file) : await resolvePhoto(source);
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
function selectDish() {
  fill(dishForm,menu.find(item => item.id === byId("dish").value) || {});
  preview(dishForm,"image",byId("preview"));
}
function renderMenu(items, selected = "") {
  menu = items;
  byId("dish").replaceChildren(new Option("Yangi taom",""),...items.map(item => new Option(item.category + " · " + item.name,item.id)));
  byId("dish").value = selected;
  selectDish();
}

async function run(button, task) {
  button.disabled = true;
  notice.textContent = "Yuklanmoqda…";
  try { notice.textContent = await task() || ""; }
  catch (error) { notice.textContent = error.message; }
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
      fill(siteForm,{brand:"Zarafshon",heading:"Parij ta’mi, Toshkentda",...data.site});
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
byId("dish").onchange = selectDish;
dishForm.elements.file.onchange = () => preview(dishForm,"image",byId("preview"));
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
    const id = byId("dish").value;
    const item = {...await imagePayload(dishForm),id,visible:dishForm.elements.visible.checked};
    const result = await request("admin.menu",{item});
    renderMenu(result.menu,id || result.menu.at(-1)?.id);
    return "Taom saqlandi.";
  });
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

