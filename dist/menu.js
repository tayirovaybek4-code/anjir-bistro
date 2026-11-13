"use strict";

const catalog = document.querySelector("#menu-items");
const categories = document.querySelector("#categories");
const order = new Map();
const money = value => new Intl.NumberFormat("uz-UZ").format(value) + " so‘m";
let menuItems = window.MENU_ITEMS;
let activeCategory = menuItems[0].category;

function orderPayload() {
  return [...order].map(([id, quantity]) => ({id, quantity}));
}

function portionControls(item) {
  const group = document.createElement("div");
  group.className = "portion-controls";
  group.dataset.dish = item.id;
  const count = document.createElement("output");
  count.setAttribute("aria-label","Porsiya soni");
  for (const [step, symbol, label] of [[-1,"−","kamaytirish"],[1,"+","qo‘shish"]]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "outline";
    button.textContent = symbol;
    button.setAttribute("aria-label",item.name + " — porsiya " + label);
    button.onclick = () => {
      const quantity = (order.get(item.id) || 0) + step;
      if (quantity < 0 || quantity > 20 || (quantity === 1 && step === 1 && order.size >= 30)) return;
      if (quantity) order.set(item.id,quantity);
      else order.delete(item.id);
      const inOrder = Boolean(group.closest("#order-lines"));
      renderOrder();
      if (inOrder) {
        const remaining = [...document.querySelectorAll(".portion-controls")].find(control => control.dataset.dish === item.id && control.closest("#order-lines"));
        const focus = remaining?.querySelector(step > 0 && quantity < 20 ? "button:last-child" : "button:first-child");
        (focus || document.querySelector("#order-lines button:enabled") || document.querySelector("#categories button[aria-pressed=true]"))?.focus();
      }
      document.querySelector("#order-feedback").textContent = item.name + (quantity ? " · " + quantity + " porsiya" : " buyurtmadan olib tashlandi.");
    };
    group.append(button);
    if (step < 0) group.append(count);
  }
  updatePortionControls(group);
  return group;
}

function updatePortionControls(group) {
  const quantity = order.get(group.dataset.dish) || 0;
  group.querySelector("output").textContent = quantity;
  group.firstElementChild.disabled = quantity === 0;
  group.lastElementChild.disabled = quantity >= 20 || (!quantity && order.size >= 30);
}

function renderOrder() {
  const lines = document.querySelector("#order-lines");
  lines.replaceChildren();
  let total = 0;
  for (const item of menuItems) {
    const quantity = order.get(item.id);
    if (!quantity) continue;
    total += item.price * quantity;
    const row = document.createElement("div");
    row.className = "order-row";
    const label = document.createElement("span");
    label.textContent = item.name + " · " + money(item.price * quantity);
    row.append(label, portionControls(item));
    lines.append(row);
  }
  document.querySelector("#preorder").hidden = !order.size;
  document.querySelector("#order-link").hidden = !order.size;
  document.querySelector("#order-total").textContent = "Jami · " + money(total);
  document.querySelectorAll(".portion-controls").forEach(updatePortionControls);
}

function dishCard(item, withPhoto) {
  const card = document.createElement("article");
  const sources = [...new Set([item.image, ...(window.DISH_PHOTOS?.[item.id] || [])].filter(Boolean))];
  if (withPhoto && sources.length) {
    const photo = document.createElement("img");
    photo.alt = item.name;
    photo.loading = "lazy";
    photo.decoding = "async";
    photo.referrerPolicy = "no-referrer";
    let sourceIndex = 0;
    const showSource = () => {
      const source = sources[sourceIndex++];
      if (!source) return photo.remove();
      if (source.startsWith("photo:")) resolvePhoto(source).then(url => { photo.src = url; },showSource);
      else photo.src = source;
    };
    photo.onerror = showSource;
    showSource();
    card.append(photo);
  }
  const content = document.createElement("div");
  content.className = "dish-content";
  const title = document.createElement("h3");
  title.textContent = item.name;
  const price = document.createElement("p");
  price.textContent = money(item.price);
  content.append(title, price);
  if (item.description) {
    const description = document.createElement("p");
    description.textContent = item.description;
    content.append(description);
  }
  if (window.PREORDER_ENABLED) content.append(portionControls(item));
  card.append(content);
  return card;
}

function renderMenu(items = menuItems) {
  menuItems = items.filter(item => item.visible !== false);
  const available = new Set(menuItems.map(item => item.id));
  for (const id of order.keys()) {
    if (!available.has(id)) order.delete(id);
  }
  const groups = [...new Set(menuItems.map(item => item.category))];
  if (!groups.includes(activeCategory)) activeCategory = groups[0];
  categories.replaceChildren();
  for (const category of groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = category;
    button.setAttribute("aria-pressed", String(category === activeCategory));
    button.onclick = () => {
      activeCategory = category;
      for (const choice of categories.children) choice.setAttribute("aria-pressed", String(choice === button));
      showCategory();
    };
    categories.append(button);
  }
  const preferred = ["14", "47", "64"].map(id => menuItems.find(item => item.id === id && item.image)).filter(Boolean);
  const photos = [...new Set([...preferred, ...menuItems.filter(item => item.image)])].slice(0,3);
  document.querySelector("#featured").replaceChildren(...photos.map(item => dishCard(item,true)));
  showCategory();
  renderOrder();
}

function showCategory() {
  catalog.replaceChildren(...menuItems.filter(item => item.category === activeCategory).map(item => dishCard(item,true)));
}

renderMenu();

