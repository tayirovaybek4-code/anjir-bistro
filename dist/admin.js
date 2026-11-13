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
    if (field.type === "checkbox") field.checked = data[field.name] !== false;
    else field.value = data[field.name] ?? "";
  }
}
function preview() {
  const image = dishForm.elements.image.value.trim();
  const photo = byId("preview");
  photo.hidden = !/^https:\/\/[^\s]+$/i.test(image) && !/^assets\/[a-z\d.-]+$/i.test(image);
  if (!photo.hidden) photo.src = image;
  else photo.removeAttribute("src");
}
function selectDish() {
  fill(dishForm,menu.find(item => item.id === byId("dish").value) || {});
  preview();
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
dishForm.elements.image.oninput = preview;
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
    const item = {...Object.fromEntries(new FormData(dishForm)),id,visible:dishForm.elements.visible.checked};
    const result = await request("admin.menu",{item});
    renderMenu(result.menu,id || result.menu.at(-1)?.id);
    return "Taom saqlandi.";
  });
};
siteForm.onsubmit = event => {
  event.preventDefault();
  run(siteForm.querySelector("button"),async () => {
    const result = await request("admin.site",{site:Object.fromEntries(new FormData(siteForm))});
    fill(siteForm,result.site);
    return "Sayt ma’lumotlari saqlandi.";
  });
};