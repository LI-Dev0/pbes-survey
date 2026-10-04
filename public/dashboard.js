const ctx = document.getElementById('categoryChart').getContext('2d');
let chart = null;
let currentFilters = {};

function toArrayFromSelect(selectElement) {
  return Array.from(selectElement.selectedOptions).map(o => o.value);
}

function buildFilterParams() {
  const params = new URLSearchParams();
  
  const analyzeBy = document.getElementById('analyzeBySelect').value;
  params.append('analyzeBy', analyzeBy);

  const reportingCurrency = document.getElementById('reportingCurrency').value;
  params.append('reportingCurrency', reportingCurrency);

  const fuelVals = toArrayFromSelect(document.getElementById('currentFuelFilter'));
  if (fuelVals.length > 0) params.append('currentFuel', fuelVals.join(','));

  const interestVals = toArrayFromSelect(document.getElementById('interestFilter'));
  if (interestVals.length > 0) params.append('interest', interestVals.join(','));

  const budgetVals = toArrayFromSelect(document.getElementById('budgetFilter'));
  if (budgetVals.length > 0) params.append('budget', budgetVals.join(','));

  const minSpend = document.getElementById('minSpend').value;
  if (minSpend) params.append('minMonthlySpend', minSpend);

  const maxSpend = document.getElementById('maxSpend').value;
  if (maxSpend) params.append('maxMonthlySpend', maxSpend);

  return params;
}

function updateCurrencyLabels() {
  const reportingCurrency = document.getElementById('reportingCurrency').value;
  document.getElementById('minSpendCurrency').textContent = reportingCurrency;
  document.getElementById('maxSpendCurrency').textContent = reportingCurrency;
  const budgetLabels = {
    lt100: `Less than 100 ${reportingCurrency}`,
    '100-499': `100–499 ${reportingCurrency}`,
    '500-999': `500–999 ${reportingCurrency}`,
    '1000+': `1000+ ${reportingCurrency}`
  };
  Array.from(document.getElementById('budgetFilter').options).forEach((option) => {
    option.textContent = budgetLabels[option.value] || option.value;
  });
}

async function fetchAggregate(params) {
  const res = await fetch('/api/aggregate?' + params.toString());
  if (!res.ok) throw new Error('Failed to fetch /api/aggregate');
  return await res.json();
}

async function fetchSubs(params, page = 1, limit = 50) {
  const url = '/api/submissions?page=' + page + '&limit=' + limit + '&' + params.toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch /api/submissions');
  return await res.json();
}

function renderChart(data) {
  const labels = Object.keys(data.counts || {});
  const values = labels.map(l => data.counts[l]);

  const palette = [
    '#16a34a', '#34d399', '#86efac', '#bbf7d0', '#065f46', '#059669',
    '#10b981', '#2dd4bf', '#5eead4', '#a7f3d0'
  ];

  const bg = labels.map((_, i) => palette[i % palette.length]);

  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Count',
        data: values,
        backgroundColor: bg,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: labels.length > 6 ? 'y' : 'x',
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Analysis by: ${data.analyzeBy} | ${data.reportingCurrency || 'USD'} (Total: ${data.total})`
        }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(ctx, cfg);
}

function renderSubs(list) {
  const body = document.getElementById('subsBody');
  body.innerHTML = '';
  const shown = list.slice(0, 30);
  shown.forEach(s => {
    const tr = document.createElement('tr');
    const when = new Date(s.timestamp).toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const payload = s.payload || {};
    const name = (payload.name || payload.email || 'N/A').split('@')[0]; // show name or email prefix
    const fuel = payload.currentFuel || 'N/A';
    tr.innerHTML = `<td style="white-space:nowrap; font-size:0.8rem">${escapeHtml(when)}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(fuel)}</td>`;
    body.appendChild(tr);
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function displayActiveFilters(params) {
  const container = document.getElementById('activeFiltersTags');
  container.innerHTML = '';

  const entries = params.toString().split('&').filter(e => e && e !== 'analyzeBy=category');
  
  if (entries.length === 0) {
    container.innerHTML = '<span style="color: #999; font-size: 0.85rem;">No filters applied</span>';
    return;
  }

  entries.forEach(entry => {
    const [key, val] = entry.split('=');
    const decodedKey = decodeURIComponent(key);
    const decodedVal = decodeURIComponent(val);
    
    // Skip analyzeBy from display since it's in the selector
    if (decodedKey === 'analyzeBy') return;
    
    const tag = document.createElement('span');
    tag.className = 'filter-tag';
    tag.textContent = `${decodedKey}: ${decodedVal}`;
    container.appendChild(tag);
  });
}

async function refreshAll() {
  try {
    const params = buildFilterParams();
    displayActiveFilters(params);
    
    const [agg, subs] = await Promise.all([
      fetchAggregate(params),
      fetchSubs(params, 1, 50)
    ]);
    
    renderChart(agg);
    renderSubs(subs.submissions || []);
  } catch (err) {
    console.error('Refresh failed', err);
    alert('Error refreshing data: ' + err.message);
  }
}

function clearFilters() {
  document.getElementById('currentFuelFilter').selectedIndex = -1;
  document.getElementById('interestFilter').selectedIndex = -1;
  document.getElementById('budgetFilter').selectedIndex = -1;
  document.getElementById('minSpend').value = '';
  document.getElementById('maxSpend').value = '';
  document.getElementById('analyzeBySelect').value = 'category';
  document.getElementById('reportingCurrency').value = 'USD';
  updateCurrencyLabels();
  refreshAll();
}

function toCSV(rows) {
  const headers = ['id', 'timestamp', 'category', 'name', 'email', 'location', 'currentFuel', 'monthlySpend', 'currency', 'monthlySpendBaseUSD', 'budget', 'budgetCurrency', 'budgetMinBaseUSD', 'budgetMaxBaseUSD', 'usage', 'interest', 'barriers', 'barriersOther', 'payment', 'contactOk', 'message'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    const p = r.payload || {};
    const vals = [
      r.id,
      new Date(r.timestamp).toISOString(),
      (r.category || ''),
      (p.name || '').replace(/"/g, '""'),
      (p.email || '').replace(/"/g, '""'),
      (p.location || '').replace(/"/g, '""'),
      (p.currentFuel || ''),
      (p.monthlySpend || ''),
      (p.currency || ''),
      (p.monthlySpendBase == null ? '' : p.monthlySpendBase),
      (p.budget || ''),
      (p.budgetCurrency || ''),
      (p.budgetMinBase == null ? '' : p.budgetMinBase),
      (p.budgetMaxBase == null ? '' : p.budgetMaxBase),
      (Array.isArray(p.usage) ? p.usage.join('|') : ''),
      (p.interest || ''),
      (Array.isArray(p.barriers) ? p.barriers.join('|') : ''),
      (p.barriersOther || '').replace(/"/g, '""'),
      (p.payment || ''),
      p.contactOk ? 'true' : 'false',
      (p.message || '').replace(/"/g, '""')
    ];
    const row = vals.map(v => {
      const str = String(v);
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(',');
    lines.push(row);
  });
  return lines.join('\n');
}

let timer = null;
function startAutoRefresh() {
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (document.getElementById('autoRefresh').checked) {
      refreshAll();
    }
  }, 30000);
}

// Event Listeners
document.getElementById('applyFiltersBtn').addEventListener('click', refreshAll);
document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
document.getElementById('refreshBtn').addEventListener('click', refreshAll);
document.getElementById('reportingCurrency').addEventListener('change', updateCurrencyLabels);

document.getElementById('exportBtn').addEventListener('click', async () => {
  try {
    const params = buildFilterParams();
    const res = await fetch('/api/submissions?page=1&limit=2000&' + params.toString());
    const data = await res.json();
    const rows = data.submissions || [];
    
    if (!rows.length) {
      alert('No submissions to export');
      return;
    }
    
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biogas-survey-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export failed', err);
    alert('Export failed: ' + err.message);
  }
});

// Initialize on load
window.addEventListener('load', () => {
  updateCurrencyLabels();
  refreshAll();
  startAutoRefresh();
});
