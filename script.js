/* ========================================
   FINTRACK — SCRIPT PRINCIPAL
   ======================================== */

// ---- STATE ----
let state = {
  months: {},      // { "2025-01": { income: 0, goal: 20, expenses: [] } }
  currentMonth: '', // "YYYY-MM"
};

const CATEGORY_ICONS = {
  Moradia: '🏠', Alimentação: '🍽️', Transporte: '🚗',
  Saúde: '❤️', Educação: '📚', Lazer: '🎮',
  Roupas: '👕', Outros: '📦',
};

const CHART_COLORS = [
  '#2EA043','#E3B341','#388BFD','#CF4545',
  '#A371F7','#F78166','#39D353','#79C0FF',
];

let donutChart, lineChart, barChart;

// ---- INIT ----
function init() {
  loadState();
  setCurrentMonth(new Date());
  bindNav();
  bindDashboard();
  bindDespesas();
  setDefaultDate();
}

function loadState() {
  try {
    const saved = localStorage.getItem('fintrack_state');
    if (saved) state = JSON.parse(saved);
  } catch (e) {}
}

function saveState() {
  localStorage.setItem('fintrack_state', JSON.stringify(state));
}

function getCurrentData() {
  if (!state.months[state.currentMonth]) {
    state.months[state.currentMonth] = { income: 0, goal: 20, expenses: [] };
  }
  return state.months[state.currentMonth];
}

// ---- MONTH NAVIGATION ----
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

function prevMonth() {
  const [y, m] = state.currentMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  setCurrentMonth(d);
}

function nextMonth() {
  const [y, m] = state.currentMonth.split('-').map(Number);
  const d = new Date(y, m, 1);
  setCurrentMonth(d);
}

// ---- NAV ----
function bindNav() {
  document.querySelectorAll('.nav-btn, .btn-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      switchTab(tab);
    });
  });

  document.getElementById('prevMonth').addEventListener('click', prevMonth);
  document.getElementById('nextMonth').addEventListener('click', nextMonth);
  document.getElementById('btnReset').addEventListener('click', resetData);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Visão geral das suas finanças'],
    despesas:  ['Despesas', 'Registre e gerencie seus gastos'],
    relatorio: ['Relatório', 'Análise detalhada do período'],
  };
  document.getElementById('pageTitle').textContent = titles[tab][0];
  document.getElementById('pageSub').textContent   = titles[tab][1];

  if (tab === 'relatorio') renderReport();
  if (tab === 'despesas')  renderFullList();
}

// ---- DASHBOARD ----
function bindDashboard() {
  document.getElementById('btnSaveIncome').addEventListener('click', () => {
    const val = parseFloat(document.getElementById('incomeInput').value) || 0;
    getCurrentData().income = val;
    saveState();
    renderAll();
    showToast('✅ Renda atualizada!');
  });

  document.getElementById('goalInput').addEventListener('input', (e) => {
    const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
    getCurrentData().goal = val;
    saveState();
    renderProgress();
  });

  document.getElementById('btnGoToDespesas').addEventListener('click', () => switchTab('despesas'));
}

function renderAll() {
  const data = getCurrentData();
  // sync inputs
  document.getElementById('incomeInput').value = data.income || '';
  document.getElementById('goalInput').value   = data.goal ?? 20;

  renderKPIs();
  renderProgress();
  renderDonut();
  renderLine();
  renderRecentList();
}

function renderKPIs() {
  const { income, expenses } = getCurrentData();
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const balance  = income - totalExp;
  const rate     = income > 0 ? ((balance / income) * 100).toFixed(1) : 0;

  document.getElementById('kpiIncome').textContent  = formatCurrency(income);
  document.getElementById('kpiExpense').textContent = formatCurrency(totalExp);
  document.getElementById('kpiBalance').textContent = formatCurrency(balance);
  document.getElementById('kpiSaveRate').textContent = `${rate}%`;

  const balEl = document.getElementById('kpiBalance');
  balEl.style.color = balance >= 0 ? 'var(--green-lit)' : 'var(--red-lit)';

  const rateEl = document.getElementById('kpiSaveRate');
  rateEl.style.color = Number(rate) >= 20 ? 'var(--green-lit)' : Number(rate) >= 0 ? 'var(--gold)' : 'var(--red-lit)';
}

function renderProgress() {
  const { income, expenses, goal = 20 } = getCurrentData();
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const saved    = income - totalExp;
  const rate     = income > 0 ? (saved / income) * 100 : 0;
  const pct      = income > 0 ? Math.min(100, Math.max(0, (rate / goal) * 100)) : 0;

  document.getElementById('progressBar').style.width = `${pct}%`;

  let caption = '';
  if (income === 0) {
    caption = 'Defina sua renda para começar.';
  } else if (rate < 0) {
    caption = `⚠️ Você está no negativo em ${formatCurrency(Math.abs(saved))}. Revise seus gastos.`;
  } else if (rate >= goal) {
    caption = `🎉 Meta atingida! Você está guardando ${rate.toFixed(1)}% da renda (meta: ${goal}%).`;
  } else {
    const faltam = formatCurrency((goal / 100) * income - saved);
    caption = `Guardando ${rate.toFixed(1)}% de ${goal}% da meta. Faltam ${faltam} para atingi-la.`;
  }

  document.getElementById('progressCaption').textContent = caption;
}

// ---- DONUT CHART ----
function renderDonut() {
  const { expenses } = getCurrentData();
  const byCategory  = groupByCategory(expenses);
  const labels      = Object.keys(byCategory);
  const values      = labels.map(l => byCategory[l]);
  const total       = values.reduce((a, b) => a + b, 0);

  document.getElementById('donutTotal').textContent = formatCurrency(total);

  const ctx = document.getElementById('donutChart').getContext('2d');
  if (donutChart) donutChart.destroy();

  if (labels.length === 0) {
    donutChart = null;
    return;
  }

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
        legend: {
          position: 'bottom',
          labels: {
            color: '#8B949E',
            font: { size: 11, family: 'Inter' },
            boxWidth: 10,
            padding: 12,
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.raw)} (${((ctx.raw / total) * 100).toFixed(1)}%)`
          }
        }
      }
    }
  });
}

// ---- LINE CHART ----
function renderLine() {
  const ctx = document.getElementById('lineChart').getContext('2d');
  if (lineChart) lineChart.destroy();

  // last 6 months
  const months = [];
  const incomes = [];
  const exps    = [];
  const savings = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthData = state.months[key] || { income: 0, expenses: [] };
    const totalExp  = monthData.expenses.reduce((s, e) => s + e.amount, 0);
    months.push(d.toLocaleDateString('pt-BR', { month: 'short' }));
    incomes.push(monthData.income);
    exps.push(totalExp);
    savings.push(monthData.income - totalExp);
  }

  lineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Renda',
          data: incomes,
          borderColor: '#2EA043',
          backgroundColor: 'rgba(46,160,67,0.1)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Despesas',
          data: exps,
          borderColor: '#CF4545',
          backgroundColor: 'rgba(207,69,69,0.1)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'Economia',
          data: savings,
          borderColor: '#E3B341',
          backgroundColor: 'rgba(227,179,65,0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ]
    },
    options: {
      plugins: {
        legend: {
          labels: { color: '#8B949E', font: { size: 11, family: 'Inter' }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` }
        }
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

// ---- RECENT LIST ----
function renderRecentList() {
  const { expenses } = getCurrentData();
  const list  = document.getElementById('recentList');
  const items = [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  list.innerHTML = items.length
    ? items.map(e => expenseItemHTML(e)).join('')
    : '<li class="empty-state">Nenhuma despesa registrada ainda.</li>';

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteExpense(btn.dataset.id));
  });
}

// ---- DESPESAS TAB ----
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

  if (!desc)       return showToast('⚠️ Informe uma descrição.');
  if (!value || value <= 0) return showToast('⚠️ Informe um valor válido.');
  if (!date)       return showToast('⚠️ Informe uma data.');

  const expense = { id: Date.now().toString(), desc, amount: value, category: cat, date };
  getCurrentData().expenses.push(expense);
  saveState();
  renderAll();
  renderFullList();

  document.getElementById('expDesc').value  = '';
  document.getElementById('expValue').value = '';
  setDefaultDate();

  showToast(`✅ Despesa "${desc}" adicionada!`);
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
    const matchSearch = !search || e.desc.toLowerCase().includes(search) || e.category.toLowerCase().includes(search);
    const matchCat    = !cat || e.category === cat;
    return matchSearch && matchCat;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const list = document.getElementById('fullExpenseList');
  list.innerHTML = filtered.length
    ? filtered.map(e => expenseItemHTML(e)).join('')
    : '<li class="empty-state">Nenhuma despesa encontrada.</li>';

  list.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteExpense(btn.dataset.id));
  });
}

function expenseItemHTML(e) {
  const icon = CATEGORY_ICONS[e.category] || '📦';
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

// ---- REPORT ----
function renderReport() {
  const { income, expenses } = getCurrentData();
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = groupByCategory(expenses);

  // KPIs
  if (expenses.length === 0) {
    ['reportMax','reportAvg','reportCount','reportTopCat'].forEach(id => {
      document.getElementById(id).textContent = '—';
    });
    document.getElementById('insightText').textContent = 'Adicione despesas para ver a análise.';
  } else {
    const max = Math.max(...expenses.map(e => e.amount));
    const maxItem = expenses.find(e => e.amount === max);
    document.getElementById('reportMax').textContent = `${formatCurrency(max)} (${maxItem.desc})`;
    document.getElementById('reportAvg').textContent = formatCurrency(totalExp / expenses.length);
    document.getElementById('reportCount').textContent = `${expenses.length} lançamentos`;

    const topCat = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('reportTopCat').textContent = topCat
      ? `${CATEGORY_ICONS[topCat[0]]} ${topCat[0]} (${formatCurrency(topCat[1])})`
      : '—';

    renderInsight(income, totalExp, byCategory, expenses);
  }

  renderBarChart(byCategory);
}

function renderInsight(income, totalExp, byCategory, expenses) {
  const balance = income - totalExp;
  const rate    = income > 0 ? (balance / income) * 100 : 0;
  const lines   = [];

  if (income === 0) {
    lines.push('Cadastre sua renda mensal para uma análise completa.');
  } else if (rate < 0) {
    lines.push(`🚨 Seus gastos superam a renda em ${formatCurrency(Math.abs(balance))}. É hora de rever o orçamento.`);
  } else if (rate >= 30) {
    lines.push(`🌟 Excelente! Você está guardando ${rate.toFixed(1)}% da renda — muito acima da média recomendada.`);
  } else if (rate >= 20) {
    lines.push(`✅ Você está guardando ${rate.toFixed(1)}% da renda — dentro da meta saudável de 20%.`);
  } else if (rate > 0) {
    lines.push(`📈 Você guarda ${rate.toFixed(1)}% da renda. Tente reduzir gastos para atingir a meta de 20%.`);
  }

  const topCats = Object.entries(byCategory).sort((a,b) => b[1]-a[1]).slice(0,2);
  if (topCats.length > 0) {
    const pct = ((topCats[0][1] / totalExp) * 100).toFixed(0);
    lines.push(`Sua maior categoria é ${topCats[0][0]} (${pct}% das despesas).`);
  }

  if (expenses.length >= 3) {
    const avg = totalExp / expenses.length;
    const acimaDaMedia = expenses.filter(e => e.amount > avg * 2);
    if (acimaDaMedia.length > 0) {
      lines.push(`💡 ${acimaDaMedia.length} gasto(s) estão bem acima da sua média — verifique se são essenciais.`);
    }
  }

  document.getElementById('insightText').textContent = lines.join(' ');
}

function renderBarChart(byCategory) {
  const ctx = document.getElementById('barChart').getContext('2d');
  if (barChart) barChart.destroy();

  const sorted  = Object.entries(byCategory).sort((a,b) => b[1]-a[1]);
  const labels  = sorted.map(([k]) => `${CATEGORY_ICONS[k]} ${k}`);
  const values  = sorted.map(([,v]) => v);

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8B949E', font: { size: 11 }, callback: v => 'R$' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v) },
          grid: { color: '#2A303B' }
        },
        y: { ticks: { color: '#E6EDF3', font: { size: 12 } }, grid: { display: false } }
      }
    }
  });
}

// ---- HELPERS ----
function groupByCategory(expenses) {
  return expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
}

function formatCurrency(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function setDefaultDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expDate').value = today;
}

function showToast(msg, duration = 2800) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function resetData() {
  if (!confirm('Tem certeza? Todos os dados serão apagados.')) return;
  state = { months: {}, currentMonth: '' };
  localStorage.removeItem('fintrack_state');
  setCurrentMonth(new Date());
  showToast('🗑️ Dados resetados.');
}

// ---- START ----
document.addEventListener('DOMContentLoaded', init);
