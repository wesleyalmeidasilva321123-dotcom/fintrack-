'use strict';
/* =============================================
   FINTRACK — script.js
   ============================================= */

// ─── CONSTANTS ────────────────────────────────
const CAT_ICONS = {
  Moradia:'🏠', Alimentação:'🍽️', Transporte:'🚗',
  Saúde:'❤️',  Educação:'📚',    Lazer:'🎮',
  Roupas:'👕',  Outros:'📦',
};
const COLORS = ['#2EA043','#E3B341','#388BFD','#CF4545','#A371F7','#F78166','#39D353','#79C0FF'];

// ─── STATE ────────────────────────────────────
let user   = null;   // { email, name }
let state  = { months:{}, currentMonth:'' };
let activeType = 'dia20';
let charts = {};

// ─── UTILS ────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);

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

// ─── SHOW / HIDE SCREENS ──────────────────────
function showAuth(){
  $('authScreen').style.display='flex';
  $('appScreen').style.display='none';
}

function showApp(){
  $('authScreen').style.display='none';
  $('appScreen').style.display='flex';
}

// ─── AUTH ─────────────────────────────────────
function getUsers(){ try{return JSON.parse(localStorage.getItem('ft_users')||'{}')}catch{return{}} }
function saveUsers(u){ localStorage.setItem('ft_users',JSON.stringify(u)) }

function login(email,pw){
  const users=getUsers();
  const u=users[email];
  if(!u||u.hash!==hashPw(pw)) return false;
  user={email,name:u.name};
  localStorage.setItem('ft_sess',JSON.stringify(user));
  return true;
}

function register(name,email,pw){
  const users=getUsers();
  if(users[email]) return 'Este e-mail já está cadastrado.';
  users[email]={name,hash:hashPw(pw)};
  saveUsers(users);
  user={email,name};
  localStorage.setItem('ft_sess',JSON.stringify(user));
  return true;
}

function logout(){
  localStorage.removeItem('ft_sess');
  user=null;
  state={months:{},currentMonth:''};
  showAuth();
  // reset form errors
  $('loginError').textContent='';
  $('loginEmail').value='';
  $('loginPassword').value='';
}

function checkSession(){
  try{
    const s=localStorage.getItem('ft_sess');
    if(s){ user=JSON.parse(s); return true; }
  }catch{}
  return false;
}

// ─── STATE STORAGE ────────────────────────────
function stateKey(){ return `ft_data_${user.email}`; }

function loadState(){
  try{
    const s=localStorage.getItem(stateKey());
    state=s?JSON.parse(s):{months:{},currentMonth:''};
  }catch{state={months:{},currentMonth:''}}
}

function saveState(){ localStorage.setItem(stateKey(),JSON.stringify(state)); }

function monthData(){
  if(!state.months[state.currentMonth])
    state.months[state.currentMonth]={incomes:[],expenses:[],goal:20,reserveAmt:0,reserveMonths:12};
  const d=state.months[state.currentMonth];
  // migrate old format
  if(typeof d.income==='number'){d.incomes=[{type:'dia20',label:'Salário (dia 20)',amount:d.income}];delete d.income;}
  if(!d.incomes)d.incomes=[];
  if(!d.reserveAmt)d.reserveAmt=0;
  if(!d.reserveMonths)d.reserveMonths=12;
  return d;
}

function totalIncome(){return monthData().incomes.reduce((s,i)=>s+i.amount,0)}
function totalExpenses(){return monthData().expenses.reduce((s,e)=>s+e.amount,0)}

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
  ['dashboard','despesas','relatorio'].forEach(t=>{
    $(  `tab-${t}`).style.display=t===tab?'block':'none';
  });
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('active');

  const titles={
    dashboard:['Dashboard','Visão geral das suas finanças'],
    despesas: ['Despesas','Registre e gerencie seus gastos'],
    relatorio:['Relatório','Análise detalhada do período'],
  };
  $('pageTitle').textContent=titles[tab][0];
  $('pageSub').textContent  =titles[tab][1];

  if(tab==='relatorio') renderReport();
  if(tab==='despesas')  renderFullList();
}

// ─── INCOME TYPE UI ───────────────────────────
function setIncomeType(type){
  activeType=type;
  document.querySelectorAll('.it-btn').forEach(b=>b.classList.toggle('active',b.dataset.type===type));
  $('valeField').style.display     =type==='vale'?'':'none';
  $('customDayField').style.display=type==='custom'?'':'none';
  const labels={dia20:'Salário (R$)',vale:'Salário principal (R$)',custom:'Salário (R$)'};
  $('mainIncomeLabel').textContent=labels[type];
}

// ─── RENDER ALL ───────────────────────────────
function renderAll(){
  renderStrip();
  renderIncomeBadges();
  renderGoal();
  renderSavingsRate();
  renderDonut();
  renderLine();
  renderDashTable();
}

// ─── BALANCE STRIP ────────────────────────────
function renderStrip(){
  const income=totalIncome();
  const exp   =totalExpenses();
  const saved =income-exp;
  const forecast=calcForecast();

  $('balanceTop').textContent =fmt(saved);
  $('balanceTop').style.color =saved>=0?'var(--text)':'var(--red-l)';
  $('stripIn').textContent    =fmt(income);
  $('stripOut').textContent   =fmt(exp);
  $('stripSaved').textContent =fmt(Math.max(0,saved));
  $('stripForecast').textContent=fmt(forecast);
}

function calcForecast(){
  // estimate saldo at next pay date (using dia20 or custom day)
  const d  =monthData();
  const inc=totalIncome();
  const exp=totalExpenses();
  if(!inc) return 0;

  // find pay day
  const payIncome=d.incomes.find(i=>i.type==='dia20'||i.type==='custom');
  let payDay=20;
  if(payIncome?.type==='custom'){
    // try to find stored day
    payDay=d.customDay||20;
  }

  const now=new Date();
  const [y,m]=state.currentMonth.split('-').map(Number);
  const nextPay=new Date(y,m-1,payDay); // same month pay day

  // if pay day already passed this month, next is next month
  if(nextPay<=now) nextPay.setMonth(nextPay.getMonth()+1);

  const daysLeft=Math.max(1,Math.ceil((nextPay-now)/(1000*60*60*24)));
  const dailySpend=exp/(now.getDate()||1);
  const projectedExtraExp=dailySpend*daysLeft;

  return (inc-exp)-projectedExtraExp;
}

// ─── INCOME BADGES ────────────────────────────
function renderIncomeBadges(){
  const {incomes}=monthData();
  $('incomeBadges').innerHTML=incomes.map(i=>`<span class="badge">${i.label}: ${fmt(i.amount)}</span>`).join('');
}

// ─── GOAL / RESERVE ───────────────────────────
function renderGoal(){
  const d=monthData();
  const {reserveAmt,reserveMonths,incomes,expenses}=d;

  // sync inputs
  if($('goalAmount').value==='') $('goalAmount').value=reserveAmt||'';
  if($('goalMonths').value==='') $('goalMonths').value=reserveMonths||12;

  if(!reserveAmt){
    $('reserveBar').style.width='0%';
    $('reserveCaption').textContent='Defina sua meta acima.';
    $('reservePct').textContent='0%';
    return;
  }

  const monthlyNeed=reserveAmt/reserveMonths;
  const saved=Math.max(0,totalIncome()-totalExpenses());
  // accumulate across all months
  const totalSaved=Object.values(state.months).reduce((s,md)=>{
    const inc=(md.incomes||[]).reduce((a,i)=>a+i.amount,0)+(md.income||0);
    const exp=(md.expenses||[]).reduce((a,e)=>a+e.amount,0);
    return s+Math.max(0,inc-exp);
  },0);

  const pct=Math.min(100,(totalSaved/reserveAmt)*100);
  $('reserveBar').style.width=`${pct}%`;
  $('reservePct').textContent=`${pct.toFixed(1)}%`;

  const remaining=Math.max(0,reserveAmt-totalSaved);
  if(pct>=100){
    $('reserveCaption').textContent=`🎉 Meta atingida! Você juntou ${fmt(totalSaved)}.`;
  } else {
    $('reserveCaption').textContent=
      `Guardado: ${fmt(totalSaved)} de ${fmt(reserveAmt)} — faltam ${fmt(remaining)}. Meta mensal sugerida: ${fmt(monthlyNeed)}.`;
  }
}

function renderSavingsRate(){
  const d=monthData();
  const goal=d.goal??20;
  const inc=totalIncome();
  const saved=inc-totalExpenses();
  const rate=inc>0?(saved/inc)*100:0;
  const pct=inc>0&&goal>0?Math.min(100,Math.max(0,(rate/goal)*100)):0;

  if($('goalPct').value==='') $('goalPct').value=goal;
  $('savingsPctBar').style.width=`${pct}%`;

  let cap='';
  if(!inc)           cap='Defina sua renda para ver a meta.';
  else if(rate<0)    cap=`⚠️ Gastos superam a renda em ${fmt(Math.abs(saved))}.`;
  else if(rate>=goal)cap=`🎉 Meta atingida! Guardando ${rate.toFixed(1)}% (meta: ${goal}%).`;
  else               cap=`Guardando ${rate.toFixed(1)}% de ${goal}%. Faltam ${fmt((goal/100)*inc-saved)}.`;
  $('savingsPctCaption').textContent=cap;
}

// ─── DONUT CHART ──────────────────────────────
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

// ─── LINE CHART ───────────────────────────────
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
      {label:'Renda',   data:incs,borderColor:'#2EA043',tension:.4,fill:false,pointRadius:4},
      {label:'Despesas',data:exps,borderColor:'#CF4545',tension:.4,fill:false,pointRadius:4},
      {label:'Economia',data:savs,borderColor:'#E3B341',backgroundColor:'rgba(227,179,65,.08)',tension:.4,fill:true,pointRadius:4},
    ]},
    options:{
      plugins:{
        legend:{labels:{color:'#8B949E',font:{size:11,family:'Inter'},boxWidth:12}},
        tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmt(c.raw)}`}}
      },
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
  if(!sorted.length){
    tbody.innerHTML=`<tr><td colspan="4" class="empty">Nenhuma despesa registrada.</td></tr>`;
    return;
  }
  tbody.innerHTML=sorted.map(e=>{
    const icon=CAT_ICONS[e.category]||'📦';
    const ds=e.date?new Date(e.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):'—';
    return `<tr>
      <td>${e.desc}</td>
      <td><span class="td-cat">${icon} ${e.category}</span></td>
      <td>${ds}</td>
      <td class="ar td-amt">- ${fmt(e.amount)}</td>
    </tr>`;
  }).join('');
}

// ─── FULL EXPENSE LIST ────────────────────────
function renderFullList(){
  const {expenses}=monthData();
  const q=$('searchInput').value.toLowerCase();
  const cat=$('filterCat').value;
  const filtered=expenses
    .filter(e=>(!q||e.desc.toLowerCase().includes(q)||e.category.toLowerCase().includes(q))&&(!cat||e.category===cat))
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  const list=$('fullList');
  list.innerHTML=filtered.length
    ? filtered.map(expHTML).join('')
    : '<li class="empty">Nenhuma despesa encontrada.</li>';
  list.querySelectorAll('.btn-del').forEach(btn=>btn.addEventListener('click',()=>delExpense(btn.dataset.id)));
}

function expHTML(e){
  const icon=CAT_ICONS[e.category]||'📦';
  const ds=e.date?new Date(e.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'';
  return `<li class="exp-item">
    <span class="exp-icon">${icon}</span>
    <div class="exp-info">
      <div class="exp-desc">${e.desc}</div>
      <div class="exp-meta">${e.category} · ${ds}</div>
    </div>
    <div class="exp-right">
      <span class="exp-amt">- ${fmt(e.amount)}</span>
      <button class="btn-del" data-id="${e.id}" title="Remover">✕</button>
    </div>
  </li>`;
}

function delExpense(id){
  const d=monthData();
  d.expenses=d.expenses.filter(e=>e.id!==id);
  saveState(); renderAll(); renderFullList();
  toast('🗑️ Despesa removida.');
}

// ─── REPORT ───────────────────────────────────
function renderReport(){
  const {expenses}=monthData();
  const inc=totalIncome(), exp=totalExpenses(), byC=groupByCat(expenses);

  if(!expenses.length){
    ['rMax','rAvg','rCount','rTop'].forEach(id=>$(id).textContent='—');
    $('insightText').textContent='Adicione despesas para ver a análise.';
  } else {
    const max=Math.max(...expenses.map(e=>e.amount));
    const maxItem=expenses.find(e=>e.amount===max);
    $('rMax').textContent    =`${fmt(max)} — ${maxItem.desc}`;
    $('rAvg').textContent    =fmt(exp/expenses.length);
    $('rCount').textContent  =`${expenses.length}`;
    const top=Object.entries(byC).sort((a,b)=>b[1]-a[1])[0];
    $('rTop').textContent    =top?`${CAT_ICONS[top[0]]} ${top[0]}`:'—';
    renderInsight(inc,exp,byC,expenses);
  }
  renderBar(byC);
}

function renderInsight(inc,exp,byC,expenses){
  const saved=inc-exp, rate=inc>0?(saved/inc)*100:0, lines=[];
  if(!inc)        lines.push('Cadastre sua renda para análise completa.');
  else if(rate<0) lines.push(`🚨 Gastos superam a renda em ${fmt(Math.abs(saved))}. Reveja o orçamento.`);
  else if(rate>=30)lines.push(`🌟 Excelente! Guardando ${rate.toFixed(1)}% — acima da média recomendada.`);
  else if(rate>=20)lines.push(`✅ Guardando ${rate.toFixed(1)}% — dentro da meta saudável de 20%.`);
  else             lines.push(`📈 Guardando ${rate.toFixed(1)}%. Reduza gastos para atingir 20%.`);
  const top=Object.entries(byC).sort((a,b)=>b[1]-a[1])[0];
  if(top) lines.push(`Maior categoria: ${top[0]} (${((top[1]/exp)*100).toFixed(0)}% das despesas).`);
  const avg=exp/expenses.length;
  const altos=expenses.filter(e=>e.amount>avg*2);
  if(altos.length) lines.push(`💡 ${altos.length} gasto(s) bem acima da média — verifique se são essenciais.`);
  $('insightText').textContent=lines.join(' ');
}

function renderBar(byC){
  const ctx=$('barChart').getContext('2d');
  if(charts.bar){charts.bar.destroy();charts.bar=null;}
  const sorted=Object.entries(byC).sort((a,b)=>b[1]-a[1]);
  charts.bar=new Chart(ctx,{
    type:'bar',
    data:{labels:sorted.map(([k])=>`${CAT_ICONS[k]} ${k}`),datasets:[{data:sorted.map(([,v])=>v),backgroundColor:COLORS.slice(0,sorted.length),borderRadius:6,borderSkipped:false}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${fmt(c.raw)}`}}},
      scales:{
        x:{ticks:{color:'#8B949E',font:{size:11},callback:v=>'R$'+(v>=1000?(v/1000).toFixed(1)+'k':v)},grid:{color:'#2A303B'}},
        y:{ticks:{color:'#E6EDF3',font:{size:12}},grid:{display:false}}
      }
    }
  });
}

// ─── HELPER ───────────────────────────────────
function groupByCat(expenses){
  return expenses.reduce((a,e)=>{a[e.category]=(a[e.category]||0)+e.amount;return a},{});
}

// ─── BIND ALL EVENTS ──────────────────────────
function bindAuth(){
  // panel switch
  $('goRegister').onclick=()=>{ $('panelLogin').style.display='none'; $('panelRegister').style.display=''; };
  $('goLogin').onclick   =()=>{ $('panelRegister').style.display='none'; $('panelLogin').style.display=''; };

  // password toggles
  document.querySelectorAll('.pw-toggle').forEach(btn=>{
    btn.onclick=()=>{
      const inp=$(btn.dataset.target);
      inp.type=inp.type==='password'?'text':'password';
      btn.textContent=inp.type==='password'?'👁':'🙈';
    };
  });

  // LOGIN
  $('btnLogin').onclick=()=>{
    const email=$('loginEmail').value.trim().toLowerCase();
    const pw   =$('loginPassword').value;
    const err  =$('loginError');
    err.textContent='';
    if(!email||!pw){err.textContent='Preencha todos os campos.';return;}
    if(login(email,pw)){
      bootApp();
    } else {
      err.textContent='E-mail ou senha incorretos.';
    }
  };

  // enter key on login
  [$('loginEmail'),$('loginPassword')].forEach(el=>{
    el.addEventListener('keydown',e=>{ if(e.key==='Enter') $('btnLogin').click(); });
  });

  // REGISTER
  $('btnRegister').onclick=()=>{
    const name =$('regName').value.trim();
    const email=$('regEmail').value.trim().toLowerCase();
    const pw   =$('regPassword').value;
    const conf =$('regConfirm').value;
    const err  =$('regError');
    err.textContent='';
    if(!name||!email||!pw||!conf){err.textContent='Preencha todos os campos.';return;}
    if(!/\S+@\S+\.\S+/.test(email)){err.textContent='E-mail inválido.';return;}
    if(pw.length<6){err.textContent='Senha: mínimo 6 caracteres.';return;}
    if(pw!==conf){err.textContent='As senhas não coincidem.';return;}
    const result=register(name,email,pw);
    if(result===true){
      bootApp();
      toast(`👋 Bem-vindo(a), ${name}!`);
    } else {
      err.textContent=result;
    }
  };
}

function bindApp(){
  // nav tabs
  document.querySelectorAll('.nav-btn').forEach(btn=>{
    btn.onclick=()=>{ if(btn.dataset.tab) switchTab(btn.dataset.tab); };
  });

  // month nav
  $('prevMonth').onclick=()=>{
    const [y,m]=state.currentMonth.split('-').map(Number);
    setMonth(new Date(y,m-2,1));
  };
  $('nextMonth').onclick=()=>{
    const [y,m]=state.currentMonth.split('-').map(Number);
    setMonth(new Date(y,m,1));
  };

  // logout & reset
  $('btnLogout').onclick=()=>{ if(confirm('Deseja sair?')) logout(); };
  $('btnReset').onclick =()=>{
    if(!confirm('Apagar todos os dados financeiros?')) return;
    state={months:{},currentMonth:''};
    saveState(); setMonth(new Date());
    toast('🗑️ Dados resetados.');
  };

  // income types
  document.querySelectorAll('.it-btn').forEach(btn=>{
    btn.onclick=()=>setIncomeType(btn.dataset.type);
  });

  // save income
  $('btnSaveIncome').onclick=()=>{
    const amt=parseFloat($('incomeMain').value);
    if(!amt||amt<=0){toast('⚠️ Informe um valor válido.');return;}
    const d=monthData();

    if(activeType==='dia20'){
      d.incomes=d.incomes.filter(i=>i.type!=='dia20');
      d.incomes.push({type:'dia20',label:'Salário (dia 20)',amount:amt});
    } else if(activeType==='vale'){
      const vale=parseFloat($('incomeVale').value)||0;
      d.incomes=d.incomes.filter(i=>i.type!=='salario_main'&&i.type!=='vale');
      d.incomes.push({type:'salario_main',label:'Salário principal',amount:amt});
      if(vale>0) d.incomes.push({type:'vale',label:'Vale alimentação',amount:vale});
    } else {
      const day=parseInt($('incomeDay').value)||20;
      d.customDay=day;
      d.incomes=d.incomes.filter(i=>i.type!=='custom');
      d.incomes.push({type:'custom',label:`Salário (dia ${day})`,amount:amt});
    }
    saveState(); renderAll();
    $('incomeMain').value=''; $('incomeVale').value='';
    toast('✅ Renda salva!');
  };

  // save reserve goal
  $('btnSaveGoal').onclick=()=>{
    const amt=parseFloat($('goalAmount').value)||0;
    const mos=parseInt($('goalMonths').value)||12;
    const d=monthData();
    d.reserveAmt=amt; d.reserveMonths=mos;
    saveState(); renderAll();
    toast('🎯 Meta de reserva salva!');
  };

  // savings rate
  $('goalPct').addEventListener('input',()=>{
    monthData().goal=Math.min(100,Math.max(0,parseFloat($('goalPct').value)||0));
    saveState(); renderSavingsRate();
  });

  // add expense
  $('btnAdd').onclick=addExpense;

  // search / filter
  $('searchInput').addEventListener('input',renderFullList);
  $('filterCat').addEventListener('change',renderFullList);
}

function addExpense(){
  const desc =$('expDesc').value.trim();
  const value=parseFloat($('expValue').value);
  const cat  =$('expCat').value;
  const date =$('expDate').value;
  if(!desc)        {toast('⚠️ Informe uma descrição.');return;}
  if(!value||value<=0){toast('⚠️ Informe um valor válido.');return;}
  if(!date)        {toast('⚠️ Informe uma data.');return;}

  monthData().expenses.push({id:Date.now().toString(),desc,amount:value,category:cat,date});
  saveState(); renderAll(); renderFullList();
  $('expDesc').value=''; $('expValue').value='';
  $('expDate').value=new Date().toISOString().split('T')[0];
  toast(`✅ "${desc}" adicionado!`);
}

// ─── BOOT APP ─────────────────────────────────
function bootApp(){
  loadState();
  showApp();

  // sidebar user info
  $('sidebarAvatar').textContent=user.name.charAt(0).toUpperCase();
  $('sidebarName').textContent  =user.name;

  // reset income inputs
  $('incomeMain').value='';
  $('incomeVale').value='';
  $('incomeDay').value='';
  $('goalAmount').value='';
  $('goalMonths').value='';
  $('goalPct').value='';

  // reset income type UI
  setIncomeType('dia20');

  // default expense date
  $('expDate').value=new Date().toISOString().split('T')[0];

  setMonth(new Date());
  switchTab('dashboard');
}

// ─── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  bindAuth();
  bindApp();
  if(checkSession()){
    bootApp();
  } else {
    showAuth();
  }
});
