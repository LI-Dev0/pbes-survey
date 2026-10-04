const budgetLabels = {
  lt100: 'Less than 100',
  '100-499': '100–499',
  '500-999': '500–999',
  '1000+': '1000+'
};

function updateBudgetLabels() {
  const selectedCurrency = document.getElementById('currency').value;
  const budgetSelect = document.getElementById('budget');
  Array.from(budgetSelect.options).forEach((option) => {
    option.textContent = `${budgetLabels[option.value]} ${selectedCurrency}`;
  });
}

document.getElementById('currency').addEventListener('change', updateBudgetLabels);
updateBudgetLabels();

document.getElementById('send').addEventListener('click', async (e) => {
  const useLocal = document.getElementById('useLocal').checked;

  // collect checkboxes for usage and barriers
  function collectChecks(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(n => n.value);
  }

  const payload = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    location: document.getElementById('location').value,
    category: document.getElementById('category').value || 'biogas-survey',
    currentFuel: document.getElementById('currentFuel').value,
    monthlySpend: document.getElementById('monthlySpend').value,
    currency: document.getElementById('currency').value,
    usage: collectChecks('usage'),
    interest: (document.querySelector('input[name="interest"]:checked') || {}).value,
    barriers: collectChecks('barriers'),
    barriersOther: document.getElementById('barriersOther').value,
    budget: document.getElementById('budget').value,
    budgetCurrency: document.getElementById('currency').value,
    payment: document.getElementById('payment').value,
    contactOk: document.getElementById('contactOk').checked,
    message: document.getElementById('message').value
  };

  if (useLocal) {
    try {
      const res = await fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const html = await res.text();
      const successContainer = document.createElement('div');
      successContainer.innerHTML = html;
      document.querySelector('main.container').innerHTML = '';
      document.querySelector('main.container').appendChild(successContainer);
    } catch (err) {
      console.error(err);
      alert('Local submit failed');
    }
    return;
  }

  // Default: submit to Formspree. Replace YOUR_FORMSPREE_ID with your form id
  const FORMSPREE_ID = 'YOUR_FORMSPREE_ID';
  const formData = new FormData();
  Object.keys(payload).forEach(k => {
    const v = payload[k];
    if (Array.isArray(v)) v.forEach(x => formData.append(k, x));
    else formData.append(k, v == null ? '' : v);
  });

  try {
    const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, { method: 'POST', body: formData });
    if (res.ok) alert('Submitted to Formspree');
    else alert('Formspree submission failed');
  } catch (err) {
    console.error(err);
    alert('Formspree submission error');
  }
});
