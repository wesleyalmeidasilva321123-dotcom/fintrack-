/* ========================================
   FINTRACK — SCRIPT PRINCIPAL
   ======================================== */

// ─── STATE ───────────────────────────────
let currentUser = null; // { email, name, hash }

let state = {
  months: {},       // { "YYYY-MM": { incomes:[], goal:20, expenses:[] } }
  currentMonth: '',
};

const CATEGORY_ICONS = {
  Moradia:'🏠', Alimentação:'🍽️', Transporte:'🚗',
  Saúde:'❤️',  Educação:'📚',    Lazer:'🎮',
  Roupas:'👕',  Outros:'📦',
};

const CHART_COLORS = [
  '#2EA043','#E3B341','#388BFD','#CF4545',
  '#A371F7','#F78166','#39D353','#79C0FF',
];

let donutChart, lineChart, barChart;
let activeIncomeType = 'dia20';

// ─── UTILS ───────────────────────────────
function formatCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function hashPassword(pw) {
  // Simple hash (for localStorage-only auth — not production-grade)
  let hash = 0;
  for (let i = 0; i < pw.length; i++) {
    const c = pw.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return hash.toString(36);
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function setDefaultDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = today;
}

// ─── AUTH ────────────────────────────────
function getUsers() {
  try { return JSON.parse(localStorage.getItem('ft_users') || '{}'); } catch { return {}; }
}

function saveUsers(users) {
  localStorage.setItem('ft_users', JSON.stringify(users));
}

function loadSession() {
  try {
    const s = localStorage.getItem('ft_session');
    if (s) currentUser = JSON.parse(s);
  } catch {}
}

function saveSession() {
  localStorage.setItem('ft_session', JSON.stringify(currentUser));
}

function clearSession() {
  localStorage.removeItem('ft_session');
  currentUser = null;
}

function bindAuth() {
  // panel switches
  document.getElementById('goRegister').addEventListener('click', () => {
    document.getElementById('panelLogin').classList.add('hidden');
    document.getElementById('panelRegister').classList.remove('hidden');
  });
  document.getElementById('goLogin').addEventListener('click', () => {
    document.getElementById('panelRegister').classList.add('hidden');
    document.getElementById('panelLogin').classList.remove('hidden');
  });

  // password toggles
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.target);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });
  });

  // LOGIN
  document.getElementById('btnLogin').addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pw    = document.getElementById('loginPassword').value;
    const err   = document.getElementById('loginError');

    if (!email || !pw) { err.textContent = 'Preencha todos os campos.'; return; }

    const users = getUsers();
    const user  = users[email];
    if (!user || user.hash !== hashPassword(pw)) {
      err.textContent = 'E-mail ou senha incorretos.';
      return;
    }

    err.textContent = '';
    currentUser = { email, name: user.name };
    saveSession();
    bootApp();
  });

  // REGISTER
  document.getElementById('btnRegister').addEventListener('click', () => {
    const name  = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const pw    = document.getElementById('regPassword').value;
    const conf  = document.getElementById('regConfirm').value;
    const err   = document.getElementById('regError');

    if (!name || !email || !pw || !conf) { err.textContent = 'Preencha todos os campos.'; return; }
    if (!/\S+@\S+\.\S+/.test(email))     { err.textContent = 'E-mail inválido.'; return; }
    if (pw.length < 6)                    { err.textContent = 'Senha deve ter ao menos 6 caracteres.'; return; }
    if (pw !== conf)                      { err.textContent = 'As senhas não coincidem.'; return; }

    const users = getUsers();
    if (users[email]) { err.textContent = 'Este e-mail já está cadastrado.'; return; }

    users[email] = { name, hash: hashPassword(pw) };
    saveUsers(users);

    err.textContent = '';
    currentUser = { email, name };
    saveSession();
    bootApp();
    showToast(`👋 Bem-vindo(a), ${name}!`);
  });

  // LOGOUT
  document.getElementById('btnLogout').addEventListener('click', () => {
    if (!confirm('Deseja sair da sua conta?')) return;
    clearSession();
    location.reload();
  });

  // Enter key on login
  ['loginEmail','loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btnLogin').click();
    });
  });
}

// ─── BOOT ────────────────────────────────
function bootApp() {
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('appWrapper').classList.remove('hidden');

  // user info in sidebar
  document.getElementById('userName').textContent  = currentUser.name;
  document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();

  loadUserState();
  setCurrentMonth(new Date());
  bindNav();
  bindDashboard();
  bindDespesas();
  setDefaultDate();
}

// ─── USER STATE ──────────────────────────
function stateKey() { return `ft_data_${currentUser.email}`; }

function loadUserState() {
  try {
    const saved = localStorage.getItem(stateKey());
    if (saved) state = JSON.parse(saved);
    else state = { months: {}, currentMonth: '' };
  } catch { state = { months: {}, currentMonth: '' }; }
}

function saveState() {
  localStorage.setItem(stateKey(), JSON.stringify(state));
}

function getCurrentData() {
  if (!state.months[state.currentMonth]) {
    state.months[state.currentMonth] = { incomes: [], goal: 20, expenses: [] };
  }
  // migrate old format
  const d = state.months[state.currentMonth];
  if (typeof d.income === 'number') {
    d.incomes = [{ type: 'dia20', label: 'Salário (dia 20)', amount: d.income }];
    delete d.income;
  }
  if (!d.incomes) d.incomes = [];
  return d;
}

function getTotalIncome() {
  return getCurrentData().incomes.reduce((s, i) => s + i.amount, 0);
}

// ─── MONTH NAV ───────────────────────────
function setCurrentMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  state.currentMonth = `${y}-${m}`;
  renderMonthLabel();
  renderAll();
}

function renderMonthLabel() {
  const [y, m] = state.currentMonth.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('currentMonthLabel').textContent =
    label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── NAV ─────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
  document.getElementById('prevMonth').addEventListener('click', () => {
    const [y, m] = state.currentMonth.split('-').map(Number);
    setCurrentMonth(new Date(y, m - 2, 1));
  });
  document.getElementById('nextMonth').addEventListener('click', () => {
    const [y, m] = state.currentMonth.split('-').map(Number);
    setCurrentMonth(new Date(y, m, 1));
  });
  document.getElementById('btnReset').addEventListener('click', () => {
    if (!confirm('Apagar todos os dados financeiros?')) return;
    state = { months: {}, currentMonth: '' };
    saveState();
    setCurrentMonth(new Date());
    showToast('🗑️ Dados resetados.');
  });
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('active');

  const titles = {
    dashboard: ['Dashboard',  'Visão geral das suas finanças'],
    despesas:  ['Despesas',   'Registre e gerencie seus gastos'],
    relatorio: ['Relatório',  'Análise detalhada do período'],
  };
  document.getElementById('pageTitle').textContent = titles[tab][0];
  document.getElementById('pageSub').textContent   = titles[tab][1];

  if (tab === 'relatorio') renderReport();
  if (tab === 'despesas')  renderFullList();
}

// ─── DASHBOARD ───────────────────────────
function bindDashboard() {
  // income type buttons
  document.querySelectorAll('.income-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.income-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeIncomeType = btn.dataset.type;
      updateIncomeFormUI();
    });
  });

  document.getElementById('btnSaveIncome').addEventListener('click', saveIncome);

  document.getElementById('goalInput').addEventListener('input', e => {
    getCurrentData().goal = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
    saveState();
    renderProgress();
  });
}

function updateIncomeFormUI() {
  const labels = {
    dia20:  'Salário (dia 20)',
    vale:   'Salário principal',
    custom: 'Salário',
  };
  document.getElementById('incomeTypeLabel').textContent = labels[activeIncomeType];
  document.getElementById('customDateGroup').style.display = activeIncomeType === 'custom' ? '' : 'none';
  document.getElementById('valeValueGroup').style.display  = activeIncomeType === 'vale'   ? '' : 'none';
}

function saveIncome() {
  const amount = parseFloat(document.getElementById('incomeInput').value);
  if (!amount || amount <= 0) { showToast('⚠️ Informe um valor válido.'); return; }

  const data = getCurrentData();
  let label = '';
  let entries = [];

  if (activeIncomeType === 'dia20') {
    label = 'Salário (dia 20)';
    // remove previous dia20
    data.incomes = data.incomes.filter(i => i.type !== 'dia20');
    entries.push({ type: 'dia20', label, amount });

  } else if (activeIncomeType === 'vale') {
    const valeAmt = parseFloat(document.getElementById('valeInput').value) || 0;
    data.incomes = data.incomes.filter(i => i.type !== 'salario_main' && i.type !== 'vale');
    entries.push({ type: 'salario_main', label: 'Salário principal', amount });
    if (valeAmt > 0) entries.push({ type: 'vale', label: 'Vale alimentação/refeição', amount: valeAmt });

  } else if (activeIncomeType === 'custom') {
    const day = parseInt(document.getElementById('customDay').value) || '?';
    label = `Salário (dia ${day})`;
    data.incomes = data.incomes.filter(i => i.type !== 'custom');
    entries.push({ type: 'custom', label, amount });
  }

  entries.forEach(e => data.incomes.push(e));
  saveState();
  renderAll();
  showToast('✅ Renda atualizada!');
  document.getElementById('incomeInput').value = '';
  document.getElementById('valeInput').value   = '';
}

function renderAll() {
  const data = getCurrentData();
  document.getElementById('goalInput').value = data.goal ?? 20;
  renderIncomeBadges();
  renderKPIs();
  renderProgress();
  renderDonut();
  renderLine();
  renderDashTable();
}

function renderIncomeBadges() {
  const { incomes } = getCurrentData();
  const el = document.getElementById('incomeBadges');
  if (!incomes.length) { el.innerHTML = ''; return; }
  el.innerHTML = incomes.map(i =>
    `<span class="income-badge">${i.label}: ${formatCurrency(i.amount)}</span>`
  ).join('');
}

function renderKPIs() {
  const { expenses } = getCurrentData();
  const income   = getTotalIncome();
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const balance  = income - totalExp;
  const rate     = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

  document.getElementById('kpiIncome').textContent   = formatCurrency(income);
  document.getElementById('kpiExpense').textContent  = formatCurrency(totalExp);
  document.getElementById('kpiBalance').textContent  = formatCurrency(balance);
  document.getElementById('kpiSaveRate').textContent = `${rate}%`;

  document.getElementById('kpiBalance').style.color  = balance >= 0 ? 'var(--green-lit)' : 'var(--red-lit)';
  const r = Number(rate);
  document.getElementById('kpiSaveRate').style.color =
    r >= 20 ? 'var(--green-lit)' : r >= 0 ? 'var(--gold)' : 'var(--red-lit)';
}

function renderProgress() {
  const { expenses, goal = 20 } = getCurrentData();
  const income   = getTotalIncome();
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const saved    = income - totalExp;
  const rate     = income > 0 ? (saved / income) * 100 : 0;
  const pct      = income > 0 && goal > 0 ? Math.min(100, Math.max(0, (rate / goal) * 100)) : 0;

  document.getElementById('progressBar').style.width = `${pct}%`;

  let caption = '';
  if (income === 0)        caption = 'Defina sua renda para começar.';
  else if (rate < 0)       caption = `⚠️ Você está no negativo em ${formatCurrency(Math.abs(saved))}. Revise seus gastos.`;
  else if (rate >= goal)   caption = `🎉 Meta atingida! Guardando ${rate.toFixed(1)}% (meta: ${goal}%).`;
  else {
    const faltam = formatCurrency((goal / 100) * income - saved);
    caption = `Guardando ${rate.toFixed(1)}% de ${goal}% da meta. Faltam ${faltam}.`;
  }
  document.getElementById('progressCaption').textContent = caption;
}

// ─── DONUT ───────────────────────────────
function renderDonut() {
  const { expenses } = getCurrentData();
  const byCat  = groupByCategory(expenses);
  const labels = Object.keys(byCat);
  const values = labels.map(l => byCat[l]);
  const total  = values.reduce((a, b) => a + b, 0);

  document.getElementById('donutTotal').textContent = formatCurrency(total);

  const ctx = document.getElementById('donutChart').getContext('2d');
  if (donutChart) donutChart.destroy();
  if (!labels.length) return;

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderColor: '#161B22',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      cutout: '72%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8B949E', font: { size: 11, family: 'Inter' }, boxWidth: 10, padding: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)} (${((ctx.raw/total)*100).toFixed(1)}%)` } }
      }
    }
  });
}

// ─── LINE ────────────────────────────────
function renderLine() {
  const ctx = document.getElementById('lineChart').getContext('2d');
  if (lineChart) lineChart.destroy();

  const months = [], incomes = [], exps = [], savings = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const md  = state.months[key] || { incomes: [], expenses: [] };
    const inc = (md.incomes || []).reduce((s, x) => s + x.amount, 0) + (md.income || 0);
    const exp = (md.expenses || []).reduce((s, x) => s + x.amount, 0);
    months.push(d.toLocaleDateString('pt-BR', { month: 'short' }));
    incomes.push(inc);
    exps.push(exp);
    savings.push(inc - exp);
  }

  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        { label: 'Renda',     data: incomes,  borderColor: '#2EA043', tension: 0.4, fill: false, pointRadius: 4 },
        { label: 'Despesas',  data: exps,     borderColor: '#CF4545', tension: 0.4, fill: false, pointRadius: 4 },
        { label: 'Economia',  data: savings,  borderColor: '#E3B341', backgroundColor: 'rgba(227,179,65,0.08)', tension: 0.4, fill: true, pointRadius: 4 },
      ]
    },
    options: {
      plugins: {
        legend: { labels: { color: '#8B949E', font: { size: 11, family: 'Inter' }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: '#2A303B' } },
        y: {
          ticks: { color: '#8B949E', font: { size: 11 }, callback: v => 'R$' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v) },
          grid: { color: '#2A303B' }
        }
      }
    }
  });
}

// ─── DASHBOARD TABLE ─────────────────────
function renderDashTable() {
  const { expenses } = getCurrentData();
  const sorted = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  const total  = expenses.reduce((s, e) => s + e.amount, 0);

  document.getElementById('dashExpCount').textContent = `${expenses.length} lançamento${expenses.length !== 1 ? 's' : ''}`;
  document.getElementById('dashExpTotal').textContent = formatCurrency(total);

  const tbody = document.getElementById('dashExpTableBody');

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Nenhuma despesa registrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(e => {
    const icon    = CATEGORY_ICONS[e.category] || '📦';
    const dateStr = e.date
      ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    return `
      <tr>
        <td>${e.desc}</td>
        <td><span class="td-cat">${icon} ${e.category}</span></td>
        <td>${dateStr}</td>
        <td class="align-right td-amount">- ${formatCurrency(e.amount)}</td>
      </tr>`;
  }).join('');
}

// ─── DESPESAS TAB ────────────────────────
function bindDespesas() {
  document.getElementById('btnAddExpense').addEventListener('click', addExpense);
  document.getElementById('searchInput').addEventListener('input', renderFullList);
  document.getElementById('filterCategory').addEventListener('change', renderFullList);
}

function addExpense() {
  const desc  = document.getElementById('expDesc').value.trim();
  const value = parseFloat(document.getElementById('expValue').value);
  const cat   = document.getElementById('expCategory').value;
  const date  = document.getElementById('expDate').value;

  if (!desc)          { showToast('⚠️ Informe uma descrição.'); return; }
  if (!value || value <= 0) { showToast('⚠️ Informe um valor válido.'); return; }
  if (!date)          { showToast('⚠️ Informe uma data.'); return; }

  getCurrentData().expenses.push({ id: Date.now().toString(), desc, amount: value, category: cat, date });
  saveState();
  renderAll();
  renderFullList();

  document.getElementById('expDesc').value  = '';
  document.getElementById('expValue').value = '';
  setDefaultDate();
  showToast(`✅ "${desc}" adicionado!`);
}

function deleteExpense(id) {
  const data = getCurrentData();
  data.expenses = data.expenses.filter(e => e.id !== id);
  saveState();
  renderAll();
  renderFullList();
  showToast('🗑️ Despesa removida.');
}

function renderFullList() {
  const { expenses } = getCurrentData();
  const search = document.getElementById('searchInput').value.toLowerCase();
  const cat    = document.getElementById('filterCategory').value;

  const filtered = expenses.filter(e => {
    const ms = !search || e.desc.toLowerCase().includes(search) || e.category.toLowerCase().includes(search);
    const mc = !cat || e.category === cat;
    return ms && mc;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const list = document.getElementById('fullExpenseList');
  list.innerHTML = filtered.length
    ? filtered.map(expenseItemHTML).join('')
    : '<li class="empty-state">Nenhuma despesa encontrada.</li>';

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteExpense(btn.dataset.id));
  });
}

function expenseItemHTML(e) {
  const icon    = CATEGORY_ICONS[e.category] || '📦';
  const dateStr = e.date
    ? new Date(e.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : '';
  return `
    <li class="expense-item">
      <span class="expense-icon">${icon}</span>
      <div class="expense-info">
        <div class="expense-desc">${e.desc}</div>
        <div class="expense-meta">${e.category} · ${dateStr}</div>
      </div>
      <div class="expense-right">
        <span class="expense-amount">- ${formatCurrency(e.amount)}</span>
        <button class="btn-delete" data-id="${e.id}" title="Remover">✕</button>
      </div>
    </li>`;
}

// ─── REPORT ──────────────────────────────
function renderReport() {
  const { expenses } = getCurrentData();
  const income   = getTotalIncome();
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat    = groupByCategory(expenses);

  if (!expenses.length) {
    ['reportMax','reportAvg','reportCount','reportTopCat'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    document.getElementById('insightText').textContent = 'Adicione despesas para ver a análise.';
  } else {
    const max     = Math.max(...expenses.map(e => e.amount));
    const maxItem = expenses.find(e => e.amount === max);
    document.getElementById('reportMax').textContent     = `${formatCurrency(max)} — ${maxItem.desc}`;
    document.getElementById('reportAvg').textContent     = formatCurrency(totalExp / expenses.length);
    document.getElementById('reportCount').textContent   = `${expenses.length} lançamentos`;
    const topCat = Object.entries(byCat).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('reportTopCat').textContent  = topCat
      ? `${CATEGORY_ICONS[topCat[0]]} ${topCat[0]}`
      : '—';
    renderInsight(income, totalExp, byCat, expenses);
  }

  renderBarChart(byCat);
}

function renderInsight(income, totalExp, byCat, expenses) {
  const balance = income - totalExp;
  const rate    = income > 0 ? (balance / income) * 100 : 0;
  const lines   = [];

  if (income === 0)       lines.push('Cadastre sua renda para uma análise completa.');
  else if (rate < 0)      lines.push(`🚨 Seus gastos superam a renda em ${formatCurrency(Math.abs(balance))}. Reveja o orçamento.`);
  else if (rate >= 30)    lines.push(`🌟 Excelente! Guardando ${rate.toFixed(1)}% — acima da média recomendada.`);
  else if (rate >= 20)    lines.push(`✅ Guardando ${rate.toFixed(1)}% — dentro da meta saudável de 20%.`);
  else                    lines.push(`📈 Guardando ${rate.toFixed(1)}%. Tente reduzir gastos para atingir 20%.`);

  const top = Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  if (top) lines.push(`Sua maior categoria é ${top[0]} (${((top[1]/totalExp)*100).toFixed(0)}% das despesas).`);

  const avg = totalExp / expenses.length;
  const altos = expenses.filter(e => e.amount > avg * 2);
  if (altos.length) lines.push(`💡 ${altos.length} gasto(s) bem acima da média — verifique se são essenciais.`);

  document.getElementById('insightText').textContent = lines.join(' ');
}

function renderBarChart(byCat) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChart) barChart.destroy();

  const sorted = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const labels = sorted.map(([k]) => `${CATEGORY_ICONS[k]} ${k}`);
  const values = sorted.map(([,v]) => v);

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: CHART_COLORS.slice(0, labels.length), borderRadius: 6, borderSkipped: false }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` } }
      },
      scales: {
        x: { ticks: { color: '#8B949E', font: { size: 11 }, callback: v => 'R$'+(v>=1000?(v/1000).toFixed(1)+'k':v) }, grid: { color: '#2A303B' } },
        y: { ticks: { color: '#E6EDF3', font: { size: 12 } }, grid: { display: false } }
      }
    }
  });
}

// ─── HELPERS ─────────────────────────────
function groupByCategory(expenses) {
  return expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
}

// ─── INIT ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindAuth();
  loadSession();
  if (currentUser) {
    bootApp();
  }
  // default income type UI
  updateIncomeFormUI();
});
