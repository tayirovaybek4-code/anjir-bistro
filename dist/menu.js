"use strict";

const catalog = document.querySelector("#menu-items");
const categories = document.querySelector("#categories");
const order = new Map();
const orderNotes = new Map();
try {
  const draft=JSON.parse(sessionStorage.getItem("zarafshon-order-draft") || "[]");
  sessionStorage.removeItem("zarafshon-order-draft");
  if(Array.isArray(draft)) for(const item of draft.slice(0,30)) {
    if(typeof item.id==="string" && Number.isInteger(item.quantity) && item.quantity>0 && item.quantity<=20){order.set(item.id,item.quantity);orderNotes.set(item.id,String(item.note || "").slice(0,300));}
  }
}catch{}

const money = value => new Intl.NumberFormat("uz-UZ").format(value) + " so‘m";
let menuItems = window.MENU_ITEMS;
let activeCategory = menuItems[0]?.category || "__all";
let menuSearchText = "";
const menuSearch = document.querySelector("#menu-search");
const normalizeMenu = value => String(value).normalize("NFKD").toLowerCase().replace(/[‘’'`]/g,"");
function goToTables() {
  document.querySelector("#cart-dialog").close();
  if (typeof tableOrderRecord !== "undefined" && tableOrderRecord) { document.querySelector("#send-table-order").click();return; }
  location.hash="reservation";
  document.querySelector("#reservation").scrollIntoView({block:"start",behavior:"smooth"});
}
function openCart() {
  const dialog=document.querySelector("#cart-dialog");if(!dialog.open)dialog.showModal();
}
menuSearch.oninput=()=>{menuSearchText=menuSearch.value;activeCategory="__all";updateCategoryButtons();showCategory();};
document.querySelector("#menu-cart-open").onclick=openCart;
document.querySelector("#booking-cart").onclick=openCart;
document.querySelector("#menu-proceed").onclick=goToTables;
document.querySelector("#cart-continue").onclick=goToTables;
function updateCategoryButtons(){for(const button of categories.children)button.setAttribute("aria-pressed",String(button.dataset.category===activeCategory));}

function orderPayload() {
  return [...order].map(([id, quantity]) => ({id, quantity, note:orderNotes.get(id) || ""}));
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
      if(window.ORDER_SUBMITTING)return;
      const quantity = (order.get(item.id) || 0) + step;
      if (quantity < 0 || quantity > 20 || (quantity === 1 && step === 1 && order.size >= 30)) return;
      if (quantity) order.set(item.id,quantity);
      else { order.delete(item.id); orderNotes.delete(item.id); }
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
  group.firstElementChild.disabled = window.ORDER_SUBMITTING || quantity === 0;
  group.lastElementChild.disabled = window.ORDER_SUBMITTING || quantity >= 20 || (!quantity && order.size >= 30);
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
    const note = document.createElement("input");
    note.placeholder = "Masalan: tuzi kam, achchiqroq, yaxshiroq qovurilsin";
    note.maxLength = 300;
    note.disabled = !window.ORDER_NOTES_ENABLED || window.ORDER_SUBMITTING;
    if (!window.ORDER_NOTES_ENABLED) note.placeholder = "Oshpazga izoh: server ulanishi kutilmoqda";
    note.setAttribute("aria-label", item.name + " uchun oshpazga izoh");
    note.value = orderNotes.get(item.id) || "";
    note.oninput = () => orderNotes.set(item.id,note.value);
    const wrapper = document.createElement("div");
    wrapper.className = "order-note";
    wrapper.append(row,note);
    lines.append(wrapper);
  }
  document.querySelector("#preorder").hidden = !order.size;
  document.querySelector("#order-link").hidden = true;
  const quantity=[...order.values()].reduce((sum,value)=>sum+value,0);
  const extra=typeof tableOrderRecord!=="undefined" && tableOrderRecord;
  document.querySelector("#menu-cart").hidden=!order.size;
  document.querySelector("#menu-cart-count").textContent=order.size+" ta taom · "+quantity+" porsiya";
  document.querySelector("#menu-cart-total").textContent=money(total);
  document.querySelector("#booking-cart").hidden=!order.size;
  document.querySelector("#booking-cart").textContent="Savatcha · "+money(total);
  for(const id of ["menu-proceed","cart-continue"]){const button=document.querySelector("#"+id);button.textContent=extra?"Oshxonaga yuborish":"Stollarni tanlash";button.disabled=Boolean(window.ORDER_SUBMITTING) || !order.size;}
  document.querySelector("#cart-guidance").textContent=extra ? "Buyurtma "+extra.table+"-stolga yuboriladi." : "Izohlaringizni yozing, keyin zal xaritasidan stolni tanlang.";
  document.body.classList.toggle("has-cart",Boolean(order.size));
  document.querySelector("#order-total").textContent = "Jami · " + money(total);
  document.querySelectorAll(".portion-controls").forEach(updatePortionControls);
  document.querySelectorAll(".dish-order").forEach(button=>button.disabled=Boolean(window.ORDER_SUBMITTING));
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
  if (window.PREORDER_ENABLED) {
    const actions=document.createElement("div");actions.className="dish-actions";
    const submit=document.createElement("button");submit.type="button";submit.className="dish-order";submit.textContent="Buyurtma berish";
    submit.setAttribute("aria-label",item.name+" — buyurtma berish");
    submit.onclick=()=>{
      if(window.ORDER_SUBMITTING)return;
      if(!order.has(item.id)){if(order.size>=30)return;order.set(item.id,1);}
      renderOrder();document.querySelector("#order-feedback").textContent="Savatchaga qo‘shildi. Pastdagi «Stollarni tanlash» tugmasini bosing.";
    };
    actions.append(portionControls(item),submit);content.append(actions);
  }
  card.append(content);
  return card;
}

function renderMenu(items = menuItems) {
  menuItems=items.filter(item=>item.visible!==false);
  const available=new Set(menuItems.map(item=>item.id));
  for(const id of order.keys())if(!available.has(id)){order.delete(id);orderNotes.delete(id);}
  const groups=[...new Set(menuItems.map(item=>item.category))];
  if(activeCategory!=="__all" && !groups.includes(activeCategory))activeCategory=groups[0] || "__all";
  categories.replaceChildren();
  for(const category of ["__all",...groups]){
    const button=document.createElement("button");button.type="button";button.dataset.category=category;
    button.textContent=category==="__all"?"Barchasi":category;
    button.onclick=()=>{activeCategory=category;menuSearchText="";menuSearch.value="";updateCategoryButtons();showCategory();};categories.append(button);
  }
  updateCategoryButtons();document.querySelector("#featured").replaceChildren();showCategory();renderOrder();
}
function showCategory() {
  const query=normalizeMenu(menuSearchText.trim());
  const items=menuItems.filter(item=>(activeCategory==="__all" || item.category===activeCategory) && (!query || normalizeMenu(item.name+" "+item.category+" "+(item.description || "")).includes(query)));
  catalog.replaceChildren(...items.map(item=>dishCard(item,true)));
  document.querySelector("#menu-results").textContent=items.length ? items.length+" ta taom" : "Taom topilmadi. Boshqa nom yoki bo‘limni tanlang.";
}
renderMenu();
