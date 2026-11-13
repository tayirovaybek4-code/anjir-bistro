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
    label.textContent = item.name + " × " + quantity;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "outline";
    remove.textContent = "−";
    remove.setAttribute("aria-label", item.name + " porsiyasini kamaytirish");
    remove.onclick = () => {
      if (quantity === 1) order.delete(item.id);
      else order.set(item.id, quantity - 1);
      renderOrder();
    };
    row.append(label, remove);
    lines.append(row);
  }
  document.querySelector("#preorder").hidden = !order.size;
  document.querySelector("#order-total").textContent = "Jami · " + money(total);
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
    photo.onerror = () => {
      if (sources[++sourceIndex]) photo.src = sources[sourceIndex];
      else photo.remove();
    };
    photo.src = sources[0];
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
  const add = document.createElement("button");
  add.type = "button";
  add.className = "outline";
  add.textContent = "+ Buyurtmaga";
  add.onclick = () => {
    if (!window.PREORDER_ENABLED) return;
    order.set(item.id, Math.min(20, (order.get(item.id) || 0) + 1));
    renderOrder();
    document.querySelector("#order-feedback").textContent = item.name + " buyurtmaga qo‘shildi.";
    document.querySelector("#order-link").hidden = false;
  };
  if (window.PREORDER_ENABLED) content.append(add);
  card.append(content);
  return card;
}

function renderMenu(items = menuItems) {
  menuItems = items.filter(item => item.visible !== false);
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
}

function showCategory() {
  catalog.replaceChildren(...menuItems.filter(item => item.category === activeCategory).map(item => dishCard(item,true)));
}

renderMenu();

