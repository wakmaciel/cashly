/* =========================================================
   CASHLY — app.js
   Estado em localStorage. Sem build step, sem dependências.
========================================================= */
(function(){
"use strict";

const STORAGE_KEY = "cashly:data:v1";
const VISIBILITY_KEY = "cashly:hideValues";

const ICONS = ["💰","🏦","💳","👛","🐷","🏠","🍔","🚗","🛒","🎓","💊","🎮","✈️","🎬","👕","📱","💡","🐾","🎁","💼","📈","🏋️","☕","🧾","🔧","📚"];
const COLORS = ["#7C6CFF","#2DD4BF","#3DDC84","#FF6B6B","#F5B945","#5B9DFF","#FF8FB1","#9B7BFF","#4ECDC4","#FFA45B","#6C7A93","#E16AE1"];

const DEFAULT_CATEGORIES = [
  { id:"cat_alimentacao", name:"Alimentação", icon:"🍔", color:"#F5B945", type:"expense" },
  { id:"cat_moradia",     name:"Moradia",     icon:"🏠", color:"#7C6CFF", type:"expense" },
  { id:"cat_transporte",  name:"Transporte",  icon:"🚗", color:"#5B9DFF", type:"expense" },
  { id:"cat_saude",       name:"Saúde",       icon:"💊", color:"#FF6B6B", type:"expense" },
  { id:"cat_lazer",       name:"Lazer",       icon:"🎮", color:"#9B7BFF", type:"expense" },
  { id:"cat_compras",     name:"Compras",     icon:"🛒", color:"#FF8FB1", type:"expense" },
  { id:"cat_educacao",    name:"Educação",    icon:"🎓", color:"#4ECDC4", type:"expense" },
  { id:"cat_pets",        name:"Pets",        icon:"🐾", color:"#FFA45B", type:"expense" },
  { id:"cat_assinaturas", name:"Assinaturas", icon:"📱", color:"#6C7A93", type:"expense" },
  { id:"cat_outros",      name:"Outros",      icon:"🧾", color:"#E16AE1", type:"expense" },
  { id:"cat_salario",     name:"Salário",     icon:"💼", color:"#3DDC84", type:"income" },
  { id:"cat_freelance",   name:"Freelance",   icon:"📈", color:"#2DD4BF", type:"income" },
  { id:"cat_presente",    name:"Presente",    icon:"🎁", color:"#FF8FB1", type:"income" },
  { id:"cat_outrosrec",   name:"Outras receitas", icon:"💰", color:"#7C6CFF", type:"income" },
  { id:"cat_fatura",      name:"Pagamento de fatura", icon:"💳", color:"#7C6CFF", type:"expense", system:true },
];

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function uid(){ return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const data = JSON.parse(raw);
      if(!data.categories) data.categories = DEFAULT_CATEGORIES.slice();
      if(!data.categories.find(c=>c.id==="cat_fatura")){
        data.categories.push({ id:"cat_fatura", name:"Pagamento de fatura", icon:"💳", color:"#7C6CFF", type:"expense", system:true });
      }
      if(!data.budgets) data.budgets = [];
      return data;
    }
  }catch(e){ console.warn("Falha ao carregar dados", e); }
  return {
    accounts: [
      { id: uid(), name:"Carteira", icon:"👛", balance: 0 },
    ],
    cards: [],
    categories: DEFAULT_CATEGORIES.slice(),
    transactions: [],
    budgets: []
  };
}

let state = loadState();
let viewDate = new Date();
let hideValues = localStorage.getItem(VISIBILITY_KEY) === "1";

function persist(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmtMoney(v){
  const n = Number(v)||0;
  return n.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
}
function maskMoney(v){
  if(hideValues) return "R$ ••••";
  return fmtMoney(v);
}
function parseAmount(str){
  if(!str) return 0;
  const clean = String(str).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3},)/g,"").replace(",",".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function monthKey(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
function txMonthKey(tx){ const d = new Date(tx.date+"T00:00:00"); return monthKey(d); }

function $(sel, ctx){ return (ctx||document).querySelector(sel); }
function $all(sel, ctx){ return Array.from((ctx||document).querySelectorAll(sel)); }
function el(tag, attrs, children){
  const e = document.createElement(tag);
  if(attrs) for(const k in attrs){
    if(k === "class") e.className = attrs[k];
    else if(k === "html") e.innerHTML = attrs[k];
    else if(k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  (children||[]).forEach(c => { if(c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
  return e;
}

function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=> t.classList.remove("show"), 2200);
}

/* ============== getters ============== */
function getCategory(id){ return state.categories.find(c=>c.id===id); }
function getAccount(id){ return state.accounts.find(a=>a.id===id); }
function getCard(id){ return state.cards.find(c=>c.id===id); }

function accountBalance(acc){
  let bal = acc.balance || 0;
  state.transactions.forEach(tx=>{
    if(tx.accountId === acc.id && tx.kind === "account"){
      if(tx.type === "income") bal += tx.amount;
      else if(tx.type === "expense") bal -= tx.amount;
      else if(tx.type === "invoice_payment") bal -= tx.amount;
      else if(tx.type === "transfer_out") bal -= tx.amount;
      else if(tx.type === "transfer_in") bal += tx.amount;
    }
  });
  return bal;
}
function totalBalance(){
  return state.accounts.reduce((s,a)=> s + accountBalance(a), 0);
}
function cardInvoice(card, mKey){
  return state.transactions
    .filter(tx => tx.cardId === card.id && tx.kind === "card" && txMonthKey(tx) === mKey)
    .reduce((s,tx)=> s + tx.amount, 0);
}
function monthTx(mKey){
  return state.transactions.filter(tx => txMonthKey(tx) === mKey && tx.type !== "transfer_out" && tx.type !== "transfer_in" && tx.type !== "invoice_payment");
}
function monthIncomeExpense(mKey){
  const txs = monthTx(mKey);
  const income = txs.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const expense = txs.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  return { income, expense };
}

/* ----- faturas: status, pagamento e total fechado ----- */
function isInvoiceClosed(card, mKey){
  const nowKey = monthKey(new Date());
  if(mKey < nowKey) return true;
  if(mKey > nowKey) return false;
  const closingDay = card.closingDay || 31;
  return new Date().getDate() > closingDay;
}
function invoicePaidAmount(card, mKey){
  return state.transactions
    .filter(t => t.type==="invoice_payment" && t.invoicePayment && t.invoicePayment.cardId===card.id && t.invoicePayment.mKey===mKey)
    .reduce((s,t)=> s+t.amount, 0);
}
function invoiceRemaining(card, mKey){
  return cardInvoice(card, mKey) - invoicePaidAmount(card, mKey);
}
function invoiceStatus(card, mKey){
  const total = cardInvoice(card, mKey);
  if(total <= 0.004) return { label:null };
  const paid = invoicePaidAmount(card, mKey);
  if(paid >= total - 0.004) return { label:"Fatura paga", cls:"ok" };
  if(paid > 0) return { label:"Paga parcialmente", cls:"pending" };
  if(isInvoiceClosed(card, mKey)) return { label:"Fatura fechada", cls:"pending" };
  return { label:null };
}
function monthLabel(mKey){
  const [y,m] = mKey.split("-").map(Number);
  return MONTHS[m-1] + "/" + y;
}
function closedInvoicesDue(){
  let sum = 0;
  const list = [];
  state.cards.forEach(card=>{
    const keys = new Set(state.transactions.filter(t=>t.kind==="card" && t.cardId===card.id).map(txMonthKey));
    keys.forEach(mKey=>{
      if(isInvoiceClosed(card, mKey)){
        const remaining = invoiceRemaining(card, mKey);
        if(remaining > 0.004){
          sum += remaining;
          list.push({ card, mKey, remaining, paid: invoicePaidAmount(card,mKey), total: cardInvoice(card,mKey) });
        }
      }
    });
  });
  list.sort((a,b)=> a.mKey.localeCompare(b.mKey));
  return { sum, list };
}

/* ============== rendering: header ============== */
function renderMonthLabel(){
  $("#monthLabel").textContent = MONTHS[viewDate.getMonth()];
}

/* ============== rendering: home ============== */
function renderRing(income, expense){
  const total = income + expense;
  const circumference = 2*Math.PI*92;
  const ring = $("#ringProgress");
  if(total <= 0){
    ring.setAttribute("stroke-dasharray", `0 ${circumference}`);
    return;
  }
  const pct = income/total;
  const len = Math.max(circumference*pct, 6);
  ring.setAttribute("stroke-dasharray", `${len} ${circumference}`);
}

function renderHome(){
  const mKey = monthKey(viewDate);
  const { income, expense } = monthIncomeExpense(mKey);
  $("#totalBalance").textContent = maskMoney(totalBalance());
  $("#monthIncome").textContent = maskMoney(income);
  $("#monthExpense").textContent = maskMoney(expense);
  renderRing(income, expense);
  renderInvoiceBanner();

  // accounts
  const accWrap = $("#accountsList");
  accWrap.innerHTML = "";
  if(state.accounts.length === 0){
    accWrap.appendChild(emptyRow("Nenhuma conta cadastrada. Toque em + para adicionar."));
  } else {
    state.accounts.forEach(acc=>{
      const bal = accountBalance(acc);
      accWrap.appendChild(el("div",{class:"list-row", onclick:()=>openAccountSheet(acc)},[
        el("div",{class:"row-ic", style:`background:${acc.color||"#7C6CFF"}`},[acc.icon||"💰"]),
        el("div",{class:"row-body"},[
          el("div",{class:"name"},[acc.name]),
        ]),
        el("div",{class:`row-val ${bal<0?"neg":"pos"}`},[maskMoney(bal)])
      ]));
    });
    accWrap.appendChild(el("div",{class:"total-row"},[
      el("span",{},["Total"]), el("span",{class:"num"},[maskMoney(totalBalance())])
    ]));
  }

  // cards
  const cardWrap = $("#cardsList");
  cardWrap.innerHTML = "";
  if(state.cards.length === 0){
    cardWrap.appendChild(emptyRow("Nenhum cartão cadastrado. Toque em + para adicionar."));
  } else {
    let totalInvoice = 0;
    state.cards.forEach(card=>{
      const invoice = cardInvoice(card, mKey);
      const status = invoiceStatus(card, mKey);
      totalInvoice += invoice;
      cardWrap.appendChild(el("div",{class:"list-row", onclick:()=>openCardSheet(card)},[
        el("div",{class:"row-ic", style:`background:${card.color||"#262B38"}`},["💳"]),
        el("div",{class:"row-body"},[
          el("div",{class:"name"},[card.name]),
          el("div",{class:"sub"},[card.closingDay ? `Fecha dia ${card.closingDay}` : "Sem data de fechamento"])
        ]),
        el("div",{class:"row-val-stack"},[
          status.label ? el("div",{class:`row-status ${status.cls}`},[status.label]) : null,
          el("div",{class:`amt-line num ${status.cls==="ok"?"pos":"neg"}`},[maskMoney(invoice)])
        ])
      ]));
    });
    cardWrap.appendChild(el("div",{class:"total-row"},[
      el("span",{},["Total faturas"]), el("span",{class:"num"},[maskMoney(totalInvoice)])
    ]));
  }

  renderDonut(mKey);
}

function renderInvoiceBanner(){
  const { sum, list } = closedInvoicesDue();
  const wrap = $("#invoiceBanner");
  if(sum <= 0.004){ wrap.classList.add("page-hidden"); return; }
  wrap.classList.remove("page-hidden");
  $("#invoiceBannerAmount").textContent = maskMoney(sum);
  $("#invoiceBannerSub").textContent = `${list.length} fatura${list.length>1?"s":""} fechada${list.length>1?"s":""} aguardando pagamento`;
}

function emptyRow(msg){ return el("div",{class:"empty-row"},[msg]); }

function renderDonut(mKey){
  const wrap = $("#donutCard");
  wrap.innerHTML = "";
  const txs = monthTx(mKey).filter(t=>t.type==="expense");
  if(txs.length === 0){
    wrap.appendChild(el("div",{class:"empty-state", style:"padding:18px 6px;"},[
      el("div",{class:"ic"},["📊"]),
      el("h3",{},["Sem despesas este mês"]),
      el("p",{},["Adicione transações para ver o resumo por categoria."])
    ]));
    return;
  }
  const byCat = {};
  txs.forEach(t=>{ byCat[t.categoryId] = (byCat[t.categoryId]||0) + t.amount; });
  const total = Object.values(byCat).reduce((a,b)=>a+b,0);
  const entries = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const r = 56, c = 2*Math.PI*r;
  let offset = 0;
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("viewBox","0 0 128 128");
  const bg = document.createElementNS("http://www.w3.org/2000/svg","circle");
  bg.setAttribute("cx",64); bg.setAttribute("cy",64); bg.setAttribute("r",r);
  bg.setAttribute("fill","none"); bg.setAttribute("stroke","var(--surface-3)"); bg.setAttribute("stroke-width","16");
  svg.appendChild(bg);
  entries.forEach(([catId, val])=>{
    const cat = getCategory(catId) || {color:"#6C7A93"};
    const frac = val/total;
    const len = frac*c;
    const seg = document.createElementNS("http://www.w3.org/2000/svg","circle");
    seg.setAttribute("cx",64); seg.setAttribute("cy",64); seg.setAttribute("r",r);
    seg.setAttribute("fill","none"); seg.setAttribute("stroke",cat.color); seg.setAttribute("stroke-width","16");
    seg.setAttribute("stroke-dasharray", `${len} ${c-len}`);
    seg.setAttribute("stroke-dashoffset", -offset);
    seg.setAttribute("stroke-linecap","butt");
    svg.appendChild(seg);
    offset += len;
  });

  const donutWrap = el("div",{class:"donut-wrap"},[svg, el("div",{class:"donut-center"},[
    el("span",{class:"v num"},[maskMoney(total).replace("R$","")]),
    el("span",{class:"l"},["total"])
  ])]);

  const legend = el("div",{class:"legend"});
  entries.forEach(([catId,val])=>{
    const cat = getCategory(catId) || {name:"Outros", color:"#6C7A93", icon:"🧾"};
    legend.appendChild(el("div",{class:"legend-row"},[
      el("span",{class:"legend-dot", style:`background:${cat.color}`}),
      el("span",{class:"name"},[cat.name]),
      el("span",{class:"val"},[maskMoney(val)])
    ]));
  });

  wrap.appendChild(donutWrap);
  wrap.appendChild(legend);
}

/* ============== rendering: transactions ============== */
function renderTx(){
  const mKey = monthKey(viewDate);
  const { income, expense } = monthIncomeExpense(mKey);
  $("#txIncome").textContent = maskMoney(income);
  $("#txExpense").textContent = maskMoney(expense);
  $("#txBalance").textContent = maskMoney(income-expense);
  const max = Math.max(income, expense, 1);
  $("#barIncome").style.height = Math.max(8,(income/max)*100) + "%";
  $("#barExpense").style.height = Math.max(8,(expense/max)*100) + "%";

  const wrap = $("#txListWrap");
  wrap.innerHTML = "";
  const txs = state.transactions
    .filter(t => txMonthKey(t) === mKey && t.type !== "transfer_in")
    .sort((a,b)=> b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  if(txs.length === 0){
    wrap.appendChild(el("div",{class:"empty-state"},[
      el("div",{class:"ic"},["🧾"]),
      el("h3",{},["Nenhuma transação"]),
      el("p",{},["Toque no botão + para registrar sua primeira receita ou despesa."])
    ]));
    return;
  }

  const groups = {};
  txs.forEach(t=>{ (groups[t.date] = groups[t.date]||[]).push(t); });

  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date=>{
    const group = el("div",{class:"day-group"});
    group.appendChild(el("div",{class:"day-label"},[formatDateLabel(date)]));
    groups[date].forEach(tx=>{
      const cat = getCategory(tx.categoryId) || {icon:"🔁", color:"#6C7A93", name:"Transferência"};
      const place = tx.kind === "card" ? (getCard(tx.cardId)||{}).name : (getAccount(tx.accountId)||{}).name;
      const isPos = tx.type === "income";
      group.appendChild(el("div",{class:"tx-row", onclick:()=> tx.type==="invoice_payment" ? openInvoicePaymentView(tx) : openTxSheet(tx)},[
        el("div",{class:"tx-ic", style:`background:${cat.color}33; color:${cat.color}`},[cat.icon]),
        el("div",{class:"tx-body"},[
          el("div",{class:"name"},[tx.description || cat.name]),
          el("div",{class:"sub"},[`${cat.name}${place? " · "+place : ""}`])
        ]),
        el("div",{class:"tx-val"},[
          el("div",{class:`amt ${isPos?"pos":"neg"}`},[(isPos?"+ ":"- ") + maskMoney(tx.amount)]),
          el("div",{class:"status ok"},["concluído"])
        ])
      ]));
    });
    wrap.appendChild(group);
  });
}

function formatDateLabel(dateStr){
  const d = new Date(dateStr+"T00:00:00");
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate()-1);
  const sameDay = (a,b)=> a.toDateString()===b.toDateString();
  if(sameDay(d, today)) return "Hoje";
  if(sameDay(d, yest)) return "Ontem";
  const weekday = d.toLocaleDateString("pt-BR",{weekday:"long"});
  return weekday.charAt(0).toUpperCase()+weekday.slice(1) + ", " + d.getDate();
}

/* ============== rendering: planejamento ============== */
function renderPlan(){
  const mKey = monthKey(viewDate);
  const wrap = $("#budgetList");
  wrap.innerHTML = "";
  if(state.budgets.length === 0){
    wrap.appendChild(el("div",{class:"empty-state"},[
      el("div",{class:"ic"},["🎯"]),
      el("h3",{},["Nenhum orçamento definido"]),
      el("p",{},["Crie limites de gastos por categoria para manter o controle todo mês."])
    ]));
    return;
  }
  const txs = monthTx(mKey).filter(t=>t.type==="expense");
  state.budgets.forEach(b=>{
    const cat = getCategory(b.categoryId) || {name:"Categoria", icon:"🏷️", color:"#6C7A93"};
    const spent = txs.filter(t=>t.categoryId===b.categoryId).reduce((s,t)=>s+t.amount,0);
    const pct = Math.min(100, (spent/b.limit)*100 || 0);
    const over = spent > b.limit;
    wrap.appendChild(el("div",{class:"budget-card"},[
      el("div",{class:"top"},[
        el("div",{class:"name"},[el("span",{},[cat.icon]), el("span",{},[cat.name])]),
        el("div",{class:"nums"},[el("b",{},[maskMoney(spent)]), ` / ${maskMoney(b.limit)}`])
      ]),
      el("div",{class:"bar-track"},[
        el("div",{class:"bar-fill", style:`width:${pct}%; background:${over?"var(--coral)":cat.color}`})
      ])
    ]));
  });
}

/* ============== more / categories ============== */
function renderCategoriesManageList(){
  const wrap = $("#categoriesManageList");
  wrap.innerHTML = "";
  state.categories.filter(c=>!c.system).forEach(cat=>{
    wrap.appendChild(el("div",{class:"cat-pick-row", onclick:()=>openCategoryEdit(cat)},[
      el("div",{class:"row-ic", style:`background:${cat.color}`},[cat.icon]),
      el("span",{},[cat.name])
    ]));
  });
}

/* ============== navigation ============== */
const pages = ["home","tx","plan","more"];
function showPage(name){
  pages.forEach(p=>{
    $("#page-"+p).classList.toggle("page-hidden", p!==name);
  });
  $all(".nav-btn").forEach(b=> b.classList.toggle("active", b.dataset.page===name));
  if(name==="home") renderHome();
  if(name==="tx") renderTx();
  if(name==="plan") renderPlan();
  if(name==="more") {} 
}
$all(".nav-btn").forEach(b=> b.addEventListener("click", ()=> showPage(b.dataset.page)));

$("#prevMonth").addEventListener("click", ()=>{ viewDate.setMonth(viewDate.getMonth()-1); refreshAll(); });
$("#nextMonth").addEventListener("click", ()=>{ viewDate.setMonth(viewDate.getMonth()+1); refreshAll(); });

function refreshAll(){
  renderMonthLabel();
  const active = pages.find(p=> !$("#page-"+p).classList.contains("page-hidden"));
  showPage(active||"home");
}

/* ============== sheets (modals) ============== */
function openSheet(id){ $(id).classList.add("show"); }
function closeSheet(id){ $(id).classList.remove("show"); }
$all(".overlay").forEach(ov=>{
  ov.addEventListener("click", (e)=>{ if(e.target===ov) closeSheet("#"+ov.id); });
  $all("[data-close]", ov).forEach(btn=> btn.addEventListener("click", ()=> closeSheet("#"+ov.id)));
});

/* ----- nova transação ----- */
let editingTxId = null;
let txSelectedCategory = null;
let txCurrentType = "expense";

function fillAccountSelect(selectEl, includeCards){
  selectEl.innerHTML = "";
  const accGroup = el("optgroup",{label:"Contas"});
  state.accounts.forEach(a=> accGroup.appendChild(el("option",{value:"acc:"+a.id},[a.name])));
  selectEl.appendChild(accGroup);
  if(includeCards && state.cards.length){
    const cardGroup = el("optgroup",{label:"Cartões de crédito"});
    state.cards.forEach(c=> cardGroup.appendChild(el("option",{value:"card:"+c.id},[c.name])));
    selectEl.appendChild(cardGroup);
  }
}

function setTxType(type){
  txCurrentType = type;
  $all("#txTypeSeg button").forEach(b=> b.classList.toggle("active", b.dataset.type===type));
  $("#txToAccountField").classList.toggle("page-hidden", type!=="transfer");
  $("#txCategoryField").classList.toggle("page-hidden", type==="transfer");
  $("#txAccountLabel").textContent = type==="transfer" ? "De (conta)" : "Conta / Cartão";
  fillAccountSelect($("#txAccount"), type==="expense");
  fillAccountSelect($("#txToAccount"), false);
  if(type !== "transfer"){
    txSelectedCategory = state.categories.find(c=>c.type===type && !c.system) || null;
    updateCategoryBtn();
  }
}
$all("#txTypeSeg button").forEach(b=> b.addEventListener("click", ()=> setTxType(b.dataset.type)));

function updateCategoryBtn(){
  if(txSelectedCategory){
    $("#txCategoryIcon").textContent = txSelectedCategory.icon;
    $("#txCategoryName").textContent = txSelectedCategory.name;
  } else {
    $("#txCategoryIcon").textContent = "🏷️";
    $("#txCategoryName").textContent = "Selecionar categoria";
  }
}

function openCategoryPicker(type, onPick){
  const wrap = $("#catPickList");
  wrap.innerHTML = "";
  state.categories.filter(c=>c.type===type && !c.system).forEach(cat=>{
    wrap.appendChild(el("div",{class:"cat-pick-row", onclick:()=>{ onPick(cat); closeSheet("#sheetCategoryPick"); }},[
      el("div",{class:"row-ic", style:`background:${cat.color}`},[cat.icon]),
      el("span",{},[cat.name])
    ]));
  });
  openSheet("#sheetCategoryPick");
}
$("#txCategoryBtn").addEventListener("click", ()=>{
  openCategoryPicker(txCurrentType, (cat)=>{ txSelectedCategory = cat; updateCategoryBtn(); });
});

function openTxSheet(tx){
  editingTxId = tx ? tx.id : null;
  $("#txSheetTitle").textContent = tx ? "Editar transação" : "Nova transação";
  $("#deleteTxBtn").classList.toggle("page-hidden", !tx);
  const type = tx ? (tx.type==="transfer_out"?"transfer":tx.type) : "expense";
  setTxType(type);
  $("#txAmount").value = tx ? String(tx.amount).replace(".",",") : "";
  $("#txDesc").value = tx ? (tx.description||"") : "";
  $("#txDate").value = tx ? tx.date : isoDate(new Date());
  if(tx){
    txSelectedCategory = getCategory(tx.categoryId) || null;
    updateCategoryBtn();
    if(tx.kind==="card") $("#txAccount").value = "card:"+tx.cardId;
    else $("#txAccount").value = "acc:"+tx.accountId;
  } else {
    if($("#txAccount").options.length) $("#txAccount").selectedIndex = 0;
  }
  openSheet("#sheetTx");
}
function isoDate(d){ return d.toISOString().slice(0,10); }

$("#fabAdd").addEventListener("click", ()=> openTxSheet(null));

$("#saveTxBtn").addEventListener("click", ()=>{
  const amount = parseAmount($("#txAmount").value);
  if(amount<=0){ toast("Informe um valor válido"); return; }
  const date = $("#txDate").value || isoDate(new Date());
  const desc = $("#txDesc").value.trim();

  if(txCurrentType === "transfer"){
    const fromVal = $("#txAccount").value, toVal = $("#txToAccount").value;
    if(!fromVal || !toVal || fromVal===toVal){ toast("Selecione contas diferentes"); return; }
    const fromId = fromVal.split(":")[1], toId = toVal.split(":")[1];
    if(editingTxId) removeTxPair(editingTxId);
    const pairId = uid();
    state.transactions.push({ id: uid(), pairId, type:"transfer_out", kind:"account", accountId: fromId, amount, date, description: desc||"Transferência", categoryId:null, createdAt: Date.now() });
    state.transactions.push({ id: uid(), pairId, type:"transfer_in", kind:"account", accountId: toId, amount, date, description: desc||"Transferência", categoryId:null, createdAt: Date.now() });
    toast("Transferência registrada");
  } else {
    if(!txSelectedCategory){ toast("Selecione uma categoria"); return; }
    const accVal = $("#txAccount").value;
    if(!accVal){ toast("Selecione uma conta ou cartão"); return; }
    const [kindRaw, id] = accVal.split(":");
    const kind = kindRaw==="card" ? "card" : "account";
    const payload = {
      type: txCurrentType, kind,
      accountId: kind==="account"?id:null,
      cardId: kind==="card"?id:null,
      amount, date, description: desc, categoryId: txSelectedCategory.id
    };
    if(editingTxId){
      const idx = state.transactions.findIndex(t=>t.id===editingTxId);
      if(idx>-1) state.transactions[idx] = Object.assign(state.transactions[idx], payload);
      toast("Transação atualizada");
    } else {
      payload.id = uid(); payload.createdAt = Date.now();
      state.transactions.push(payload);
      toast("Transação adicionada");
    }
  }
  persist();
  closeSheet("#sheetTx");
  refreshAll();
});

function removeTxPair(id){
  const tx = state.transactions.find(t=>t.id===id);
  if(tx && tx.pairId) state.transactions = state.transactions.filter(t=>t.pairId!==tx.pairId);
  else state.transactions = state.transactions.filter(t=>t.id!==id);
}
$("#deleteTxBtn").addEventListener("click", ()=>{
  if(!editingTxId) return;
  removeTxPair(editingTxId);
  persist();
  closeSheet("#sheetTx");
  refreshAll();
  toast("Transação excluída");
});

/* ----- conta ----- */
let editingAccountId = null;
function buildIconGrid(container, selected, onSelect){
  container.innerHTML = "";
  ICONS.forEach(ic=>{
    const btn = el("div",{class:"icon-pick"+(ic===selected?" active":""), onclick:()=>{
      $all(".icon-pick", container).forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      onSelect(ic);
    }},[ic]);
    container.appendChild(btn);
  });
}
function openAccountSheet(acc){
  editingAccountId = acc ? acc.id : null;
  $("#accSheetTitle").textContent = acc ? "Editar conta" : "Nova conta";
  $("#deleteAccountBtn").classList.toggle("page-hidden", !acc);
  $("#accName").value = acc ? acc.name : "";
  $("#accBalance").value = acc ? String(acc.balance).replace(".",",") : "";
  let chosenIcon = acc ? acc.icon : "👛";
  buildIconGrid($("#accIconGrid"), chosenIcon, (ic)=> chosenIcon = ic);
  $("#saveAccountBtn").onclick = ()=>{
    const name = $("#accName").value.trim();
    if(!name){ toast("Informe um nome"); return; }
    const balance = parseAmount($("#accBalance").value);
    if(editingAccountId){
      const a = getAccount(editingAccountId);
      a.name=name; a.balance=balance; a.icon=chosenIcon;
      toast("Conta atualizada");
    } else {
      state.accounts.push({ id: uid(), name, balance, icon: chosenIcon });
      toast("Conta criada");
    }
    persist(); closeSheet("#sheetAccount"); refreshAll();
  };
  openSheet("#sheetAccount");
}
$("#addAccountBtn").addEventListener("click", ()=> openAccountSheet(null));
$("#deleteAccountBtn").addEventListener("click", ()=>{
  if(!editingAccountId) return;
  state.accounts = state.accounts.filter(a=>a.id!==editingAccountId);
  state.transactions = state.transactions.filter(t=> t.accountId!==editingAccountId);
  persist(); closeSheet("#sheetAccount"); refreshAll();
  toast("Conta excluída");
});

/* ----- cartão ----- */
let editingCardId = null;
function openCardSheet(card){
  editingCardId = card ? card.id : null;
  $("#cardSheetTitle").textContent = card ? "Editar cartão" : "Novo cartão";
  $("#deleteCardBtn").classList.toggle("page-hidden", !card);
  $("#cardName").value = card ? card.name : "";
  $("#cardLimit").value = card ? String(card.limit||0).replace(".",",") : "";
  $("#cardClosing").value = card ? (card.closingDay||"") : "";
  $("#cardDue").value = card ? (card.dueDay||"") : "";

  const alertBox = $("#cardInvoiceAlert");
  if(card){
    const mKey = monthKey(viewDate);
    const status = invoiceStatus(card, mKey);
    const remaining = invoiceRemaining(card, mKey);
    if(status.label && status.label !== "Fatura paga" && remaining > 0.004){
      alertBox.classList.remove("page-hidden");
      $("#cardInvoiceAlertLabel").textContent = `${status.label} · ${monthLabel(mKey)}`;
      $("#cardInvoiceAlertAmount").textContent = maskMoney(remaining);
      $("#cardInvoiceAlertBtn").onclick = ()=>{ closeSheet("#sheetCard"); openInvoiceConfirm(card, mKey); };
    } else {
      alertBox.classList.add("page-hidden");
    }
  } else {
    alertBox.classList.add("page-hidden");
  }

  $("#saveCardBtn").onclick = ()=>{
    const name = $("#cardName").value.trim();
    if(!name){ toast("Informe um nome"); return; }
    const limit = parseAmount($("#cardLimit").value);
    const closingDay = parseInt($("#cardClosing").value)||null;
    const dueDay = parseInt($("#cardDue").value)||null;
    if(editingCardId){
      const c = getCard(editingCardId);
      c.name=name; c.limit=limit; c.closingDay=closingDay; c.dueDay=dueDay;
      toast("Cartão atualizado");
    } else {
      state.cards.push({ id: uid(), name, limit, closingDay, dueDay, color:"#262B38" });
      toast("Cartão criado");
    }
    persist(); closeSheet("#sheetCard"); refreshAll();
  };
  openSheet("#sheetCard");
}
$("#addCardBtn").addEventListener("click", ()=> openCardSheet(null));
$("#deleteCardBtn").addEventListener("click", ()=>{
  if(!editingCardId) return;
  state.cards = state.cards.filter(c=>c.id!==editingCardId);
  state.transactions = state.transactions.filter(t=> t.cardId!==editingCardId);
  persist(); closeSheet("#sheetCard"); refreshAll();
  toast("Cartão excluído");
});

/* ----- pagamento de fatura ----- */
let invoicePayTarget = null;

function openInvoicePaySheet(){
  const { list } = closedInvoicesDue();
  const wrap = $("#invoicePayList");
  wrap.innerHTML = "";
  if(list.length === 0){
    wrap.appendChild(emptyRow("Nenhuma fatura fechada pendente."));
  } else {
    list.forEach(item=>{
      wrap.appendChild(el("div",{class:"list-row", onclick:()=> openInvoiceConfirm(item.card, item.mKey)},[
        el("div",{class:"row-ic", style:`background:${item.card.color||"#262B38"}`},["💳"]),
        el("div",{class:"row-body"},[
          el("div",{class:"name"},[item.card.name]),
          el("div",{class:"sub"},[`Fatura de ${monthLabel(item.mKey)}${item.paid>0?" · paga parcialmente":""}`])
        ]),
        el("div",{class:"row-val neg"},[maskMoney(item.remaining)])
      ]));
    });
  }
  openSheet("#sheetInvoicePay");
}
$("#invoiceBanner").addEventListener("click", openInvoicePaySheet);

function openInvoiceConfirm(card, mKey){
  invoicePayTarget = { card, mKey };
  const total = cardInvoice(card, mKey);
  const paid = invoicePaidAmount(card, mKey);
  const remaining = total - paid;

  const info = $("#invoiceConfirmInfo");
  info.innerHTML = "";
  info.appendChild(el("div",{class:"invoice-summary"},[
    el("div",{class:"row"},[el("span",{},["Cartão"]), el("b",{},[card.name])]),
    el("div",{class:"row"},[el("span",{},["Fatura"]), el("b",{},[monthLabel(mKey)])]),
    el("div",{class:"row"},[el("span",{},["Total da fatura"]), el("b",{class:"num"},[maskMoney(total)])]),
    paid>0 ? el("div",{class:"row"},[el("span",{},["Já pago"]), el("b",{class:"num", style:"color:var(--teal)"},[maskMoney(paid)])]) : null,
    el("div",{class:"row"},[el("span",{},["Restante"]), el("b",{class:"num", style:"color:var(--coral)"},[maskMoney(remaining)])]),
  ]));

  $("#invoicePayAmount").value = remaining.toFixed(2).replace(".",",");
  fillAccountSelect($("#invoicePayAccount"), false);
  $("#invoicePayDate").value = isoDate(new Date());
  closeSheet("#sheetInvoicePay");
  openSheet("#sheetInvoiceConfirm");
}

$("#confirmInvoicePayBtn").addEventListener("click", ()=>{
  if(!invoicePayTarget) return;
  const amount = parseAmount($("#invoicePayAmount").value);
  if(amount<=0){ toast("Informe um valor válido"); return; }
  const accVal = $("#invoicePayAccount").value;
  if(!accVal){ toast("Selecione uma conta"); return; }
  const accountId = accVal.split(":")[1];
  const date = $("#invoicePayDate").value || isoDate(new Date());
  const { card, mKey } = invoicePayTarget;

  state.transactions.push({
    id: uid(), type:"invoice_payment", kind:"account",
    accountId, amount, date,
    description: `Pagamento fatura ${card.name}`,
    categoryId: "cat_fatura",
    invoicePayment: { cardId: card.id, mKey },
    createdAt: Date.now()
  });
  persist();

  const total = cardInvoice(card, mKey);
  const paidNow = invoicePaidAmount(card, mKey);
  closeSheet("#sheetInvoiceConfirm");
  refreshAll();
  toast(paidNow >= total - 0.004 ? "Fatura paga!" : "Pagamento parcial registrado");
});

function openInvoicePaymentView(tx){
  const card = getCard(tx.invoicePayment ? tx.invoicePayment.cardId : null);
  const account = getAccount(tx.accountId);
  const msg = `Pagamento de fatura\n\nCartão: ${card?card.name:"—"}\nFatura: ${tx.invoicePayment?monthLabel(tx.invoicePayment.mKey):"—"}\nValor: ${fmtMoney(tx.amount)}\nConta: ${account?account.name:"—"}\nData: ${tx.date}\n\nDeseja excluir este pagamento?`;
  if(confirm(msg)){
    state.transactions = state.transactions.filter(t=>t.id!==tx.id);
    persist(); refreshAll();
    toast("Pagamento excluído");
  }
}

/* ----- orçamento ----- */
let budgetSelectedCategory = null;
$("#budgetCategoryBtn").addEventListener("click", ()=>{
  openCategoryPicker("expense", (cat)=>{
    budgetSelectedCategory = cat;
    $("#budgetCategoryIcon").textContent = cat.icon;
    $("#budgetCategoryName").textContent = cat.name;
  });
});
$("#addBudgetBtn").addEventListener("click", ()=>{
  budgetSelectedCategory = null;
  $("#budgetCategoryIcon").textContent="🏷️"; $("#budgetCategoryName").textContent="Selecionar categoria";
  $("#budgetLimit").value = "";
  openSheet("#sheetBudget");
});
$("#saveBudgetBtn").addEventListener("click", ()=>{
  if(!budgetSelectedCategory){ toast("Selecione uma categoria"); return; }
  const limit = parseAmount($("#budgetLimit").value);
  if(limit<=0){ toast("Informe um limite válido"); return; }
  const existing = state.budgets.find(b=>b.categoryId===budgetSelectedCategory.id);
  if(existing) existing.limit = limit;
  else state.budgets.push({ id: uid(), categoryId: budgetSelectedCategory.id, limit });
  persist(); closeSheet("#sheetBudget"); refreshAll();
  toast("Orçamento salvo");
});

/* ----- categorias (gerenciar) ----- */
let editingCategoryId = null;
function openCategoryEdit(cat){
  editingCategoryId = cat ? cat.id : null;
  $("#catEditTitle").textContent = cat ? "Editar categoria" : "Nova categoria";
  $("#deleteCategoryBtn").classList.toggle("page-hidden", !cat);
  $("#catName").value = cat ? cat.name : "";
  let chosenIcon = cat ? cat.icon : ICONS[0];
  let chosenColor = cat ? cat.color : COLORS[0];
  let chosenType = cat ? cat.type : "expense";
  buildIconGrid($("#catIconGrid"), chosenIcon, ic=>chosenIcon=ic);
  const colorWrap = $("#catColorGrid");
  colorWrap.innerHTML = "";
  COLORS.forEach(c=>{
    const dot = el("div",{class:"color-pick"+(c===chosenColor?" active":""), style:`background:${c}`, onclick:()=>{
      $all(".color-pick", colorWrap).forEach(d=>d.classList.remove("active"));
      dot.classList.add("active"); chosenColor=c;
    }});
    colorWrap.appendChild(dot);
  });
  $("#saveCategoryBtn").onclick = ()=>{
    const name = $("#catName").value.trim();
    if(!name){ toast("Informe um nome"); return; }
    if(editingCategoryId){
      const c = getCategory(editingCategoryId);
      c.name=name; c.icon=chosenIcon; c.color=chosenColor;
      toast("Categoria atualizada");
    } else {
      state.categories.push({ id: uid(), name, icon: chosenIcon, color: chosenColor, type: chosenType });
      toast("Categoria criada");
    }
    persist(); closeSheet("#sheetCategoryEdit"); renderCategoriesManageList();
  };
  openSheet("#sheetCategoryEdit");
}
$("#newCategoryBtn").addEventListener("click", ()=> openCategoryEdit(null));
$("#deleteCategoryBtn").addEventListener("click", ()=>{
  if(!editingCategoryId) return;
  state.categories = state.categories.filter(c=>c.id!==editingCategoryId);
  persist(); closeSheet("#sheetCategoryEdit"); renderCategoriesManageList();
  toast("Categoria excluída");
});

/* ============== Mais: tabs + menu actions ============== */
$all(".tab-btn").forEach(b=>{
  b.addEventListener("click", ()=>{
    $all(".tab-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    $("#moreGerenciar").classList.toggle("page-hidden", b.dataset.tab!=="gerenciar");
    $("#moreSobre").classList.toggle("page-hidden", b.dataset.tab!=="sobre");
  });
});

$all(".menu-row").forEach(row=>{
  row.addEventListener("click", ()=>{
    const action = row.dataset.action;
    if(action==="theme"){ openThemeSheet(); }
    else if(action==="accounts"){ showPage("home"); document.getElementById("accountsList").scrollIntoView({behavior:"smooth"}); }
    else if(action==="cards"){ showPage("home"); document.getElementById("cardsList").scrollIntoView({behavior:"smooth"}); }
    else if(action==="categories"){ renderCategoriesManageList(); openSheet("#sheetCategories"); }
    else if(action==="export") exportData();
    else if(action==="import") importData();
    else if(action==="reset") resetData();
  });
});

function exportData(){
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `cashly-backup-${isoDate(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Backup exportado");
}
function importData(){
  const input = document.createElement("input");
  input.type = "file"; input.accept = "application/json";
  input.onchange = ()=>{
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if(!data.accounts || !data.transactions) throw new Error("formato inválido");
        state = data;
        persist(); refreshAll();
        toast("Backup importado");
      }catch(e){ toast("Arquivo inválido"); }
    };
    reader.readAsText(file);
  };
  input.click();
}
function resetData(){
  if(!confirm("Isso vai apagar todos os dados do Cashly neste dispositivo. Deseja continuar?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  persist(); refreshAll();
  toast("Dados apagados");
}

/* ============== visibility toggle ============== */
$("#toggleVisibility").addEventListener("click", ()=>{
  hideValues = !hideValues;
  localStorage.setItem(VISIBILITY_KEY, hideValues?"1":"0");
  $("#toggleVisibility").textContent = hideValues ? "🙈" : "👁";
  refreshAll();
});

/* ============== tema (claro / escuro / automático) ============== */
const THEME_KEY = "cashly:theme";
const THEME_LABELS = { auto:"Automático", light:"Claro", dark:"Escuro" };
const systemDarkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function getThemePref(){
  return localStorage.getItem(THEME_KEY) || "auto";
}
function applyTheme(pref){
  const root = document.documentElement;
  if(pref === "light") root.setAttribute("data-theme","light");
  else if(pref === "dark") root.setAttribute("data-theme","dark");
  else root.removeAttribute("data-theme"); // auto: deixa o CSS seguir prefers-color-scheme

  // resolve a cor real aplicada agora, para sincronizar a barra de status do iOS
  const isLight = pref === "light" || (pref === "auto" && systemDarkQuery && !systemDarkQuery.matches);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if(metaTheme) metaTheme.setAttribute("content", isLight ? "#F3F4F9" : "#0E1015");

  const label = $("#themeValueLabel");
  if(label) label.textContent = THEME_LABELS[pref] || "Automático";

  $all(".theme-pick-row").forEach(row=>{
    row.classList.toggle("active", row.dataset.themeChoice === pref);
  });
}
function setThemePref(pref){
  localStorage.setItem(THEME_KEY, pref);
  applyTheme(pref);
}
function openThemeSheet(){
  applyTheme(getThemePref());
  openSheet("#sheetTheme");
}
$all(".theme-pick-row").forEach(row=>{
  row.addEventListener("click", ()=>{
    setThemePref(row.dataset.themeChoice);
    closeSheet("#sheetTheme");
    toast("Aparência: " + THEME_LABELS[row.dataset.themeChoice]);
  });
});
if(systemDarkQuery){
  systemDarkQuery.addEventListener("change", ()=>{
    if(getThemePref() === "auto") applyTheme("auto");
  });
}

/* ============== settings shortcut (top gear) ============== */
$("#openSettings").addEventListener("click", ()=> showPage("more"));

/* ============== init ============== */
function init(){
  $("#txDate").value = isoDate(new Date());
  $("#toggleVisibility").textContent = hideValues ? "🙈" : "👁";
  applyTheme(getThemePref());
  refreshAll();

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("sw.js").catch(()=>{});

    // Quando o SW novo assume o controle (após deploy), recarrega a página
    // automaticamente para garantir que o usuário veja a versão atualizada.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{
      if(refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }
}
init();

})();
