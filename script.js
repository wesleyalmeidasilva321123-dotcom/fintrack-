'use strict';
/* =============================================
   FINTRACK — script.js v2
   ============================================= */

// ─── CONSTANTS ────────────────────────────────
const CAT_ICONS = {
  'Aluguel':'🏠','Condomínio':'🏢','Água/Luz/Gás':'💡','Internet':'📡','Manutenção':'🔧',
  'Supermercado':'🛒','Restaurante':'🍽️','Delivery':'🛵','Padaria/Café':'☕',
  'Combustível':'⛽','Transporte público':'🚌','Uber/99':'🚖','Estacionamento':'🅿️','IPVA/Seguro':'🚗',
  'Farmácia':'💊','Consulta médica':'🩺','Plano de saúde':'🏥','Academia':'🏋️',
  'Faculdade/Curso':'🎓','Livros':'📖','Escola filhos':'🏫',
  'Streaming':'📺','Games':'🎮','Cinema/Teatro':'🎬','Viagem':'✈️','Hobby':'🎨',
  'Roupas':'👕','Calçados':'👟','Beleza/Barbearia':'💈','Higiene':'🧴',
  'Cartão crédito':'💳','Empréstimo':'🏦','Seguros':'🛡️','Impostos':'📋',
  'Pet':'🐾','Presente':'🎁','Doação':'❤️','Outros':'📦',
};

const WALLET_LABELS = { salary:'Salário', voucher:'Voucher alimentação', refeicao:'Vale refeição' };
const WALLET_DOT    = { salary:'salary', voucher:'voucher', refeicao:'refeicao' };

// Investment type definitions — rate as fraction of CDI or annual %
const INV_TYPES = {
  nubank_caixinha: { label:'Nubank Caixinha', icon:'🟣', cdiPct:100,  cdiBase:true  },
  nubank_rdb:      { label:'Nubank RDB',      icon:'🟣', cdiPct:100,  cdiBase:true  },
  inter_cdb:       { label:'Banco Inter CDB', icon:'🟠', cdiPct:100,  cdiBase:true  },
  picpay:          { label:'PicPay',          icon:'💚', cdiPct:102,  cdiBase:true  },
  poupanca:        { label:'Poupança',        icon:'🏦', annualRate:6.17,  cdiBase:false },
  tesouro_selic:   { label:'Tesouro Selic',   icon:'🇧🇷', cdiPct:100, cdiBase:true  },
  tesouro_ipca:    { label:'Tesouro IPCA+',   icon:'🇧🇷', annualRate:5.5, cdiBase:false, plusInflation:true },
  cdb_100cdi:      { label:'CDB 100% CDI',    icon:'📊', cdiPct:100,  cdiBase:true  },
  cdb_110cdi:      { label:'CDB 110% CDI',    icon:'📊', cdiPct:110,  cdiBase:true  },
  lci_lca:         { label:'LCI / LCA',       icon:'🌾', cdiPct:92,   cdiBase:true  },
  fii:             { label:'FII',             icon:'🏢', annualRate:10, cdiBase:false },
  acoes:           { label:'Ações',           icon:'📈', annualRate:0,  cdiBase:false, variable:true },
  cripto:          { label:'Cripto',          icon:'🪙', annualRate:0,  cdiBase:false, variable:true },
  custom:          { label:'Personalizado',   icon:'⚙️', cdiBase:false },
};

const COLORS = ['#2EA043','#E3B341','#388BFD','#CF4545','#A371F7','#F78166','#39D353','#79C0FF','#2DBDBD','#FF9B54'];

// ─── STATE ────────────────────────────────────
let user  = null;
let state = { months:{}, currentMonth:'', investments:[], rates:{ cdi:10.50, selic:10.50 } };
let activeType = 'dia20';
let charts = {};

// ─── UTILS ────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
const fmtPct = v => `${(v||0).toFixed(2)}%`;

function hashPw(pw){
  let h=0;
  for(let i=0;i<pw.length;i++){h=Math.imul(31,h)+pw.charCodeAt(i)|0}
  return Math.abs(h).toString(36);
}

function toast(msg,ms=2800){
  const el=$('toast');
  el.textContent=msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t=setTimeout(()=>el.classList.remove('show'),ms);
}

// ─── INVESTMENT MATH ──────────────────────────
function calcInvestment(inv){
  const def = INV_TYPES[inv.type] || INV_TYPES.custom;
  const start = new Date(inv.date+'T12:00:00');
  const now   = new Date();
  const days  = Math.max(0, Math.floor((now - start)/(1000*60*60*24)));

  let annualRate; // effective annual rate
  if(def.variable){
    // For variable assets, use stored manual rate or 0
    annualRate = inv.manualRate || 0;
  } else if(def.cdiBase){
    const pct = inv.cdiPct != null ? inv.cdiPct : (def.cdiPct||100);
    annualRate = (state.rates.cdi || 10.50) * (pct/100);
  } else if(def.plusInflation){
    // IPCA+: use annualRate from def + fixed 5% inflation estimate
    annualRate = (def.annualRate||5.5) + 5.0;
  } else {
    annualRate = inv.annualRate != null ? inv.annualRate : (def.annualRate||0);
  }

  // Daily compounding
  const dailyRate = Math.pow(1 + annualRate/100, 1/252) - 1;
  const currentValue = inv.amount * Math.pow(1 + dailyRate, days);
  const yieldTotal   = currentValue - inv.amount;
  const todayYield   = currentValue - (inv.amount * Math.pow(1 + dailyRate, Math.max(0,days-1)));

  return { days, annualRate, dailyRate, currentValue, yieldTotal, todayYield };
}

// ─── AUTH ─────────────────────────────────────
function showAuth(){ $('authScreen').style.display='flex'; $('appScreen').style.display='none'; }
function showApp() { $('authScreen').style.display='none'; $('appScreen').style.display='flex'; }

function getUsers(){ try{return JSON.parse(localStorage.getItem('ft_users')||'{}')}catch{return{}} }
function saveUsers(u){ localStorage.setItem('ft_users',JSON.stringify(u)) }

function login(email,pw){
  const users=getUsers(); const u=users[email];
  if(!u||u.hash!==hashPw(pw)) return false;
  user={email,name:u.name}; localStorage.setItem('ft_sess',JSON.stringify(user)); return true;
}
function register(name,email,pw){
  const users=getUsers();
  if(users[email]) return 'Este e-mail já está cadastrado.';
  users[email]={name,hash:hashPw(pw)};
  saveUsers(users); user={email,name}; localStorage.setItem('ft_sess',JSON.stringify(user)); return true;
}
function logout(){ localStorage.removeItem('ft_sess'); user=null; state={months:{},currentMonth:'',investments:[],rates:{cdi:10.50,selic:10.50}}; showAuth(); $('loginError').textContent=''; $('loginEmail').value=''; $('loginPassword').value=''; }
function checkSession(){ try{ const s=localStorage.getItem('ft_sess'); if(s){user=JSON.parse(s);return true;} }catch{} return false; }

// ─── STATE STORAGE ────────────────────────────
function stateKey(){ return `ft_data2_${user.email}`; }

function loadState(){
  try{
    const s=localStorage.getItem(stateKey());
    state=s?JSON.parse(s):{months:{},currentMonth:'',investments:[],rates:{cdi:10.50,selic:10.50}};
    if(!state.investments) state.investments=[];
    if(!state.rates) state.rates={cdi:10.50,selic:10.50};
  }catch{state={months:{},currentMonth:'',investments:[],rates:{cdi:10.50,selic:10.50}}}
}

function saveState(){ localStorage.setItem(stateKey(),JSON.stringify(state)); }

function monthData(){
  if(!state.months[state.currentMonth])
    state.months[state.currentMonth]={incomes:[],expenses:[],goal:20,reserveAmt:0,reserveMonths:12};
  const d=state.months[state.currentMonth];
  if(!d.incomes) d.incomes=[];
  if(!d.reserveAmt) d.reserveAmt=0;
  if(!d.reserveMonths) d.reserveMonths=12;
  // migrate old single income
  if(typeof d.income==='number'){d.incomes=[{type:'dia20',label:'Salário (dia 20)',amount:d.income,wallet:'salary'}];delete d.income;}
  return d;
}

function totalIncomeBySalary(){ return monthData().incomes.filter(i=>i.wallet==='salary'||!i.wallet).reduce((s,i)=>s+i.amount,0); }
function totalIncomeByVoucher(){ return monthData().incomes.filter(i=>i.wallet==='voucher').reduce((s,i)=>s+i.amount,0); }
function totalIncomeByRefe(){ return monthData().incomes.filter(i=>i.wallet==='refeicao').reduce((s,i)=>s+i.amount,0); }
function totalIncome(){ return monthData().incomes.reduce((s,i)=>s+i.amount,0); }

function totalExpensesByWallet(wallet){ return monthData().expenses.filter(e=>e.wallet===wallet).reduce((s,e)=>s+e.amount,0); }
function totalExpenses(){ return monthData().expenses.reduce((s,e)=>s+e.amount,0); }

// ─── MONTH NAV ────────────────────────────────
function setMonth(date){
  const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,'0');
  state.currentMonth=`${y}-${m}`;
  const d=new Date(y,m-1,1);
  const label=d.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  $('monthLabel').textContent=label.charAt(0).toUpperCase()+label.slice(1);
  renderAll();
}

// ─── NAV TABS ─────────────────────────────────
function switchTab(tab){
  ['dashboard','despesas','investimentos','relatorio'].forEach(t=>{
    $(`tab-${t}`).style.display=t===tab?'block':'none';
  });
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('active');
  const titles={
    dashboard:    ['Dashboard','Visão geral das suas finanças'],
    despesas:     ['Despesas','Registre e gerencie seus gastos'],
    investimentos:['Investimentos','Acompanhe seus rendimentos'],
    relatorio:    ['Relatório','Análise detalhada do período'],
  };
  $('pageTitle').textContent=titles[tab][0];
  $('pageSub').textContent  =titles[tab][1];
  if(tab==='relatorio')    renderReport();
  if(tab==='despesas')     renderFullList();
  if(tab==='investimentos') renderInvestments();
}

// ─── INCOME TYPE UI ───────────────────────────
function setIncomeType(type){
  activeType=type;
  document.querySelectorAll('.it-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
  $('voucherSalField').style.display  = type==='vale'?'':'none';
  $('voucherRefeField').style.display = type==='vale'?'':'none';
  $('customDayField').style.display   = type==='custom'?'':'none';
  const labels={dia20:'Salário (R$)',vale:'Salário (R$)',custom:'Salário (R$)'};
  $('mainIncomeLabel').textContent=labels[type];
}

// ─── RENDER ALL ───────────────────────────────
function renderAll(){
  renderStrip();
  renderIncomeBadges();
  renderWallets();
  renderGoal();
  renderSavingsRate();
  renderDonut();
  renderLine();
  renderDashTable();
}

// ─── BALANCE STRIP ────────────────────────────
function renderStrip(){
  const salaryIn  = totalIncomeBySalary();
  const voucherIn = totalIncomeByVoucher();
  const refeIn    = totalIncomeByRefe();
  const exp       = totalExpenses();
  const totalIn   = totalIncome();
  const saved     = totalIn - exp;
  const forecast  = calcForecast();
  const invested  = state.investments.reduce((s,inv)=>s+calcInvestment(inv).currentValue,0);

  $('balanceTop').textContent = fmt(saved+invested);
  $('balanceTop').style.color = (saved+invested)>=0?'var(--text)':'var(--red-l)';
  $('stripIn').textContent      = fmt(salaryIn);
  $('stripVoucher').textContent = fmt(voucherIn+refeIn);
  $('stripOut').textContent     = fmt(exp);
  $('stripInvested').textContent= fmt(invested);
  $('stripForecast').textContent= fmt(forecast);
}

function calcForecast(){
  const d=monthData(); const inc=totalIncome(); const exp=totalExpenses();
  if(!inc) return 0;
  const payIncome=d.incomes.find(i=>i.type==='dia20'||i.type==='custom');
  let payDay=20;
  if(payIncome?.type==='custom') payDay=d.customDay||20;
  const now=new Date(); const [y,m]=state.currentMonth.split('-').map(Number);
  const nextPay=new Date(y,m-1,payDay);
  if(nextPay<=now) nextPay.setMonth(nextPay.getMonth()+1);
  const daysLeft=Math.max(1,Math.ceil((nextPay-now)/(1000*60*60*24)));
  const dailySpend=exp/(now.getDate()||1);
  return (inc-exp)-dailySpend*daysLeft;
}

// ─── INCOME BADGES ────────────────────────────
function renderIncomeBadges(){
  const {incomes}=monthData();
  $('incomeBadges').innerHTML=incomes.map(i=>{
    const cls = i.wallet==='voucher'?'badge--voucher':i.wallet==='refeicao'?'badge--refe':'';
    return `<span class="badge ${cls}">${i.label}: ${fmt(i.amount)}</span>`;
  }).join('');
}

// ─── WALLET BALANCES ──────────────────────────
function renderWallets(){
  const salaryBal  = totalIncomeBySalary()  - totalExpensesByWallet('salary');
  const voucherBal = totalIncomeByVoucher() - totalExpensesByWallet('voucher');
  const refeBal    = totalIncomeByRefe()    - totalExpensesByWallet('refeicao');
  $('walletSalaryBal').textContent  = fmt(salaryBal);
  $('walletVoucherBal').textContent = fmt(voucherBal);
  $('walletRefeBal').textContent    = fmt(refeBal);
}

// ─── GOAL / RESERVE ───────────────────────────
function renderGoal(){
  const d=monthData(); const {reserveAmt,reserveMonths}=d;
  if($('goalAmount').value==='') $('goalAmount').value=reserveAmt||'';
  if($('goalMonths').value==='') $('goalMonths').value=reserveMonths||12;
  if(!reserveAmt){ $('reserveBar').style.width='0%'; $('reserveCaption').textContent='Defina sua meta acima.'; $('reservePct').textContent='0%'; return; }
  const monthlyNeed=reserveAmt/reserveMonths;
  const totalSaved=Object.values(state.months).reduce((s,md)=>{
    const inc=(md.incomes||[]).reduce((a,i)=>a+i.amount,0)+(md.income||0);
    const exp=(md.expenses||[]).reduce((a,e)=>a+e.amount,0);
    return s+Math.max(0,inc-exp);
  },0);
  const pct=Math.min(100,(totalSaved/reserveAmt)*100);
  $('reserveBar').style.width=`${pct}%`;
  $('reservePct').textContent=`${pct.toFixed(1)}%`;
  const remaining=Math.max(0,reserveAmt-totalSaved);
  $('reserveCaption').textContent=pct>=100
    ?`🎉 Meta atingida! Você juntou ${fmt(totalSaved)}.`
    :`Guardado: ${fmt(totalSaved)} de ${fmt(reserveAmt)} — faltam ${fmt(remaining)}. Meta mensal sugerida: ${fmt(monthlyNeed)}.`;
}

function renderSavingsRate(){
  const d=monthData(); const goal=d.goal??20; const inc=totalIncome(); const saved=inc-totalExpenses();
  const rate=inc>0?(saved/inc)*100:0;
  const pct=inc>0&&goal>0?Math.min(100,Math.max(0,(rate/goal)*100)):0;
  if($('goalPct').value==='') $('goalPct').value=goal;
  $('savingsPctBar').style.width=`${pct}%`;
  let cap='';
  if(!inc)            cap='Defina sua renda para ver a meta.';
  else if(rate<0)     cap=`⚠️ Gastos superam a renda em ${fmt(Math.abs(saved))}.`;
  else if(rate>=goal) cap=`🎉 Meta atingida! Guardando ${rate.toFixed(1)}% (meta: ${goal}%).`;
  else                cap=`Guardando ${rate.toFixed(1)}% de ${goal}%. Faltam ${fmt((goal/100)*inc-saved)}.`;
  $('savingsPctCaption').textContent=cap;
}

// ─── DONUT ────────────────────────────────────
function renderDonut(){
  const {expenses}=monthData();
  const byC=groupByCat(expenses);
  const labels=Object.keys(byC), values=labels.map(l=>byC[l]);
  const total=values.reduce((a,b)=>a+b,0);
  $('donutTotal').textContent=fmt(total);
  const ctx=$('donutChart').getContext('2d');
  if(charts.donut){charts.donut.destroy();charts.donut=null;}
  if(!labels.length) return;
  charts.donut=new Chart(ctx,{
    type:'doughnut',
    data:{labels,datasets:[{data:values,backgroundColor:COLORS.slice(0,labels.length),borderColor:'#161B22',borderWidth:3,hoverOffset:8}]},
    options:{cutout:'72%',plugins:{
      legend:{position:'bottom',labels:{color:'#8B949E',font:{size:11,family:'Inter'},boxWidth:10,padding:12}},
      tooltip:{callbacks:{label:c=>` ${fmt(c.raw)} (${((c.raw/total)*100).toFixed(1)}%)`}}
    }}
  });
}

// ─── LINE ─────────────────────────────────────
function renderLine(){
  const months=[],incs=[],exps=[],savs=[];
  for(let i=5;i>=0;i--){
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const md=state.months[key]||{incomes:[],expenses:[]};
    const inc=(md.incomes||[]).reduce((s,x)=>s+x.amount,0)+(md.income||0);
    const exp=(md.expenses||[]).reduce((s,x)=>s+x.amount,0);
    months.push(d.toLocaleDateString('pt-BR',{month:'short'}));
    incs.push(inc); exps.push(exp); savs.push(inc-exp);
  }
  const ctx=$('lineChart').getContext('2d');
  if(charts.line){charts.line.destroy();charts.line=null;}
  charts.line=new Chart(ctx,{
    type:'line',
    data:{labels:months,datasets:[
      {label:'Renda',    data:incs,borderColor:'#2EA043',tension:.4,fill:false,pointRadius:4},
      {label:'Despesas', data:exps,borderColor:'#CF4545',tension:.4,fill:false,pointRadius:4},
      {label:'Economia', data:savs,borderColor:'#E3B341',backgroundColor:'rgba(227,179,65,.08)',tension:.4,fill:true,pointRadius:4},
    ]},
    options:{
      plugins:{legend:{labels:{color:'#8B949E',font:{size:11,family:'Inter'},boxWidth:12}},tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}}},
      scales:{
        x:{ticks:{color:'#8B949E',font:{size:11}},grid:{color:'#2A303B'}},
        y:{ticks:{color:'#8B949E',font:{size:11},callback:v=>'R$'+(v>=1000?(v/1000).toFixed(1)+'k':v)},grid:{color:'#2A303B'}}
      }
    }
  });
}

// ─── DASH TABLE ───────────────────────────────
function renderDashTable(){
  const {expenses}=monthData();
  const sorted=[...expenses].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total=expenses.reduce((s,e)=>s+e.amount,0);
  $('dashCount').textContent=`${expenses.length} lançamento${expenses.length!==1?'s':''}`;
  $('dashTotal').textContent=fmt(total);
  const tbody=$('dashTableBody');
  if(!sorted.length){ tbody.innerHTML=`<tr><td colspan="5" class="empty">Nenhuma despesa registrada.</td></tr>`; return; }
  tbody.innerHTML=sorted.map(e=>{
    const icon=CAT_ICONS[e.category]||'📦';
    const ds=e.date?new Date(e.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):'—';
    const w=e.wallet||'salary';
    const wlabel=WALLET_LABELS[w]||w;
    return `<tr>
      <td>${e.desc}</td>
      <td><span class="td-cat">${icon} ${e.category}</span></td>
      <td><span class="td-wallet td-wallet--${w}">${wlabel}</span></td>
      <td>${ds}</td>
      <td class="ar td-amt">- ${fmt(e.amount)}</td>
    </tr>`;
  }).join('');
}

// ─── FULL EXPENSE LIST ────────────────────────
function renderFullList(){
  const {expenses}=monthData();
  const q   =$('searchInput').value.toLowerCase();
  const cat =$('filterCat').value;
  const wal =$('filterWallet').value;
  const filtered=expenses
    .filter(e=>(!q||e.desc.toLowerCase().includes(q)||e.category.toLowerCase().includes(q))&&(!cat||e.category===cat)&&(!wal||e.wallet===wal))
    .sort((a,b)=>new Date(b.date)-new Date(a.date));
  const list=$('fullList');
  list.innerHTML=filtered.length ? filtered.map(expHTML).join('') : '<li class="empty">Nenhuma despesa encontrada.</li>';
  list.querySelectorAll('.btn-del').forEach(btn=>btn.addEventListener('click',()=>delExpense(btn.dataset.id)));
}

function expHTML(e){
  const icon=CAT_ICONS[e.category]||'📦';
  const ds=e.date?new Date(e.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'';
  const w=e.wallet||'salary'; const wlabel=WALLET_LABELS[w]||w;
  return `<li class="exp-item">
    <span class="exp-icon">${icon}</span>
    <div class="exp-info">
      <div class="exp-desc">${e.desc}</div>
      <div class="exp-meta">
        ${e.category} · ${ds}
        <span class="exp-wallet-dot exp-wallet-dot--${w}"></span>
        <span style="font-size:.7rem">${wlabel}</span>
      </div>
    </div>
    <div class="exp-right">
      <span class="exp-amt">- ${fmt(e.amount)}</span>
      <button class="btn-del" data-id="${e.id}" title="Remover">✕</button>
    </div>
  </li>`;
}

function delExpense(id){
  const d=monthData(); d.expenses=d.expenses.filter(e=>e.id!==id);
  saveState(); renderAll(); renderFullList(); toast('🗑️ Despesa removida.');
}

// ─── INVESTMENTS ──────────────────────────────
function renderInvestments(){
  const invs=state.investments;
  const list=$('investmentsList');

  // Portfolio summary
  let totalPrincipal=0, totalCurrent=0, totalToday=0;
  invs.forEach(inv=>{ const r=calcInvestment(inv); totalPrincipal+=inv.amount; totalCurrent+=r.currentValue; totalToday+=r.todayYield; });
  const totalYield=totalCurrent-totalPrincipal;
  $('psTotal').textContent    = fmt(totalPrincipal);
  $('psYield').textContent    = `+ ${fmt(totalYield)}`;
  $('psCurrent').textContent  = fmt(totalCurrent);
  $('psToday').textContent    = `+ ${fmt(totalToday)}`;

  if(!invs.length){ list.innerHTML=`<div class="inv-empty">Nenhum investimento cadastrado ainda.<br>Adicione acima para acompanhar seus rendimentos diariamente.</div>`; return; }

  list.innerHTML = invs.map((inv,idx)=>{
    const def=INV_TYPES[inv.type]||INV_TYPES.custom;
    const r=calcInvestment(inv);
    const yieldPct=(r.yieldTotal/inv.amount)*100;
    const rateLabel=def.cdiBase?`${inv.cdiPct||def.cdiPct||100}% do CDI (${fmtPct(r.annualRate)} a.a.)`:`${fmtPct(r.annualRate)} a.a.`;
    const variableNote=def.variable?'<span style="color:var(--gold);font-size:.7rem">⚠️ Variável — rendimento estimado</span>':'';
    return `<div class="inv-card">
      <div class="inv-card-header">
        <div class="inv-card-title">
          <span style="font-size:1.3rem">${def.icon}</span>
          <span class="inv-card-name">${inv.name}</span>
          <span class="inv-card-type">${def.label}</span>
        </div>
        <div class="inv-card-actions">
          ${variableNote}
          ${def.variable?`<input type="number" class="input-plain input-plain--xs" placeholder="% a.a." value="${inv.manualRate||''}" onchange="updateInvRate(${idx},this.value)" title="Taxa anual estimada" />`:''}
          <button class="btn-icon" onclick="delInvestment(${idx})" title="Remover">✕ Remover</button>
        </div>
      </div>
      <div class="inv-card-body">
        <div class="inv-stat"><span class="inv-stat-label">Inicial</span><span class="inv-stat-val">${fmt(inv.amount)}</span></div>
        <div class="inv-stat"><span class="inv-stat-label">Atual</span><span class="inv-stat-val inv-stat-val--green">${fmt(r.currentValue)}</span></div>
        <div class="inv-stat"><span class="inv-stat-label">Rendimento total</span><span class="inv-stat-val inv-stat-val--gold">+ ${fmt(r.yieldTotal)} (${fmtPct(yieldPct)})</span></div>
        <div class="inv-stat"><span class="inv-stat-label">Rendimento hoje</span><span class="inv-stat-val inv-stat-val--blue">+ ${fmt(r.todayYield)}</span></div>
      </div>
      <div class="inv-progress">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--muted)">
          <span>Taxa: ${rateLabel}</span>
          <span>${r.days} dias investido${r.days!==1?'s':''}</span>
        </div>
        <div class="inv-progress-bar"><div class="inv-progress-fill" style="width:${Math.min(100,yieldPct*20)}%"></div></div>
        <div class="inv-days">Início: ${new Date(inv.date+'T12:00:00').toLocaleDateString('pt-BR')}</div>
      </div>
    </div>`;
  }).join('');
}

function updateInvRate(idx, val){
  state.investments[idx].manualRate = parseFloat(val)||0;
  saveState(); renderInvestments();
}

function delInvestment(idx){
  if(!confirm('Remover este investimento?')) return;
  state.investments.splice(idx,1);
  saveState(); renderInvestments(); toast('🗑️ Investimento removido.');
  renderStrip();
}

// ─── REPORT ───────────────────────────────────
function renderReport(){
  const {expenses}=monthData();
  const inc=totalIncome(), exp=totalExpenses(), byC=groupByCat(expenses);

  // Wallet breakdown
  const salaryExp  =totalExpensesByWallet('salary');
  const voucherExp =totalExpensesByWallet('voucher');
  const refeExp    =totalExpensesByWallet('refeicao');
  $('reportWallets').innerHTML=`
    <div class="rw-card"><div class="rw-label">💵 Gasto — Salário</div><div class="rw-val" style="color:var(--green-l)">${fmt(salaryExp)}</div></div>
    <div class="rw-card"><div class="rw-label">🎫 Gasto — Voucher</div><div class="rw-val" style="color:var(--purple-l)">${fmt(voucherExp)}</div></div>
    <div class="rw-card"><div class="rw-label">🍽️ Gasto — Vale Refeição</div><div class="rw-val" style="color:var(--gold)">${fmt(refeExp)}</div></div>
  `;

  if(!expenses.length){
    ['rMax','rAvg','rCount','rTop'].forEach(id=>$(id).textContent='—');
    $('insightText').textContent='Adicione despesas para ver a análise.';
  } else {
    const max=Math.max(...expenses.map(e=>e.amount));
    const maxItem=expenses.find(e=>e.amount===max);
    $('rMax').textContent   =`${fmt(max)} — ${maxItem.desc}`;
    $('rAvg').textContent   =fmt(exp/expenses.length);
    $('rCount').textContent =`${expenses.length}`;
    const top=Object.entries(byC).sort((a,b)=>b[1]-a[1])[0];
    $('rTop').textContent   =top?`${CAT_ICONS[top[0]]||'📦'} ${top[0]}`:'—';
    renderInsight(inc,exp,byC,expenses);
  }
  renderBar(byC);
}

function renderInsight(inc,exp,byC,expenses){
  const saved=inc-exp, rate=inc>0?(saved/inc)*100:0, lines=[];
  if(!inc)          lines.push('Cadastre sua renda para análise completa.');
  else if(rate<0)   lines.push(`🚨 Gastos superam a renda em ${fmt(Math.abs(saved))}. Reveja o orçamento.`);
  else if(rate>=30) lines.push(`🌟 Excelente! Guardando ${rate.toFixed(1)}% — acima da média recomendada.`);
  else if(rate>=20) lines.push(`✅ Guardando ${rate.toFixed(1)}% — dentro da meta saudável de 20%.`);
  else              lines.push(`📈 Guardando ${rate.toFixed(1)}%. Reduza gastos para atingir 20%.`);
  const top=Object.entries(byC).sort((a,b)=>b[1]-a[1])[0];
  if(top) lines.push(`Maior categoria: ${top[0]} (${((top[1]/exp)*100).toFixed(0)}% das despesas).`);
  const avg=exp/expenses.length;
  const altos=expenses.filter(e=>e.amount>avg*2);
  if(altos.length) lines.push(`💡 ${altos.length} gasto(s) bem acima da média — verifique se são essenciais.`);
  // investment tip
  if(state.investments.length){
    const total=state.investments.reduce((s,inv)=>s+calcInvestment(inv).currentValue,0);
    lines.push(`📈 Patrimônio investido: ${fmt(total)}.`);
  }
  $('insightText').textContent=lines.join(' ');
}

function renderBar(byC){
  const ctx=$('barChart').getContext('2d');
  if(charts.bar){charts.bar.destroy();charts.bar=null;}
  const sorted=Object.entries(byC).sort((a,b)=>b[1]-a[1]);
  charts.bar=new Chart(ctx,{
    type:'bar',
    data:{labels:sorted.map(([k])=>`${CAT_ICONS[k]||'📦'} ${k}`),datasets:[{data:sorted.map(([,v])=>v),backgroundColor:COLORS.slice(0,sorted.length),borderRadius:6,borderSkipped:false}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt(c.raw)}`}}},
      scales:{
        x:{ticks:{color:'#8B949E',font:{size:11},callback:v=>'R$'+(v>=1000?(v/1000).toFixed(1)+'k':v)},grid:{color:'#2A303B'}},
        y:{ticks:{color:'#E6EDF3',font:{size:12}},grid:{display:false}}
      }
    }
  });
}

function groupByCat(expenses){ return expenses.reduce((a,e)=>{a[e.category]=(a[e.category]||0)+e.amount;return a},{}); }

// ─── BIND AUTH ────────────────────────────────
function bindAuth(){
  $('goRegister').onclick=()=>{ $('panelLogin').style.display='none'; $('panelRegister').style.display=''; };
  $('goLogin').onclick   =()=>{ $('panelRegister').style.display='none'; $('panelLogin').style.display=''; };
  document.querySelectorAll('.pw-toggle').forEach(btn=>{
    btn.onclick=()=>{ const inp=$(btn.dataset.target); inp.type=inp.type==='password'?'text':'password'; btn.textContent=inp.type==='password'?'👁':'🙈'; };
  });
  $('btnLogin').onclick=()=>{
    const email=$('loginEmail').value.trim().toLowerCase(), pw=$('loginPassword').value, err=$('loginError');
    err.textContent='';
    if(!email||!pw){err.textContent='Preencha todos os campos.';return;}
    if(login(email,pw)) bootApp(); else err.textContent='E-mail ou senha incorretos.';
  };
  [$('loginEmail'),$('loginPassword')].forEach(el=>el.addEventListener('keydown',e=>{if(e.key==='Enter')$('btnLogin').click();}));
  $('btnRegister').onclick=()=>{
    const name=$('regName').value.trim(), email=$('regEmail').value.trim().toLowerCase(), pw=$('regPassword').value, conf=$('regConfirm').value, err=$('regError');
    err.textContent='';
    if(!name||!email||!pw||!conf){err.textContent='Preencha todos os campos.';return;}
    if(!/\S+@\S+\.\S+/.test(email)){err.textContent='E-mail inválido.';return;}
    if(pw.length<6){err.textContent='Senha: mínimo 6 caracteres.';return;}
    if(pw!==conf){err.textContent='As senhas não coincidem.';return;}
    const result=register(name,email,pw);
    if(result===true){ bootApp(); toast(`👋 Bem-vindo(a), ${name}!`); } else { err.textContent=result; }
  };
}

// ─── BIND APP ─────────────────────────────────
function bindApp(){
  document.querySelectorAll('.nav-btn').forEach(btn=>{ btn.onclick=()=>{ if(btn.dataset.tab) switchTab(btn.dataset.tab); }; });

  $('prevMonth').onclick=()=>{ const [y,m]=state.currentMonth.split('-').map(Number); setMonth(new Date(y,m-2,1)); };
  $('nextMonth').onclick=()=>{ const [y,m]=state.currentMonth.split('-').map(Number); setMonth(new Date(y,m,1)); };

  $('btnLogout').onclick=()=>{ if(confirm('Deseja sair?')) logout(); };
  $('btnReset').onclick =()=>{ if(!confirm('Apagar todos os dados financeiros?')) return; state={months:{},currentMonth:'',investments:[],rates:{cdi:10.50,selic:10.50}}; saveState(); setMonth(new Date()); toast('🗑️ Dados resetados.'); };

  document.querySelectorAll('.it-btn').forEach(btn=>{ btn.onclick=()=>setIncomeType(btn.dataset.type); });

  $('btnSaveIncome').onclick=()=>{
    const amt=parseFloat($('incomeMain').value);
    if(!amt||amt<=0){toast('⚠️ Informe um valor válido.');return;}
    const d=monthData();
    if(activeType==='dia20'){
      d.incomes=d.incomes.filter(i=>i.type!=='dia20');
      d.incomes.push({type:'dia20',label:'Salário (dia 20)',amount:amt,wallet:'salary'});
    } else if(activeType==='vale'){
      const voucher=parseFloat($('incomeVoucher').value)||0;
      const refe   =parseFloat($('incomeVoucherRefe').value)||0;
      d.incomes=d.incomes.filter(i=>i.type!=='salario_main'&&i.type!=='voucher'&&i.type!=='refeicao');
      d.incomes.push({type:'salario_main',label:'Salário',amount:amt,wallet:'salary'});
      if(voucher>0) d.incomes.push({type:'voucher',label:'Voucher alimentação',amount:voucher,wallet:'voucher'});
      if(refe>0)    d.incomes.push({type:'refeicao',label:'Vale refeição',amount:refe,wallet:'refeicao'});
    } else {
      const day=parseInt($('incomeDay').value)||20;
      d.customDay=day;
      d.incomes=d.incomes.filter(i=>i.type!=='custom');
      d.incomes.push({type:'custom',label:`Salário (dia ${day})`,amount:amt,wallet:'salary'});
    }
    saveState(); renderAll();
    $('incomeMain').value=''; $('incomeVoucher').value=''; $('incomeVoucherRefe').value='';
    toast('✅ Renda salva!');
  };

  $('btnSaveGoal').onclick=()=>{
    const amt=parseFloat($('goalAmount').value)||0, mos=parseInt($('goalMonths').value)||12, d=monthData();
    d.reserveAmt=amt; d.reserveMonths=mos; saveState(); renderAll(); toast('🎯 Meta de reserva salva!');
  };

  $('goalPct').addEventListener('input',()=>{ monthData().goal=Math.min(100,Math.max(0,parseFloat($('goalPct').value)||0)); saveState(); renderSavingsRate(); });

  $('btnAdd').onclick=addExpense;
  $('searchInput').addEventListener('input',renderFullList);
  $('filterCat').addEventListener('change',renderFullList);
  $('filterWallet').addEventListener('change',renderFullList);

  // Investment form
  $('invType').addEventListener('change',()=>{
    const t=$('invType').value;
    const def=INV_TYPES[t]||{};
    $('invCustomRateField').style.display = t==='custom'?'':'none';
    $('invCdiPctField').style.display     = def.cdiBase?'':'none';
  });

  $('btnAddInvestment').onclick=addInvestment;

  // Rates
  $('btnSaveRates').onclick=()=>{
    state.rates.cdi  =parseFloat($('cdiRateInput').value)||10.50;
    state.rates.selic=parseFloat($('selicInput').value)||10.50;
    $('cdiRateLabel').textContent=`${state.rates.cdi}%`;
    $('selicLabel').textContent=`${state.rates.selic}%`;
    saveState(); renderInvestments(); toast('✅ Taxas atualizadas!');
  };
}

function addExpense(){
  const desc =$('expDesc').value.trim();
  const value=parseFloat($('expValue').value);
  const cat  =$('expCat').value;
  const wallet=$('expWallet').value;
  const date =$('expDate').value;
  if(!desc)         {toast('⚠️ Informe uma descrição.');return;}
  if(!value||value<=0){toast('⚠️ Informe um valor válido.');return;}
  if(!date)         {toast('⚠️ Informe uma data.');return;}
  monthData().expenses.push({id:Date.now().toString(),desc,amount:value,category:cat,wallet,date});
  saveState(); renderAll(); renderFullList();
  $('expDesc').value=''; $('expValue').value='';
  $('expDate').value=new Date().toISOString().split('T')[0];
  toast(`✅ "${desc}" adicionado!`);
}

function addInvestment(){
  const name  =$('invName').value.trim();
  const type  =$('invType').value;
  const amount=parseFloat($('invAmount').value);
  const date  =$('invDate').value;
  if(!name)          {toast('⚠️ Informe um nome.');return;}
  if(!amount||amount<=0){toast('⚠️ Informe o valor inicial.');return;}
  if(!date)          {toast('⚠️ Informe a data de início.');return;}

  const def=INV_TYPES[type]||{};
  const inv={id:Date.now().toString(),name,type,amount,date};
  if(def.cdiBase)   inv.cdiPct=parseFloat($('invCdiPct').value)||def.cdiPct||100;
  if(type==='custom') inv.annualRate=parseFloat($('invCustomRate').value)||0;
  if(def.variable)  inv.manualRate=0;

  state.investments.push(inv);
  saveState(); renderInvestments(); renderStrip();
  $('invName').value=''; $('invAmount').value=''; $('invDate').value=new Date().toISOString().split('T')[0];
  toast(`✅ "${name}" adicionado!`);
}

// ─── BOOT ─────────────────────────────────────
function bootApp(){
  loadState(); showApp();
  $('sidebarAvatar').textContent=user.name.charAt(0).toUpperCase();
  $('sidebarName').textContent  =user.name;
  ['incomeMain','incomeVoucher','incomeVoucherRefe','incomeDay','goalAmount','goalMonths','goalPct'].forEach(id=>{$(id).value='';});
  setIncomeType('dia20');
  $('expDate').value =new Date().toISOString().split('T')[0];
  $('invDate').value =new Date().toISOString().split('T')[0];
  $('cdiRateInput').value=state.rates?.cdi||10.50;
  $('selicInput').value  =state.rates?.selic||10.50;
  $('cdiRateLabel').textContent=`${state.rates?.cdi||10.50}%`;
  $('selicLabel').textContent  =`${state.rates?.selic||10.50}%`;
  setMonth(new Date()); switchTab('dashboard');
}

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  bindAuth(); bindApp();
  if(checkSession()) bootApp(); else showAuth();
});
